import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/project.dart';

/// Read/write API for [Project] documents.
///
/// Two implementations exist:
/// - [InMemoryProjectRepository] — used by the scaffold for instant feedback
///   without a backend.
/// - `FirestoreProjectRepository` (in `lib/features/sync/data/`) — wired by
///   overriding [projectRepositoryProvider] once Cloud Sync is active.
abstract interface class ProjectRepository {
  Future<List<Project>> list();
  Future<Project?> get(String id);
  Future<void> upsert(Project project);
  Future<void> delete(String id);
}

/// In-memory store used by Phase 1 scaffold. Data is lost on app restart.
class InMemoryProjectRepository implements ProjectRepository {
  final Map<String, Project> _store = {};

  @override
  Future<List<Project>> list() async {
    final values = _store.values
        .where((p) => p.deletedAt == null)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return values;
  }

  @override
  Future<Project?> get(String id) async {
    final project = _store[id];
    if (project == null || project.deletedAt != null) return null;
    return project;
  }

  @override
  Future<void> upsert(Project project) async {
    _store[project.id] = project;
  }

  @override
  Future<void> delete(String id) async {
    final existing = _store[id];
    if (existing == null) return;
    _store[id] = existing.copyWith(deletedAt: DateTime.now());
  }
}

final projectRepositoryProvider = Provider<ProjectRepository>(
  (ref) => InMemoryProjectRepository(),
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
