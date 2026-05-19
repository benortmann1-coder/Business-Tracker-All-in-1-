import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/invoice.dart';
import 'invoice_repository.dart';

class HiveInvoiceRepository implements InvoiceRepository {
  HiveInvoiceRepository(this._box);

  static const String boxName = 'invoices';

  final Box<String> _box;

  @override
  Future<List<Invoice>> list() async {
    final invoices = <Invoice>[];
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final invoice = Invoice.fromJson(json);
        if (invoice.deletedAt == null) invoices.add(invoice);
      } on FormatException {
        continue;
      }
    }
    invoices.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return invoices;
  }

  @override
  Future<Invoice?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final invoice = Invoice.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (invoice.deletedAt != null) return null;
    return invoice;
  }

  @override
  Future<void> upsert(Invoice invoice) async {
    await _box.put(invoice.id, jsonEncode(invoice.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final invoice =
        Invoice.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = invoice.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
