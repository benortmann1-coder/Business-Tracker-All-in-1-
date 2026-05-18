import 'package:uuid/uuid.dart';

enum QuoteStatus {
  draft('draft'),
  sent('sent'),
  approved('approved'),
  declined('declined');

  const QuoteStatus(this.jsonValue);

  final String jsonValue;

  static QuoteStatus fromJson(String value) => QuoteStatus.values.firstWhere(
        (s) => s.jsonValue == value,
        orElse: () => QuoteStatus.draft,
      );

  String toJson() => jsonValue;
}

class Quote {
  Quote({
    required this.projectId,
    required this.clientId,
    String? id,
    this.status = QuoteStatus.draft,
    this.materialTotalCents = 0,
    this.laborHours = 0,
    this.laborRateCents = 0,
    this.markupPercent = 0,
    this.taxPercent = 0,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory Quote.fromJson(Map<String, dynamic> json) => Quote(
        id: json['id'] as String,
        projectId: json['projectId'] as String,
        clientId: json['clientId'] as String,
        status: QuoteStatus.fromJson(json['status'] as String),
        materialTotalCents:
            (json['materialTotalCents'] as num?)?.toInt() ?? 0,
        laborHours: (json['laborHours'] as num?)?.toDouble() ?? 0,
        laborRateCents: (json['laborRateCents'] as num?)?.toInt() ?? 0,
        markupPercent: (json['markupPercent'] as num?)?.toDouble() ?? 0,
        taxPercent: (json['taxPercent'] as num?)?.toDouble() ?? 0,
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.parse(json['createdAt'] as String),
        deletedAt: json['deletedAt'] != null
            ? DateTime.parse(json['deletedAt'] as String)
            : null,
      );

  final String id;
  final String projectId;
  final String clientId;
  final QuoteStatus status;
  final int materialTotalCents;
  final double laborHours;
  final int laborRateCents;
  final double markupPercent;
  final double taxPercent;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? deletedAt;

  int get laborTotalCents => (laborHours * laborRateCents).round();
  int get subtotalCents => materialTotalCents + laborTotalCents;
  int get afterMarkupCents =>
      (subtotalCents * (1 + markupPercent / 100)).round();
  int get totalCents => (afterMarkupCents * (1 + taxPercent / 100)).round();

  Map<String, dynamic> toJson() => {
        'id': id,
        'projectId': projectId,
        'clientId': clientId,
        'status': status.toJson(),
        'materialTotalCents': materialTotalCents,
        'laborHours': laborHours,
        'laborRateCents': laborRateCents,
        'laborTotalCents': laborTotalCents,
        'markupPercent': markupPercent,
        'taxPercent': taxPercent,
        'subtotalCents': subtotalCents,
        'afterMarkupCents': afterMarkupCents,
        'totalCents': totalCents,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Quote && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
