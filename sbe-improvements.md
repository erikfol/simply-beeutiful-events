# Simply Beeutiful Events — Improvement Plan

This document captures recommended improvements for the Simply Beeutiful Events project, prioritized from high-impact product capabilities to lower-effort refinements. The **Current plan and progress** section below is the up-to-date roadmap; the numbered sections further down are the original brainstorm and are kept for reference.

## Current plan and progress

_Last updated September 29, 2026 (app v0.4)._

### Goal

An internal tool for SBE staff (not a product for sale): **one place to go for every event**. It reads everything from SBE's Google Drive, shows what needs doing, builds day-of timelines, and answers questions about any event. Timeline Genius (timelinegenius.com, $54.95/mo) is the reference for the timeline features.

The four jobs:

1. **Event hub**: everything about an event (vendors, contacts, budget, payments, contracts, documents), read from Drive.
2. **Action center**: overdue, due this week, coming up, and what changed in Drive, for one event or all of them.
3. **Timeline builder**: create, edit, and shift day-of run sheets (Timeline Genius-style), seeded from times in the contracts.
4. **Ask SBE**: search, and later optionally chat, across event documents, with links to sources.

### Principles

- **Google Drive stays the source of truth for documents.** The app only reads Drive; it never edits it.
- **The app owns its own work**: timelines, task status, payment statuses, notes.
- **Every extracted fact links to the document it came from**, and planners can correct it.
- **No AI by default.** Client documents are not sent to any AI service. The chatbot is optional and decided later (see privacy options below).
- **Hosting stays on GitHub Pages.** The public site shows only the fictional demo event; real events stay private.

### Decisions

| Decision | Status |
|---|---|
| Drive layout | ✅ One shared folder with a subfolder per event (naming rules in `README.md` → *Google Drive event folders*) |
| Build order | ✅ Timeline builder first, tested on the demo event |
| Sending documents to AI | ✅ Not by default; Phases 1–4 use no AI |
| Who uses it | ✅ SBE staff only |
| Sign-in accounts | ✅ The SBE owner's Google account owns all the shared event folders. For now only one person signs in (the project lead's Gmail account), listed as the single approved user of the app's Google sign-in. More people can be added to that list later. |
| Database / sign-in service | ✅ **Google-only for now, no Supabase.** Sign in with Google in the browser; read the event folders with the signed-in person's own Drive access (read-only); save the app's own data (timelines, statuses, notes) in an "SBE App Data" folder the app creates in that person's Drive, touching only files it created. Cost: $0. Revisit Supabase (free tier; $25/mo Pro for backups and no sleeping) when more people use the app or background features are needed (daily email digest, scheduled sync, server-side chat). |
| Chatbot privacy option | ⏳ Needed for Phase 5 (options below) |

### Phases

| # | Phase | Status | Rough effort |
|---|---|---|---|
| 0 | Groundwork: split the app into modules, automated tests on every push, Drive naming rules | ✅ Done (commit `77c8911`) | ~1 week |
| 1 | Timeline builder | ✅ Done, v0.4 (commit `2fee2e4`) | 3–4 weeks |
| 2 | Google sign-in + Drive connection: events listed from the shared folder, document list with Drive links, timelines and statuses saved to the "SBE App Data" Drive folder | ⏳ Next; decisions made, needs a one-time Google Cloud setup (free) | 2–3 weeks |
| 3 | Reading the documents: facts with source links, "needs a look" list, planner corrections, event hub page | Planned | 2–3 weeks |
| 4 | Action center: overdue / this week / next 30 days / changed in Drive, date-based checklist, done / snooze / assign | Planned | 2–3 weeks |
| 5 | Ask SBE: search first; optional private AI chat later | Planned | 1–2 weeks |
| $ | Billing and invoicing (client invoices, payment schedules, proposals, contracts), using HoneyBook as the reference; see below | Not scheduled | — |
| + | Later, if wanted: daily email digest, client/vendor share links, wedding-day texts, time tracking, calendar (.ics) export | Not scheduled | — |

Estimates assume part-time work with Claude doing most of the coding. Expected running cost: $0/month with the Google-only approach (no AI).

### What's done

**Cleanup and privacy (September 2026)**
- Consolidated the app into `docs/` (the GitHub Pages folder); removed the duplicate `doc-reader/` copy and the unused save server.
- Real client files (`events/`) and real reports are untracked and git-ignored. The public site shows a **fictional demo event** (Harper-Bennett wedding, 6.12.27) generated from made-up source documents in `tests/demo_event/`.
- Real events still work locally through the git-ignored `docs/reports/local-index.json`.

**Phase 0: groundwork**
- `docs/js/` ES modules (no build step); pure logic separated from DOM code.
- JavaScript tests (`npm test`) and Python tests (`pytest`) run on every push via GitHub Actions.

**Phase 1: timeline builder (v0.4)**
- **Generate draft** questionnaire: ceremony time and length; traditional / first look / elopement; hair and makeup headcount and artists; cocktail and reception length; shuttles; sunset; which moments to include.
- Day templates (rehearsal + dinner, welcome party, farewell brunch) and **Save as template** for reuse.
- **Shift times** for a whole day or **Shift from here**; edits can move later stops by the same amount and keep a stop's length.
- **From the documents**: contract times offered as one-click *confirmed* stops that cite their source.
- Warnings when the timeline disagrees with the documents (e.g. ceremony at 4:15 vs the venue's 4:00).
- Role tags on every stop, **View as** a single vendor or role, and a branded **Print / PDF** sheet.
- Inline forms instead of pop-up prompts; works on phone-width screens.
- 33 JavaScript tests and 6 Python tests.

### Next steps

1. Try the timeline builder on the demo event and note what a planner would change.
2. Start Phase 2. It includes a one-time free Google Cloud registration for the app's sign-in (step-by-step guide provided), and the owner sharing the SBE events folder with the signed-in account if it isn't already.

### Billing and invoicing reference: HoneyBook

SBE will use **HoneyBook** (https://www.honeybook.com/) as the reference for billing, invoicing, and related features, the way Timeline Genius is the reference for timelines. Noted September 27, 2026 from HoneyBook's home page:

- **Invoicing and payments**: online invoices, card/bank payment processing, payment schedules, and HoneyBook Finance for money management.
- **Proposals and contracts**: proposal templates, online contracts with e-signature, customizable templates.
- **Clients**: CRM with pipeline and tasks, lead-capture forms and questionnaires, and a client portal.
- **Scheduling and automation**: meeting scheduler, calendar sync, email automations, and phone/SMS messaging.
- **AI**: email drafting, project summaries, and meeting notes.
- **Integrations**: QuickBooks Online, Google Calendar and Gmail, Zoom, Calendly, Mailchimp, Zapier, Outlook.
- **Pricing**: Starter $36/mo ($29 yearly), Essentials $59/mo ($49 yearly), Premium $129/mo ($109 yearly).

Fits with the existing app: budget tracking, per-vendor contract and payment status, and payment due-date alerts (Status Update view) are the starting point.

**Open question for later:** build billing features into the SBE app, or have SBE subscribe to HoneyBook and connect it to the app (it integrates with QuickBooks, Google, and Zapier). Either way, actual card and bank payments should go through an established payment provider, never be handled by the app itself.

### Chatbot privacy options (for Phase 5)

| Option | Who sees the documents | Trade-off |
|---|---|---|
| No AI (start here) | Only Google Drive and the SBE database | Search instead of conversation |
| Claude through Google Cloud (Vertex AI) | Google, which already stores the documents in Drive | Real conversation; needs a Google Cloud account; about $15–40/mo |
| Send facts, not documents | The AI sees extracted facts with names, emails, and phones masked | Good for "what's overdue", weak for contract wording |
| AI on SBE's own computer | Nobody outside SBE | Needs a capable PC left on; slower and less accurate |

## To do

- [ ] **Purge client files from Git history.** As of September 2026 `events/` and the real reports in `docs/reports/` are untracked and git-ignored (the published site now shows a fictional demo event), but every contract, budget, photo, and generated report committed before then can still be recovered from past commits (and from any existing clone or fork). Fixing it means rewriting history with `git filter-repo --invert-paths --path events --path doc-reader/reports --path-glob 'docs/reports/6-6-26-*'` (or BFG), force-pushing `main`, and asking anyone with a clone to re-clone. Deferred for now; do it before the repo gets more collaborators or clients. Note that GitHub may still serve old commits by SHA until cached views expire; contact GitHub Support if a full purge is required.

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

The generated reports demonstrate the value of budget analysis: the fictional demo event shows a planned budget of `$45,000`, actual costs of `$51,860.00`, and `$32,340.00` still due.

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
