import 'dart:io';

import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../features/clients/domain/client.dart';
import '../../features/projects/domain/project.dart';
import '../../features/quotes/domain/quote.dart';
import '../../features/quotes/domain/quote_line_item.dart';

/// Builds and shares CSV files of the user's local data. Hank asked for
/// "own your data on export" — this is that.
class CsvExporter {
  const CsvExporter();

  Future<void> exportProjects(List<Project> projects) async {
    final rows = <List<String>>[
      [
        'id',
        'name',
        'status',
        'description',
        'dimensions',
        'laborHours',
        'costEstimateCents',
        'unitSystem',
        'createdAt',
        'updatedAt',
        'dueDate',
      ],
      for (final p in projects)
        [
          p.id,
          p.name,
          p.status.toJson(),
          p.description,
          p.dimensions,
          p.laborHours.toString(),
          p.costEstimateCents.toString(),
          p.unitSystem,
          p.createdAt.toIso8601String(),
          p.updatedAt.toIso8601String(),
          p.dueDate?.toIso8601String() ?? '',
        ],
    ];
    await _shareCsv('bevelry-projects', rows);
  }

  Future<void> exportClients(List<Client> clients) async {
    final rows = <List<String>>[
      [
        'id',
        'name',
        'phone',
        'email',
        'address',
        'notes',
        'createdAt',
        'updatedAt',
      ],
      for (final c in clients)
        [
          c.id,
          c.name,
          c.phone ?? '',
          c.email ?? '',
          c.address ?? '',
          c.notes,
          c.createdAt.toIso8601String(),
          c.updatedAt.toIso8601String(),
        ],
    ];
    await _shareCsv('bevelry-clients', rows);
  }

  Future<void> exportQuotes(List<Quote> quotes) async {
    final rows = <List<String>>[
      [
        'id',
        'title',
        'projectId',
        'clientId',
        'status',
        'lineItemsCount',
        'materialTotalCents',
        'laborHours',
        'laborRateCents',
        'laborTotalCents',
        'markupPercent',
        'taxPercent',
        'totalCents',
        'createdAt',
        'updatedAt',
        'sentAt',
      ],
      for (final q in quotes)
        [
          q.id,
          q.title,
          q.projectId ?? '',
          q.clientId ?? '',
          q.status.toJson(),
          q.lineItems.length.toString(),
          q.materialTotalCents.toString(),
          q.laborHours.toString(),
          q.laborRateCents.toString(),
          q.laborTotalCents.toString(),
          q.markupPercent.toString(),
          q.taxPercent.toString(),
          q.totalCents.toString(),
          q.createdAt.toIso8601String(),
          q.updatedAt.toIso8601String(),
          q.sentAt?.toIso8601String() ?? '',
        ],
    ];
    await _shareCsv('bevelry-quotes', rows);
  }

  Future<void> exportQuoteLineItems(List<Quote> quotes) async {
    final rows = <List<String>>[
      [
        'quoteId',
        'lineItemId',
        'description',
        'category',
        'quantity',
        'unit',
        'unitCostCents',
        'totalCents',
      ],
      for (final q in quotes)
        for (final QuoteLineItem li in q.lineItems)
          [
            q.id,
            li.id,
            li.description,
            li.category.jsonValue,
            li.quantity.toString(),
            li.unit,
            li.unitCostCents.toString(),
            li.totalCents.toString(),
          ],
    ];
    await _shareCsv('bevelry-quote-line-items', rows);
  }

  Future<void> _shareCsv(String baseName, List<List<String>> rows) async {
    final csv = rows.map(_encodeRow).join('\n');
    final dir = await getTemporaryDirectory();
    final stamp = DateTime.now()
        .toIso8601String()
        .replaceAll(':', '-')
        .replaceAll('.', '-');
    final file = File('${dir.path}/$baseName-$stamp.csv');
    await file.writeAsString(csv);
    await Share.shareXFiles(
      [XFile(file.path, mimeType: 'text/csv')],
      subject: baseName,
    );
  }

  /// RFC 4180-ish: wrap any cell containing comma, quote, or newline in
  /// double quotes; escape inner quotes by doubling.
  String _encodeRow(List<String> row) =>
      row.map(_encodeCell).join(',');

  String _encodeCell(String cell) {
    final needsQuoting =
        cell.contains(',') || cell.contains('"') || cell.contains('\n');
    if (!needsQuoting) return cell;
    final escaped = cell.replaceAll('"', '""');
    return '"$escaped"';
  }
}
