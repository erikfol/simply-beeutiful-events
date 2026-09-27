# simply-beeutiful-events
Website and project repository for Simply Beeutiful Events (SBE).

## Branding

![SBE logo](sbe-logo.png)

## Project overview

This repository contains the event management tooling and document processing workflow for Simply Beeutiful Events (SBE). It includes the browser-based doc reader, local event scanning tools, and supporting project documentation.

## Quick start

1. Install Python dependencies:
   `pip install -r requirements.txt`
2. Scan a local event folder:
   `python tools/scan_event.py "events/6.6.26 Mistretta-Petran Wedding"`
3. Serve the doc reader locally:
   `python -m http.server` from the repo root or inside `doc-reader/`
4. Open the browser to the UI and select an event.
