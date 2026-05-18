import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/paywall_gate.dart';
import '../../subscriptions/data/entitlements.dart';
import '../domain/team_member.dart';

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unlocked = ref.watch(entitlementsProvider).teamActive;

    if (!unlocked) {
      return Scaffold(
        appBar: AppBar(title: const Text('Team')),
        body: const PaywallGate(
          featureName: 'Team Collaboration',
          tagline: 'Share projects and assign tasks across your shop.',
          icon: Icons.groups_outlined,
          price: r'$9.99/seat/mo',
          bullets: [
            'Roles: owner, admin, member, viewer',
            'Per-project task assignment',
            'Shared activity feed',
            'Add seats as your shop grows',
          ],
        ),
      );
    }

    final members = [
      TeamMember(
        uid: 'u1',
        displayName: 'You',
        email: 'you@example.com',
        role: TeamRole.owner,
      ),
      TeamMember(
        uid: 'u2',
        displayName: 'Sam',
        email: 'sam@example.com',
        role: TeamRole.member,
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Team'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_add_outlined),
            tooltip: 'Invite member',
            onPressed: () {},
          ),
        ],
      ),
      body: ListView.separated(
        itemCount: members.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (_, i) {
          final m = members[i];
          return ListTile(
            leading: CircleAvatar(child: Text(m.displayName[0])),
            title: Text(m.displayName),
            subtitle: Text(m.email),
            trailing: Text(m.role.label),
          );
        },
      ),
    );
  }
}
