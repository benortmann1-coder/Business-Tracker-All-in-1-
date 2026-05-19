import 'package:uuid/uuid.dart';

enum PaymentMethod {
  cash('cash', 'Cash'),
  check('check', 'Check'),
  card('card', 'Card'),
  ach('ach', 'ACH / Bank transfer'),
  venmo('venmo', 'Venmo'),
  zelle('zelle', 'Zelle'),
  cashApp('cashApp', 'Cash App'),
  paypal('paypal', 'PayPal'),
  other('other', 'Other');

  const PaymentMethod(this.jsonValue, this.label);

  final String jsonValue;
  final String label;

  static PaymentMethod fromJson(String value) =>
      PaymentMethod.values.firstWhere(
        (m) => m.jsonValue == value,
        orElse: () => PaymentMethod.other,
      );

  String toJson() => jsonValue;
}

/// One recorded payment against an invoice. Multiple per invoice support
/// deposit + progress + balance billing.
class PaymentRecord {
  PaymentRecord({
    required this.amountCents,
    required this.method,
    String? id,
    this.reference = '',
    DateTime? paidAt,
  })  : id = id ?? const Uuid().v4(),
        paidAt = paidAt ?? DateTime.now();

  factory PaymentRecord.fromJson(Map<String, dynamic> json) => PaymentRecord(
        id: json['id'] as String,
        amountCents: (json['amountCents'] as num).toInt(),
        method: PaymentMethod.fromJson(json['method'] as String? ?? 'other'),
        reference: json['reference'] as String? ?? '',
        paidAt: DateTime.parse(json['paidAt'] as String),
      );

  final String id;
  final int amountCents;
  final PaymentMethod method;

  /// Free-form note — check number, last 4 of card, Venmo handle, etc.
  final String reference;
  final DateTime paidAt;

  PaymentRecord copyWith({
    int? amountCents,
    PaymentMethod? method,
    String? reference,
    DateTime? paidAt,
  }) =>
      PaymentRecord(
        id: id,
        amountCents: amountCents ?? this.amountCents,
        method: method ?? this.method,
        reference: reference ?? this.reference,
        paidAt: paidAt ?? this.paidAt,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'amountCents': amountCents,
        'method': method.toJson(),
        'reference': reference,
        'paidAt': paidAt.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is PaymentRecord && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
