# simply-beeutiful-events
Website and project repository for Simply Beeutiful Events (SBE).

![SBE logo](sbe-logo.png)

## Project overview

This repository contains the event management tooling and document processing workflow for Simply Beeutiful Events (SBE). It includes the browser-based event manager, local event scanning tools, Google Drive integration planning, and supporting project documentation.

## View the GUI

The static event manager can be published with GitHub Pages by selecting the `main` branch and `/docs` folder in **Settings → Pages**. The `docs/index.html` entry point forwards to the current app in `doc-reader/`.

For local development, run:

```bash
python -m http.server
```

Then open the repository root in a browser, or follow the instructions in [`doc-reader/README.md`](doc-reader/README.md).

## Quick start

1. Install Python dependencies:
   `pip install -r requirements.txt`
2. Scan a local event folder:
   `python tools/scan_event.py "events/6.6.26 Mistretta-Petran Wedding"`
3. Serve the repository locally with `python -m http.server`.
4. Open the event manager and select an event.

Actual client event data should live in Google Drive rather than in Git. The tracked `events/` directory is retained only as legacy/test data until it is removed from Git history.
