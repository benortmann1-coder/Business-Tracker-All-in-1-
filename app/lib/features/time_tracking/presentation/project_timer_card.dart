import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/time_entry_repository.dart';
import '../domain/time_entry.dart';

/// Compact start/stop timer card to embed on the project detail screen.
class ProjectTimerCard extends ConsumerStatefulWidget {
  const ProjectTimerCard({required this.projectId, super.key});

  final String projectId;

  @override
  ConsumerState<ProjectTimerCard> createState() => _ProjectTimerCardState();
}

class _ProjectTimerCardState extends ConsumerState<ProjectTimerCard> {
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    final entry = TimeEntry(projectId: widget.projectId);
    await ref.read(timeEntryRepositoryProvider).upsert(entry);
    ref.invalidate(runningTimerProvider(widget.projectId));
    ref.invalidate(timeEntriesForProjectProvider(widget.projectId));
  }

  Future<void> _stop(TimeEntry running) async {
    await ref.read(timeEntryRepositoryProvider).upsert(
          running.copyWith(endedAt: DateTime.now()),
        );
    ref.invalidate(runningTimerProvider(widget.projectId));
    ref.invalidate(timeEntriesForProjectProvider(widget.projectId));
  }

  String _hms(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '${h.toString().padLeft(2, '0')}:$m:$s';
  }

  String _formatHours(double hours) => hours.toStringAsFixed(2);

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    final runningAsync = ref.watch(runningTimerProvider(widget.projectId));
    final entriesAsync =
        ref.watch(timeEntriesForProjectProvider(widget.projectId));
    final totalHours = entriesAsync.maybeWhen(
      data: (entries) => entries.fold<double>(0, (s, e) => s + e.hours),
      orElse: () => 0.0,
    );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: runningAsync.when(
          data: (running) => Row(
            children: [
              Icon(
                running != null ? Icons.pause_circle : Icons.play_circle,
                color: running != null
                    ? t.colorScheme.primary
                    : t.colorScheme.onSurface,
                size: 36,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      running != null
                          ? 'Timer running — ${_hms(running.duration)}'
                          : 'No active timer',
                      style: t.textTheme.titleMedium,
                    ),
                    Text(
                      'Total logged: ${_formatHours(totalHours)} hrs',
                      style: t.textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              if (running == null)
                FilledButton(
                  onPressed: _start,
                  child: const Text('Start'),
                )
              else
                FilledButton.tonal(
                  onPressed: () => _stop(running),
                  child: const Text('Stop'),
                ),
            ],
          ),
          loading: () => const SizedBox(
            height: 36,
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text('Error: $e'),
        ),
      ),
    );
  }
}
