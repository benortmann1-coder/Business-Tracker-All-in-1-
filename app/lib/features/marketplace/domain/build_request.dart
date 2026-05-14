import 'package:uuid/uuid.dart';

enum BuildRequestStatus { open, matched, closed, completed }

class BuildRequest {
  BuildRequest({
    required this.clientName,
    required this.clientEmail,
    required this.description,
    required this.city,
    required this.region,
    required this.country,
    String? id,
    this.clientUid,
    this.budgetCents,
    this.targetStartAt,
    this.attachmentPaths = const [],
    this.matchedListingIds = const [],
    this.status = BuildRequestStatus.open,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String? clientUid;
  final String clientName;
  final String clientEmail;
  final String description;
  final int? budgetCents;
  final DateTime? targetStartAt;
  final List<String> attachmentPaths;
  final String city;
  final String region;
  final String country;
  final List<String> matchedListingIds;
  final BuildRequestStatus status;
  final DateTime createdAt;
}
