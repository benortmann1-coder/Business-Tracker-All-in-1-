import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../clients/data/client_repository.dart';
import '../../clients/domain/client.dart';
import '../../invoices/data/invoice_repository.dart';
import '../../invoices/domain/invoice.dart';
import '../../projects/data/project_repository.dart';
import '../../projects/domain/project.dart';
import '../../quotes/data/quote_repository.dart';
import '../../quotes/domain/quote.dart';
import '../../../shared/models/project_status.dart';
import '../domain/analytics_snapshot.dart';

/// User-selected period for the dashboard. Persists per session.
final analyticsPeriodProvider = StateProvider<AnalyticsPeriod>(
  (_) => AnalyticsPeriod.month,
);

/// Live-computed snapshot derived from the user's projects, quotes,
/// invoices, and clients. Recomputes whenever those repositories change
/// (Riverpod tracks the dependencies).
final analyticsSnapshotProvider =
    FutureProvider.autoDispose<AnalyticsSnapshot>((ref) async {
  final period = ref.watch(analyticsPeriodProvider);
  final invoices = await ref.watch(invoicesListProvider.future);
  final projects = await ref.watch(projectsListProvider.future);
  final clients = await ref.watch(clientsListProvider.future);
  final quotes = await ref.watch(quotesListProvider.future);
  return computeAnalytics(
    period: period,
    invoices: invoices,
    projects: projects,
    clients: clients,
    quotes: quotes,
  );
});

AnalyticsSnapshot computeAnalytics({
  required AnalyticsPeriod period,
  required List<Invoice> invoices,
  required List<Project> projects,
  required List<Client> clients,
  required List<Quote> quotes,
  DateTime? now,
}) {
  final today = now ?? DateTime.now();
  final periodStart = _periodStart(period, today);
  final hasData = invoices.isNotEmpty || projects.isNotEmpty;
  if (!hasData) return AnalyticsSnapshot.empty(period);

  // Revenue in period (sum of payments dated within the period)
  var revenueCents = 0;
  for (final inv in invoices) {
    for (final p in inv.payments) {
      if (_inPeriod(p.paidAt, periodStart, today)) {
        revenueCents += p.amountCents;
      }
    }
  }

  // Projects shipped in period (delivered/completed within window)
  final projectsShipped = projects.where((p) {
    if (p.status != ProjectStatus.delivered &&
        p.status != ProjectStatus.completed) {
      return false;
    }
    return _inPeriod(p.updatedAt, periodStart, today);
  }).length;

  // Outstanding cents = unpaid balance across all invoices (not period-bound)
  final outstandingCents = invoices.fold<int>(
    0,
    (s, inv) => s + (inv.balanceCents > 0 ? inv.balanceCents : 0),
  );

  // Median days to pay across invoices paid in period
  final daysToPaySamples = <int>[];
  for (final inv in invoices) {
    if (!inv.isFullyPaid) continue;
    if (inv.payments.isEmpty) continue;
    final lastPaid = inv.payments
        .map((p) => p.paidAt)
        .reduce((a, b) => a.isAfter(b) ? a : b);
    final start = inv.sentAt ?? inv.createdAt;
    if (!_inPeriod(lastPaid, periodStart, today)) continue;
    daysToPaySamples.add(lastPaid.difference(start).inDays);
  }
  daysToPaySamples.sort();
  final medianDaysToPay = daysToPaySamples.isEmpty
      ? null
      : daysToPaySamples[daysToPaySamples.length ~/ 2];

  // Quote → invoice rate (sent quotes in period vs invoices in period)
  final sentQuotesInPeriod = quotes.where((q) {
    if (q.status != QuoteStatus.sent &&
        q.status != QuoteStatus.approved &&
        q.status != QuoteStatus.declined) {
      return false;
    }
    final sent = q.sentAt ?? q.createdAt;
    return _inPeriod(sent, periodStart, today);
  }).length;
  final invoicesFromQuotesInPeriod = invoices.where((inv) {
    if (inv.quoteId == null) return false;
    return _inPeriod(inv.createdAt, periodStart, today);
  }).length;
  final quoteToInvoiceRate = sentQuotesInPeriod == 0
      ? null
      : invoicesFromQuotesInPeriod / sentQuotesInPeriod;

  // Top clients by revenue in period
  final clientById = {for (final c in clients) c.id: c};
  final revenueByClient = <String, _ClientStats>{};
  for (final inv in invoices) {
    if (inv.clientId == null) continue;
    for (final p in inv.payments) {
      if (!_inPeriod(p.paidAt, periodStart, today)) continue;
      final stats =
          revenueByClient.putIfAbsent(inv.clientId!, _ClientStats.new);
      stats.revenueCents += p.amountCents;
      stats.invoiceIds.add(inv.id);
    }
  }
  final topClientEntries = revenueByClient.entries.toList()
    ..sort((a, b) => b.value.revenueCents.compareTo(a.value.revenueCents));
  final topClients = topClientEntries.take(5).map((e) {
    final client = clientById[e.key];
    return TopClient(
      clientId: e.key,
      name: client?.name ?? '(Unknown client)',
      revenueCents: e.value.revenueCents,
      invoiceCount: e.value.invoiceIds.length,
    );
  }).toList();

  // Revenue by week (last 7 weeks, oldest to newest)
  final revenueByWeek = List<int>.filled(7, 0);
  for (final inv in invoices) {
    for (final p in inv.payments) {
      final daysAgo = today.difference(p.paidAt).inDays;
      if (daysAgo < 0 || daysAgo > 49) continue;
      final bucket = 6 - daysAgo ~/ 7;
      if (bucket >= 0 && bucket < 7) {
        revenueByWeek[bucket] += p.amountCents;
      }
    }
  }

  // AR aging
  final aging = _computeAging(invoices, today);

  return AnalyticsSnapshot(
    period: period,
    revenueCents: revenueCents,
    projectsShipped: projectsShipped,
    outstandingCents: outstandingCents,
    avgDaysToPay: medianDaysToPay,
    quoteToInvoiceRate: quoteToInvoiceRate,
    topClients: topClients,
    revenueByWeekCents: revenueByWeek,
    aging: aging,
    hasData: true,
  );
}

DateTime _periodStart(AnalyticsPeriod period, DateTime now) {
  switch (period) {
    case AnalyticsPeriod.week:
      return now.subtract(Duration(days: now.weekday - 1));
    case AnalyticsPeriod.month:
      return DateTime(now.year, now.month);
    case AnalyticsPeriod.quarter:
      final qStart = ((now.month - 1) ~/ 3) * 3 + 1;
      return DateTime(now.year, qStart);
    case AnalyticsPeriod.year:
      return DateTime(now.year);
    case AnalyticsPeriod.allTime:
      return DateTime(1970);
  }
}

bool _inPeriod(DateTime t, DateTime start, DateTime end) =>
    !t.isBefore(start) && !t.isAfter(end);

AgingBuckets _computeAging(List<Invoice> invoices, DateTime now) {
  var current = 0;
  var d30 = 0;
  var d60 = 0;
  var d90 = 0;
  var d90Plus = 0;
  for (final inv in invoices) {
    if (inv.balanceCents <= 0) continue;
    if (inv.status == InvoiceStatus.voided) continue;
    final due = inv.dueDate;
    if (due == null || due.isAfter(now)) {
      current += inv.balanceCents;
      continue;
    }
    final daysOverdue = now.difference(due).inDays;
    if (daysOverdue <= 30) {
      d30 += inv.balanceCents;
    } else if (daysOverdue <= 60) {
      d60 += inv.balanceCents;
    } else if (daysOverdue <= 90) {
      d90 += inv.balanceCents;
    } else {
      d90Plus += inv.balanceCents;
    }
  }
  return AgingBuckets(
    current: current,
    days30: d30,
    days60: d60,
    days90: d90,
    days90Plus: d90Plus,
  );
}

class _ClientStats {
  int revenueCents = 0;
  final Set<String> invoiceIds = {};
}
