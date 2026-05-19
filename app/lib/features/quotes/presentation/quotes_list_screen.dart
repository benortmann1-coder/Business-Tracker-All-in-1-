import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../clients/data/client_repository.dart';
import '../../../shared/widgets/empty_state.dart';
import '../data/quote_repository.dart';
import '../domain/quote.dart';
import 'quote_form_sheet.dart';

class QuotesListScreen extends ConsumerWidget {
  const QuotesListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quotesAsync = ref.watch(quotesListProvider);
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Quotes & Invoices'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Quotes'),
              Tab(text: 'Invoices'),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton.extended(
          icon: const Icon(Icons.add),
          label: const Text('New Quote'),
          onPressed: () => QuoteFormSheet.show(context),
        ),
        body: TabBarView(
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
            const EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices yet',
              subtitle: 'Approved quotes become invoices with one tap. '
                  'Invoice builder ships in the next release.',
            ),
          ],
        ),
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
            _StatusChip(status: quote.status),
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

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});

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
