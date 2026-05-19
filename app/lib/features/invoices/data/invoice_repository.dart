import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/invoice.dart';
import 'hive_invoice_repository.dart';

abstract interface class InvoiceRepository {
  Future<List<Invoice>> list();
  Future<Invoice?> get(String id);
  Future<void> upsert(Invoice invoice);
  Future<void> delete(String id);
}

final invoiceRepositoryProvider = Provider<InvoiceRepository>(
  (ref) => HiveInvoiceRepository(
    Hive.box<String>(HiveInvoiceRepository.boxName),
  ),
);

final invoicesListProvider =
    FutureProvider.autoDispose<List<Invoice>>((ref) async {
  return ref.watch(invoiceRepositoryProvider).list();
});

final invoiceProvider =
    FutureProvider.autoDispose.family<Invoice?, String>((ref, id) async {
  return ref.watch(invoiceRepositoryProvider).get(id);
});
