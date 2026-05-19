import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/status_pill.dart';
import '../../time_tracking/presentation/project_timer_card.dart';
import '../data/project_repository.dart';
import 'project_form_sheet.dart';

class ProjectDetailScreen extends ConsumerWidget {
  const ProjectDetailScreen({required this.projectId, super.key});

  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectProvider(projectId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Project'),
        actions: [
          projectAsync.maybeWhen(
            data: (project) {
              if (project == null) return const SizedBox.shrink();
              return IconButton(
                icon: const Icon(Icons.edit_outlined),
                tooltip: 'Edit project',
                onPressed: () =>
                    ProjectFormSheet.show(context, existing: project),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
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
              if (project.dimensions.isNotEmpty) ...[
                const SizedBox(height: 16),
                _LabeledRow(
                  label: 'Dimensions',
                  value: project.dimensions,
                ),
              ],
              if (project.dueDate != null) ...[
                const SizedBox(height: 8),
                _LabeledRow(
                  label: 'Due',
                  value: _fmtDate(project.dueDate!),
                ),
              ],
              if (project.description.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(
                  project.description,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
              ],
              const SizedBox(height: 24),
              ProjectTimerCard(projectId: projectId),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Time entries',
                subtitle: 'See and edit logged shop hours',
                icon: Icons.timer_outlined,
                onTap: () => context.go('/projects/$projectId/time'),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Cut List',
                subtitle: 'Build an optimized cut list for this project',
                icon: Icons.straighten_outlined,
                onTap: () => context.go('/projects/$projectId/cut-list'),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Finishing Schedule',
                subtitle: 'Multi-step finish with drying reminders',
                icon: Icons.timer_outlined,
                onTap: () => context.go('/projects/$projectId/finishing'),
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'CNC Files',
                subtitle: 'DXF, SVG, and G-code files for this project',
                icon: Icons.precision_manufacturing_outlined,
                onTap: () => context.go('/projects/$projectId/cnc'),
              ),
              const SizedBox(height: 12),
              const _SectionCard(
                title: 'Materials',
                subtitle: 'Coming soon — lumber, hardware, finishes',
                icon: Icons.layers_outlined,
                enabled: false,
              ),
              const SizedBox(height: 12),
              _SectionCard(
                title: 'Photos & Drawings',
                subtitle: project.photoPaths.isEmpty
                    ? 'Snap progress shots and shop drawings'
                    : '${project.photoPaths.length} photo${project.photoPaths.length == 1 ? '' : 's'} attached',
                icon: Icons.image_outlined,
                onTap: () => context.go('/projects/$projectId/photos'),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  String _fmtDate(DateTime d) =>
      '${d.month.toString().padLeft(2, '0')}/'
      '${d.day.toString().padLeft(2, '0')}/${d.year}';
}

class _LabeledRow extends StatelessWidget {
  const _LabeledRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 96,
          child: Text(label, style: t.textTheme.bodySmall),
        ),
        Expanded(
          child: Text(value, style: t.textTheme.bodyLarge),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({
    required this.title,
    required this.subtitle,
    required this.icon,
    this.onTap,
    this.enabled = true,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback? onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final fg =
        enabled ? null : t.colorScheme.onSurface.withValues(alpha: 0.45);
    return Card(
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, size: 28, color: fg),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: t.textTheme.titleLarge?.copyWith(color: fg),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: t.textTheme.bodySmall?.copyWith(color: fg),
                    ),
                  ],
                ),
              ),
              if (enabled) const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
