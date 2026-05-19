import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/project.dart';
import 'project_repository.dart';

/// Hive-backed implementation. Survives app restart. Stores each project as
/// a JSON string keyed by project id; small overhead, no codegen.
class HiveProjectRepository implements ProjectRepository {
  HiveProjectRepository(this._box);

  static const String boxName = 'projects';

  final Box<String> _box;

  @override
  Future<List<Project>> list() async {
    final projects = <Project>[];
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final project = Project.fromJson(json);
        if (project.deletedAt == null) projects.add(project);
      } on FormatException {
        // Skip malformed rows; future migration logic would clean these.
        continue;
      }
    }
    projects.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return projects;
  }

  @override
  Future<Project?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final project = Project.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (project.deletedAt != null) return null;
    return project;
  }

  @override
  Future<void> upsert(Project project) async {
    await _box.put(project.id, jsonEncode(project.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final project =
        Project.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = project.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
