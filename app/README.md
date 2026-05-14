# WoodWorks Pro — Flutter App

Mobile app for woodworking professionals. See the docs at the repo root for the product blueprint (REQUIREMENTS.md, APP_STORE.md, DESIGN.md, PITCH.md).

## Requirements
- Flutter SDK >= 3.22
- Dart SDK >= 3.4
- iOS or Android simulator / device for running

## Setup
```
flutter create . --project-name woodworks_pro --org com.woodworkspro --platforms ios,android
flutter pub get
flutter run
```
The `flutter create` line above generates the platform folders (`ios/`, `android/`) and `pubspec.lock` that aren't tracked here — run it once after cloning.

## Project Layout
```
lib/
  main.dart                       App entrypoint (Riverpod ProviderScope + runApp)
  app.dart                        MaterialApp.router wiring
  core/
    theme/                        Color tokens, typography, ThemeData
    routing/                      go_router setup with bottom-nav shell
  shared/
    models/                       Cross-feature enums (ProjectStatus)
    widgets/                      Reusable widgets (StatusPill, EmptyState)
  features/
    projects/      domain + data + presentation
    clients/       domain + presentation
    cut_list/      domain + presentation
    board_foot/    presentation (calculator)
    tools/         domain + presentation
    quotes/        domain (Quote + Invoice math) + presentation
    settings/      presentation
```

## Architecture
- **State management:** Riverpod 2.x. Repository providers live in each feature's `data/` folder.
- **Routing:** go_router with `StatefulShellRoute.indexedStack` so each tab keeps its own navigation stack.
- **Persistence:** in-memory repositories today. Swap to Hive (offline) + Firestore (cloud sync) in sprint 2 by implementing the same `ProjectRepository` interface.
- **Theme:** light + dark variants generated from the design tokens in `core/theme/colors.dart` and `core/theme/typography.dart`.

## What's Implemented
- Full bottom-nav shell with 5 tabs and per-tab stack navigation
- Light + dark theme matching `DESIGN.md` tokens
- Projects: list + detail with placeholder action cards; create-project flow wired
- Cut list: add / remove parts, running totals, Optimize button (algorithm TBD)
- Board-foot calculator: fully functional with price math
- Clients / Tools / Quotes / Settings: scaffolded screens with empty states and FABs

## What's Next (Phase 1 Sprint Backlog)
1. Swap `InMemoryProjectRepository` for a Hive-backed implementation
2. Cut list optimization algorithm (1D guillotine + 2D bin-packing)
3. Quote builder multi-step flow with PDF generation
4. Material library + cost estimator
5. Client CRM with project history
6. Firebase Auth + Firestore for opt-in cloud sync
7. Apple / Google sign-in
8. Bundle Inter + JetBrains Mono via the `google_fonts` package or asset bundling

## Notes
- Font families are not yet bundled — `bodyMedium` etc. fall back to the platform's default sans-serif and `'monospace'`. Add `google_fonts` to `pubspec.yaml` and update `core/theme/typography.dart` when bringing in Inter + JetBrains Mono.
- Firebase deps are in `pubspec.yaml` but `Firebase.initializeApp()` is not called yet; the app runs without a Firebase project configured.
