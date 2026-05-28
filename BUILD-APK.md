# Auto-upload APK to Google Drive

One-time setup so every push to `claude/**`, `main`, or `master` (and every
manual `workflow_dispatch` run) builds the APK and drops it in your
**Bevelry — Woodworking App Blueprint** Drive folder, with no further
action from you.

## What you'll need (~10 minutes)

A Google Cloud project + service account that has permission to write to
the Drive folder, plus two GitHub Actions secrets.

## 1. Create the service account

1. Go to <https://console.cloud.google.com/projectcreate>. Name it
   something like `bevelry-ci`. Wait for it to finish creating.
2. With that project selected, go to
   <https://console.cloud.google.com/apis/library/drive.googleapis.com>
   and click **Enable** to turn on the Drive API.
3. Go to **IAM & Admin → Service Accounts**, click **Create service
   account**:
   - Name: `bevelry-apk-uploader`
   - Description: "Uploads built APKs to Drive"
   - Skip the optional role grants (we'll grant access at the folder
     level instead).
4. Open the new service account → **Keys** tab → **Add key → Create new
   key → JSON**. Save the downloaded `.json` file — you'll paste its
   contents into a GitHub secret in step 3.
5. Copy the service account's email (looks like
   `bevelry-apk-uploader@bevelry-ci.iam.gserviceaccount.com`) —
   you'll share the Drive folder with it in step 2.

## 2. Share the Drive folder with the service account

1. Open the **Bevelry — Woodworking App Blueprint** folder in Drive:
   <https://drive.google.com/drive/folders/1E1eH30gqyxBoU-3x-93rnPsVjRo7phNw>
2. Right-click the folder → **Share**
3. Paste the service account email from step 1.5
4. Set the role to **Editor** (so it can upload files)
5. Click **Send** (uncheck "Notify people" — the service account doesn't
   have a real inbox)

## 3. Add the two GitHub secrets

In your repo (`benortmann1-coder/business-tracker-all-in-1-`) go to
**Settings → Secrets and variables → Actions → New repository secret**
and add two secrets:

- **`GDRIVE_SA_JSON`** — paste the *entire contents* of the JSON file you
  downloaded in step 1.4 (one big JSON blob with `private_key`,
  `client_email`, etc.). Don't wrap it in quotes; just paste the JSON.

- **`GDRIVE_FOLDER_ID`** — the value `1E1eH30gqyxBoU-3x-93rnPsVjRo7phNw`
  (the folder ID from the URL of the Drive folder in step 2).

## 4. Trigger a build

You can either:

- **Push any commit** to a `claude/**`, `main`, or `master` branch — the
  workflow runs automatically, OR
- Go to **Actions → Build Android APK → Run workflow** and pick
  `debug` or `release`.

When the workflow finishes, look at the **Upload APK to Google Drive**
step in the log — you'll see a line like:

```
Uploaded bevelry-debug-87-3ab1b8a.apk (32.4 MB) →
https://drive.google.com/file/d/.../view
```

Open the link, or refresh the Drive folder — the new APK will be sitting
there alongside the existing docs.

## Filename convention

APKs are uploaded as `bevelry-{mode}-{run-number}-{commit-sha}.apk`, e.g.:

```
bevelry-debug-87-3ab1b8af.apk
bevelry-release-88-49c90a99.apk
```

Each build creates a new file (Drive doesn't dedupe by name). Old builds
just stack up — delete them in Drive when you're done with them.

## Troubleshooting

- **"Missing required env vars"** — at least one of `GDRIVE_SA_JSON`,
  `GDRIVE_FOLDER_ID`, or `APK_PATH` is empty. Re-check both repo secrets
  exist and are spelled correctly.
- **"403: storageQuotaExceeded"** — service accounts don't have their
  own Drive storage. The folder you share with them counts against
  *your* Drive quota. If you're full, free up space.
- **"404: File not found"** — the folder ID is wrong, or you forgot to
  share the folder with the service-account email in step 2.
- **The upload step doesn't run at all** — it's gated on
  `env.GDRIVE_SA_JSON != ''`. If the secret isn't set the step is
  skipped silently; the rest of the build still publishes the APK as a
  workflow artifact you can download manually.

## What if I want to disable auto-upload temporarily?

Delete the `GDRIVE_SA_JSON` repo secret (or rename it). The upload step
checks for it and skips silently when it's empty. The APK artifact
still gets attached to the run page for manual download.
