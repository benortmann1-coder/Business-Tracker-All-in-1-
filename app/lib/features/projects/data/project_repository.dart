import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/project.dart';
import 'hive_project_repository.dart';

/// Read/write API for [Project] documents.
///
/// Implementations:
/// - [HiveProjectRepository] — default, persists locally via Hive
/// - `FirestoreProjectRepository` (in `lib/features/sync/data/`) — activated
///   by overriding [projectRepositoryProvider] once Cloud Sync is active
abstract interface class ProjectRepository {
  Future<List<Project>> list();
  Future<Project?> get(String id);
  Future<void> upsert(Project project);
  Future<void> delete(String id);
}

final projectRepositoryProvider = Provider<ProjectRepository>(
  (ref) => HiveProjectRepository(
    Hive.box<String>(HiveProjectRepository.boxName),
  ),
);

final projectsListProvider =
    FutureProvider.autoDispose<List<Project>>((ref) async {
  final repo = ref.watch(projectRepositoryProvider);
  return repo.list();
});

final projectProvider =
    FutureProvider.autoDispose.family<Project?, String>((ref, id) async {
  final repo = ref.watch(projectRepositoryProvider);
  return repo.get(id);
});
