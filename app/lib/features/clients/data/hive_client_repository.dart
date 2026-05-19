import 'dart:convert';

import 'package:hive/hive.dart';

import '../domain/client.dart';
import 'client_repository.dart';

class HiveClientRepository implements ClientRepository {
  HiveClientRepository(this._box);

  static const String boxName = 'clients';

  final Box<String> _box;

  @override
  Future<List<Client>> list() async {
    final clients = <Client>[];
    for (final raw in _box.values) {
      try {
        final json = jsonDecode(raw) as Map<String, dynamic>;
        final client = Client.fromJson(json);
        if (client.deletedAt == null) clients.add(client);
      } on FormatException {
        continue;
      }
    }
    clients.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return clients;
  }

  @override
  Future<Client?> get(String id) async {
    final raw = _box.get(id);
    if (raw == null) return null;
    final client = Client.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    if (client.deletedAt != null) return null;
    return client;
  }

  @override
  Future<void> upsert(Client client) async {
    await _box.put(client.id, jsonEncode(client.toJson()));
  }

  @override
  Future<void> delete(String id) async {
    final existing = _box.get(id);
    if (existing == null) return;
    final client = Client.fromJson(jsonDecode(existing) as Map<String, dynamic>);
    final tombstoned = client.copyWith(deletedAt: DateTime.now());
    await _box.put(id, jsonEncode(tombstoned.toJson()));
  }
}
