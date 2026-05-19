import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/project_status.dart';
import '../data/project_repository.dart';
import '../domain/project.dart';

/// Modal bottom sheet for creating or editing a [Project].
///
/// Returns the saved [Project] when the user taps Save; null on cancel.
class ProjectFormSheet extends ConsumerStatefulWidget {
  const ProjectFormSheet({this.existing, super.key});

  final Project? existing;

  static Future<Project?> show(
    BuildContext context, {
    Project? existing,
  }) {
    return showModalBottomSheet<Project>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => ProjectFormSheet(existing: existing),
    );
  }

  @override
  ConsumerState<ProjectFormSheet> createState() => _ProjectFormSheetState();
}

class _ProjectFormSheetState extends ConsumerState<ProjectFormSheet> {
  late final TextEditingController _name;
  late final TextEditingController _description;
  late final TextEditingController _dimensions;
  late ProjectStatus _status;
  DateTime? _dueDate;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final existing = widget.existing;
    _name = TextEditingController(text: existing?.name ?? '');
    _description = TextEditingController(text: existing?.description ?? '');
    _dimensions = TextEditingController(text: existing?.dimensions ?? '');
    _status = existing?.status ?? ProjectStatus.draft;
    _dueDate = existing?.dueDate;
  }

  @override
  void dispose() {
    _name.dispose();
    _description.dispose();
    _dimensions.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final isEdit = widget.existing != null;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        16,
        16,
        MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: t.dividerColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Text(
              isEdit ? 'Edit project' : 'New project',
              style: t.textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _name,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Project name *',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _dimensions,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Dimensions',
                helperText: 'e.g. 36"W × 84"H × 24"D',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Notes',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            _StatusTile(
              status: _status,
              onChanged: (s) => setState(() => _status = s),
            ),
            _DueDateTile(
              dueDate: _dueDate,
              onChanged: (d) => setState(() => _dueDate = d),
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : _save,
              child: _saving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(isEdit ? 'Save changes' : 'Create project'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Project name is required')),
      );
      return;
    }
    setState(() => _saving = true);
    final repo = ref.read(projectRepositoryProvider);
    final existing = widget.existing;
    final dueChangedToNull = existing?.dueDate != null && _dueDate == null;
    final project = existing == null
        ? Project(
            name: name,
            description: _description.text.trim(),
            dimensions: _dimensions.text.trim(),
            status: _status,
            dueDate: _dueDate,
          )
        : existing.copyWith(
            name: name,
            description: _description.text.trim(),
            dimensions: _dimensions.text.trim(),
            status: _status,
            dueDate: _dueDate,
            setDueDateToNull: dueChangedToNull,
            updatedAt: DateTime.now(),
          );
    await repo.upsert(project);
    ref.invalidate(projectsListProvider);
    ref.invalidate(projectProvider(project.id));
    if (!mounted) return;
    Navigator.of(context).pop(project);
  }
}

class _StatusTile extends StatelessWidget {
  const _StatusTile({required this.status, required this.onChanged});

  final ProjectStatus status;
  final ValueChanged<ProjectStatus> onChanged;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.flag_outlined),
      title: const Text('Status'),
      subtitle: Text(status.label),
      trailing: const Icon(Icons.chevron_right),
      onTap: () async {
        final selected = await showModalBottomSheet<ProjectStatus>(
          context: context,
          builder: (_) => SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final s in ProjectStatus.values)
                  ListTile(
                    title: Text(s.label),
                    onTap: () => Navigator.of(context).pop(s),
                  ),
              ],
            ),
          ),
        );
        if (selected != null) onChanged(selected);
      },
    );
  }
}

class _DueDateTile extends StatelessWidget {
  const _DueDateTile({required this.dueDate, required this.onChanged});

  final DateTime? dueDate;
  final ValueChanged<DateTime?> onChanged;

  @override
  Widget build(BuildContext context) {
    final formatted = dueDate == null
        ? 'None'
        : '${dueDate!.month.toString().padLeft(2, '0')}/'
            '${dueDate!.day.toString().padLeft(2, '0')}/${dueDate!.year}';
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: const Icon(Icons.event_outlined),
      title: const Text('Due date'),
      subtitle: Text(formatted),
      trailing: dueDate == null
          ? const Icon(Icons.chevron_right)
          : IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Clear due date',
              onPressed: () => onChanged(null),
            ),
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: dueDate ?? DateTime.now().add(const Duration(days: 14)),
          firstDate: DateTime.now().subtract(const Duration(days: 365)),
          lastDate: DateTime.now().add(const Duration(days: 365 * 3)),
        );
        if (picked != null) onChanged(picked);
      },
    );
  }
}
