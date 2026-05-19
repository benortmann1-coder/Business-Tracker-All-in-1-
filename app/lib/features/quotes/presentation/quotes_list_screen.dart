import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../clients/data/client_repository.dart';
import '../../invoices/data/invoice_repository.dart';
import '../../invoices/domain/invoice.dart';
import '../../invoices/presentation/invoice_form_sheet.dart';
import '../data/quote_repository.dart';
import '../domain/quote.dart';
import 'quote_form_sheet.dart';

class QuotesListScreen extends ConsumerStatefulWidget {
  const QuotesListScreen({super.key});

  @override
  ConsumerState<QuotesListScreen> createState() => _QuotesListScreenState();
}

class _QuotesListScreenState extends ConsumerState<QuotesListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _tab.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final quotesAsync = ref.watch(quotesListProvider);
    final invoicesAsync = ref.watch(invoicesListProvider);
    final isQuotesTab = _tab.index == 0;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Quotes & Invoices'),
        bottom: TabBar(
          controller: _tab,
          tabs: const [
            Tab(text: 'Quotes'),
            Tab(text: 'Invoices'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: Text(isQuotesTab ? 'New Quote' : 'New Invoice'),
        onPressed: () => isQuotesTab
            ? QuoteFormSheet.show(context)
            : InvoiceFormSheet.show(context),
      ),
      body: TabBarView(
        controller: _tab,
        children: [
          quotesAsync.when(
            data: (quotes) {
              if (quotes.isEmpty) {
                return EmptyState(
                  icon: Icons.description_outlined,
                  title: 'Your quote ledger is empty',
                  subtitle:
                      'Build quotes with line items, markup, and tax. '
                      'Save to send later.',
                  actionLabel: '+ New Quote',
                  onAction: () => QuoteFormSheet.show(context),
                );
              }
              return ListView.separated(
                itemCount: quotes.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) => _QuoteRow(quote: quotes[i]),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
          invoicesAsync.when(
            data: (invoices) {
              if (invoices.isEmpty) {
                return EmptyState(
                  icon: Icons.receipt_long_outlined,
                  title: 'No invoices yet',
                  subtitle:
                      'Convert an approved quote into an invoice, or '
                      'create one from scratch.',
                  actionLabel: '+ New Invoice',
                  onAction: () => InvoiceFormSheet.show(context),
                );
              }
              return ListView.separated(
                itemCount: invoices.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) => _InvoiceRow(invoice: invoices[i]),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(child: Text('Error: $e')),
          ),
        ],
      ),
    );
  }
}

class _QuoteRow extends ConsumerWidget {
  const _QuoteRow({required this.quote});

  final Quote quote;

  String _formatCents(int cents) =>
      '\$${(cents / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final clientAsync = quote.clientId == null
        ? null
        : ref.watch(clientProvider(quote.clientId!));
    return ListTile(
      minVerticalPadding: 14,
      title: Text(
        quote.title.isEmpty ? '(Untitled quote)' : quote.title,
        style: t.textTheme.titleLarge,
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            _QuoteStatusChip(status: quote.status),
            const SizedBox(width: 8),
            if (clientAsync != null)
              Flexible(
                child: clientAsync.when(
                  data: (c) => Text(
                    c?.name ?? '',
                    overflow: TextOverflow.ellipsis,
                  ),
                  loading: () => const Text(''),
                  error: (_, __) => const Text(''),
                ),
              ),
          ],
        ),
      ),
      trailing: Text(
        _formatCents(quote.totalCents),
        style: t.textTheme.titleMedium?.copyWith(
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
      onTap: () => QuoteFormSheet.show(context, existing: quote),
    );
  }
}

class _QuoteStatusChip extends StatelessWidget {
  const _QuoteStatusChip({required this.status});

  final QuoteStatus status;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    Color bg;
    switch (status) {
      case QuoteStatus.draft:
        bg = t.colorScheme.surfaceContainerHighest;
      case QuoteStatus.sent:
        bg = t.colorScheme.primary.withValues(alpha: 0.18);
      case QuoteStatus.approved:
        bg = t.colorScheme.primary.withValues(alpha: 0.28);
      case QuoteStatus.declined:
        bg = t.colorScheme.error.withValues(alpha: 0.18);
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
  }
}

class _InvoiceRow extends ConsumerWidget {
  const _InvoiceRow({required this.invoice});

  final Invoice invoice;

  String _formatCents(int cents) =>
      '\$${(cents / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    final clientAsync = invoice.clientId == null
        ? null
        : ref.watch(clientProvider(invoice.clientId!));
    final effectiveStatus = invoice.effectiveStatus;
    return ListTile(
      minVerticalPadding: 14,
      title: Text(
        invoice.title.isEmpty ? '(Untitled invoice)' : invoice.title,
        style: t.textTheme.titleLarge,
      ),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            _InvoiceStatusChip(status: effectiveStatus),
            const SizedBox(width: 8),
            if (clientAsync != null)
              Flexible(
                child: clientAsync.when(
                  data: (c) => Text(
                    c?.name ?? '',
                    overflow: TextOverflow.ellipsis,
                  ),
                  loading: () => const Text(''),
                  error: (_, __) => const Text(''),
                ),
              ),
          ],
        ),
      ),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            _formatCents(invoice.totalCents),
            style: t.textTheme.titleMedium?.copyWith(
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          if (invoice.balanceCents > 0)
            Text(
              'Balance ${_formatCents(invoice.balanceCents)}',
              style: t.textTheme.bodySmall?.copyWith(
                color: t.colorScheme.error,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
        ],
      ),
      onTap: () => InvoiceFormSheet.show(context, existing: invoice),
    );
  }
}

class _InvoiceStatusChip extends StatelessWidget {
  const _InvoiceStatusChip({required this.status});

  final InvoiceStatus status;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    Color bg;
    switch (status) {
      case InvoiceStatus.draft:
        bg = t.colorScheme.surfaceContainerHighest;
      case InvoiceStatus.sent:
        bg = t.colorScheme.primary.withValues(alpha: 0.18);
      case InvoiceStatus.partiallyPaid:
        bg = t.colorScheme.tertiary.withValues(alpha: 0.28);
      case InvoiceStatus.paid:
        bg = t.colorScheme.primary.withValues(alpha: 0.32);
      case InvoiceStatus.overdue:
        bg = t.colorScheme.error.withValues(alpha: 0.22);
      case InvoiceStatus.voided:
        bg = t.colorScheme.surfaceContainerHighest;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.label,
        style: t.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.w600),
      ),
    );
  }
}
