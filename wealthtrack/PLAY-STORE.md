# Putting WealthTrack on Google Play

This is the full path from "APK in my Google Drive" to "anyone can install it from Google Play". Plan on about 3–4 weeks, most of it waiting on the 14-day closed test.

Everything you need to paste into Play Console is in [`store-listing/`](store-listing/). The privacy policy page is [`privacy/index.html`](privacy/index.html).

**Things only you can fill in** are marked **YOU:** below.

---

## 0. Before you start: three decisions

1. **Account type.**
   - **Personal account** (simplest). You must run a closed test with **12 testers for 14 days straight** before you can publish.
   - **Organization account** skips the tester rule, but needs a registered business (e.g. an LLC) and a free **D-U-N-S number** from Dun & Bradstreet. If PCSS is a registered business, this is worth considering.
2. **Your public address.** WealthTrack will sell a Pro upgrade, so Google Play shows the **full address** from your payments profile on the store page (consumer-protection rule for any account that sells something). If you don't want your home address public, get a PO box or use a business address **before** you create the payments profile. The payments profile's country can't be changed later.
3. **App name and package name.** The package name `com.wealthtrack.app` is permanent once uploaded, and it must be unique on Google Play. If Play Console says it's taken, it has to change in `android/app/build.gradle` (`applicationId`) before the first upload. Search Google Play for "WealthTrack" too: if another finance app already uses the name, pick a variation (e.g. "WealthTrack: Bills & Budget") to avoid a trademark complaint.

## 1. Create the developer account (day 1)

1. Go to https://play.google.com/console and sign in with the Google account you want to own the app.
2. Choose **Personal** (or Organization), pay the **$25 one-time fee**.
3. **Verify your identity**: legal name and address (from your Google payments profile) and an ID document.
4. **Verify an Android device**: install the **Play Console** app on your phone and sign in. New personal accounts must prove they have a real Android phone.
5. Verify your contact email (and phone, for organizations).

Verification can take a few days. You can set up the app while you wait.

## 2. Publish the privacy policy (day 1, 10 minutes)

Google requires a public privacy policy URL. The repo is public, so GitHub Pages can host it for free:

1. **YOU:** open `privacy/index.html` and replace `[YOUR CONTACT EMAIL]` with the email users should write to (use one you're fine showing publicly). Commit.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick the branch that has the `wealthtrack/` folder and the `/ (root)` folder, **Save**.
3. After a minute the policy is at
   `https://benortmann1-coder.github.io/Business-Tracker-All-in-1-/wealthtrack/privacy/`
   Open it to check, then use that URL in Play Console.

## 3. Get the upload file (AAB)

Google Play needs an **Android App Bundle (.aab)**, not the APK.

1. On GitHub: **Actions → Build WealthTrack APK → Run workflow**, build mode **release**.
2. When it finishes, open the run and download the **`wealthtrack-release-aab`** artifact (a zip with the `.aab` inside).

Make sure the `WT_KEYSTORE_B64` and `WT_KEYSTORE_PASSWORD` secrets are set (they already are if updates install over your phone's copy). The run log says "Signing with the WealthTrack release key" when they are. **Never lose that keystore file or its password**: it's your **upload key**.

## 4. Create the app in Play Console

1. **Create app** → name, default language English (US), **App**, **Free** (Free is correct even with an in-app purchase. A free app can never be switched to paid later, and that's fine here).
2. Accept the declarations.

### Play App Signing

On the first upload Play Console turns on **Play App Signing**: Google keeps the final signing key and your existing WealthTrack keystore becomes the **upload key**. Accept it.

Two consequences:

- **Copies installed from Google Play are signed by Google's key**, not yours. Your sideloaded copy from Drive can't update to the Play copy or the other way round. When you switch your own phone to the Play version: **back up first** (Settings → Your data → Back up now, or the Drive backup), uninstall the sideloaded app, install from Play, restore.
- **Google sign-in needs Google's key too.** In Play Console go to **Test and release → App integrity → App signing**, copy the **App signing key certificate SHA-1**, and add a **second Android OAuth client** with that SHA-1 (same steps as [GOOGLE-SIGNIN.md](GOOGLE-SIGNIN.md)). Without it, "Sign in with Google" fails with developer error 10 for everyone who installs from Play. Keep the existing client too, so your sideloaded builds keep working.

### Google sign-in for the public

While your Google Cloud **OAuth consent screen** is in **Testing**, only the test users listed there can sign in, and their sign-in expires every 7 days. Before release:

1. Go to https://console.cloud.google.com/auth/audience (WealthTrack uploader project) and click **Publish app** to move it to **In production**.
2. On https://console.cloud.google.com/auth/branding set the app name to **WealthTrack**, add the privacy policy URL, and your support email.

WealthTrack only asks for the `drive.file` scope (files it created), which isn't a sensitive or restricted scope, so this shouldn't need Google's verification review. If Google asks for verification anyway, follow its prompts.

## 5. App content (Policy → App content)

Answer every section. Exact answers are in `store-listing/`:

| Section | Answer |
|---|---|
| Privacy policy | the GitHub Pages URL from step 2 |
| App access | **All functionality is available without special access** ("Continue as guest" skips sign-in; no account is needed) |
| Ads | **No, my app does not contain ads** |
| Content rating | Fill in the IARC questionnaire: see `store-listing/content-rating.md`. Expect **Everyone / PEGI 3** |
| Target audience | **18 and over** only. Don't include any under-13 age group (that triggers the Families policy) |
| News app | No |
| Data safety | see `store-listing/data-safety.md` |
| Government app | No |
| **Financial features** | WealthTrack is a personal budgeting and bill tracker. It does **not** offer loans, banking, payments between people, crypto, investing or trading. Pick the option for personal finance management / budgeting if it's listed; otherwise the option saying the app provides none of the listed financial services. Don't tick anything about loans. |
| Health apps | No health features |
| Advertising ID | **No** (the app doesn't use it) |

## 6. Store listing (Grow → Store presence → Main store listing)

Copy from `store-listing/listing.md`:

- App name (30 characters max)
- Short description (80 max)
- Full description (4,000 max)
- **App icon:** `store-listing/icon-512.png`
- **Feature graphic:** `store-listing/feature-graphic-1024x500.png`
- **Phone screenshots:** `store-listing/screenshots/*.png` (1080×1920; upload 4–8, dashboard first)
- Category: **Finance**. Tags: budgeting, bill tracker, personal finance.
- **YOU:** contact email (shown publicly) and, optionally, a website.

The screenshots use made-up sample data. Regenerate them after UI changes with `node wealthtrack/store-listing/make-assets.js`.

## 7. Set up the Pro upgrade (Monetize → Products → In-app products)

You can only create products after a build that includes Google Play Billing has been uploaded (any testing track counts), and after a payments profile is linked.

1. **Monetize → Monetization setup**: link or create the **payments profile** (this is where the address from step 0 comes from) and set up payouts.
2. **Products → In-app products → Create product**:
   - Product ID: **`wealthtrack_pro`** (must match the app exactly; can never be reused)
   - Name: `WealthTrack Pro`
   - Description: e.g. `Unlock Google Drive backup, Reports and Excel export, the debt payoff planner and Smart Budget. One-time purchase.`
   - **YOU:** price (set the US price and let Google convert the rest)
   - **Activate** it.
3. **Test Pro for free:** **Settings (gear, left menu) → License testing** → add your Gmail (and anyone helping you test) → response **RESPOND_NORMALLY**. License testers see test cards in the purchase sheet ("Test card, always approves") and are never charged. Purchases only work in a copy installed **from Google Play** (any test track), not your sideloaded APK.

## 8. Closed test: 12 testers for 14 days (personal accounts)

1. **Test and release → Testing → Closed testing → Create track** (or use the default "Alpha").
2. **Testers:** create an email list and add at least **12** people's Gmail addresses (recruit 15–20 in case some drop out). Coworkers, friends, family.
3. **Create release** → upload the `.aab` from step 3 → release notes → **Review release → Start rollout**.
4. Send testers the **opt-in link** (shown on the track's Testers tab). Each must open it, tap **Become a tester**, then install from Google Play.
5. They need to **stay opted in for 14 days in a row** and actually use the app. Google checks engagement. Ask them to add a few bills, mark one paid, and send you feedback.
6. Ship an update or two during the test (bump `versionCode` and `versionName` in `android/app/build.gradle` each time; Play rejects a reused versionCode).

## 9. Apply for production

1. When the 14 days are done, **Dashboard → Apply for production**. Answer the questions about your test (how you recruited testers, what feedback you got and what you changed). Real, specific answers help.
2. Google decides in about **2 days**.
3. Then **Production → Create release** → upload the latest `.aab` → **Send for review**. Review takes up to about **7 days** for a new app.
4. Approved → it's live. Share the Play link everywhere.

## Every update after launch

1. Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle`.
2. Run the workflow in **release** mode, download the new AAB, upload it to the track (Production, or a test track first).
3. Keep the target API level current: Google raises it every August (Android 16 / API 36 is required for new apps and updates since Aug 31 2026). `compileSdk`/`targetSdk` live in `android/app/build.gradle`.

## Checklist: what you need to supply

- [ ] Contact email in `privacy/index.html` (and in the Play listing)
- [ ] Turn on GitHub Pages and confirm the privacy URL works
- [ ] Address you're OK being public (PO box?) before creating the payments profile
- [ ] Check `com.wealthtrack.app` and the "WealthTrack" name are free on Google Play
- [ ] Second Android OAuth client with the **Play app signing** SHA-1
- [ ] Publish the OAuth consent screen to **In production**
- [ ] Pro price
- [ ] 12+ testers' Gmail addresses
