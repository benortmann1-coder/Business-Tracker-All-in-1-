import 'package:flutter/material.dart';

import '../../../core/theme/colors.dart';
import '../../../shared/widgets/coming_soon.dart';
import '../domain/listing.dart';

class MarketplaceBrowseScreen extends StatelessWidget {
  const MarketplaceBrowseScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final listings = [
      MarketplaceListing(
        shopUid: 'demo-1',
        shopName: 'Hilltop Custom',
        city: 'Asheville',
        region: 'NC',
        country: 'US',
        trades: const ['cabinets', 'furniture'],
        priceRange: (minCents: 200000, maxCents: 1500000),
        averageRating: 4.9,
        reviewCount: 23,
        bio: 'Family-run shop specializing in walnut and white oak case goods.',
      ),
      MarketplaceListing(
        shopUid: 'demo-2',
        shopName: 'Mara Kitchens',
        city: 'Portland',
        region: 'OR',
        country: 'US',
        trades: const ['cabinets'],
        priceRange: (minCents: 800000, maxCents: 5000000),
        averageRating: 4.7,
        reviewCount: 41,
        bio: 'Full-service kitchen cabinet design and installation.',
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Marketplace'),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune_outlined),
            tooltip: 'Filter',
            onPressed: () => showComingSoon(context, 'Marketplace filtering'),
          ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: listings.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _ListingCard(listing: listings[i]),
      ),
    );
  }
}

class _ListingCard extends StatelessWidget {
  const _ListingCard({required this.listing});

  final MarketplaceListing listing;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(child: Text(listing.shopName[0])),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(listing.shopName, style: t.textTheme.titleLarge),
                      Text(
                        '${listing.city}, ${listing.region}',
                        style: t.textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                if (listing.averageRating != null) ...[
                  const Icon(Icons.star, size: 16, color: AppColors.amber500),
                  const SizedBox(width: 4),
                  Text(
                    '${listing.averageRating!.toStringAsFixed(1)} '
                    '(${listing.reviewCount})',
                    style: t.textTheme.bodySmall,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Text(listing.bio, style: t.textTheme.bodyMedium),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              children: [
                for (final trade in listing.trades)
                  Chip(label: Text(trade), visualDensity: VisualDensity.compact),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              _formatPriceRange(listing.priceRange),
              style: t.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatPriceRange(({int minCents, int maxCents}) range) {
    final minDollars = (range.minCents / 100).toStringAsFixed(0);
    final maxDollars = (range.maxCents / 100).toStringAsFixed(0);
    return 'Typical projects: \$$minDollars – \$$maxDollars';
  }
}
