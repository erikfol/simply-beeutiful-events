"""Read-only Google Drive event-folder sync prototype.

This module intentionally does not write to Google Drive. It recursively lists a
folder, exports native Google Docs/Sheets to local formats, and downloads other
supported files. The resulting directory can be passed to tools/scan_event.py.

Usage:
    python tools/google_drive_sync.py --folder-id FOLDER_ID --output-dir /tmp/sbe-event

Authentication uses a Google service-account JSON file. Never commit that file.
"""
from __future__ import annotations

import argparse
import io
import json
import logging
import os
from pathlib import Path, PurePosixPath
from typing import Any

LOG = logging.getLogger("sbe.google_drive_sync")
FOLDER_MIME = "application/vnd.google-apps.folder"
EXPORTS = {
    "application/vnd.google-apps.document": (".pdf", "application/pdf"),
    "application/vnd.google-apps.spreadsheet": (
        ".xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    "application/vnd.google-apps.presentation": (".pdf", "application/pdf"),
}
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def build_drive_service(credentials_path: str):
    """Build a Drive client using read-only service-account credentials."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError as exc:  # pragma: no cover - exercised by CLI setup
        raise RuntimeError(
            "Google dependencies are missing; run: pip install -r requirements.txt"
        ) from exc

    credentials = Credentials.from_service_account_file(credentials_path, scopes=SCOPES)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def list_files(service: Any, folder_id: str) -> list[dict[str, Any]]:
    """Recursively list files below *folder_id*, retaining relative paths."""
    result: list[dict[str, Any]] = []

    def walk(parent_id: str, relative_parent: PurePosixPath) -> None:
        token = None
        while True:
            response = (
                service.files()
                .list(
                    q=f"'{parent_id}' in parents and trashed = false",
                    spaces="drive",
                    fields="nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)",
                    pageSize=100,
                    pageToken=token,
                    orderBy="name",
                )
                .execute()
            )
            for item in response.get("files", []):
                if item["mimeType"] == FOLDER_MIME:
                    walk(item["id"], relative_parent / item["name"])
                else:
                    item = dict(item)
                    item["relative_path"] = str(relative_parent / item["name"])
                    result.append(item)
            token = response.get("nextPageToken")
            if not token:
                return

    walk(folder_id, PurePosixPath())
    return result


def _safe_path(output_dir: Path, relative_path: str, suffix: str | None = None) -> Path:
    """Return a path below output_dir, preventing traversal from Drive names."""
    relative = PurePosixPath(relative_path)
    if suffix:
        relative = relative.with_suffix(suffix)
    destination = (output_dir / Path(*relative.parts)).resolve()
    root = output_dir.resolve()
    if destination != root and root not in destination.parents:
        raise ValueError(f"Unsafe Drive path: {relative_path}")
    return destination


def download_file(service: Any, item: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Download or export one Drive item and return sync metadata."""
    try:
        from googleapiclient.http import MediaIoBaseDownload
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Install google-api-python-client first") from exc

    mime_type = item["mimeType"]
    export = EXPORTS.get(mime_type)
    suffix = export[0] if export else None
    destination = _safe_path(output_dir, item["relative_path"], suffix)
    destination.parent.mkdir(parents=True, exist_ok=True)

    if export:
        request = service.files().export_media(fileId=item["id"], mimeType=export[1])
    else:
        request = service.files().get_media(fileId=item["id"])

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    destination.write_bytes(buffer.getvalue())

    return {
        "drive_file_id": item["id"],
        "drive_name": item["name"],
        "drive_mime_type": mime_type,
        "modified_time": item.get("modifiedTime"),
        "web_view_link": item.get("webViewLink"),
        "relative_path": str(destination.relative_to(output_dir)),
        "bytes": destination.stat().st_size,
    }


def sync_folder(folder_id: str, output_dir: str, credentials_path: str) -> dict[str, Any]:
    """Sync one Drive folder and write a manifest alongside downloaded files."""
    output = Path(output_dir).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    service = build_drive_service(credentials_path)
    items = list_files(service, folder_id)
    downloaded: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for item in items:
        try:
            LOG.info("Downloading %s", item["relative_path"])
            downloaded.append(download_file(service, item, output))
        except Exception as exc:  # continue so one bad file does not stop the event
            LOG.exception("Could not download %s", item["name"])
            errors.append({"name": item["name"], "error": str(exc)})

    manifest = {
        "folder_id": folder_id,
        "output_dir": str(output),
        "files_found": len(items),
        "files_downloaded": len(downloaded),
        "errors": errors,
        "files": downloaded,
    }
    (output / ".sbe-drive-manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--folder-id", required=True, help="Google Drive event folder ID")
    parser.add_argument(
        "--output-dir", required=True, help="Local temporary directory outside the repository"
    )
    parser.add_argument(
        "--credentials",
        default=os.getenv("GOOGLE_CREDENTIALS_PATH", "credentials.json"),
        help="Service-account JSON path (default: GOOGLE_CREDENTIALS_PATH or credentials.json)",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING)

    if not Path(args.credentials).is_file():
        parser.error(
            f"Credentials file not found: {args.credentials}. "
            "Set GOOGLE_CREDENTIALS_PATH or pass --credentials."
        )
    manifest = sync_folder(args.folder_id, args.output_dir, args.credentials)
    print(
        f"Synced {manifest['files_downloaded']}/{manifest['files_found']} files to "
        f"{manifest['output_dir']}"
    )
    if manifest["errors"]:
        print(f"Warnings: {len(manifest['errors'])} file(s) failed; see .sbe-drive-manifest.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
