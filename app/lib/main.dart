import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app.dart';
import 'features/clients/data/hive_client_repository.dart';
import 'features/invoices/data/hive_invoice_repository.dart';
import 'features/materials/data/hive_material_repository.dart';
import 'features/projects/data/hive_project_repository.dart';
import 'features/quotes/data/hive_quote_repository.dart';
import 'features/settings/data/shop_settings_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  final results = await Future.wait<dynamic>([
    Hive.openBox<String>(HiveProjectRepository.boxName),
    Hive.openBox<String>(HiveClientRepository.boxName),
    Hive.openBox<String>(HiveQuoteRepository.boxName),
    Hive.openBox<String>(HiveMaterialRepository.boxName),
    Hive.openBox<String>(HiveInvoiceRepository.boxName),
    SharedPreferences.getInstance(),
  ]);
  final prefs = results.last as SharedPreferences;
  runApp(
    ProviderScope(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
      ],
      child: const BevelryApp(),
    ),
  );
}
