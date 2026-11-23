# WealthTrack for Android

A plain native Android app (Java, no Flutter/Capacitor) that wraps the offline
WealthTrack web app in `../web/` in a full-screen WebView.

- Package `com.wealthtrack.app`, minSdk 24, target/compile SDK 34, AGP 8.7.3, Gradle 8.14.3 (wrapper included).
- `../web/**` is added as an assets source dir (`app/build.gradle`), so every build bundles the current web app.
- The page is served by `WebViewAssetLoader` from
  `https://appassets.androidplatform.net/assets/index.html`, a secure context
  (`crypto.subtle` works) with a stable origin for IndexedDB/localStorage.
- Light/dark system bars follow the system theme; `prefers-color-scheme` in the page follows it too.

## Build locally

Requirements: JDK 17+ and an Android SDK with `platforms;android-34` and `build-tools;34.0.0`.

```bash
cd wealthtrack/android
ANDROID_HOME=$HOME/Android/Sdk ./build-apk.sh          # -> wealthtrack/dist/WealthTrack-debug.apk
BUILD_TYPE=release ANDROID_HOME=... ./build-apk.sh     # -> wealthtrack/dist/WealthTrack-release.apk
```

You can also run `./gradlew assembleDebug` directly; the APK lands in
`app/build/outputs/apk/debug/app-debug.apk`. Release builds are signed with the
debug key (no keystore configured), which is fine for side-loading but not for the Play Store.

## CI

`.github/workflows/wealthtrack-apk.yml` runs on pushes to `main`, `master` and
`claude/**` that touch `wealthtrack/**`, and on manual dispatch (debug or release).
It builds with Temurin 17 and `android-actions/setup-android@v3`, uploads the
`wealthtrack-debug-apk` artifact (open the run in the Actions tab, then Artifacts), and, if the
`GDRIVE_SA_JSON` / `GDRIVE_FOLDER_ID` secrets are set, uploads to Google Drive
via `.github/workflows/upload_to_drive.py`.

## Install on a phone

1. Copy `WealthTrack-debug.apk` to the phone (download the CI artifact zip and unzip it, or use the Drive link).
2. Open it from Files/Downloads. When Android asks, allow **Install unknown apps** for
   that app (Settings > Apps > Special access > Install unknown apps).
3. Or with USB debugging: `adb install -r WealthTrack-debug.apk`.

Data lives in the app's WebView storage. Uninstalling the app deletes it, so export a backup first.

## JavaScript bridge: `window.AndroidBridge`

Present only inside the Android app; feature-detect with `if (window.AndroidBridge)`.
Calls are synchronous and run on a background thread. Return values are strings or booleans.

| Method | Returns | Notes |
| --- | --- | --- |
| `saveFile(fileName, mimeType, base64Data)` | `"ok:<path>"` or `"error:<msg>"` | Saves to public Downloads (MediaStore on API 29+). Shows the toast "Saved to Downloads/<name>". `base64Data` may be raw base64 or a `data:...;base64,` URL. On API 24-28, if storage permission is not yet granted, it asks for it and saves this file to the app's own folder (the path is returned). |
| `shareFile(fileName, mimeType, base64Data)` | `"ok"` or `"error:<msg>"` | Writes the file to cache and opens the share sheet (FileProvider). |
| `setReminders(json)` | nothing | `json` is a **string**: `JSON.stringify([{id, at, title, body}])`, with `at` in epoch milliseconds. It replaces all earlier reminders. Past times are skipped. Reminders are stored and rescheduled after a reboot or app update. They post on the notification channel "bills" ("Bill reminders"), and tapping one opens the app. |
| `requestNotificationPermission()` | nothing | Android 13+ runtime prompt. The result arrives as a `window` event `androidpermission` with `detail = {name: 'notifications', granted}`. |
| `notificationsEnabled()` | boolean | |
| `appVersion()` | string | e.g. `"1.0.0 (1)"` |

Other hooks:

- **Back button.** If the page defines `window.onAndroidBack = () => boolean` and it returns
  `true`, the press is consumed (for example to close a modal). Otherwise the WebView goes back in history, or the app closes.
- **File inputs.** `<input type="file" accept="application/json,.json">` and `accept="image/*"` open
  the system picker. Image inputs also offer the camera.
- **Downloads.** `blob:`/`data:` downloads (`<a download>`) are ignored inside the app. Use `saveFile` instead.
- **External links.** `http(s)` links to other hosts, and `mailto:`/`tel:` links, open in external apps.

```js
function blobToBase64(blob) {
  return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
}
if (window.AndroidBridge) {
  const res = AndroidBridge.saveFile('wealthtrack-backup.json', 'application/json', await blobToBase64(blob));
  if (res.startsWith('error:')) alert(res.slice(6));
}
```
