import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/typography.dart';
import '../../../shared/widgets/coming_soon.dart';
import '../../../shared/widgets/empty_state.dart';
import '../data/analytics_service.dart';
import '../domain/analytics_snapshot.dart';

class AnalyticsDashboardScreen extends ConsumerWidget {
  const AnalyticsDashboardScreen({super.key});

  String _formatCents(int cents) {
    final dollars = cents / 100;
    if (dollars.abs() >= 1000) {
      final k = dollars / 1000;
      return '\$${k.toStringAsFixed(k.abs() >= 10 ? 0 : 1)}k';
    }
    return '\$${dollars.toStringAsFixed(0)}';
  }

  String _formatFullCents(int cents) =>
      '\$${(cents / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final period = ref.watch(analyticsPeriodProvider);
    final snapshotAsync = ref.watch(analyticsSnapshotProvider);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Insights'),
        actions: [
          PopupMenuButton<AnalyticsPeriod>(
            icon: const Icon(Icons.date_range_outlined),
            tooltip: 'Time period',
            initialValue: period,
            itemBuilder: (_) => [
              for (final p in AnalyticsPeriod.values)
                PopupMenuItem(value: p, child: Text(p.label)),
            ],
            onSelected: (p) =>
                ref.read(analyticsPeriodProvider.notifier).state = p,
          ),
        ],
      ),
      body: snapshotAsync.when(
        data: (s) {
          if (!s.hasData) {
            return EmptyState(
              icon: Icons.bar_chart_outlined,
              title: 'No data yet',
              subtitle:
                  'Create projects, send quotes, and record payments — your '
                  'real numbers will light up here as you work.',
            );
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Text(
                  period.label,
                  style: t.textTheme.bodySmall,
                ),
              ),
              Row(
                children: [
                  Expanded(
                    child: _KpiCard(
                      label: 'Revenue',
                      value: _formatCents(s.revenueCents),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _KpiCard(
                      label: 'Projects shipped',
                      value: s.projectsShipped.toString(),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _KpiCard(
                      label: 'Outstanding',
                      value: _formatCents(s.outstandingCents),
                      bad: s.outstandingCents > 0,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _KpiCard(
                      label: 'Median days to pay',
                      value:
                          s.avgDaysToPay == null ? '—' : '${s.avgDaysToPay}',
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _KpiCard(
                      label: 'Quote → invoice',
                      value: s.quoteToInvoiceRate == null
                          ? '—'
                          : '${(s.quoteToInvoiceRate! * 100).toStringAsFixed(0)}%',
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(child: SizedBox.shrink()),
                ],
              ),
              const SizedBox(height: 24),
              Text('Revenue (last 7 weeks)', style: t.textTheme.titleLarge),
              const SizedBox(height: 12),
              _RevenueBarChart(valuesCents: s.revenueByWeekCents),
              const SizedBox(height: 32),
              Text('AR aging', style: t.textTheme.titleLarge),
              const SizedBox(height: 8),
              _AgingBucketsCard(
                aging: s.aging,
                formatter: _formatFullCents,
              ),
              const SizedBox(height: 32),
              Text('Top clients', style: t.textTheme.titleLarge),
              const SizedBox(height: 8),
              if (s.topClients.isEmpty)
                Card(
                  color: t.colorScheme.surfaceContainerHighest
                      .withValues(alpha: 0.5),
                  child: const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text('No paid invoices in this period yet.'),
                  ),
                )
              else
                for (final c in s.topClients)
                  _ClientRow(
                    name: c.name,
                    invoiceCount: c.invoiceCount,
                    revenueCents: c.revenueCents,
                    formatter: _formatFullCents,
                  ),
              const SizedBox(height: 32),
              OutlinedButton.icon(
                onPressed: () => showComingSoon(context, 'PDF export'),
                icon: const Icon(Icons.ios_share_outlined),
                label: const Text('Export PDF'),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({
    required this.label,
    required this.value,
    this.bad = false,
  });

  final String label;
  final String value;
  final bool bad;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
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
                color: bad
                    ? t.colorScheme.error
                    : t.colorScheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RevenueBarChart extends StatelessWidget {
  const _RevenueBarChart({required this.valuesCents});

  final List<int> valuesCents;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final maxCents = valuesCents.fold<int>(0, (m, v) => v > m ? v : m);
    return SizedBox(
      height: 140,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (final v in valuesCents)
            Expanded(
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                height: maxCents == 0 ? 4 : (v / maxCents) * 140,
                decoration: BoxDecoration(
                  color: t.colorScheme.primary
                      .withValues(alpha: v == 0 ? 0.15 : 1.0),
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

class _AgingBucketsCard extends StatelessWidget {
  const _AgingBucketsCard({
    required this.aging,
    required this.formatter,
  });

  final AgingBuckets aging;
  final String Function(int) formatter;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    if (aging.totalOutstandingCents == 0) {
      return Card(
        color: t.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        child: const Padding(
          padding: EdgeInsets.all(16),
          child: Text("You're all paid up. Nothing outstanding."),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            _AgingRow(label: 'Current', cents: aging.current, formatter: formatter),
            _AgingRow(label: '1–30 days', cents: aging.days30, formatter: formatter),
            _AgingRow(label: '31–60 days', cents: aging.days60, formatter: formatter),
            _AgingRow(label: '61–90 days', cents: aging.days90, formatter: formatter),
            _AgingRow(
              label: '90+ days',
              cents: aging.days90Plus,
              formatter: formatter,
              warn: true,
            ),
            const Divider(),
            _AgingRow(
              label: 'TOTAL outstanding',
              cents: aging.totalOutstandingCents,
              formatter: formatter,
              bold: true,
            ),
          ],
        ),
      ),
    );
  }
}

class _AgingRow extends StatelessWidget {
  const _AgingRow({
    required this.label,
    required this.cents,
    required this.formatter,
    this.bold = false,
    this.warn = false,
  });

  final String label;
  final int cents;
  final String Function(int) formatter;
  final bool bold;
  final bool warn;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final color = warn && cents > 0 ? t.colorScheme.error : null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: t.textTheme.bodyMedium?.copyWith(
                fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
                color: color,
              ),
            ),
          ),
          Text(
            formatter(cents),
            style: t.textTheme.bodyMedium?.copyWith(
              fontFamily: 'monospace',
              fontWeight: bold ? FontWeight.w700 : FontWeight.w400,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

class _ClientRow extends StatelessWidget {
  const _ClientRow({
    required this.name,
    required this.invoiceCount,
    required this.revenueCents,
    required this.formatter,
  });

  final String name;
  final int invoiceCount;
  final int revenueCents;
  final String Function(int) formatter;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: t.textTheme.bodyLarge),
                Text(
                  '$invoiceCount invoice${invoiceCount == 1 ? '' : 's'}',
                  style: t.textTheme.bodySmall,
                ),
              ],
            ),
          ),
          Text(
            formatter(revenueCents),
            style: t.textTheme.titleMedium?.copyWith(
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }
}
