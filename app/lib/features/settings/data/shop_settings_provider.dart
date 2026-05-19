import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/shop_settings.dart';

/// Overridden in main.dart with the resolved [SharedPreferences] instance.
final sharedPreferencesProvider = Provider<SharedPreferences>((ref) {
  throw UnimplementedError(
    'Override sharedPreferencesProvider in ProviderScope at app startup '
    'with the resolved SharedPreferences instance.',
  );
});

class ShopSettingsNotifier extends Notifier<ShopSettings> {
  @override
  ShopSettings build() {
    final prefs = ref.read(sharedPreferencesProvider);
    final raw = prefs.getString(kShopSettingsKey);
    if (raw == null) return const ShopSettings();
    try {
      return ShopSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return const ShopSettings();
    }
  }

  Future<void> update(ShopSettings settings) async {
    final prefs = ref.read(sharedPreferencesProvider);
    await prefs.setString(kShopSettingsKey, jsonEncode(settings.toJson()));
    state = settings;
  }
}

final shopSettingsProvider =
    NotifierProvider<ShopSettingsNotifier, ShopSettings>(
  ShopSettingsNotifier.new,
);
