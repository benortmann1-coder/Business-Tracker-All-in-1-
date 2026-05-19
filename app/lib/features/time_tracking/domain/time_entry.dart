import 'package:uuid/uuid.dart';

/// One unit of logged work on a project. `endedAt == null` means the timer
/// is still running.
class TimeEntry {
  TimeEntry({
    required this.projectId,
    String? id,
    this.note = '',
    DateTime? startedAt,
    this.endedAt,
    DateTime? createdAt,
    DateTime? updatedAt,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        startedAt = startedAt ?? DateTime.now(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory TimeEntry.fromJson(Map<String, dynamic> json) => TimeEntry(
        id: json['id'] as String,
        projectId: json['projectId'] as String,
        note: json['note'] as String? ?? '',
        startedAt: DateTime.parse(json['startedAt'] as String),
        endedAt: json['endedAt'] != null
            ? DateTime.parse(json['endedAt'] as String)
            : null,
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
  final String note;
  final DateTime startedAt;
  final DateTime? endedAt;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? deletedAt;

  bool get isRunning => endedAt == null;

  Duration get duration =>
      (endedAt ?? DateTime.now()).difference(startedAt);

  double get hours => duration.inSeconds / 3600.0;

  TimeEntry copyWith({
    String? note,
    DateTime? startedAt,
    DateTime? endedAt,
    bool setEndedAtToNull = false,
    DateTime? updatedAt,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) =>
      TimeEntry(
        id: id,
        projectId: projectId,
        note: note ?? this.note,
        startedAt: startedAt ?? this.startedAt,
        endedAt: setEndedAtToNull ? null : (endedAt ?? this.endedAt),
        createdAt: createdAt,
        updatedAt: updatedAt ?? DateTime.now(),
        deletedAt:
            setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'projectId': projectId,
        'note': note,
        'startedAt': startedAt.toIso8601String(),
        'endedAt': endedAt?.toIso8601String(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is TimeEntry && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
