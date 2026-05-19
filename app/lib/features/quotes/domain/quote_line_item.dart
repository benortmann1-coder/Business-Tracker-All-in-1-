import 'package:uuid/uuid.dart';

/// A single line on a quote — material, hardware, finish, or service.
class QuoteLineItem {
  QuoteLineItem({
    required this.description,
    required this.quantity,
    required this.unit,
    required this.unitCostCents,
    String? id,
    this.category = QuoteLineCategory.material,
  }) : id = id ?? const Uuid().v4();

  factory QuoteLineItem.fromJson(Map<String, dynamic> json) => QuoteLineItem(
        id: json['id'] as String,
        description: json['description'] as String,
        quantity: (json['quantity'] as num).toDouble(),
        unit: json['unit'] as String,
        unitCostCents: (json['unitCostCents'] as num).toInt(),
        category: QuoteLineCategoryX.fromJson(
          json['category'] as String? ?? 'material',
        ),
      );

  final String id;
  final String description;
  final double quantity;
  final String unit;
  final int unitCostCents;
  final QuoteLineCategory category;

  int get totalCents => (quantity * unitCostCents).round();

  QuoteLineItem copyWith({
    String? description,
    double? quantity,
    String? unit,
    int? unitCostCents,
    QuoteLineCategory? category,
  }) =>
      QuoteLineItem(
        id: id,
        description: description ?? this.description,
        quantity: quantity ?? this.quantity,
        unit: unit ?? this.unit,
        unitCostCents: unitCostCents ?? this.unitCostCents,
        category: category ?? this.category,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'description': description,
        'quantity': quantity,
        'unit': unit,
        'unitCostCents': unitCostCents,
        'totalCents': totalCents,
        'category': category.jsonValue,
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is QuoteLineItem && other.id == id);

  @override
  int get hashCode => id.hashCode;
}

enum QuoteLineCategory {
  material('material', 'Material'),
  hardware('hardware', 'Hardware'),
  finish('finish', 'Finish'),
  labor('labor', 'Labor'),
  delivery('delivery', 'Delivery / Install'),
  other('other', 'Other');

  const QuoteLineCategory(this.jsonValue, this.label);

  final String jsonValue;
  final String label;
}

extension QuoteLineCategoryX on QuoteLineCategory {
  static QuoteLineCategory fromJson(String value) =>
      QuoteLineCategory.values.firstWhere(
        (c) => c.jsonValue == value,
        orElse: () => QuoteLineCategory.material,
      );
}

const List<String> kQuoteLineUnits = [
  'each',
  'sheet',
  'bf',
  'ft',
  'lf',
  'sqft',
  'hr',
  'lb',
  'oz',
];
