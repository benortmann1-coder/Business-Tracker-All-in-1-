import 'package:uuid/uuid.dart';

enum FinishingStepType {
  sanding,
  conditioner,
  stain,
  sealer,
  topcoat,
  custom,
}

enum FinishingStatus { pending, drying, ready, complete }

class FinishingStep {
  FinishingStep({
    required this.type,
    required this.dryingMinutes,
    String? id,
    this.productName,
    this.notes = '',
    this.startedAt,
    this.finishedAt,
  }) : id = id ?? const Uuid().v4();

  final String id;
  final FinishingStepType type;
  final int dryingMinutes;
  final String? productName;
  final String notes;
  final DateTime? startedAt;
  final DateTime? finishedAt;

  DateTime? get readyAt =>
      startedAt?.add(Duration(minutes: dryingMinutes));

  FinishingStatus get status {
    if (finishedAt != null) return FinishingStatus.complete;
    if (startedAt == null) return FinishingStatus.pending;
    final ready = readyAt;
    if (ready == null) return FinishingStatus.drying;
    return DateTime.now().isAfter(ready)
        ? FinishingStatus.ready
        : FinishingStatus.drying;
  }
}

class FinishingSchedule {
  FinishingSchedule({
    required this.name,
    required this.steps,
    String? id,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String name;
  final List<FinishingStep> steps;
  final DateTime createdAt;
}
