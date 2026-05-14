import 'package:flutter/material.dart';

import '../../../core/theme/typography.dart';

class AnalyticsDashboardScreen extends StatelessWidget {
  const AnalyticsDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Insights'),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.date_range_outlined),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'week', child: Text('This Week')),
              PopupMenuItem(value: 'month', child: Text('This Month')),
              PopupMenuItem(value: 'quarter', child: Text('This Quarter')),
              PopupMenuItem(value: 'year', child: Text('This Year')),
            ],
            onSelected: (_) {},
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'Revenue',
                  value: r'$12,840',
                  delta: '+18%',
                  good: true,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _KpiCard(
                  label: 'Projects shipped',
                  value: '7',
                  delta: '+2',
                  good: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Row(
            children: [
              Expanded(
                child: _KpiCard(
                  label: 'Avg margin',
                  value: '34%',
                  delta: '-2%',
                  good: false,
                ),
              ),
              SizedBox(width: 12),
              Expanded(
                child: _KpiCard(
                  label: 'Days to pay',
                  value: '11',
                  delta: '-3',
                  good: true,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Revenue by week', style: t.textTheme.titleLarge),
          const SizedBox(height: 12),
          const _MiniBarChart(values: [3.2, 2.1, 4.5, 3.8, 5.1, 4.2, 6.0]),
          const SizedBox(height: 32),
          Text('Top clients', style: t.textTheme.titleLarge),
          const SizedBox(height: 8),
          const _ClientRow(name: 'Hilltop Custom', value: r'$4,200'),
          const _ClientRow(name: 'Mara Kitchens', value: r'$3,840'),
          const _ClientRow(name: 'Cedar Stoneworks', value: r'$2,100'),
          const SizedBox(height: 32),
          OutlinedButton.icon(
            onPressed: () {},
            icon: const Icon(Icons.ios_share_outlined),
            label: const Text('Export PDF'),
          ),
        ],
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    required this.delta,
    required this.good,
  });

  final String label;
  final String value;
  final String delta;
  final bool good;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final deltaColor = good ? t.colorScheme.primary : t.colorScheme.error;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: t.textTheme.bodySmall),
            const SizedBox(height: 8),
            Text(
              value,
              style: AppTypography.numericDisplay.copyWith(
                color: t.colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              delta,
              style: t.textTheme.bodySmall?.copyWith(
                color: deltaColor,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniBarChart extends StatelessWidget {
  const _MiniBarChart({required this.values});

  final List<double> values;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final max = values.reduce((a, b) => a > b ? a : b);
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final v in values)
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                height: (v / max) * 140,
                decoration: BoxDecoration(
                  color: t.colorScheme.primary,
                  borderRadius:
                      const BorderRadius.vertical(top: Radius.circular(4)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ClientRow extends StatelessWidget {
  const _ClientRow({required this.name, required this.value});

  final String name;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(child: Text(name)),
          Text(value, style: const TextStyle(fontFamily: 'monospace')),
        ],
      ),
    );
  }
}
