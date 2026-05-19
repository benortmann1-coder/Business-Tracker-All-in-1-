import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/material_item.dart';
import 'hive_material_repository.dart';

abstract interface class MaterialRepository {
  Future<List<MaterialItem>> list();
  Future<MaterialItem?> get(String id);
  Future<void> upsert(MaterialItem material);
  Future<void> delete(String id);
}

final materialRepositoryProvider = Provider<MaterialRepository>(
  (ref) => HiveMaterialRepository(
    Hive.box<String>(HiveMaterialRepository.boxName),
  ),
);

final materialsListProvider =
    FutureProvider.autoDispose<List<MaterialItem>>((ref) async {
  return ref.watch(materialRepositoryProvider).list();
});

final materialProvider =
    FutureProvider.autoDispose.family<MaterialItem?, String>((ref, id) async {
  return ref.watch(materialRepositoryProvider).get(id);
});
