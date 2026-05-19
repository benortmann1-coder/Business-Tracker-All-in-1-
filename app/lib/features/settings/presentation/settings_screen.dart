import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/utils/csv_exporter.dart';
import '../../../shared/widgets/coming_soon.dart';
import '../../clients/data/client_repository.dart';
import '../../projects/data/project_repository.dart';
import '../../quotes/data/quote_repository.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Account'),
          ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: const Text('Shop info'),
            subtitle: const Text('Name, address, license, defaults'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/shop-info'),
          ),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Profile'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showComingSoon(context, 'Profile editing'),
          ),
          const SwitchListTile(
            secondary: Icon(Icons.fingerprint),
            title: Text('Biometric lock'),
            subtitle: Text('Coming soon'),
            value: false,
            onChanged: null,
          ),
          const _SectionHeader('Insights'),
          ListTile(
            leading: const Icon(Icons.bar_chart_outlined),
            title: const Text('View insights'),
            subtitle: const Text('Revenue, margin, days to pay'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/insights'),
          ),
          const _SectionHeader('Subscription & Add-Ons'),
          ListTile(
            leading: const Icon(Icons.cloud_outlined),
            title: const Text('Cloud Sync'),
            subtitle: const Text('Not subscribed'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/cloud-sync'),
          ),
          ListTile(
            leading: const Icon(Icons.groups_outlined),
            title: const Text('Team Collaboration'),
            subtitle: const Text('Solo account'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/team'),
          ),
          ListTile(
            leading: const Icon(Icons.precision_manufacturing_outlined),
            title: const Text('CNC File Manager'),
            subtitle: const Text('Not purchased'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/cnc'),
          ),
          const _SectionHeader('Library'),
          ListTile(
            leading: const Icon(Icons.layers_outlined),
            title: const Text('Materials & hardware'),
            subtitle: const Text('Lumber, hinges, finishes, fasteners'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/materials'),
          ),
          const _SectionHeader('Preferences'),
          ListTile(
            leading: const Icon(Icons.straighten_outlined),
            title: const Text('Units'),
            subtitle: const Text('Imperial (in, ft, lb)'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showComingSoon(context, 'Unit preferences'),
          ),
          ListTile(
            leading: const Icon(Icons.attach_money),
            title: const Text('Default markup'),
            subtitle: const Text('25%'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => showComingSoon(context, 'Markup preferences'),
          ),
          const _SectionHeader('Data'),
          ListTile(
            leading: const Icon(Icons.ios_share_outlined),
            title: const Text('Export data (CSV)'),
            subtitle: const Text('Download projects, clients, and quotes'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showExportSheet(context, ref),
          ),
          const _SectionHeader('About'),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('Version'),
            subtitle: Text('0.1.0'),
          ),
        ],
      ),
    );
  }

  Future<void> _showExportSheet(BuildContext context, WidgetRef ref) async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text(
                'Export to CSV',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              subtitle: Text("You'll be prompted to share or save the file."),
            ),
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.folder_outlined),
              title: const Text('Projects'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                final repo = ref.read(projectRepositoryProvider);
                final projects = await repo.list();
                await const CsvExporter().exportProjects(projects);
              },
            ),
            ListTile(
              leading: const Icon(Icons.people_outline),
              title: const Text('Clients'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                final repo = ref.read(clientRepositoryProvider);
                final clients = await repo.list();
                await const CsvExporter().exportClients(clients);
              },
            ),
            ListTile(
              leading: const Icon(Icons.description_outlined),
              title: const Text('Quotes'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                final repo = ref.read(quoteRepositoryProvider);
                final quotes = await repo.list();
                await const CsvExporter().exportQuotes(quotes);
              },
            ),
            ListTile(
              leading: const Icon(Icons.list_alt_outlined),
              title: const Text('Quote line items'),
              subtitle: const Text('Itemized export across all quotes'),
              onTap: () async {
                Navigator.of(sheetCtx).pop();
                final repo = ref.read(quoteRepositoryProvider);
                final quotes = await repo.list();
                await const CsvExporter().exportQuoteLineItems(quotes);
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelSmall,
      ),
    );
  }
}
