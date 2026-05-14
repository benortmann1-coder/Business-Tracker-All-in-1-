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
    this.costEstimate = 0,
    this.photoPaths = const [],
    DateTime? createdAt,
    this.dueDate,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  factory Project.fromJson(Map<String, dynamic> json) => Project(
        id: json['id'] as String,
        name: json['name'] as String,
        clientId: json['clientId'] as String?,
        status: ProjectStatus.fromJson(json['status'] as String),
        description: json['description'] as String? ?? '',
        dimensions: json['dimensions'] as String? ?? '',
        laborHours: (json['laborHours'] as num?)?.toDouble() ?? 0,
        costEstimate: (json['costEstimate'] as num?)?.toDouble() ?? 0,
        photoPaths:
            (json['photoPaths'] as List<dynamic>?)?.cast<String>() ?? const [],
        createdAt: DateTime.parse(json['createdAt'] as String),
        dueDate: json['dueDate'] != null
            ? DateTime.parse(json['dueDate'] as String)
            : null,
      );

  final String id;
  final String name;
  final String? clientId;
  final ProjectStatus status;
  final String description;
  final String dimensions;
  final double laborHours;
  final double costEstimate;
  final List<String> photoPaths;
  final DateTime createdAt;
  final DateTime? dueDate;

  Project copyWith({
    String? name,
    String? clientId,
    ProjectStatus? status,
    String? description,
    String? dimensions,
    double? laborHours,
    double? costEstimate,
    List<String>? photoPaths,
    DateTime? dueDate,
  }) {
    return Project(
      id: id,
      name: name ?? this.name,
      clientId: clientId ?? this.clientId,
      status: status ?? this.status,
      description: description ?? this.description,
      dimensions: dimensions ?? this.dimensions,
      laborHours: laborHours ?? this.laborHours,
      costEstimate: costEstimate ?? this.costEstimate,
      photoPaths: photoPaths ?? this.photoPaths,
      createdAt: createdAt,
      dueDate: dueDate ?? this.dueDate,
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
        'costEstimate': costEstimate,
        'photoPaths': photoPaths,
        'createdAt': createdAt.toIso8601String(),
        'dueDate': dueDate?.toIso8601String(),
      };
}
