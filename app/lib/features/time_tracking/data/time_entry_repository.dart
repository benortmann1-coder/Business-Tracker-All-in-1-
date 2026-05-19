import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/time_entry.dart';
import 'hive_time_entry_repository.dart';

abstract interface class TimeEntryRepository {
  Future<List<TimeEntry>> listForProject(String projectId);
  Future<TimeEntry?> currentlyRunning(String projectId);
  Future<TimeEntry?> get(String id);
  Future<void> upsert(TimeEntry entry);
  Future<void> delete(String id);
}

final timeEntryRepositoryProvider = Provider<TimeEntryRepository>(
  (ref) => HiveTimeEntryRepository(
    Hive.box<String>(HiveTimeEntryRepository.boxName),
  ),
);

final timeEntriesForProjectProvider =
    FutureProvider.autoDispose.family<List<TimeEntry>, String>(
        (ref, projectId) async {
  return ref
      .watch(timeEntryRepositoryProvider)
      .listForProject(projectId);
});

final runningTimerProvider =
    FutureProvider.autoDispose.family<TimeEntry?, String>(
        (ref, projectId) async {
  return ref
      .watch(timeEntryRepositoryProvider)
      .currentlyRunning(projectId);
});
