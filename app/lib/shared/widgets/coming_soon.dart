import 'package:flutter/material.dart';

/// Shows a transient SnackBar that explains a feature is not yet wired.
///
/// Use this anywhere a button would otherwise be `onPressed: () {}`. Better
/// than disabling because the user still sees the affordance and the message
/// names what's coming.
void showComingSoon(BuildContext context, String feature) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text('$feature — coming in a future release'),
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 2),
    ),
  );
}
