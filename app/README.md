# Bevelry — Flutter App

Mobile app for woodworking professionals. See the docs at the repo root for the product blueprint (REQUIREMENTS.md, APP_STORE.md, DESIGN.md, PITCH.md).

## Requirements
- Flutter SDK >= 3.22
- Dart SDK >= 3.4
- iOS or Android simulator / device for running

## Setup
```
flutter create . --project-name bevelry --org com.bevelry --platforms ios,android
flutter pub get
flutter run
```
The `flutter create` line above generates the platform folders (`ios/`, `android/`) and `pubspec.lock` that aren't tracked here — run it once after cloning.

### Platform permissions (one-time after the initial `flutter create`)

The app uses `image_picker` (camera + photo library) and `url_launcher`
(mailto + sms schemes). After `flutter create`, edit the platform files:

**iOS** — `ios/Runner/Info.plist`, add inside `<dict>`:
```xml
<key>NSCameraUsageDescription</key>
<string>Take photos of your projects, finishes, and shop drawings.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Attach photos from your library to a project.</string>
<key>LSApplicationQueriesSchemes</key>
<array>
  <string>mailto</string>
  <string>sms</string>
</array>
```

**Android** — `android/app/src/main/AndroidManifest.xml`, inside `<manifest>`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<queries>
  <intent>
    <action android:name="android.intent.action.SENDTO" />
    <data android:scheme="mailto" />
  </intent>
  <intent>
    <action android:name="android.intent.action.SENDTO" />
    <data android:scheme="sms" />
  </intent>
</queries>
```

**Voice notes** (iOS only):
```xml
<key>NSMicrophoneUsageDescription</key>
<string>Dictate quick notes while you work.</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Transcribe your voice notes into project notes.</string>
```

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

## What's Implemented (Phase 1)
- Full bottom-nav shell with 5 tabs and per-tab stack navigation
- Light + dark theme matching `DESIGN.md` tokens
- Projects: list + detail with action cards; create-project flow wired
- Cut list: add / remove parts, running totals, Optimize button (algorithm TBD)
- Board-foot calculator: fully functional with price math
- Clients / Tools / Quotes / Settings: scaffolded screens with empty states and FABs

## What's Implemented (Phase 2)
- CNC File Manager screen with paywall gate (`$14.99` one-time IAP)
- Finishing Schedule screen with a 4-step sample workflow (sanding → conditioner → stain → topcoat)
- Team Collaboration screen with paywall gate + member list when unlocked
- Insights / Analytics dashboard with KPI cards, mini bar chart, top clients, export
- Cloud Sync upgrade screen with monthly + annual pricing
- `FirestoreProjectRepository` demonstrating the cloud-backed `ProjectRepository` pattern (not wired by default; activate via provider override after Firebase init)
- Reusable `PaywallGate` widget for any future paid feature

## What's Implemented (Phase 3)
- `ResponsiveScaffold` wrapper that switches between mobile, navigation-rail, and extended-navigation-rail layouts for the Web Companion
- Marketplace browse screen with sample listings (rating, trades, price range)
- Marketplace domain models (`MarketplaceListing`, `BuildRequest`)
- AI service interfaces with stub implementations: `CutOptimizationService` (LocalGuillotineOptimizer ships an algorithmic baseline; Cloud Function variant lives in Phase 3 v2) and `MaterialSubstitutionService`
- `AiSuggestionsSheet` UI for surfacing material substitution suggestions
- i18n: `flutter_localizations` wired into pubspec, `l10n.yaml` config, and ARB seed files for English, Spanish, French, and German (`lib/l10n/intl_*.arb`). Run `flutter gen-l10n` to generate the `AppLocalizations` class

## What's Next
1. Swap `InMemoryProjectRepository` for a Hive-backed implementation
2. Cut list optimization algorithm (1D guillotine + 2D bin-packing)
3. Quote builder multi-step flow with PDF generation
4. Material library + cost estimator
5. Client CRM with project history
6. Firebase Auth + Firestore for opt-in cloud sync (wire `FirestoreProjectRepository`)
7. Apple / Google sign-in
8. Bundle Inter + JetBrains Mono via the `google_fonts` package or asset bundling
9. Replace the in-line `_MiniBarChart` with `fl_chart` once Phase 2 sprint begins
10. Wire receipt validation for IAPs (Cloud Function spec'd in `API.md`)

## Notes
- Font families are not yet bundled — `bodyMedium` etc. fall back to the platform's default sans-serif and `'monospace'`. Add `google_fonts` to `pubspec.yaml` and update `core/theme/typography.dart` when bringing in Inter + JetBrains Mono.
- Firebase deps are in `pubspec.yaml` but `Firebase.initializeApp()` is not called yet; the app runs without a Firebase project configured.
