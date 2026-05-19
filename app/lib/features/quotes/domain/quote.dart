import 'package:uuid/uuid.dart';

import 'quote_line_item.dart';

enum QuoteStatus {
  draft('draft', 'Draft'),
  sent('sent', 'Sent'),
  approved('approved', 'Approved'),
  declined('declined', 'Declined');

  const QuoteStatus(this.jsonValue, this.label);

  final String jsonValue;
  final String label;

  static QuoteStatus fromJson(String value) => QuoteStatus.values.firstWhere(
        (s) => s.jsonValue == value,
        orElse: () => QuoteStatus.draft,
      );

  String toJson() => jsonValue;
}

class Quote {
  Quote({
    String? id,
    this.title = '',
    this.projectId,
    this.clientId,
    this.status = QuoteStatus.draft,
    this.lineItems = const [],
    this.laborHours = 0,
    this.laborRateCents = 7500,
    this.markupPercent = 25,
    this.taxPercent = 0,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.sentAt,
    this.signedAt,
    this.signatureStoragePath,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory Quote.fromJson(Map<String, dynamic> json) => Quote(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        projectId: json['projectId'] as String?,
        clientId: json['clientId'] as String?,
        status: QuoteStatus.fromJson(json['status'] as String? ?? 'draft'),
        lineItems: (json['lineItems'] as List<dynamic>?)
                ?.map((m) => QuoteLineItem.fromJson(m as Map<String, dynamic>))
                .toList() ??
            const [],
        laborHours: (json['laborHours'] as num?)?.toDouble() ?? 0,
        laborRateCents: (json['laborRateCents'] as num?)?.toInt() ?? 7500,
        markupPercent: (json['markupPercent'] as num?)?.toDouble() ?? 25,
        taxPercent: (json['taxPercent'] as num?)?.toDouble() ?? 0,
        notes: json['notes'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.parse(json['createdAt'] as String),
        sentAt: json['sentAt'] != null
            ? DateTime.parse(json['sentAt'] as String)
            : null,
        signedAt: json['signedAt'] != null
            ? DateTime.parse(json['signedAt'] as String)
            : null,
        signatureStoragePath: json['signatureStoragePath'] as String?,
        deletedAt: json['deletedAt'] != null
            ? DateTime.parse(json['deletedAt'] as String)
            : null,
      );

  final String id;
  final String title;
  final String? projectId;
  final String? clientId;
  final QuoteStatus status;
  final List<QuoteLineItem> lineItems;
  final double laborHours;
  final int laborRateCents;
  final double markupPercent;
  final double taxPercent;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? sentAt;
  final DateTime? signedAt;
  final String? signatureStoragePath;
  final DateTime? deletedAt;

  int get materialTotalCents =>
      lineItems.fold(0, (sum, li) => sum + li.totalCents);

  int get laborTotalCents => (laborHours * laborRateCents).round();

  int get subtotalCents => materialTotalCents + laborTotalCents;

  int get afterMarkupCents =>
      (subtotalCents * (1 + markupPercent / 100)).round();

  int get totalCents => (afterMarkupCents * (1 + taxPercent / 100)).round();

  Quote copyWith({
    String? title,
    String? projectId,
    bool setProjectIdToNull = false,
    String? clientId,
    bool setClientIdToNull = false,
    QuoteStatus? status,
    List<QuoteLineItem>? lineItems,
    double? laborHours,
    int? laborRateCents,
    double? markupPercent,
    double? taxPercent,
    String? notes,
    DateTime? updatedAt,
    DateTime? sentAt,
    bool setSentAtToNull = false,
    DateTime? signedAt,
    bool setSignedAtToNull = false,
    String? signatureStoragePath,
    bool setSignatureStoragePathToNull = false,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) {
    return Quote(
      id: id,
      title: title ?? this.title,
      projectId:
          setProjectIdToNull ? null : (projectId ?? this.projectId),
      clientId: setClientIdToNull ? null : (clientId ?? this.clientId),
      status: status ?? this.status,
      lineItems: lineItems ?? this.lineItems,
      laborHours: laborHours ?? this.laborHours,
      laborRateCents: laborRateCents ?? this.laborRateCents,
      markupPercent: markupPercent ?? this.markupPercent,
      taxPercent: taxPercent ?? this.taxPercent,
      notes: notes ?? this.notes,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      sentAt: setSentAtToNull ? null : (sentAt ?? this.sentAt),
      signedAt: setSignedAtToNull ? null : (signedAt ?? this.signedAt),
      signatureStoragePath: setSignatureStoragePathToNull
          ? null
          : (signatureStoragePath ?? this.signatureStoragePath),
      deletedAt: setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'projectId': projectId,
        'clientId': clientId,
        'status': status.toJson(),
        'lineItems': lineItems.map((li) => li.toJson()).toList(),
        'materialTotalCents': materialTotalCents,
        'laborHours': laborHours,
        'laborRateCents': laborRateCents,
        'laborTotalCents': laborTotalCents,
        'markupPercent': markupPercent,
        'taxPercent': taxPercent,
        'subtotalCents': subtotalCents,
        'afterMarkupCents': afterMarkupCents,
        'totalCents': totalCents,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'sentAt': sentAt?.toIso8601String(),
        'signedAt': signedAt?.toIso8601String(),
        'signatureStoragePath': signatureStoragePath,
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Quote && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
