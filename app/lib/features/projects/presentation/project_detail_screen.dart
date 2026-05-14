import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/status_pill.dart';
import '../data/project_repository.dart';

class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({required this.projectId, super.key});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectProvider(projectId));
    return Scaffold(
      appBar: AppBar(title: const Text('Project')),
      body: projectAsync.when(
        data: (project) {
          if (project == null) {
            return const Center(child: Text('Project not found'));
          }
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                project.name,
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 12),
              StatusPill(status: project.status),
              const SizedBox(height: 24),
              _SectionCard(
                title: 'Cut List',
                subtitle: 'Build an optimized cut list for this project',
                icon: Icons.straighten_outlined,
                onTap: () => context.go('/projects/$projectId/cut-list'),
              ),
              const SizedBox(height: 12),
              const _SectionCard(
                title: 'Materials',
                subtitle: 'Lumber, hardware, finishes, fasteners',
                icon: Icons.layers_outlined,
              ),
              const SizedBox(height: 12),
              const _SectionCard(
                title: 'Photos & Drawings',
                subtitle: 'Progress photos and shop drawings',
                icon: Icons.image_outlined,
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'CNC Files',
                subtitle: 'DXF, SVG, and G-code files for this project',
                icon: Icons.precision_manufacturing_outlined,
                onTap: () => context.go('/projects/$projectId/cnc'),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Finishing Schedule',
                subtitle: 'Multi-step finish with drying reminders',
                icon: Icons.timer_outlined,
                onTap: () => context.go('/projects/$projectId/finishing'),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.send_outlined),
                label: const Text('Send Quote'),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 28),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: t.textTheme.titleLarge),
                    const SizedBox(height: 2),
                    Text(subtitle, style: t.textTheme.bodySmall),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
