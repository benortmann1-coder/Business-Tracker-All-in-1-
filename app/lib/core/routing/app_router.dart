import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/analytics/presentation/analytics_dashboard_screen.dart';
import '../../features/board_foot/presentation/board_foot_calculator_screen.dart';
import '../../features/clients/presentation/clients_list_screen.dart';
import '../../features/cnc/presentation/cnc_files_screen.dart';
import '../../features/cut_list/presentation/cut_list_screen.dart';
import '../../features/finishing/presentation/finishing_schedule_screen.dart';
import '../../features/marketplace/presentation/marketplace_browse_screen.dart';
import '../../features/materials/presentation/materials_list_screen.dart';
import '../../features/projects/presentation/project_detail_screen.dart';
import '../../features/projects/presentation/project_photos_screen.dart';
import '../../features/projects/presentation/projects_list_screen.dart';
import '../../features/quotes/presentation/quotes_list_screen.dart';
import '../../features/settings/presentation/settings_screen.dart';
import '../../features/settings/presentation/shop_settings_screen.dart';
import '../../features/sync/presentation/cloud_sync_screen.dart';
import '../../features/team/presentation/team_screen.dart';
import '../../features/tools/presentation/tools_list_screen.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/projects',
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Page not found')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.broken_image_outlined, size: 64),
              const SizedBox(height: 16),
              Text(
                "We couldn't find ${state.uri}",
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go('/projects'),
                child: const Text('Back to Projects'),
              ),
            ],
          ),
        ),
      ),
    ),
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            _ShellScaffold(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/projects',
                builder: (_, __) => const ProjectsListScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (_, state) => ProjectDetailScreen(
                      projectId: state.pathParameters['id']!,
                    ),
                    routes: [
                      GoRoute(
                        path: 'cut-list',
                        builder: (_, state) => CutListScreen(
                          projectId: state.pathParameters['id']!,
                        ),
                      ),
                      GoRoute(
                        path: 'cnc',
                        builder: (_, state) => CncFilesScreen(
                          projectId: state.pathParameters['id']!,
                        ),
                      ),
                      GoRoute(
                        path: 'finishing',
                        builder: (_, state) => FinishingScheduleScreen(
                          projectId: state.pathParameters['id'],
                        ),
                      ),
                      GoRoute(
                        path: 'photos',
                        builder: (_, state) => ProjectPhotosScreen(
                          projectId: state.pathParameters['id']!,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/clients',
                builder: (_, __) => const ClientsListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/tools',
                builder: (_, __) => const ToolsListScreen(),
                routes: [
                  GoRoute(
                    path: 'board-foot',
                    builder: (_, __) => const BoardFootCalculatorScreen(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/quotes',
                builder: (_, __) => const QuotesListScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/settings',
                builder: (_, __) => const SettingsScreen(),
                routes: [
                  GoRoute(
                    path: 'cloud-sync',
                    builder: (_, __) => const CloudSyncScreen(),
                  ),
                  GoRoute(
                    path: 'team',
                    builder: (_, __) => const TeamScreen(),
                  ),
                  GoRoute(
                    path: 'insights',
                    builder: (_, __) => const AnalyticsDashboardScreen(),
                  ),
                  GoRoute(
                    path: 'marketplace',
                    builder: (_, __) => const MarketplaceBrowseScreen(),
                  ),
                  GoRoute(
                    path: 'cnc',
                    builder: (_, __) => const CncFilesScreen(),
                  ),
                  GoRoute(
                    path: 'shop-info',
                    builder: (_, __) => const ShopSettingsScreen(),
                  ),
                  GoRoute(
                    path: 'materials',
                    builder: (_, __) => const MaterialsListScreen(),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
});

class _ShellScaffold extends StatelessWidget {
  const _ShellScaffold({required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (i) => navigationShell.goBranch(
          i,
          initialLocation: i == navigationShell.currentIndex,
        ),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder),
            label: 'Projects',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Clients',
          ),
          NavigationDestination(
            icon: Icon(Icons.handyman_outlined),
            selectedIcon: Icon(Icons.handyman),
            label: 'Tools',
          ),
          NavigationDestination(
            icon: Icon(Icons.payments_outlined),
            selectedIcon: Icon(Icons.payments),
            label: 'Money',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }
}
