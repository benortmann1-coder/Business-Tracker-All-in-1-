import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive/hive.dart';

import '../domain/client.dart';
import 'hive_client_repository.dart';

abstract interface class ClientRepository {
  Future<List<Client>> list();
  Future<Client?> get(String id);
  Future<void> upsert(Client client);
  Future<void> delete(String id);
}

final clientRepositoryProvider = Provider<ClientRepository>(
  (ref) => HiveClientRepository(
    Hive.box<String>(HiveClientRepository.boxName),
  ),
);

final clientsListProvider =
    FutureProvider.autoDispose<List<Client>>((ref) async {
  final repo = ref.watch(clientRepositoryProvider);
  return repo.list();
});

final clientProvider =
    FutureProvider.autoDispose.family<Client?, String>((ref, id) async {
  final repo = ref.watch(clientRepositoryProvider);
  return repo.get(id);
});
