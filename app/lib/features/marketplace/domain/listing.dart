import 'package:uuid/uuid.dart';

class MarketplaceListing {
  MarketplaceListing({
    required this.shopUid,
    required this.shopName,
    required this.city,
    required this.region,
    required this.country,
    required this.trades,
    required this.priceRange,
    String? id,
    this.shopAvatarUrl,
    this.serviceRadiusKm = 80,
    this.bio = '',
    this.portfolioPhotoIds = const [],
    this.averageRating,
    this.reviewCount = 0,
    this.capacityOpensAt,
    this.active = true,
    DateTime? createdAt,
  })  : id = id ?? const Uuid().v4(),
        createdAt = createdAt ?? DateTime.now();

  final String id;
  final String shopUid;
  final String shopName;
  final String? shopAvatarUrl;
  final String city;
  final String region;
  final String country;
  final int serviceRadiusKm;
  final List<String> trades;
  final ({int minCents, int maxCents}) priceRange;
  final String bio;
  final List<String> portfolioPhotoIds;
  final double? averageRating;
  final int reviewCount;
  final DateTime? capacityOpensAt;
  final bool active;
  final DateTime createdAt;
}
