import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/material_item.dart';
import 'material_repository.dart';

class HiveMaterialRepository implements MaterialRepository {
  HiveMaterialRepository(this._box);

  static const String boxName = 'materials';

  final Box<String> _box;

  @override
  Future<List<MaterialItem>> list() async {
    final items = <MaterialItem>[];
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final item = MaterialItem.fromJson(json);
        if (item.deletedAt == null) items.add(item);
      } on FormatException {
        continue;
      }
    }
    items.sort((a, b) {
      final c = a.category.label.compareTo(b.category.label);
      if (c != 0) return c;
      return a.name.toLowerCase().compareTo(b.name.toLowerCase());
    });
    return items;
  }

  @override
  Future<MaterialItem?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final item = MaterialItem.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (item.deletedAt != null) return null;
    return item;
  }

  @override
  Future<void> upsert(MaterialItem material) async {
    await _box.put(material.id, jsonEncode(material.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final item = MaterialItem.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = item.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
