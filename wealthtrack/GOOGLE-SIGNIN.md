# Turn on "Sign in with Google" for Drive backup

The app has a **Settings → Your data → Google Drive backup → Sign in with Google** button. Once you sign in, it backs your data up to `WealthTrack-backup.json` in your Google Drive:

- a minute after any change
- whenever you leave the app
- at least once a day

Backups are fully automatic: there are no buttons to press. On a new or reset phone, signing in with Google offers to **restore** your backup. WealthTrack can only see the files it creates, not the rest of your Drive.

Google only lets an app use its sign-in after the account owner registers it. That's a one-time, roughly 2-minute step, in the **same Google Cloud project** you made for the Drive uploads ("WealthTrack uploader").

## The one-time step

1. Go to **https://console.cloud.google.com/auth/clients** and make sure the **WealthTrack uploader** project is selected at the top.
2. Click **+ Create client**.
3. **Application type: Android**.
4. Fill in:
   - **Name:** `WealthTrack Android`
   - **Package name:** `com.wealthtrack.app`
   - **SHA-1 certificate fingerprint:** the value from the newest "Build WealthTrack APK" run. Open the run on GitHub Actions, then the step **"Show signing fingerprint"**, and copy the `SHA-1` line.
5. Click **Create**.

That's it. Nothing needs to be copied back into the app or GitHub.

**Optional:** the Google sign-in screen shows the app name from your consent screen. To make it say "WealthTrack" instead of "WealthTrack uploader", go to https://console.cloud.google.com/auth/branding and change the **App name**.

## If something goes wrong

- **"Google sign-in isn't set up for this app yet (developer error 10)":** the Android client is missing, the package name or SHA-1 is wrong, or it's in a different project. Check step 4.
- **"Sign in again" in Settings:** Google wants you to confirm access again. Tap it.
- **To stop backups:** Settings → Personal info → Google account → **Sign out**. To remove access completely, go to https://myaccount.google.com/permissions.

The backup file isn't protected by the app's PIN lock. It's stored in your own private Google Drive.

## Signing in to open the app (1.2.2+)

- **Phone:** the first time you open WealthTrack, you create a PIN (6+ digits). Under the keypad you can also **Sign in with Google** to back up to Drive (or restore a backup on a new phone), or **Continue as guest**. After that it asks for your PIN every time you open it, and again after 2 minutes in the background. Fingerprint unlock is turned on in **Settings → Security**.
- **Browser (WealthTrack.html):** asks you to create a PIN on first open, then asks for it every time.
- **Continue as guest (phone):** skips the PIN and Google. Your data is **not backed up** and the app isn't locked, so if the phone is lost, reset, or the app is uninstalled, the data is gone. A red banner on the Overview screen reminds you. You can sign in with Google or add a PIN any time in Settings.
- **Forgot your PIN?** Tap "Forgot PIN?" on the unlock screen. On the phone you can erase it and restore from Google Drive; in the browser you can erase it and restore from a backup file.
- Change your PIN or turn fingerprint on and off in **Settings → Security**. Sign in or out of Google in **Settings → Personal info**.
