import 'package:flutter/material.dart';

import '../../../shared/widgets/coming_soon.dart';
import '../domain/finishing_step.dart';

class FinishingScheduleScreen extends StatelessWidget {
  const FinishingScheduleScreen({this.projectId, super.key});

  final String? projectId;

  @override
  Widget build(BuildContext context) {
    // Until a FinishingScheduleRepository lands, the screen renders a
    // representative sample so the wireframe is walkable.
    final schedule = FinishingSchedule(
      name: 'Walnut bookcase — front',
      steps: [
        FinishingStep(
          type: FinishingStepType.sanding,
          dryingMinutes: 0,
          productName: '220 grit',
        ),
        FinishingStep(
          type: FinishingStepType.conditioner,
          dryingMinutes: 30,
          productName: 'Minwax Pre-Stain',
        ),
        FinishingStep(
          type: FinishingStepType.stain,
          dryingMinutes: 240,
          productName: 'General Finishes Java Gel',
        ),
        FinishingStep(
          type: FinishingStepType.topcoat,
          dryingMinutes: 360,
          productName: 'Arm-R-Seal Satin × 3 coats',
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: Text(schedule.name)),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('Add Step'),
        onPressed: () => showComingSoon(context, 'Finishing step editor'),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: schedule.steps.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) => _StepCard(step: schedule.steps[i], index: i),
      ),
    );
  }
}

class _StepCard extends StatelessWidget {
  const _StepCard({required this.step, required this.index});

  final FinishingStep step;
  final int index;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: t.colorScheme.primary.withValues(alpha: 0.12),
              foregroundColor: t.colorScheme.primary,
              child: Text('${index + 1}'),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_label(step.type), style: t.textTheme.titleLarge),
                  if (step.productName != null) ...[
                    const SizedBox(height: 4),
                    Text(step.productName!, style: t.textTheme.bodyMedium),
                  ],
                  if (step.dryingMinutes > 0) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        const Icon(Icons.schedule, size: 14),
                        const SizedBox(width: 4),
                        Text(
                          '${_formatMinutes(step.dryingMinutes)} dry time',
                          style: t.textTheme.bodySmall,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            FilledButton.tonal(
              onPressed: () => showComingSoon(context, 'Drying timer'),
              child: const Text('Start'),
            ),
          ],
        ),
      ),
    );
  }

  String _label(FinishingStepType type) {
    switch (type) {
      case FinishingStepType.sanding:
        return 'Sanding';
      case FinishingStepType.conditioner:
        return 'Wood Conditioner';
      case FinishingStepType.stain:
        return 'Stain';
      case FinishingStepType.sealer:
        return 'Sealer';
      case FinishingStepType.topcoat:
        return 'Topcoat';
      case FinishingStepType.custom:
        return 'Custom';
    }
  }

  String _formatMinutes(int m) {
    if (m < 60) return '${m}m';
    final h = m ~/ 60;
    final r = m % 60;
    if (r == 0) return '${h}h';
    return '${h}h ${r}m';
  }
}
