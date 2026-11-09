# Make every new WealthTrack build appear in your Google Drive

Do this once, about 10 minutes, on a computer. Afterwards, every time the app is updated, GitHub builds it and **replaces `WealthTrack.apk` and `WealthTrack.html` in your Drive**. The link never changes, and there are no tokens to renew.

**Why not a service account?** A service account is a robot Google login with no Drive storage of its own. Google rejects its uploads into a personal Gmail Drive with "Service Accounts do not have storage quota". So for a personal account we use a permanent sign-in key ("refresh token") from a tiny private Google app that you own.

---

## 1. Create a Google Cloud project
1. Go to <https://console.cloud.google.com/projectcreate> and sign in with **your Google account**.
2. Name it `WealthTrack uploader` and click **Create**. Make sure it's the selected project at the top of the page.
3. Go to <https://console.cloud.google.com/apis/library/drive.googleapis.com> and click **Enable**.

## 2. Set up the sign-in screen (OAuth consent)
1. Go to <https://console.cloud.google.com/auth/overview> and click **Get started**.
2. **App name:** `WealthTrack uploader`. **User support email:** your email. Then **Next**.
3. **Audience:** choose **External**, then **Next**. **Contact email:** your email, then **Next**. Agree, then **Create**.
4. Open **Audience** in the left menu and click **Publish app**, then **Confirm**, so the status says **In production**.
   - This step matters. While the app is in "Testing", Google expires its keys after 7 days.
   - The app only asks for the limited `drive.file` permission, so Google doesn't need to review it.

## 3. Create the app's key (OAuth client)
1. Go to <https://console.cloud.google.com/auth/clients> and click **+ Create client**.
2. **Application type:** **Web application**. **Name:** `WealthTrack uploader`.
3. Under **Authorized redirect URIs**, click **+ Add URI** and paste `https://developers.google.com/oauthplayground`
4. Click **Create**. Copy the **Client ID** and **Client secret** somewhere safe for a few minutes.

## 4. Get the permanent key (refresh token)
1. Go to <https://developers.google.com/oauthplayground>
2. Click the **gear icon** at the top right and tick **Use your own OAuth credentials**. Paste your **Client ID** and **Client secret**, then close the box.
3. In the list on the left, open **Drive API v3** and tick `https://www.googleapis.com/auth/drive.file`. Click **Authorize APIs**.
4. Sign in with your Google account. If Google says the app "hasn't been verified", click **Advanced**, then **Go to WealthTrack uploader**. It's your own app. Then click **Allow**.
5. Click **Exchange authorization code for tokens**.
6. Copy the **Refresh token**. It starts with `1//`. This one doesn't expire. (Don't copy the access token that starts with `ya29.`.)

## 5. Give the keys to GitHub (private repository secrets)
On GitHub, open your repository, then **Settings → Secrets and variables → Actions**. Click **New repository secret** for each of these:

| Name | Value |
|---|---|
| `GDRIVE_CLIENT_ID` | the Client ID from step 3 |
| `GDRIVE_CLIENT_SECRET` | the Client secret from step 3 |
| `GDRIVE_REFRESH_TOKEN` | the refresh token from step 4 |
| `GDRIVE_FOLDER_ID` *(optional)* | to use a folder: open it in Drive and copy the part of the address after `/folders/`. Leave it out to use the top of My Drive. |

Secrets are encrypted. Nobody can read them back, including you or me. GitHub only hands them to the build.

## 6. Try it
On GitHub, open your repository's **Actions** tab, open **Build WealthTrack APK**, then **Run workflow** and **Run workflow**. After about 2 minutes, `WealthTrack.apk` and `WealthTrack.html` appear in your Drive.

From now on this happens by itself whenever the app is updated.

---

### Good to know
- **Duplicates the first time:** the robot can only see files it created itself. So its first run makes new copies next to the ones uploaded earlier. Delete the old copies once, and from then on it keeps updating its own two files.
- **To stop it:** delete the `GDRIVE_REFRESH_TOKEN` secret, or remove the app at <https://myaccount.google.com/permissions>.
- **If it ever fails:** open the failed run in GitHub Actions and look at the "Upload to Google Drive" step. `invalid_grant` means the key was revoked or the app was left in "Testing". Repeat step 2.4 and step 4.
