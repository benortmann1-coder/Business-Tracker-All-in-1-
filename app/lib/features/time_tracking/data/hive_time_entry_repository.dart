import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/time_entry.dart';
import 'time_entry_repository.dart';

class HiveTimeEntryRepository implements TimeEntryRepository {
  HiveTimeEntryRepository(this._box);

  static const String boxName = 'time_entries';

  final Box<String> _box;

  Iterable<TimeEntry> _all() sync* {
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final entry = TimeEntry.fromJson(json);
        if (entry.deletedAt == null) yield entry;
      } on FormatException {
        continue;
      }
    }
  }

  @override
  Future<List<TimeEntry>> listForProject(String projectId) async {
    final entries =
        _all().where((e) => e.projectId == projectId).toList()
          ..sort((a, b) => b.startedAt.compareTo(a.startedAt));
    return entries;
  }

  @override
  Future<TimeEntry?> currentlyRunning(String projectId) async {
    for (final e in _all()) {
      if (e.projectId == projectId && e.isRunning) return e;
    }
    return null;
  }

  @override
  Future<TimeEntry?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final entry =
        TimeEntry.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (entry.deletedAt != null) return null;
    return entry;
  }

  @override
  Future<void> upsert(TimeEntry entry) async {
    await _box.put(entry.id, jsonEncode(entry.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final entry =
        TimeEntry.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = entry.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
