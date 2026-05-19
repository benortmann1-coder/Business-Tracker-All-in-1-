import 'package:uuid/uuid.dart';

class Client {
  Client({
    required this.name,
    String? id,
    this.email,
    this.phone,
    this.address,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory Client.fromJson(Map<String, dynamic> json) => Client(
        id: json['id'] as String,
        name: json['name'] as String,
        email: json['email'] as String?,
        phone: json['phone'] as String?,
        address: json['address'] as String?,
        notes: json['notes'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.parse(json['createdAt'] as String),
        deletedAt: json['deletedAt'] != null
            ? DateTime.parse(json['deletedAt'] as String)
            : null,
      );

  final String id;
  final String name;
  final String? email;
  final String? phone;
  final String? address;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? deletedAt;

  Client copyWith({
    String? name,
    String? email,
    bool setEmailToNull = false,
    String? phone,
    bool setPhoneToNull = false,
    String? address,
    bool setAddressToNull = false,
    String? notes,
    DateTime? updatedAt,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) {
    return Client(
      id: id,
      name: name ?? this.name,
      email: setEmailToNull ? null : (email ?? this.email),
      phone: setPhoneToNull ? null : (phone ?? this.phone),
      address: setAddressToNull ? null : (address ?? this.address),
      notes: notes ?? this.notes,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      deletedAt: setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'email': email,
        'phone': phone,
        'address': address,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Client && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
