import 'package:flutter/material.dart';

import '../../../shared/widgets/coming_soon.dart';

class CloudSyncScreen extends StatelessWidget {
  const CloudSyncScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Cloud Sync')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Icon(
                    Icons.cloud_outlined,
                    size: 64,
                    color: t.colorScheme.primary,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Multi-device sync',
                    style: t.textTheme.headlineMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Your shop, on every device. Encrypted backups. Works offline first, syncs when online.',
                    style: t.textTheme.bodyMedium,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () =>
                        showComingSoon(context, 'Cloud Sync subscriptions'),
                    child: const Text(r'Start trial — $4.99/mo'),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () =>
                        showComingSoon(context, 'Cloud Sync subscriptions'),
                    child: const Text(r'Or pay annually — $39.99/yr'),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 32),
          Text('What you get', style: t.textTheme.titleLarge),
          const SizedBox(height: 12),
          const _Feature(
            icon: Icons.devices_outlined,
            label: 'Sync across iOS, Android, and (soon) web',
          ),
          const _Feature(
            icon: Icons.shield_outlined,
            label: 'Encrypted backups',
          ),
          const _Feature(
            icon: Icons.timer_outlined,
            label: 'Finishing schedule tracker bundled in',
          ),
          const _Feature(
            icon: Icons.bar_chart_outlined,
            label: 'Advanced analytics bundled in',
          ),
        ],
      ),
    );
  }
}

class _Feature extends StatelessWidget {
  const _Feature({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, color: t.colorScheme.primary),
          const SizedBox(width: 16),
          Expanded(child: Text(label, style: t.textTheme.bodyLarge)),
        ],
      ),
    );
  }
}
