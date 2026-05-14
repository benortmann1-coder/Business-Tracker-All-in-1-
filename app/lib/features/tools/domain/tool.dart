import 'package:uuid/uuid.dart';

class Tool {
  Tool({
    required this.name,
    String? id,
    this.category,
    this.serialNumber,
    this.purchaseDate,
    this.warrantyExpires,
    this.nextMaintenance,
  }) : id = id ?? const Uuid().v4();

  factory Tool.fromJson(Map<String, dynamic> json) => Tool(
        id: json['id'] as String,
        name: json['name'] as String,
        category: json['category'] as String?,
        serialNumber: json['serialNumber'] as String?,
        purchaseDate: json['purchaseDate'] != null
            ? DateTime.parse(json['purchaseDate'] as String)
            : null,
        warrantyExpires: json['warrantyExpires'] != null
            ? DateTime.parse(json['warrantyExpires'] as String)
            : null,
        nextMaintenance: json['nextMaintenance'] != null
            ? DateTime.parse(json['nextMaintenance'] as String)
            : null,
      );

  final String id;
  final String name;
  final String? category;
  final String? serialNumber;
  final DateTime? purchaseDate;
  final DateTime? warrantyExpires;
  final DateTime? nextMaintenance;

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'category': category,
        'serialNumber': serialNumber,
        'purchaseDate': purchaseDate?.toIso8601String(),
        'warrantyExpires': warrantyExpires?.toIso8601String(),
        'nextMaintenance': nextMaintenance?.toIso8601String(),
      };
}
