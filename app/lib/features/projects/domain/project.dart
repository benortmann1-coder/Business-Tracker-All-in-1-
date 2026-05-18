import 'package:uuid/uuid.dart';

import '../../../shared/models/project_status.dart';

class Project {
  Project({
    required this.name,
    String? id,
    this.clientId,
    this.status = ProjectStatus.draft,
    this.description = '',
    this.dimensions = '',
    this.laborHours = 0,
    this.costEstimateCents = 0,
    this.photoPaths = const [],
    this.unitSystem = 'imperial',
    DateTime? createdAt,
    DateTime? updatedAt,
    this.dueDate,
    this.deletedAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String,
        name: json['name'] as String,
        clientId: json['clientId'] as String?,
        status: ProjectStatus.fromJson(json['status'] as String),
        description: json['description'] as String? ?? '',
        dimensions: json['dimensions'] as String? ?? '',
        laborHours: (json['laborHours'] as num?)?.toDouble() ?? 0,
        costEstimateCents: (json['costEstimateCents'] as num?)?.toInt() ?? 0,
        photoPaths:
            (json['photoPaths'] as List<dynamic>?)?.cast<String>() ?? const [],
        unitSystem: json['unitSystem'] as String? ?? 'imperial',
        createdAt: DateTime.parse(json['createdAt'] as String),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.parse(json['createdAt'] as String),
        dueDate: json['dueDate'] != null
            ? DateTime.parse(json['dueDate'] as String)
            : null,
        deletedAt: json['deletedAt'] != null
            ? DateTime.parse(json['deletedAt'] as String)
            : null,
      );

  final String id;
  final String name;
  final String? clientId;
  final ProjectStatus status;
  final String description;
  final String dimensions;
  final double laborHours;
  final int costEstimateCents;
  final List<String> photoPaths;
  final String unitSystem;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? dueDate;
  final DateTime? deletedAt;

  /// Pass `setClientIdToNull: true` to explicitly clear `clientId`; otherwise
  /// `null` means "no change". Same convention for `setDueDateToNull` and
  /// `setDeletedAtToNull`.
  Project copyWith({
    String? name,
    String? clientId,
    bool setClientIdToNull = false,
    ProjectStatus? status,
    String? description,
    String? dimensions,
    double? laborHours,
    int? costEstimateCents,
    List<String>? photoPaths,
    String? unitSystem,
    DateTime? updatedAt,
    DateTime? dueDate,
    bool setDueDateToNull = false,
    DateTime? deletedAt,
    bool setDeletedAtToNull = false,
  }) {
    return Project(
      id: id,
      name: name ?? this.name,
      clientId: setClientIdToNull ? null : (clientId ?? this.clientId),
      status: status ?? this.status,
      description: description ?? this.description,
      dimensions: dimensions ?? this.dimensions,
      laborHours: laborHours ?? this.laborHours,
      costEstimateCents: costEstimateCents ?? this.costEstimateCents,
      photoPaths: photoPaths ?? this.photoPaths,
      unitSystem: unitSystem ?? this.unitSystem,
      createdAt: createdAt,
      updatedAt: updatedAt ?? DateTime.now(),
      dueDate: setDueDateToNull ? null : (dueDate ?? this.dueDate),
      deletedAt: setDeletedAtToNull ? null : (deletedAt ?? this.deletedAt),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'clientId': clientId,
        'status': status.toJson(),
        'description': description,
        'dimensions': dimensions,
        'laborHours': laborHours,
        'costEstimateCents': costEstimateCents,
        'photoPaths': photoPaths,
        'unitSystem': unitSystem,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'dueDate': dueDate?.toIso8601String(),
        'deletedAt': deletedAt?.toIso8601String(),
      };

  @override
  bool operator ==(Object other) =>
      identical(this, other) || (other is Project && other.id == id);

  @override
  int get hashCode => id.hashCode;
}
