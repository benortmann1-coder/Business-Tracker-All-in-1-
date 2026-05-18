import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/status_pill.dart';
import '../data/project_repository.dart';
import '../domain/project.dart';

class ProjectsListScreen extends ConsumerWidget {
  const ProjectsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectsAsync = ref.watch(projectsListProvider);

    Future<void> createProject() async {
      final repo = ref.read(projectRepositoryProvider);
      final newProject = Project(name: 'Untitled Project');
      await repo.upsert(newProject);
      ref.invalidate(projectsListProvider);
      ref.invalidate(projectProvider(newProject.id));
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Projects')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New Project'),
        onPressed: createProject,
      ),
      body: projectsAsync.when(
        data: (projects) => projects.isEmpty
            ? EmptyState(
                icon: Icons.handyman_outlined,
                title: 'No projects yet',
                subtitle:
                    'Start your first one. Cut list, materials, and quote — all in one place.',
                actionLabel: 'Start Your First Project',
                onAction: createProject,
              )
            : ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: projects.length,
                separatorBuilder: (_, __) => const Divider(height: 1),
                itemBuilder: (_, i) => _ProjectRow(project: projects[i]),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }
}

class _ProjectRow extends StatelessWidget {
  const _ProjectRow({required this.project});

  final Project project;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minVerticalPadding: 16,
      title: Text(project.name, style: Theme.of(context).textTheme.titleLarge),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          children: [
            StatusPill(status: project.status),
            const SizedBox(width: 8),
            if (project.dueDate != null)
              Text(
                'Due ${_fmtDate(project.dueDate!)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
          ],
        ),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.go('/projects/${project.id}'),
    );
  }

  String _fmtDate(DateTime d) =>
      '${d.month.toString().padLeft(2, '0')}/${d.day.toString().padLeft(2, '0')}';
}
