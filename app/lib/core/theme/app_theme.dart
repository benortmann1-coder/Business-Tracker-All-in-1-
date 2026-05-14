import 'package:flutter/material.dart';

import 'colors.dart';
import 'typography.dart';

abstract class AppTheme {
  static ThemeData light() {
    const scheme = ColorScheme.light(
      primary: AppColors.forest600,
      onPrimary: AppColors.cream100,
      secondary: AppColors.walnut700,
      onSecondary: AppColors.cream100,
      surface: AppColors.cream50,
      onSurface: AppColors.charcoal900,
      error: AppColors.crimson600,
      onError: AppColors.cream100,
    );
    return _buildTheme(scheme, brightness: Brightness.light);
  }

  static ThemeData dark() {
    const scheme = ColorScheme.dark(
      primary: AppColors.forest500,
      onPrimary: AppColors.cream100,
      secondary: AppColors.walnut500,
      onSecondary: AppColors.cream100,
      surface: AppColors.charcoal700,
      onSurface: AppColors.cream100,
      error: AppColors.crimson600,
      onError: AppColors.cream100,
    );
    return _buildTheme(scheme, brightness: Brightness.dark);
  }

  static ThemeData _buildTheme(
    ColorScheme scheme, {
    required Brightness brightness,
  }) {
    final isDark = brightness == Brightness.dark;
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor:
          isDark ? AppColors.charcoal700 : AppColors.cream100,
      textTheme: AppTypography.buildTextTheme(
        scheme.onSurface,
        isDark ? AppColors.steel300 : AppColors.steel500,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? AppColors.charcoal700 : AppColors.cream100,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: scheme.primary,
          foregroundColor: scheme.onPrimary,
          minimumSize: const Size.fromHeight(56),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          textStyle: const TextStyle(
            fontSize: 17,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? AppColors.charcoal900 : AppColors.cream50,
        indicatorColor: scheme.primary.withOpacity(0.12),
        labelTextStyle: const WidgetStatePropertyAll(
          TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        ),
      ),
      dividerColor: isDark ? AppColors.charcoal500 : AppColors.borderLight,
      visualDensity: VisualDensity.comfortable,
    );
  }
}
