import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Account'),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Profile'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.fingerprint),
            title: const Text('Biometric lock'),
            trailing: Switch(value: false, onChanged: (_) {}),
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
          const _SectionHeader('Marketplace'),
          ListTile(
            leading: const Icon(Icons.storefront_outlined),
            title: const Text('Browse shops'),
            subtitle: const Text('Find woodworkers near you'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.go('/settings/marketplace'),
          ),
          const _SectionHeader('Preferences'),
          ListTile(
            leading: const Icon(Icons.straighten_outlined),
            title: const Text('Units'),
            subtitle: const Text('Imperial (in, ft, lb)'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.attach_money),
            title: const Text('Default markup'),
            subtitle: const Text('25%'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {},
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
