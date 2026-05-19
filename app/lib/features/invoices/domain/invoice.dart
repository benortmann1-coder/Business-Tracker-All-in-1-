import 'package:uuid/uuid.dart';

import 'payment_record.dart';

enum InvoiceStatus {
  draft('draft', 'Draft'),
  sent('sent', 'Sent'),
  partiallyPaid('partiallyPaid', 'Partially paid'),
  paid('paid', 'Paid'),
  overdue('overdue', 'Overdue'),
  voided('void', 'Void');

  const InvoiceStatus(this.jsonValue, this.label);

  final String jsonValue;
  final String label;

  static InvoiceStatus fromJson(String value) =>
      InvoiceStatus.values.firstWhere(
        (s) => s.jsonValue == value,
        orElse: () => InvoiceStatus.draft,
      );

  String toJson() => jsonValue;
}

class Invoice {
  Invoice({
    required this.title,
    String? id,
    this.quoteId,
    this.projectId,
    this.clientId,
    this.status = InvoiceStatus.draft,
    this.subtotalCents = 0,
    this.taxCents = 0,
    this.totalCents = 0,
    this.payments = const [],
    this.dueDate,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.sentAt,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory Invoice.fromJson(Map<String, dynamic> json) => Invoice(
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        quoteId: json['quoteId'] as String?,
        projectId: json['projectId'] as String?,
        clientId: json['clientId'] as String?,
        status: InvoiceStatus.fromJson(json['status'] as String? ?? 'draft'),
        subtotalCents: (json['subtotalCents'] as num?)?.toInt() ?? 0,
        taxCents: (json['taxCents'] as num?)?.toInt() ?? 0,
        totalCents: (json['totalCents'] as num?)?.toInt() ?? 0,
        payments: (json['payments'] as List<dynamic>?)
                ?.map(
                  (m) => PaymentRecord.fromJson(m as Map<String, dynamic>),
                )
                .toList() ??
            const [],
        dueDate: json['dueDate'] != null
            ? DateTime.parse(json['dueDate'] as String)
            : null,
        notes: json['notes'] as String? ?? '',
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.parse(json['createdAt'] as String),
        sentAt: json['sentAt'] != null
            ? DateTime.parse(json['sentAt'] as String)
            : null,
        deletedAt: json['deletedAt'] != null
            ? DateTime.parse(json['deletedAt'] as String)
            : null,
      );

  final String id;
  final String title;
  final String? quoteId;
  final String? projectId;
  final String? clientId;
  final InvoiceStatus status;
  final int subtotalCents;
  final int taxCents;
  final int totalCents;
  final List<PaymentRecord> payments;
  final DateTime? dueDate;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? sentAt;
  final DateTime? deletedAt;

  int get amountPaidCents =>
      payments.fold(0, (s, p) => s + p.amountCents);

  int get balanceCents => totalCents - amountPaidCents;

  bool get isFullyPaid => balanceCents <= 0 && totalCents > 0;

  bool get isOverdue {
    if (isFullyPaid) return false;
    if (status == InvoiceStatus.voided) return false;
    return dueDate != null && DateTime.now().isAfter(dueDate!);
  }

  /// Auto-computed status that reflects payments + due date. The stored
  /// [status] field still takes precedence for explicit user choices (e.g.
  /// `void`); this is for display.
  InvoiceStatus get effectiveStatus {
    if (status == InvoiceStatus.voided) return InvoiceStatus.voided;
    if (isFullyPaid) return InvoiceStatus.paid;
    if (amountPaidCents > 0) return InvoiceStatus.partiallyPaid;
    if (isOverdue) return InvoiceStatus.overdue;
    return status;
  }

  Invoice copyWith({
    String? title,
    String? quoteId,
    bool setQuoteIdToNull = false,
    String? projectId,
    bool setProjectIdToNull = false,
    String? clientId,
    bool setClientIdToNull = false,
    InvoiceStatus? status,
    int? subtotalCents,
    int? taxCents,
    int? totalCents,
    List<PaymentRecord>? payments,
    DateTime? dueDate,
    bool setDueDateToNull = false,
    String? notes,
    DateTime? updatedAt,
    DateTime? sentAt,
    bool setSentAtToNull = false,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) {
    return Invoice(
      id: id,
      title: title ?? this.title,
      quoteId: setQuoteIdToNull ? null : (quoteId ?? this.quoteId),
      projectId:
          setProjectIdToNull ? null : (projectId ?? this.projectId),
      clientId: setClientIdToNull ? null : (clientId ?? this.clientId),
      status: status ?? this.status,
      subtotalCents: subtotalCents ?? this.subtotalCents,
      taxCents: taxCents ?? this.taxCents,
      totalCents: totalCents ?? this.totalCents,
      payments: payments ?? this.payments,
      dueDate: setDueDateToNull ? null : (dueDate ?? this.dueDate),
      notes: notes ?? this.notes,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      sentAt: setSentAtToNull ? null : (sentAt ?? this.sentAt),
      deletedAt:
          setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'quoteId': quoteId,
        'projectId': projectId,
        'clientId': clientId,
        'status': status.toJson(),
        'subtotalCents': subtotalCents,
        'taxCents': taxCents,
        'totalCents': totalCents,
        'amountPaidCents': amountPaidCents,
        'balanceCents': balanceCents,
        'payments': payments.map((p) => p.toJson()).toList(),
        'dueDate': dueDate?.toIso8601String(),
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'sentAt': sentAt?.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Invoice && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
