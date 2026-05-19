import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/status_pill.dart';
import '../data/project_repository.dart';
import '../domain/project.dart';
import 'project_form_sheet.dart';

class ProjectsListScreen extends ConsumerStatefulWidget {
  const ProjectsListScreen({super.key});

  @override
  ConsumerState<ProjectsListScreen> createState() => _ProjectsListScreenState();
}

class _ProjectsListScreenState extends ConsumerState<ProjectsListScreen> {
  final TextEditingController _search = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final projectsAsync = ref.watch(projectsListProvider);
    final query = _search.text.trim().toLowerCase();

    return Scaffold(
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _search,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Search projects, clients, dimensions…',
                  border: InputBorder.none,
                ),
                onChanged: (_) => setState(() {}),
              )
            : const Text('Projects'),
        actions: [
          IconButton(
            tooltip: _searching ? 'Close search' : 'Search projects',
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () {
              setState(() {
                _searching = !_searching;
                if (!_searching) _search.clear();
              });
            },
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New Project'),
        onPressed: () => ProjectFormSheet.show(context),
      ),
      body: projectsAsync.when(
        data: (projects) {
          final filtered = query.isEmpty
              ? projects
              : projects.where((p) => _matches(p, query)).toList();

          if (projects.isEmpty) {
            return EmptyState(
              icon: Icons.handyman_outlined,
              title: 'No projects yet',
              subtitle:
                  'Start your first one. Cut list, materials, and quote — all in one place.',
              actionLabel: 'Start Your First Project',
              onAction: () => ProjectFormSheet.show(context),
            );
          }
          if (filtered.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(
                  'No projects match "${_search.text.trim()}"',
                  style: Theme.of(context).textTheme.bodyMedium,
                  textAlign: TextAlign.center,
                ),
              ),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: filtered.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) => _ProjectRow(project: filtered[i]),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
    );
  }

  bool _matches(Project p, String q) {
    if (p.name.toLowerCase().contains(q)) return true;
    if (p.description.toLowerCase().contains(q)) return true;
    if (p.dimensions.toLowerCase().contains(q)) return true;
    if (p.status.label.toLowerCase().contains(q)) return true;
    return false;
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
