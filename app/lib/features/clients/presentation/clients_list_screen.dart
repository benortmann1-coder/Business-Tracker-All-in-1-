import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/empty_state.dart';
import '../data/client_repository.dart';
import '../domain/client.dart';
import 'client_form_sheet.dart';

class ClientsListScreen extends ConsumerWidget {
  const ClientsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final clientsAsync = ref.watch(clientsListProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Clients')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New Client'),
        onPressed: () => ClientFormSheet.show(context),
      ),
      body: clientsAsync.when(
        data: (clients) {
          if (clients.isEmpty) {
            return EmptyState(
              icon: Icons.people_outline,
              title: 'Add your first client',
              subtitle:
                  'Stop digging through text threads. Keep every contact, '
                  'project, and approval in one place.',
              actionLabel: '+ New Client',
              onAction: () => ClientFormSheet.show(context),
            );
          }
          return ListView.separated(
            itemCount: clients.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) => _ClientRow(client: clients[i]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _ClientRow extends ConsumerWidget {
  const _ClientRow({required this.client});

  final Client client;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final initials = client.name.isEmpty
        ? '?'
        : client.name
            .trim()
            .split(RegExp(r'\s+'))
            .map((p) => p.isEmpty ? '' : p[0])
            .take(2)
            .join()
            .toUpperCase();
    final subtitle = [client.phone, client.email]
        .whereType<String>()
        .where((s) => s.isNotEmpty)
        .join(' • ');
    return ListTile(
      minVerticalPadding: 12,
      leading: CircleAvatar(child: Text(initials)),
      title: Text(
        client.name,
        style: Theme.of(context).textTheme.titleLarge,
      ),
      subtitle: subtitle.isEmpty ? null : Text(subtitle),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => ClientFormSheet.show(context, existing: client),
    );
  }
}
