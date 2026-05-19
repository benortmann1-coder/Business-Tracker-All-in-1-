import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'app.dart';
import 'features/clients/data/hive_client_repository.dart';
import 'features/projects/data/hive_project_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Future.wait<dynamic>([
    Hive.openBox<String>(HiveProjectRepository.boxName),
    Hive.openBox<String>(HiveClientRepository.boxName),
  ]);
  runApp(const ProviderScope(child: BevelryApp()));
}
