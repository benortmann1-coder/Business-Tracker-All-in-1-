"""Upload a built APK to a Google Drive folder using a service account.

Reads three environment variables:
- GDRIVE_SA_JSON       : the service-account JSON key (the full file content)
- GDRIVE_FOLDER_ID     : the target Drive folder id
- APK_PATH             : path to the .apk file on disk

Optional:
- BUILD_LABEL          : appended to the filename (e.g. "debug-42")

Prints the uploaded file's webViewLink on success; exits non-zero on failure.
"""

import json
import os
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


def main() -> int:
    sa_raw = os.environ.get("GDRIVE_SA_JSON")
    folder_id = os.environ.get("GDRIVE_FOLDER_ID")
    apk_path = os.environ.get("APK_PATH")

    missing = [
        name
        for name, val in (
            ("GDRIVE_SA_JSON", sa_raw),
            ("GDRIVE_FOLDER_ID", folder_id),
            ("APK_PATH", apk_path),
        )
        if not val
    ]
    if missing:
        print(f"Missing required env vars: {', '.join(missing)}", file=sys.stderr)
        return 2

    apk = Path(apk_path)
    if not apk.is_file():
        print(f"APK not found at {apk_path}", file=sys.stderr)
        return 3

    label = os.environ.get("BUILD_LABEL", "build")
    filename = f"bevelry-{label}.apk"

    creds = service_account.Credentials.from_service_account_info(
        json.loads(sa_raw),
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    media = MediaFileUpload(
        str(apk),
        mimetype="application/vnd.android.package-archive",
        resumable=True,
    )
    metadata = {"name": filename, "parents": [folder_id]}
    result = (
        drive.files()
        .create(
            body=metadata,
            media_body=media,
            fields="id,name,webViewLink,size",
            supportsAllDrives=True,
        )
        .execute()
    )
    print(
        f"Uploaded {result['name']} "
        f"({int(result.get('size', 0)) / 1024 / 1024:.1f} MB) "
        f"→ {result['webViewLink']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
