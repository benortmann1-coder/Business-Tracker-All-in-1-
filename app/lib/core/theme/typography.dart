import 'package:flutter/material.dart';

abstract class AppTypography {
  static TextTheme buildTextTheme(Color onSurface, Color onSurfaceSecondary) {
    return TextTheme(
      displayLarge: TextStyle(
        fontSize: 32,
        height: 40 / 32,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.32,
        color: onSurface,
      ),
      headlineLarge: TextStyle(
        fontSize: 28,
        height: 36 / 28,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.14,
        color: onSurface,
      ),
      headlineMedium: TextStyle(
        fontSize: 22,
        height: 28 / 22,
        fontWeight: FontWeight.w600,
        letterSpacing: -0.06,
        color: onSurface,
      ),
      titleLarge: TextStyle(
        fontSize: 17,
        height: 24 / 17,
        fontWeight: FontWeight.w600,
        color: onSurface,
      ),
      bodyLarge: TextStyle(
        fontSize: 17,
        height: 24 / 17,
        fontWeight: FontWeight.w400,
        color: onSurface,
      ),
      bodyMedium: TextStyle(
        fontSize: 15,
        height: 22 / 15,
        fontWeight: FontWeight.w400,
        color: onSurface,
      ),
      bodySmall: TextStyle(
        fontSize: 13,
        height: 18 / 13,
        fontWeight: FontWeight.w400,
        color: onSurfaceSecondary,
      ),
      labelSmall: TextStyle(
        fontSize: 11,
        height: 14 / 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 0.55,
        color: onSurfaceSecondary,
      ),
    );
  }

  static const TextStyle numericBody = TextStyle(
    fontFamily: 'monospace',
    fontSize: 15,
    height: 22 / 15,
    fontWeight: FontWeight.w400,
    fontFeatures: [FontFeature.tabularFigures()],
  );

  static const TextStyle numericDisplay = TextStyle(
    fontFamily: 'monospace',
    fontSize: 28,
    height: 36 / 28,
    fontWeight: FontWeight.w500,
    fontFeatures: [FontFeature.tabularFigures()],
  );
}
