import 'package:uuid/uuid.dart';

enum QuoteStatus { draft, sent, approved, declined }

class Quote {
  Quote({
    required this.projectId,
    required this.clientId,
    String? id,
    this.status = QuoteStatus.draft,
    this.materialTotal = 0,
    this.laborHours = 0,
    this.laborRate = 0,
    this.markupPercent = 0,
    this.taxPercent = 0,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String projectId;
  final String clientId;
  final QuoteStatus status;
  final double materialTotal;
  final double laborHours;
  final double laborRate;
  final double markupPercent;
  final double taxPercent;
  final DateTime createdAt;

  double get laborTotal => laborHours * laborRate;
  double get subtotal => materialTotal + laborTotal;
  double get afterMarkup => subtotal * (1 + markupPercent / 100);
  double get total => afterMarkup * (1 + taxPercent / 100);
}
