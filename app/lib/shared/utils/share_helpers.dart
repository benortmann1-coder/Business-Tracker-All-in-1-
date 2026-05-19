import 'package:url_launcher/url_launcher.dart';

import '../../features/clients/domain/client.dart';
import '../../features/quotes/domain/quote.dart';
import '../../features/quotes/domain/quote_line_item.dart';

/// Builds a human-readable plain-text quote suitable for pasting into email,
/// SMS, or printing.
String formatQuoteText(Quote quote, {Client? client}) {
  final lines = <String>[];
  lines.add(quote.title.isEmpty ? 'Quote' : quote.title);
  lines.add('Status: ${quote.status.label}');
  lines.add('Date: ${_fmtDate(quote.updatedAt)}');
  if (client != null) {
    lines.add('Prepared for: ${client.name}');
    if (client.email != null) lines.add('Email: ${client.email}');
    if (client.phone != null) lines.add('Phone: ${client.phone}');
  }
  lines.add('');
  if (quote.lineItems.isNotEmpty) {
    lines.add('LINE ITEMS');
    for (final QuoteLineItem li in quote.lineItems) {
      lines.add(
        '  • ${li.description}'
        ' — ${li.quantity} ${li.unit} × ${_fmtMoney(li.unitCostCents)}'
        ' = ${_fmtMoney(li.totalCents)}',
      );
    }
    lines.add('  Materials subtotal: ${_fmtMoney(quote.materialTotalCents)}');
    lines.add('');
  }
  if (quote.laborTotalCents > 0) {
    lines.add(
      'LABOR  ${quote.laborHours} hrs × ${_fmtMoney(quote.laborRateCents)}'
      ' = ${_fmtMoney(quote.laborTotalCents)}',
    );
    lines.add('');
  }
  lines.add('Subtotal:        ${_fmtMoney(quote.subtotalCents)}');
  if (quote.markupPercent != 0) {
    lines.add(
      'Markup (${quote.markupPercent.toStringAsFixed(0)}%):     '
      '${_fmtMoney(quote.afterMarkupCents - quote.subtotalCents)}',
    );
  }
  if (quote.taxPercent != 0) {
    lines.add(
      'Tax (${quote.taxPercent.toStringAsFixed(2)}%):        '
      '${_fmtMoney(quote.totalCents - quote.afterMarkupCents)}',
    );
  }
  lines.add('TOTAL:           ${_fmtMoney(quote.totalCents)}');
  if (quote.notes.isNotEmpty) {
    lines.add('');
    lines.add('Notes:');
    lines.add(quote.notes);
  }
  return lines.join('\n');
}

/// Opens the device's default mail composer with a pre-filled quote.
/// Returns true if the composer launched, false otherwise.
Future<bool> openMailWithQuote(Quote quote, {Client? client}) async {
  final body = formatQuoteText(quote, client: client);
  final subject = quote.title.isEmpty ? 'Quote' : 'Quote: ${quote.title}';
  final toParam = client?.email == null ? '' : Uri.encodeComponent(client!.email!);
  final query = <String>[
    'subject=${Uri.encodeComponent(subject)}',
    'body=${Uri.encodeComponent(body)}',
  ].join('&');
  final uri = Uri.parse('mailto:$toParam?$query');
  return launchUrl(uri);
}

/// Opens the device's default SMS composer with the quote summary pre-filled.
/// Returns true if the composer launched, false otherwise.
Future<bool> openSmsWithQuote(Quote quote, {Client? client}) async {
  final body = formatQuoteText(quote, client: client);
  final toParam = client?.phone == null
      ? ''
      : Uri.encodeComponent(_stripPhone(client!.phone!));
  final uri = Uri.parse(
    'sms:$toParam?body=${Uri.encodeComponent(body)}',
  );
  return launchUrl(uri);
}

String _stripPhone(String phone) =>
    phone.replaceAll(RegExp(r'[^0-9+]'), '');

String _fmtMoney(int cents) {
  final dollars = cents / 100;
  return '\$${dollars.toStringAsFixed(2)}';
}

String _fmtDate(DateTime d) =>
    '${d.month.toString().padLeft(2, '0')}/'
    '${d.day.toString().padLeft(2, '0')}/${d.year}';
