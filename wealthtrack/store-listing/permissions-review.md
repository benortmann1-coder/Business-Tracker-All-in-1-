# Play policy review: permissions and build (Nov 13 2026)

Checked `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle`, and the merged manifest of a real release build (`aapt2 dump badging`).

## Permissions in the release APK

| Permission | Used for | Play policy |
|---|---|---|
| `INTERNET` | Google Drive backup, address suggestions (and Play Billing) | Normal. No declaration. |
| `USE_BIOMETRIC` | Fingerprint unlock | Normal. No declaration. |
| `POST_NOTIFICATIONS` | Bill reminders (Android 13+ runtime prompt) | Normal runtime permission. No declaration. |
| `RECEIVE_BOOT_COMPLETED` | `BootReceiver` reschedules reminders after a restart or app update | Normal. No declaration. |
| `WRITE_EXTERNAL_STORAGE` (maxSdk 28) / `READ_EXTERNAL_STORAGE` (maxSdk 28, added by a library) | Saving exports to Downloads on Android 9 and older | Capped at Android 9, so it's not the restricted "All files access". No declaration. |
| `com.wealthtrack.app.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Added automatically by androidx.core | Internal, harmless. |
| `com.android.vending.BILLING` | Added by Google Play Billing (Pro upgrade branch) | Normal. |

### Restricted permissions: none

- **Exact alarms:** the app does **not** use `SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`. `ReminderScheduler` uses `setAndAllowWhileIdle` (inexact but fires in Doze), which needs no permission. Bill reminders don't need to fire to the second, so leave it this way; `USE_EXACT_ALARM` is only allowed for alarm-clock and calendar apps and would invite rejection.
- No location, contacts, SMS, call log, camera, microphone, media/photos (`READ_MEDIA_*`), accessibility, `QUERY_ALL_PACKAGES`, foreground service or Advertising ID permissions. Receipt photos go through Android's camera app / photo picker (`IMAGE_CAPTURE` intent and file chooser), which needs no camera or storage permission.
- `BootReceiver` must be `exported="true"` to receive `BOOT_COMPLETED`; it only reschedules the app's own reminders, so that's fine.

### Other policy points already in good shape

- `targetSdk 36` / `compileSdk 36`: meets the Aug 31 2026 requirement (Android 16 / API 36) for new apps and updates.
- `allowBackup=false`, `dataExtractionRules` exclude everything, `usesCleartextTraffic=false`.
- Release build is not debuggable.
- CI already builds the signed **AAB** (`bundleRelease`).

## Changes made on this branch

- Updated dependencies (audit item R5), all verified by building `assembleRelease` + `bundleRelease` locally with AGP 8.11.1 / compileSdk 36:
  - `androidx.webkit:webkit` 1.11.0 → **1.18.0**
  - `androidx.core:core` 1.13.1 → **1.17.0** (1.18+ requires compileSdk 37 and AGP 9.1, so it stops here for now)
  - `com.google.android.gms:play-services-auth` 21.2.0 → **21.6.0** (stays on 21.x: 22.0 is a major version that may drop the `GoogleSignIn` API this app uses)

## Not changed, on purpose

- **R8 / minify stays off.** The release APK is only ~3 MB (the app is a WebView plus a few small Java classes), so shrinking saves little, and the risk is real: R8 can strip or rename the `@JavascriptInterface` bridge methods the web app calls, and that only shows up at runtime on a phone, which couldn't be tested here. If you turn it on later, add to `proguard-rules.pro`:

  ```
  -keepclassmembers class * { @android.webkit.JavascriptInterface <methods>; }
  -keepattributes JavascriptInterface
  ```
  then test every bridge feature (Drive backup, reminders, file export, receipts, fingerprint, address lookup, Pro purchase) on a real phone before shipping. Play Console will show a "no deobfuscation file" note while R8 is off; that's informational only.
- GitHub Actions are still referenced by tag (`@v4`), not pinned to commit hashes (rest of R5). Low risk for a personal project.
