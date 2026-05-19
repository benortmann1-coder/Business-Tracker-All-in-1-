import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/coming_soon.dart';
import '../../../shared/widgets/empty_state.dart';

class ToolsListScreen extends StatelessWidget {
  const ToolsListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tools'),
        actions: [
          IconButton(
            icon: const Icon(Icons.calculate_outlined),
            tooltip: 'Board-Foot Calculator',
            onPressed: () => context.go('/tools/board-foot'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Add Tool'),
        onPressed: () => showComingSoon(context, 'Tool inventory'),
      ),
      body: EmptyState(
        icon: Icons.handyman_outlined,
        title: 'Track your shop tools',
        subtitle:
            'Add warranties, serial numbers, and maintenance reminders so nothing falls behind.',
        actionLabel: '+ Add Tool',
        onAction: () => showComingSoon(context, 'Tool inventory'),
      ),
    );
  }
}
