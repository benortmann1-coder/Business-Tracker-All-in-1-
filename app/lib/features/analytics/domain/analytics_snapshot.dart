enum AnalyticsPeriod {
  week('This week'),
  month('This month'),
  quarter('This quarter'),
  year('This year'),
  allTime('All time');

  const AnalyticsPeriod(this.label);

  final String label;
}

class TopClient {
  const TopClient({
    required this.clientId,
    required this.name,
    required this.revenueCents,
    required this.invoiceCount,
  });

  final String clientId;
  final String name;
  final int revenueCents;
  final int invoiceCount;
}

class AgingBuckets {
  const AgingBuckets({
    this.current = 0,
    this.days30 = 0,
    this.days60 = 0,
    this.days90 = 0,
    this.days90Plus = 0,
  });

  /// Cents not yet due (no due date or due date in the future)
  final int current;

  /// Cents 1–30 days past due
  final int days30;
  final int days60;
  final int days90;
  final int days90Plus;

  int get totalOutstandingCents =>
      current + days30 + days60 + days90 + days90Plus;
}

class AnalyticsSnapshot {
  const AnalyticsSnapshot({
    required this.period,
    required this.revenueCents,
    required this.projectsShipped,
    required this.outstandingCents,
    required this.avgDaysToPay,
    required this.quoteToInvoiceRate,
    required this.topClients,
    required this.revenueByWeekCents,
    required this.aging,
    required this.hasData,
  });

  factory AnalyticsSnapshot.empty(AnalyticsPeriod period) =>
      AnalyticsSnapshot(
        period: period,
        revenueCents: 0,
        projectsShipped: 0,
        outstandingCents: 0,
        avgDaysToPay: null,
        quoteToInvoiceRate: null,
        topClients: const [],
        revenueByWeekCents: const [0, 0, 0, 0, 0, 0, 0],
        aging: const AgingBuckets(),
        hasData: false,
      );

  final AnalyticsPeriod period;
  final int revenueCents;
  final int projectsShipped;
  final int outstandingCents;

  /// Median time between a quote being sent and the invoice being paid.
  /// Null if no completed invoices yet.
  final int? avgDaysToPay;

  /// Fraction of sent quotes that resulted in an invoice (0..1).
  /// Null if no quotes have been sent yet.
  final double? quoteToInvoiceRate;

  final List<TopClient> topClients;

  /// Revenue (paid amounts) bucketed into the last 7 weeks. Index 0 = oldest.
  final List<int> revenueByWeekCents;

  final AgingBuckets aging;

  /// True if there's enough data to show meaningful metrics.
  /// False shows the "add data to light up insights" empty state.
  final bool hasData;
}
