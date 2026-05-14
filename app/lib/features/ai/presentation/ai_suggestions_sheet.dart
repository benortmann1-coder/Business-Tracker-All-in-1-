import 'package:flutter/material.dart';

import '../data/material_substitution_service.dart';

class AiSuggestionsSheet extends StatelessWidget {
  const AiSuggestionsSheet({required this.suggestions, super.key});

  final List<MaterialSubstitution> suggestions;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome_outlined, color: t.colorScheme.primary),
                const SizedBox(width: 8),
                Text('Material suggestions', style: t.textTheme.titleLarge),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Cost-saving alternatives based on your project and region.',
              style: t.textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            if (suggestions.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Text(
                  'No suggestions right now. Add a few materials and try again.',
                  style: t.textTheme.bodyMedium,
                ),
              )
            else
              for (final s in suggestions) _SuggestionRow(suggestion: s),
          ],
        ),
      ),
    );
  }
}

class _SuggestionRow extends StatelessWidget {
  const _SuggestionRow({required this.suggestion});

  final MaterialSubstitution suggestion;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    '${suggestion.originalName} → ${suggestion.suggestedName}',
                    style: t.textTheme.titleLarge,
                  ),
                ),
                Text(
                  '-\$${(suggestion.estimatedSavingsCents / 100).toStringAsFixed(2)}',
                  style: t.textTheme.bodyMedium?.copyWith(
                    color: t.colorScheme.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(suggestion.rationale, style: t.textTheme.bodyMedium),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: () {}, child: const Text('Dismiss')),
                const SizedBox(width: 8),
                FilledButton(onPressed: () {}, child: const Text('Apply')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
