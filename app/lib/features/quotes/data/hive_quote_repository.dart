import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/quote.dart';
import 'quote_repository.dart';

class HiveQuoteRepository implements QuoteRepository {
  HiveQuoteRepository(this._box);

  static const String boxName = 'quotes';

  final Box<String> _box;

  @override
  Future<List<Quote>> list() async {
    final quotes = <Quote>[];
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final quote = Quote.fromJson(json);
        if (quote.deletedAt == null) quotes.add(quote);
      } on FormatException {
        continue;
      }
    }
    quotes.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return quotes;
  }

  @override
  Future<Quote?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final quote = Quote.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (quote.deletedAt != null) return null;
    return quote;
  }

  @override
  Future<void> upsert(Quote quote) async {
    await _box.put(quote.id, jsonEncode(quote.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final quote = Quote.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = quote.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
