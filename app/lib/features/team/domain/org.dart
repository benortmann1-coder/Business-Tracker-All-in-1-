import 'package:uuid/uuid.dart';

class Org {
  Org({
    required this.name,
    required this.ownerUid,
    String? id,
    this.seats = 1,
    this.subscriptionActive = false,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String name;
  final String ownerUid;
  final int seats;
  final bool subscriptionActive;
  final DateTime createdAt;
}
