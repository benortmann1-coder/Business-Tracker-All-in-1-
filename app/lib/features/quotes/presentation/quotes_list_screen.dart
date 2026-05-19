import 'package:flutter/material.dart';

import '../../../shared/widgets/coming_soon.dart';
import '../../../shared/widgets/empty_state.dart';

class QuotesListScreen extends StatelessWidget {
  const QuotesListScreen({super.key});

  @override
  Widget build(BuildContext context) {
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
          onPressed: () => showComingSoon(context, 'Quote builder'),
        ),
        body: const TabBarView(
          children: [
            EmptyState(
              icon: Icons.description_outlined,
              title: 'Your quote ledger is empty',
              subtitle:
                  'Build quotes with markup, send PDFs, and capture signatures.',
              actionLabel: '+ New Quote',
            ),
            EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No invoices yet',
              subtitle: 'Approved quotes become invoices with one tap.',
            ),
          ],
        ),
      ),
    );
  }
}
