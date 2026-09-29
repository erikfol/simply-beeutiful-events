# SBE Event Manager (v0.6)

Live app: https://erikfol.github.io/simply-beeutiful-events/

This folder is the app and the published site (GitHub Pages serves `main` → `/docs`). There is no separate copy to sync — edit files here directly.

Sign in with Google, pick an event, and the Overview opens. All in the browser, no upload. **The page shows no events until someone signs in**: events come only from SBE's Google Drive.

## Google Drive events
When Google sign-in is set up (see [`../GOOGLE_SETUP.md`](../GOOGLE_SETUP.md)), a bar above the event picker offers **Sign in with Google**:
- Choose the SBE events folder once (from a dropdown of folders shared with you and your own top-level folders, by name, or by pasting its Drive link). Every subfolder whose name starts with a date (`6.12.27 Harper-Bennett Wedding`) becomes an event in the dropdown; other folders are skipped and listed. Signing out empties the dropdown again.
- **Documents** lists the event's files, grouped by kind, with links that open them in Drive.
- Everything the app saves goes to one shared **"SBE App Data" folder inside the SBE events folder** (`event-<folder id>.timeline.json`, `.status.json`, `.corrections.json`, `.details.json`, `.reading.json`, plus `templates.json`), so all planners see the same work. The events folder's owner gets it created on sign-in and shares it with the other planners as **Editor**; without Editor access a planner can view but not save (the Google bar says so, with **Check again**). Each planner's own Drive keeps a small personal "SBE App Data" with just `settings.json` (which events folder they use); anything saved there before sharing existed is moved to the shared folder once. Unsaved edits are kept in the browser until saved.
- The app only reads the event documents; it never changes them.
- **Reading documents** happens in the browser: Google Docs and Sheets are exported by Drive; PDFs, Word and Excel files are opened with pdf.js, mammoth and SheetJS (copied into `vendor/`). Nothing is sent anywhere else. Results are cached per file in `event-<id>.reading.json`, so only new or changed files are read again. **Scanned PDFs and old Word (.doc) files** are uploaded as a temporary Google Doc inside "SBE App Data" so Google Drive converts them (text recognition for scans); the text is read and the copy deleted, and the original is never touched. Files that still can't be read, and unfamiliar budget layouts, go on a **Needs a look** list.
- Who may sign in is controlled in Google Cloud (test users). With `GOOGLE_CLIENT_ID` empty in `js/config.js`, the bar is hidden.

## Test data
The fictional Harper-Bennett wedding (6.12.27) in `tests/demo_event/` (source documents plus the Python scanner's reports in `tests/demo_event/reports/`) is used only by the automated tests; it is not part of the published site. Nothing in this folder contains client data: `reports/` is git-ignored, and `tools/scan_event.py` output lands there only on your own computer.

## Views
- **Overview** (opens first): **event details** (couple, venue, wedding date, guest count, getting ready, hotel / room block, other days, notes; guessed from labels in the documents such as "Clients:" or "Purchaser:", the vendor list and the run sheet, each with its source; **Edit details** overrides any guess and is saved with the event), at a glance (days to go, still owed, next up, documents read), **payments and deadlines** found in the documents plus due dates from Status Update, budget, a **vendors and contacts table** (vendor sheet rows first, with emails and phones from their contracts merged in; other vendors found in documents after; each with its source), and a *Needs a look* list. Every fact links to its document. **Looks right / Fix / Ignore** save a correction (`event-<id>.corrections.json` in "SBE App Data") that sticks when documents are read again.
- **Create Timeline**: Knot-style run sheet plus document evidence below.
  - **Generate draft**: a short questionnaire (ceremony time, traditional / first look / elopement, hair & makeup headcount, cocktail and reception length, shuttles, sunset, which moments to include) builds a full wedding day. Generated stops are marked *estimated*.
  - **Add day**: blank, a built-in template (rehearsal + dinner, welcome party, farewell brunch), or one of your saved templates. **Save as template** on any day reuses it for other events.
  - **Shift times**: move a whole day, or use **Shift from here** on a stop to move it and everything after it. When editing a stop, tick *Move later stops by the same amount*; changing only the start keeps the stop's length.
  - **From the documents**: times found in the contracts that aren't on a day yet are listed under it; **Add** puts them on the timeline as *confirmed*, citing the document.
  - **Conflicts**: a warning appears when a timeline stop (ceremony, cocktail hour, reception) disagrees with every document time.
  - **Who's involved**: each stop is tagged with roles (photographer, florist, couple, …). **View as** filters to one role; **Print / PDF** prints a branded sheet of the current view (choose *Save as PDF* in the print dialog).
- **Documents**: every file in the event, grouped (budget, vendor list, contracts and quotes, documents, photos), with type, subfolder, last-changed date, and a *new* tag for the past week.
- **Status Update**: alert banner (over-budget, balances due, unsigned contracts, timeline conflicts), per-category budget table, editable vendor/contract/payment table, upcoming/overdue items.

## Saving
Everything the app saves goes to the shared "SBE App Data" folder inside the SBE events folder (see above). **Export JSON** downloads a copy of a timeline or statuses.

## Add a new event
Create a folder for it inside the SBE events folder in Google Drive, named with the date first (`10.3.26 Alyssa & Mick`), then click **Refresh** in the Google bar.

## Code layout
Plain ES modules, no build step. `index.html` loads `js/main.js`.

| File | Job |
|---|---|
| `js/main.js` | Entry point: loads the event list, wires up buttons |
| `js/state.js` | Shared app state (current event, report, timeline, statuses, view) |
| `js/events.js` | The event list (from Drive) and loading one event: files, saved run sheet and statuses, cached reading, then reading new files |
| `js/drivebar.js` | Google bar: sign in, choose the events folder, refresh, sign out |
| `js/overview.js` | Overview (event hub): payments and deadlines with corrections, budget, vendors, needs a look |
| `js/scan.js` | Pure document-reading rules (port of `tools/scan_event.py`) + payments, deadlines, contacts, report building (tested for parity with Python) |
| `js/extract.js` | Text and spreadsheet rows from one Drive file (Docs/Sheets export, PDF, Word, Excel, text) |
| `js/reader.js` | Reads an event's new or changed files (4 at a time) and caches results in "SBE App Data" |
| `js/corrections.js` | Stores planner corrections (Drive or browser) |
| `js/docs.js` | Documents view |
| `js/google.js` | Google sign-in (Google Identity Services, full Drive permission so planners can share one app-data folder); token kept in memory |
| `js/drive.js` | Minimal Google Drive REST client; swappable transport for tests |
| `js/appdata.js` | The app's own files: shared "SBE App Data" inside the events folder (who can save, creating it, moving old personal data), personal settings |
| `js/driveEvents.js` | Pure: folder names → events, sorting, file kinds, folder links (tested) |
| `js/config.js` | Google Client ID and app-data folder name |
| `js/timeline.js` | Create Timeline view: editable run sheet, suggestions, conflicts, document evidence |
| `js/panel.js` | Inline forms: generate draft, add day, shift times, save template |
| `js/print.js` | Branded print / PDF sheet for the current view |
| `js/status.js` | Status Update view: alerts, budget and vendor tables |
| `js/draft.js` | Pure timeline logic: questionnaire rules, day templates, shifting, edits (tested) |
| `js/roles.js` | Pure: role list, role guesses for untagged stops, view filtering (tested) |
| `js/suggestions.js` | Pure: document times turned into suggested stops (tested) |
| `js/checks.js` | Pure validation rules: conflicts, missing items, due dates (tested) |
| `js/util.js` | Pure helpers: formatting, time parsing (tested) |
| `js/dom.js`, `js/storage.js` | DOM helpers; browser-saved edits and saved templates |

Keep anything without DOM access in the pure files so `npm test` can cover it. Third-party libraries live in `vendor/` (see `vendor/README.md`); when a scanning rule changes, bump `SCANNER_VERSION` in `js/scan.js` so cached results are re-read. `tests/js/fakeDrive.js` is an in-memory Google Drive used by the Drive tests.

## Local development
From the repo root: `python -m http.server`, then open http://localhost:8000/docs/. Modules don't load from `file://`.

## Releasing
Before committing app changes, run `python tools/stamp_release.py`. It stamps one version on the stylesheet and, through the import map in `index.html`, on every module, so browsers never mix new and cached files (GitHub Pages lets them cache for ~10 minutes). `npm test` fails if a module is missing from the import map.
