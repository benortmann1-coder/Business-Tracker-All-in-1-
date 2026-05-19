import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/quote.dart';
import 'hive_quote_repository.dart';

abstract interface class QuoteRepository {
  Future<List<Quote>> list();
  Future<Quote?> get(String id);
  Future<void> upsert(Quote quote);
  Future<void> delete(String id);
}

final quoteRepositoryProvider = Provider<QuoteRepository>(
  (ref) => HiveQuoteRepository(
    Hive.box<String>(HiveQuoteRepository.boxName),
  ),
);

final quotesListProvider =
    FutureProvider.autoDispose<List<Quote>>((ref) async {
  return ref.watch(quoteRepositoryProvider).list();
});

final quoteProvider =
    FutureProvider.autoDispose.family<Quote?, String>((ref, id) async {
  return ref.watch(quoteRepositoryProvider).get(id);
});
