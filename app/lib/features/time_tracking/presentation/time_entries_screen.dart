import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/widgets/empty_state.dart';
import '../data/time_entry_repository.dart';
import '../domain/time_entry.dart';

class TimeEntriesScreen extends ConsumerWidget {
  const TimeEntriesScreen({required this.projectId, super.key});

  final String projectId;

  String _formatHours(double hours) => hours.toStringAsFixed(2);

  String _formatRange(TimeEntry e) {
    final start = e.startedAt;
    final end = e.endedAt;
    final startStr =
        '${start.month.toString().padLeft(2, '0')}/${start.day.toString().padLeft(2, '0')} '
        '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    if (end == null) return '$startStr — running';
    final endStr =
        '${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
    return '$startStr → $endStr';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entriesAsync =
        ref.watch(timeEntriesForProjectProvider(projectId));
    return Scaffold(
      appBar: AppBar(title: const Text('Time entries')),
      body: entriesAsync.when(
        data: (entries) {
          if (entries.isEmpty) {
            return const EmptyState(
              icon: Icons.timer_outlined,
              title: 'No time logged yet',
              subtitle:
                  'Start the timer on the project detail screen to track shop '
                  'time. Entries appear here.',
            );
          }
          final total = entries.fold<double>(0, (s, e) => s + e.hours);
          final t = Theme.of(context);
          return Column(
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                child: Text(
                  '${_formatHours(total)} hrs total across '
                  '${entries.length} entr${entries.length == 1 ? "y" : "ies"}',
                  style: t.textTheme.bodyMedium,
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.separated(
                  itemCount: entries.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) => _EntryRow(entry: entries[i]),
                ),
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

class _EntryRow extends ConsumerWidget {
  const _EntryRow({required this.entry});

  final TimeEntry entry;

  String _formatRange(TimeEntry e) {
    final start = e.startedAt;
    final end = e.endedAt;
    final startStr =
        '${start.month.toString().padLeft(2, '0')}/${start.day.toString().padLeft(2, '0')} '
        '${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}';
    if (end == null) return '$startStr — running';
    final endStr =
        '${end.hour.toString().padLeft(2, '0')}:${end.minute.toString().padLeft(2, '0')}';
    return '$startStr → $endStr';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = Theme.of(context);
    return ListTile(
      leading: Icon(
        entry.isRunning ? Icons.play_circle : Icons.timer_outlined,
        color: entry.isRunning ? t.colorScheme.primary : null,
      ),
      title: Text(
        entry.isRunning
            ? '${entry.hours.toStringAsFixed(2)} hrs (running)'
            : '${entry.hours.toStringAsFixed(2)} hrs',
        style: t.textTheme.titleMedium,
      ),
      subtitle: Text(_formatRange(entry)),
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline),
        tooltip: 'Delete entry',
        onPressed: () async {
          await ref
              .read(timeEntryRepositoryProvider)
              .delete(entry.id);
          ref.invalidate(timeEntriesForProjectProvider(entry.projectId));
          ref.invalidate(runningTimerProvider(entry.projectId));
        },
      ),
    );
  }
}
