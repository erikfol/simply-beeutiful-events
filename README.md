# simply-beeutiful-events
Website and project repository for Simply Beeutiful Events (SBE).

![SBE logo](sbe-logo.png)

## Project overview

This repository contains the event management tooling and document processing workflow for Simply Beeutiful Events (SBE). It includes the browser-based event manager, local event scanning tools, Google Drive integration planning, and supporting project documentation.

## View the GUI

The static event manager can be published with GitHub Pages by selecting the `main` branch and `/docs` folder in **Settings → Pages**. The app lives directly in `docs/` — there is no separate copy to keep in sync.

For local development, run:

```bash
python -m http.server
```

Then open http://localhost:8000/docs/ (the repository root redirects there). See [`docs/README.md`](docs/README.md) for details.

## Quick start

1. Install Python dependencies:
   `pip install -r requirements.txt`
2. Scan a local event folder (with no argument it rebuilds the fictional demo event):
   `python tools/scan_event.py "events/<event folder>"`
3. Serve the repository locally with `python -m http.server`.
4. Open the event manager and select an event.

The published site shows only a fictional demo event. Real client reports are git-ignored and listed in `docs/reports/local-index.json`, so they appear only when running locally — see [`docs/README.md`](docs/README.md).

Actual client event data should live in Google Drive rather than in Git. The `events/` directory is git-ignored: keep event folders there locally to scan them, but never commit them.

## Google Drive event folders

The app will read events from SBE's shared Google Drive folder. These conventions keep that reliable; they match how folders are named today.

- **One shared folder, one subfolder per event**, named `M.D.YY Last-Last Event`, e.g. `6.12.27 Harper-Bennett Wedding`. The date in the name is the event date.
- **Budget:** a spreadsheet with `Budget` in its name and a tab called `Budget Calculator` (category in column B; actual, paid, and due in columns G, H, I; a `Total Cost:` row).
- **Vendors:** a spreadsheet with `Vendor Options` in its name and a tab called `Booked` (vendor, location, event, category, contact, email, cost).
- **Contracts and quotes:** any file whose name contains `contract`, `agreement`, `quote`, `estimate`, `invoice`, or `receipt` is listed as a vendor document.
- Everything else (notes, menus, inspiration photos) can be named freely.

`tests/demo_event/` is a working example of this layout.

## Development

- The app is plain JavaScript modules in `docs/js/` with no build step (see [`docs/README.md`](docs/README.md) for the file layout).
- `npm test` runs the JavaScript tests (`tests/js/`, Node 24+); `python -m pytest tests` runs the scanner tests.
- GitHub Actions runs both on every push (`.github/workflows/tests.yml`).
