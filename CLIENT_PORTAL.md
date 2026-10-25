# Client portal: brainstorm

## Context

SBE wants a **personal portal for each client and event**: one private page per couple with updates, meeting notes, vendors, contacts, a to-do list, and everything else about their event, shared with that client. Asked: is this possible with Hostinger, and what would it look like?

Answers so far: clients should **view, plus take light actions** (tick off their to-dos, comment, upload files). the project lead **prefers building** it into the SBE app over paying for a tool. Where the information comes from is **still open** (recommendation below).

## Short answer

**Yes, it's possible, but Hostinger isn't the part that makes it work.** Hostinger hosts the public marketing site. The brains of a portal are the information the **SBE Event Manager app** already gathers from Drive: vendors, contacts, deadlines, timeline, and event details. A portal is a **client-facing window onto the app**, showing only what the SBE owner chooses to share.

Hostinger's role is small: a **"Client login" link** on the website, and optionally a branded address like `portal.simplybeeutifulevents.com`.

Why not build the portal in Hostinger itself:
- **Horizons (the AI builder)** could make portal-looking pages. But each one would be typed in by hand, it costs AI credits, and its built-in database means client data would live in another place.
- **Hostinger web hosting (PHP/MySQL)** could run a custom portal. But then we'd be maintaining logins and security on a second system, with client data copied out of Google.

## What it would look like

A phone-friendly page with SBE branding, opened from a private link:

```
 Simply Beeutiful Events            Emma & Jack · June 12, 2027
 ─────────────────────────────────────────────────────────────
 ⏳ 246 days to go       Next up: Final menu choice due Nov 1

 [Home] [Updates] [To-dos] [Vendors] [Timeline] [Files]

 Latest update (Oct 8)
   Tasting booked with Rosewood for Oct 20, 6 pm. Bring...

 Your to-dos                         SBE is working on
   ☐ Send guest list draft  Oct 15     • Florist proposal
   ☑ Pick invitation suite             • Shuttle quote
   ☐ Choose first-dance song  Nov 1

 Meeting notes        Vendors & contacts      Send us files
   Oct 3 – Venue walk   Rosewood (venue) ✉ ☎     [Upload photos]
   Sep 12 – Kickoff     Bloom Co. (florist) ✉ ☎
```

Sections:

| Section | What the client sees | Comes from |
|---|---|---|
| Home | Countdown, next deadline, latest update | App (event details, deadlines) |
| Updates | Dated posts from the SBE owner | Written in the app |
| Meeting notes | Notes per meeting | Written in the app, or a Google Doc in the event folder |
| To-dos | **Theirs** (can tick off) and **SBE's** (view only) | App's checklist (Phase 4) |
| Vendors & contacts | Booked vendors, emails, phones | App's vendors table (Phase 3) |
| Timeline | Day-of run sheet, client view | App's timeline builder ("View as" already exists) |
| Files | Documents the SBE owner chooses to share, plus **Upload** | Selected Drive files; uploads land in a Drive folder |
| Payments (optional) | What's due to SBE and vendors, and when | App's payments (Phase 3). Show only if the SBE owner wants. |

Clients can also **comment** on an update or to-do. The SBE owner sees ticks, comments, and uploads in the app.

## Recommended approach: build on Google, using what the app already has

**Where the information comes from: the app, with a "Publish to portal" step.** It's not hand-typed, and it's not an automatic live mirror either.
- The app already knows vendors, contacts, deadlines, and the timeline, so nothing gets entered twice.
- The SBE owner chooses what's client-visible (e.g., hide vendor costs, internal notes, and planner-only to-dos) and clicks **Update portal**.
- The app saves a **client-safe snapshot** into a per-event `Client Portal` folder in Drive. Nothing internal reaches the client by accident.

**How clients get in, with no Google account needed:**
- A small **Google Apps Script**: a free script that runs inside the SBE owner's Google account and acts as a doorway.
- Each client gets a **long private link** (optionally with a short passcode).
- The portal page asks the script for that event's snapshot.
- When the client ticks a to-do, comments, or uploads, the script saves it into the event's `Client Portal` folder.
- The SBE owner can **turn off a link** at any time, e.g., after the wedding.

**Why this fits:**
- **$0 a month.**
- **Data stays in the SBE owner's Google Drive**, in keeping with the "Google-only" decision.
- **Clients don't sign in to Google,** which also sidesteps Google's review of the app's full Drive permission. That review would be required before outside people could sign in to the app itself.

**The trade-off:** the security is "private link" (like a Google Docs link-share) rather than per-person passwords. It's fine for wedding planning. It can be upgraded later to an email-code login, or by moving to Supabase if the portal grows.

**Rejected for now:**
- **Buying a tool** such as Aisle Planner or HoneyBook's client portal (~$30–130/month). The project lead prefers building. But revisit if SBE subscribes to HoneyBook for billing/CRM anyway, since HoneyBook includes a portal. That ties to the open HoneyBook question and to the website CRM plan in `WEBSITE.md`.
- **A Google Site per client.** Free, but clunky to keep updated, not branded, and clients need Google accounts.

## Rough phases (part-time, Claude doing most coding)

1. **Read-only portal (2–3 weeks):**
   - "Client-visible" switches in the app, plus Updates and Meeting notes.
   - **Publish to portal**, the portal page, the Apps Script doorway, and private links.
   - Test with one friendly client.
2. **Light actions (1–2 weeks):** client to-do ticks, comments, and uploads land in Drive and show in the app (the action center).
3. **Polish (later):**
   - Email the SBE owner when a client acts, and email the client when there's a new update (Apps Script can send email for free).
   - A "Client login" link on the Hostinger site and the `portal.` address.

It's best built **after Phase 4 (action center)**, because the portal's to-do list is Phase 4's checklist.

## Changes to app principles (to record in the roadmap)

- *"The app only reads Drive"* becomes: it reads event documents, and writes only inside `SBE App Data` **and each event's `Client Portal` folder**.
- *"Who uses it: SBE staff only"* gains: **clients see a published, client-safe view** via private links.
- Privacy:
  - Never put client data or links in the repo.
  - Turn links off after the event.
  - Uploads go to Drive, not to the website host.

## Status

- 2026-10-09: brainstorm written.
- 2026-10-10: **approved mockup**, `docs/portal-demo.html` (live at https://erikfol.github.io/simply-beeutiful-events/portal-demo.html), using the fictional demo couple. Ticks, comments and uploads stay in the browser only. **Use it as the design template when building the real portal.**
- Not scheduled yet. Next, when the project lead says so: add the portal to the roadmap in `sbe-improvements.md`.

## How we'd test it (when built)

- Review the plan with the SBE owner.
- When it's built later:
  - Publish a portal for the fictional demo event.
  - Open the link on a phone.
  - Tick a to-do, comment, and upload a photo, and confirm each lands in Drive and appears in the app.
  - Turn off the link and confirm it stops working.
  - Confirm hidden items (costs, internal notes) never appear.
