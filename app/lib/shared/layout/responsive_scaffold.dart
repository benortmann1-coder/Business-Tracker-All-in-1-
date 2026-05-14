import 'package:flutter/material.dart';

enum ScreenSize { compact, medium, expanded }

/// Returns the [ScreenSize] for the current context based on width breakpoints
/// recommended by Material 3.
ScreenSize screenSizeOf(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  if (width < 600) return ScreenSize.compact;
  if (width < 1240) return ScreenSize.medium;
  return ScreenSize.expanded;
}

/// Renders a different chrome depending on the active [ScreenSize].
///
/// - compact: child only; bottom navigation owned by the caller's Scaffold
/// - medium: child wrapped in a left [NavigationRail]
/// - expanded: child preceded by an extended [NavigationRail] (icon + label)
///
/// Phase 3 Web Companion uses this to render the same widget tree at three
/// breakpoints without forking the screens.
class ResponsiveScaffold extends StatelessWidget {
  const ResponsiveScaffold({
    required this.child,
    required this.destinations,
    required this.selectedIndex,
    required this.onDestinationSelected,
    super.key,
  });

  final Widget child;
  final List<ResponsiveDestination> destinations;
  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final size = screenSizeOf(context);
    if (size == ScreenSize.compact) {
      return child;
    }
    return Row(
      children: [
        NavigationRail(
          extended: size == ScreenSize.expanded,
          selectedIndex: selectedIndex,
          onDestinationSelected: onDestinationSelected,
          destinations: [
            for (final d in destinations)
              NavigationRailDestination(
                icon: Icon(d.icon),
                selectedIcon: Icon(d.selectedIcon ?? d.icon),
                label: Text(d.label),
              ),
          ],
        ),
        const VerticalDivider(width: 1),
        Expanded(child: child),
      ],
    );
  }
}

class ResponsiveDestination {
  const ResponsiveDestination({
    required this.label,
    required this.icon,
    this.selectedIcon,
  });

  final String label;
  final IconData icon;
  final IconData? selectedIcon;
}
