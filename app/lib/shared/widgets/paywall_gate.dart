import 'package:flutter/material.dart';

class PaywallGate extends StatelessWidget {
  const PaywallGate({
    required this.featureName,
    required this.tagline,
    required this.icon,
    required this.price,
    this.bullets = const [],
    this.onUpgrade,
    super.key,
  });

  final String featureName;
  final String tagline;
  final IconData icon;
  final String price;
  final List<String> bullets;
  final VoidCallback? onUpgrade;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Icon(icon, size: 72, color: t.colorScheme.primary),
            const SizedBox(height: 24),
            Text(
              featureName,
              style: t.textTheme.headlineLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              tagline,
              style: t.textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            if (bullets.isNotEmpty) ...[
              const SizedBox(height: 24),
              for (final b in bullets)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.check, size: 18, color: t.colorScheme.primary),
                      const SizedBox(width: 8),
                      Expanded(child: Text(b, style: t.textTheme.bodyMedium)),
                    ],
                  ),
                ),
            ],
            const SizedBox(height: 32),
            FilledButton(
              onPressed: onUpgrade,
              child: Text('Unlock — $price'),
            ),
          ],
        ),
      ),
    );
  }
}
