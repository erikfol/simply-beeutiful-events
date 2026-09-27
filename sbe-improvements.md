# Simply Beeutiful Events — Improvement Plan

This document captures recommended improvements for the Simply Beeutiful Events project, prioritized from high-impact product capabilities to lower-effort refinements.

## Critical storage and data workflow update

### 0. Move event data out of Git and into Google Drive

The repository should no longer be the source of truth for actual wedding/event documents. Client files, PDFs, budgets, vendor contracts, and inspiration assets should live in Google Drive (or another managed storage location), not in a Git repository.

Why:

- Git is a code versioning tool, not a secure file management system.
- Client data should not be embedded in commit history.
- Repositories become bloated as PDFs and photos accumulate.
- Shared documents are easier to manage in Google Drive than in Git.
- Real-time editing and collaboration work far better in Google Docs/Sheets than in Git.

Recommended approach:

- Create a shared Google Drive folder structure per event.
- Use Google Sheets/Docs for collaborative planning and contract tracking.
- Export Google Docs/Sheets to PDF/XLSX when the app needs to parse them.
- Treat the repo as code and app logic only, not as storage for event data.
- Add a sync layer that pulls Drive files into a temporary working directory and parses them.

This update is now the top-priority change in the project, because it affects the quality and safety of the entire data model.

## High-impact improvements

### 1. Add a backend API and database

The current Doc Reader is primarily client-side and local-only. Add a small backend, such as FastAPI or Flask, with SQLite initially and PostgreSQL when multi-user deployment is needed.

Potential capabilities:

- Store events, documents, vendors, budgets, and timeline items.
- Cache parsed reports instead of reprocessing files.
- Support multiple users and events.
- Add authentication and role-based access for planners, clients, and vendors.
- Maintain an audit trail for budget and contract changes.
- Enable shared client and vendor portals.

### 2. Add optional AI-assisted summaries

The current summary logic selects the first few substantive sentences. Keep this local fallback, but optionally add an API endpoint such as `POST /api/summarize` for deeper analysis.

Useful AI outputs could include:

- Key decisions.
- Action items and owners.
- Contract deadlines.
- Payment obligations.
- Missing vendor or event information.
- Conflicting dates, amounts, or requirements.
- Plain-language contract summaries.

AI processing should be opt-in, clearly labeled, and protected against sending sensitive documents without user consent.

### 3. Improve budget tracking and alerts

The generated Mistretta-Petran report demonstrates the value of budget analysis: the report shows a planned budget of `$50,000`, actual costs of `$67,911.28`, and `$7,568.01` still due.

Add a budget dashboard with:

- Planned, actual, paid, and due totals.
- Category-level budget comparisons.
- Charts showing the largest cost categories.
- Over-budget warnings.
- Unpaid invoice and deposit alerts.
- Payment due dates and status tracking.
- Exportable accounting and reconciliation reports.

### 4. Validate timelines and deadlines

The current timeline displays extracted dates but does not judge whether the schedule is complete or consistent.

Add validation rules to:

- Flag missing deadlines for common planning tasks.
- Warn when contract or quote deadlines have passed.
- Identify vendor payment dates near the event date.
- Detect conflicting event times or locations.
- Support relative dates such as “two weeks before the wedding.”
- Suggest follow-up dates for unresolved tasks.

## Medium-impact improvements

### 5. Improve file organization and search

The current interface accepts files and folders but does not provide much organization after import.

Add:

- Automatic categories such as Contracts, Budgets, Vendor Quotes, Inspiration, and Timelines.
- File search and filtering.
- Filters by vendor, file type, date, category, and payment status.
- Duplicate-file detection.
- A document status field such as New, Reviewed, Needs Action, or Archived.
- A link from each extracted item back to its source document.

### 6. Add a vendor dashboard

Create a vendor-focused view showing only relevant information:

- Vendor name and contact information.
- Assigned event responsibilities.
- Event date, time, and location.
- Contract and quote status.
- Amount paid and amount due.
- Important vendor deadlines.
- Notes and follow-up history.

The dashboard should support a read-only sharing mode so vendors do not see unrelated client information.

### 7. Expand export formats

The project already generates JSON and Markdown reports. Add:

- Styled PDF reports.
- CSV exports for budgets and vendor lists.
- ICS calendar files for timeline events and deadlines.
- Printable vendor packets.
- Client-friendly summaries.
- Optional email or weekly digest exports.

### 8. Improve the image gallery

Images are currently listed and supported formats such as PNG, JPG, and JPEG can be previewed, while HEIC files are listed without previews.

Improve the gallery with:

- Thumbnail grids.
- Full-size lightbox previews.
- Image categories and tags.
- Captions and notes.
- Better HEIC support or a clear conversion workflow.
- Links between inspiration images and planning decisions.

## Low-effort improvements

### 9. Strengthen date parsing

The current regular expressions handle common formats such as `6.6.26`, `6/6/2026`, ISO dates, and written month names. Improve coverage for:

- Relative dates such as “one month out.”
- Phrases such as “mid-June” and “late June.”
- Times and time zones.
- Date ranges.
- Ambiguous dates with a user confirmation step.
- Locale-specific date formats.

The Python scanner could use a library such as `dateparser`, while preserving the existing deterministic parser as a fallback.

### 10. Track contract and payment status

Add explicit statuses for contracts and payments:

- Contract: Draft, Sent, Signed, Expired, or Needs Review.
- Payment: Not Due, Due, Partially Paid, Paid, or Overdue.
- Vendor: Option, Hold, Booked, or Cancelled.

Display these statuses in the report and allow planners to update them manually when extraction is uncertain.

### 11. Improve mobile support

Make the Doc Reader easier to use on phones and tablets:

- Use a single-column layout on narrow screens.
- Make controls and buttons touch-friendly.
- Support mobile photo uploads.
- Optimize the timeline for horizontal scrolling.
- Reduce large image and report rendering costs on mobile devices.

### 12. Add dark mode

Add a theme toggle and CSS variables for light and dark themes. Preserve readable contrast for cards, tables, timelines, status messages, and the combined report.

## Engineering and maintainability

### 13. Add automated tests and CI

There are currently no visible automated tests. Add unit tests for both the Python scanner and browser-side parsing logic.

Important test cases include:

```python
assert to_iso("6.6.26") == "2026-06-06"
assert to_iso("June 6, 2026") == "2026-06-06"
```

Also test:

- Amount extraction.
- Keyword filtering.
- Empty and unsupported files.
- PDF, DOCX, and XLSX extraction.
- Budget totals and category parsing.
- Vendor extraction.
- Timeline sorting.
- Duplicate document replacement.
- Malformed or partially unreadable files.

Add GitHub Actions to run the test suite on pushes and pull requests.

### 14. Improve documentation

Expand the root `README.md` with:

- Project goals and current limitations.
- Local setup instructions.
- Python dependencies and installation commands.
- Browser requirements.
- How to scan a new event folder.
- How to use the Doc Reader.
- Report formats and field definitions.
- Privacy and data-handling guidance.
- A roadmap for backend and AI features.

Consider adding separate documentation for planners and developers.

### 15. Improve error handling and observability

Make errors more actionable than a generic parse failure:

- Identify the file and parser that failed.
- Distinguish unsupported, corrupted, password-protected, and empty files.
- Continue processing other files when one file fails.
- Include a parse-status summary in generated reports.
- Provide a downloadable error log for troubleshooting.
- Avoid exposing sensitive document content in browser console logs.

## Product expansion

### 16. Support multiple events

The current workflow focuses on one event folder at a time. Add an event selector and persistent event records so planners can manage multiple weddings and events.

Potential features:

- Create, archive, and switch between events.
- Compare event budgets and vendor costs.
- Reuse planning templates.
- Search across all events.
- Duplicate an event structure without copying private documents.

### 17. Create a vendor and template library

Allow planners to maintain reusable information across events:

- Vendor contact records.
- Contract and quote templates.
- Planning checklists.
- Budget category templates.
- Vendor notes and performance history.
- Reusable timeline milestones.

### 18. Add client questionnaires

Create an intake workflow for collecting:

- Client names and contact information.
- Event date and venue.
- Guest count.
- Budget range.
- Style and color preferences.
- Dietary restrictions and accessibility requirements.
- Music, food, photography, and décor preferences.

Use questionnaire responses to seed the event record and generate an initial planning checklist.

## Competitive reference: Timeline Genius (https://www.timelinegenius.com/)

Paid planner software ($55/mo, $550/yr, or $195 one-time for 5 events). Reviewed September 2026. Features worth borrowing, cheapest first:

- **Genius auto-generation** — enter basics, get a starter timeline. Could generate our first-draft `.timeline.json` from wedding date + ceremony time.
- **Bulk time-shifting** — change one item, shift the rest. Natural fit for our editable spine.
- **Templates** (preset + custom) — a shared template library our per-event timelines start from.
- **Tailored events** — filtered views per audience (client vs vendor). Could be a role filter on the run sheet.
- **PDF export / email** — already covered by item 7 above.
- **Vendor rolodex, file management, text reminders, collaboration, time tracking** — backend territory; revisit with item 1.

## Suggested implementation order

1. Stop tracking event data in Git and move to Google Drive.
2. Add tests for `tools/scan_event.py` and the core JavaScript parsing functions.
3. Add a minimal Google Drive sync prototype for one event folder.
4. Improve documentation and add a dependency file for the Python scanner.
5. Add budget and contract status dashboards to the existing frontend.
6. Add timeline validation and actionable deadline alerts.
7. Improve file categorization, search, and source-document links.
8. Add PDF, CSV, and ICS exports.
9. Introduce a backend and database for persistence and multi-event support.
10. Add optional, privacy-conscious AI summaries after the deterministic workflow is reliable.

## Recommended first three features

If development time is limited, start with:

1. **Google Drive sync + storage separation** — this protects client data and preserves the actual working workflow.
2. **Budget alerts and reconciliation** — this provides immediate operational value to planners.
3. **Timeline validation** — this turns extracted dates into actionable planning information.

## Practical next step

The immediate project priority is no longer “more UI features”; it is “keeping client files out of Git and making the app read from managed storage.” That change reduces risk and aligns the project with the real collaboration workflow.
