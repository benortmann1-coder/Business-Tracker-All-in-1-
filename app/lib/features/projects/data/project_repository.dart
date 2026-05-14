import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/project.dart';

abstract interface class ProjectRepository {
  Future<List<Project>> list();
  Future<Project?> get(String id);
  Future<void> upsert(Project project);
  Future<void> delete(String id);
}

class InMemoryProjectRepository implements ProjectRepository {
  final Map<String, Project> _store = {};

  @override
  Future<List<Project>> list() async {
    final values = _store.values.toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return values;
  }

  @override
  Future<Project?> get(String id) async => _store[id];

  @override
  Future<void> upsert(Project project) async {
    _store[project.id] = project;
  }

  @override
  Future<void> delete(String id) async {
    _store.remove(id);
  }
}

final projectRepositoryProvider = Provider<ProjectRepository>(
  (ref) => InMemoryProjectRepository(),
);

final projectsListProvider = FutureProvider<List<Project>>((ref) async {
  final repo = ref.watch(projectRepositoryProvider);
  return repo.list();
});

final projectProvider = FutureProvider.family<Project?, String>((ref, id) async {
  final repo = ref.watch(projectRepositoryProvider);
  return repo.get(id);
});
