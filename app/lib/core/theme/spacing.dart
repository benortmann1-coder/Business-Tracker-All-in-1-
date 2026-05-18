/// Spacing tokens from DESIGN.md §5 (Spacing & Layout).
///
/// All `EdgeInsets` and `SizedBox` values in the app should reference these
/// rather than hardcoded magic numbers, so the 8pt grid stays consistent.
abstract class AppSpacing {
  static const double xs2 = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 24;
  static const double xl = 32;
  static const double xl2 = 48;
  static const double xl3 = 64;

  /// Minimum tappable size for buttons, icons, and list rows.
  /// Non-negotiable per DESIGN.md §5 — users may be wearing gloves.
  static const double hitTargetMin = 48;

  /// Primary button height (per DESIGN.md §5).
  static const double primaryButtonHeight = 56;

  /// Minimum list row height for shop conditions (per DESIGN.md §5).
  static const double listRowMinHeight = 64;

  // Border radii
  static const double radiusCard = 12;
  static const double radiusButton = 10;
  static const double radiusPill = 999;
}
