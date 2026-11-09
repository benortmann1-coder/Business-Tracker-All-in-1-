"""Upload build outputs to Google Drive.

Two ways to sign in (pick one):

1. Personal Google account (works with a normal @gmail.com Drive) — recommended
   - GDRIVE_CLIENT_ID      : OAuth client ID ("Desktop app") from your Google Cloud project
   - GDRIVE_CLIENT_SECRET  : that client's secret
   - GDRIVE_REFRESH_TOKEN  : a refresh token for your account with the drive.file scope
   Files are stored in your own Drive and count against your quota.

2. Service account (only works with a Google Workspace *shared drive*; service
   accounts have no storage of their own, so uploads into a personal My Drive fail)
   - GDRIVE_SA_JSON        : the service-account JSON key (full file content)

What to upload:
- APK_PATH                 : path to the .apk (required)
- GDRIVE_FOLDER_ID         : target folder id (optional with OAuth: defaults to My Drive)
- FIXED_NAME               : if set (e.g. "WealthTrack.apk"), the same Drive file is
                             replaced on every run, so its link never changes
- otherwise the file is named "<FILE_PREFIX>-<BUILD_LABEL>.apk" (a new file per build)
- EXTRA_UPLOADS            : optional extra files, one per line: "<path>|<drive name>|<mime>"
                             (always replaced in place by name)

Prints each file's link; exits non-zero on failure.
"""

import json
import os
import sys
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
APK_MIME = "application/vnd.android.package-archive"


def credentials():
    cid, secret, refresh = (os.environ.get(k) for k in ("GDRIVE_CLIENT_ID", "GDRIVE_CLIENT_SECRET", "GDRIVE_REFRESH_TOKEN"))
    if cid and secret and refresh:
        from google.oauth2.credentials import Credentials

        return Credentials(
            None,
            refresh_token=refresh,
            client_id=cid,
            client_secret=secret,
            token_uri="https://oauth2.googleapis.com/token",
            scopes=SCOPES,
        ), "personal account"
    sa_raw = os.environ.get("GDRIVE_SA_JSON")
    if sa_raw:
        from google.oauth2 import service_account

        return service_account.Credentials.from_service_account_info(json.loads(sa_raw), scopes=SCOPES), "service account"
    return None, None


def find_existing(drive, name, folder_id):
    safe = name.replace("\\", "\\\\").replace("'", "\\'")
    q = f"name = '{safe}' and trashed = false"
    if folder_id:
        q += f" and '{folder_id}' in parents"
    res = drive.files().list(q=q, fields="files(id,name)", spaces="drive", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
    files = res.get("files", [])
    return files[0]["id"] if files else None


def upload(drive, path, name, mime, folder_id, replace):
    media = MediaFileUpload(str(path), mimetype=mime, resumable=True)
    existing = find_existing(drive, name, folder_id) if replace else None
    fields = "id,name,webViewLink,size"
    if existing:
        result = drive.files().update(fileId=existing, media_body=media, fields=fields, supportsAllDrives=True).execute()
        verb = "Updated"
    else:
        body = {"name": name}
        if folder_id:
            body["parents"] = [folder_id]
        result = drive.files().create(body=body, media_body=media, fields=fields, supportsAllDrives=True).execute()
        verb = "Uploaded"
    print(f"{verb} {result['name']} ({int(result.get('size', 0)) / 1024 / 1024:.2f} MB) -> {result.get('webViewLink', '')}")


def main() -> int:
    apk_path = os.environ.get("APK_PATH")
    if not apk_path:
        print("Missing required env var: APK_PATH", file=sys.stderr)
        return 2
    apk = Path(apk_path)
    if not apk.is_file():
        print(f"APK not found at {apk_path}", file=sys.stderr)
        return 3

    creds, kind = credentials()
    if not creds:
        print("No Drive credentials: set GDRIVE_CLIENT_ID/GDRIVE_CLIENT_SECRET/GDRIVE_REFRESH_TOKEN or GDRIVE_SA_JSON", file=sys.stderr)
        return 2
    folder_id = os.environ.get("GDRIVE_FOLDER_ID") or None
    if kind == "service account" and not folder_id:
        print("GDRIVE_FOLDER_ID is required with a service account", file=sys.stderr)
        return 2
    print(f"Signing in to Drive with a {kind}")
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    fixed = os.environ.get("FIXED_NAME")
    if fixed:
        upload(drive, apk, fixed, APK_MIME, folder_id, replace=True)
    else:
        label = os.environ.get("BUILD_LABEL", "build")
        upload(drive, apk, f"{os.environ.get('FILE_PREFIX', 'bevelry')}-{label}.apk", APK_MIME, folder_id, replace=False)

    for line in (os.environ.get("EXTRA_UPLOADS") or "").splitlines():
        line = line.strip()
        if not line:
            continue
        path, name, mime = (part.strip() for part in line.split("|"))
        if not Path(path).is_file():
            print(f"Skipping missing extra file {path}", file=sys.stderr)
            continue
        upload(drive, Path(path), name, mime, folder_id, replace=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
