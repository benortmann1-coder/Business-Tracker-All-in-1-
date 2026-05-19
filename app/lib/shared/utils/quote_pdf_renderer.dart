import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../../features/clients/domain/client.dart';
import '../../features/quotes/domain/quote.dart';
import '../../features/quotes/domain/quote_line_item.dart';

/// Renders a [Quote] (with optional [Client]) to PDF bytes. Use with
/// `Printing.layoutPdf` for preview/print/save or `Printing.sharePdf` for
/// the system share sheet.
Future<Uint8List> renderQuotePdf({
  required Quote quote,
  Client? client,
  String shopName = 'Bevelry',
  String? shopAddress,
  String? shopPhone,
  String? shopEmail,
}) async {
  final doc = pw.Document(
    title: quote.title.isEmpty ? 'Quote' : quote.title,
  );

  String money(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';
  String date(DateTime d) =>
      '${d.month.toString().padLeft(2, '0')}/'
      '${d.day.toString().padLeft(2, '0')}/${d.year}';

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.letter,
      margin: const pw.EdgeInsets.fromLTRB(48, 56, 48, 48),
      build: (ctx) => [
        // Header
        pw.Row(
          mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Text(
                  shopName,
                  style: pw.TextStyle(
                    fontSize: 22,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                if (shopAddress != null)
                  pw.Text(shopAddress, style: const pw.TextStyle(fontSize: 10)),
                if (shopPhone != null)
                  pw.Text(shopPhone, style: const pw.TextStyle(fontSize: 10)),
                if (shopEmail != null)
                  pw.Text(shopEmail, style: const pw.TextStyle(fontSize: 10)),
              ],
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text(
                  'QUOTE',
                  style: pw.TextStyle(
                    fontSize: 22,
                    fontWeight: pw.FontWeight.bold,
                    color: PdfColors.grey700,
                  ),
                ),
                pw.SizedBox(height: 4),
                pw.Text('Date: ${date(quote.updatedAt)}',
                    style: const pw.TextStyle(fontSize: 10)),
                pw.Text(
                  'Quote #: ${quote.id.substring(0, 8).toUpperCase()}',
                  style: const pw.TextStyle(fontSize: 10),
                ),
                pw.Text(
                  'Status: ${quote.status.label}',
                  style: const pw.TextStyle(fontSize: 10),
                ),
              ],
            ),
          ],
        ),
        pw.Divider(height: 24, thickness: 0.5),

        // Client + project info
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'Prepared for:',
                    style: pw.TextStyle(
                      fontSize: 10,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.grey700,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text(
                    client?.name ?? '(Unassigned client)',
                    style: const pw.TextStyle(fontSize: 12),
                  ),
                  if (client?.email != null)
                    pw.Text(client!.email!, style: const pw.TextStyle(fontSize: 10)),
                  if (client?.phone != null)
                    pw.Text(client!.phone!, style: const pw.TextStyle(fontSize: 10)),
                  if (client?.address != null)
                    pw.Text(client!.address!, style: const pw.TextStyle(fontSize: 10)),
                ],
              ),
            ),
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'Project:',
                    style: pw.TextStyle(
                      fontSize: 10,
                      fontWeight: pw.FontWeight.bold,
                      color: PdfColors.grey700,
                    ),
                  ),
                  pw.SizedBox(height: 4),
                  pw.Text(
                    quote.title,
                    style: const pw.TextStyle(fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
        ),
        pw.SizedBox(height: 24),

        // Line items table
        if (quote.lineItems.isNotEmpty)
          pw.Table(
            border: pw.TableBorder(
              top: const pw.BorderSide(color: PdfColors.grey400, width: 0.5),
              bottom: const pw.BorderSide(color: PdfColors.grey400, width: 0.5),
              horizontalInside:
                  const pw.BorderSide(color: PdfColors.grey300, width: 0.25),
            ),
            columnWidths: const {
              0: pw.FlexColumnWidth(4),
              1: pw.FlexColumnWidth(1),
              2: pw.FlexColumnWidth(1),
              3: pw.FlexColumnWidth(1.4),
              4: pw.FlexColumnWidth(1.6),
            },
            children: [
              pw.TableRow(
                decoration: const pw.BoxDecoration(color: PdfColors.grey200),
                children: [
                  _th('Description'),
                  _th('Qty', align: pw.TextAlign.right),
                  _th('Unit'),
                  _th('Rate', align: pw.TextAlign.right),
                  _th('Total', align: pw.TextAlign.right),
                ],
              ),
              for (final QuoteLineItem li in quote.lineItems)
                pw.TableRow(
                  children: [
                    _td(li.description, sub: li.category.label),
                    _td(li.quantity.toString(), align: pw.TextAlign.right),
                    _td(li.unit),
                    _td(money(li.unitCostCents), align: pw.TextAlign.right),
                    _td(money(li.totalCents), align: pw.TextAlign.right),
                  ],
                ),
            ],
          ),
        pw.SizedBox(height: 16),

        // Totals
        pw.Align(
          alignment: pw.Alignment.centerRight,
          child: pw.Container(
            width: 240,
            child: pw.Column(
              children: [
                _totalRow('Materials', money(quote.materialTotalCents)),
                if (quote.laborTotalCents > 0)
                  _totalRow(
                    'Labor (${quote.laborHours} hrs × ${money(quote.laborRateCents)})',
                    money(quote.laborTotalCents),
                  ),
                _totalRow('Subtotal', money(quote.subtotalCents)),
                if (quote.markupPercent != 0)
                  _totalRow(
                    'Markup (${quote.markupPercent.toStringAsFixed(0)}%)',
                    money(quote.afterMarkupCents - quote.subtotalCents),
                  ),
                if (quote.taxPercent != 0)
                  _totalRow(
                    'Tax (${quote.taxPercent.toStringAsFixed(2)}%)',
                    money(quote.totalCents - quote.afterMarkupCents),
                  ),
                pw.Divider(thickness: 0.5),
                _totalRow(
                  'TOTAL',
                  money(quote.totalCents),
                  bold: true,
                ),
              ],
            ),
          ),
        ),

        // Notes
        if (quote.notes.isNotEmpty) ...[
          pw.SizedBox(height: 24),
          pw.Text(
            'Notes',
            style: pw.TextStyle(
              fontSize: 11,
              fontWeight: pw.FontWeight.bold,
              color: PdfColors.grey700,
            ),
          ),
          pw.SizedBox(height: 4),
          pw.Text(quote.notes, style: const pw.TextStyle(fontSize: 10)),
        ],

        // Signature line
        pw.SizedBox(height: 36),
        pw.Row(
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Container(
                    height: 1,
                    color: PdfColors.black,
                    margin: const pw.EdgeInsets.only(top: 28, right: 24),
                  ),
                  pw.Text(
                    'Customer signature',
                    style: const pw.TextStyle(
                        fontSize: 9, color: PdfColors.grey600),
                  ),
                ],
              ),
            ),
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Container(
                    height: 1,
                    color: PdfColors.black,
                    margin: const pw.EdgeInsets.only(top: 28),
                  ),
                  pw.Text(
                    'Date',
                    style: const pw.TextStyle(
                        fontSize: 9, color: PdfColors.grey600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
      footer: (ctx) => pw.Container(
        alignment: pw.Alignment.centerRight,
        child: pw.Text(
          'Page ${ctx.pageNumber} of ${ctx.pagesCount}',
          style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey600),
        ),
      ),
    ),
  );

  return doc.save();
}

pw.Widget _th(String text, {pw.TextAlign align = pw.TextAlign.left}) =>
    pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: pw.Text(
        text,
        textAlign: align,
        style: pw.TextStyle(
          fontSize: 10,
          fontWeight: pw.FontWeight.bold,
        ),
      ),
    );

pw.Widget _td(
  String text, {
  pw.TextAlign align = pw.TextAlign.left,
  String? sub,
}) =>
    pw.Padding(
      padding: const pw.EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      child: pw.Column(
        crossAxisAlignment: align == pw.TextAlign.right
            ? pw.CrossAxisAlignment.end
            : pw.CrossAxisAlignment.start,
        children: [
          pw.Text(
            text,
            textAlign: align,
            style: const pw.TextStyle(fontSize: 10),
          ),
          if (sub != null)
            pw.Text(
              sub,
              style:
                  const pw.TextStyle(fontSize: 8, color: PdfColors.grey600),
            ),
        ],
      ),
    );

pw.Widget _totalRow(String label, String value, {bool bold = false}) =>
    pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        children: [
          pw.Expanded(
            child: pw.Text(
              label,
              style: pw.TextStyle(
                fontSize: bold ? 12 : 10,
                fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              ),
            ),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              fontSize: bold ? 14 : 10,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
            ),
          ),
        ],
      ),
    );
