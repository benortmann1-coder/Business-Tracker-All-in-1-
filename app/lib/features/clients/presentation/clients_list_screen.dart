import 'package:flutter/material.dart';

import '../../../shared/widgets/empty_state.dart';

class ClientsListScreen extends StatelessWidget {
  const ClientsListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Clients')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New Client'),
        onPressed: () {},
      ),
      body: const EmptyState(
        icon: Icons.people_outline,
        title: 'Add your first client',
        subtitle:
            'Stop digging through text threads. Keep every contact, project, and approval in one place.',
        actionLabel: '+ New Client',
      ),
    );
  }
}
