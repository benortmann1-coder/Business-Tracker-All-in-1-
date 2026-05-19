import 'package:uuid/uuid.dart';

enum MaterialCategory {
  lumber('lumber', 'Lumber'),
  sheetGoods('sheetGoods', 'Sheet goods'),
  hardware('hardware', 'Hardware'),
  finishes('finishes', 'Finishes'),
  adhesives('adhesives', 'Adhesives'),
  fasteners('fasteners', 'Fasteners'),
  other('other', 'Other');

  const MaterialCategory(this.jsonValue, this.label);

  final String jsonValue;
  final String label;

  static MaterialCategory fromJson(String value) =>
      MaterialCategory.values.firstWhere(
        (c) => c.jsonValue == value,
        orElse: () => MaterialCategory.other,
      );

  String toJson() => jsonValue;
}

/// A reusable entry in the user's materials / hardware library. Line items
/// on a quote can reference one of these so the user isn't retyping
/// "Blum 110° soft-close hinge" on every quote.
class MaterialItem {
  MaterialItem({
    required this.name,
    String? id,
    this.category = MaterialCategory.lumber,
    this.defaultUnit = 'each',
    this.defaultUnitCostCents = 0,
    this.vendor,
    this.sku,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory MaterialItem.fromJson(Map<String, dynamic> json) => MaterialItem(
        id: json['id'] as String,
        name: json['name'] as String,
        category: MaterialCategory.fromJson(json['category'] as String? ?? 'other'),
        defaultUnit: json['defaultUnit'] as String? ?? 'each',
        defaultUnitCostCents:
            (json['defaultUnitCostCents'] as num?)?.toInt() ?? 0,
        vendor: json['vendor'] as String?,
        sku: json['sku'] as String?,
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
  final MaterialCategory category;
  final String defaultUnit;
  final int defaultUnitCostCents;
  final String? vendor;
  final String? sku;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? deletedAt;

  MaterialItem copyWith({
    String? name,
    MaterialCategory? category,
    String? defaultUnit,
    int? defaultUnitCostCents,
    String? vendor,
    bool setVendorToNull = false,
    String? sku,
    bool setSkuToNull = false,
    String? notes,
    DateTime? updatedAt,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) =>
      MaterialItem(
        id: id,
        name: name ?? this.name,
        category: category ?? this.category,
        defaultUnit: defaultUnit ?? this.defaultUnit,
        defaultUnitCostCents: defaultUnitCostCents ?? this.defaultUnitCostCents,
        vendor: setVendorToNull ? null : (vendor ?? this.vendor),
        sku: setSkuToNull ? null : (sku ?? this.sku),
        notes: notes ?? this.notes,
        createdAt: createdAt,
        updatedAt: updatedAt ?? DateTime.now(),
        deletedAt: setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'category': category.toJson(),
        'defaultUnit': defaultUnit,
        'defaultUnitCostCents': defaultUnitCostCents,
        'vendor': vendor,
        'sku': sku,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is MaterialItem && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
