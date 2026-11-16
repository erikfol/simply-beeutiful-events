# Planning system: ideas and plan

_Written November 16, 2026. **Decided November 16, 2026:** build it in this app (not Notion), and use an all-in-one business service for contracts, invoices, payments, inquiries and client emails. The roadmap in `sbe-improvements.md` (Phases table) points here._

## Where this came from

On November 16, 2026 a team member sent Nicole a proposal for a planning system built in **Notion**, an online notes-and-database app. It would hold every event, vendor, timeline, checklist, payment and file in one place and replace Timeline Genius. The proposal listed 25 features and the things Notion can't do. It also suggested a client portal on the website for contracts and payments.

Most of it overlaps with the SBE Event Manager (this app). This file lists every idea, shows what the app already does, and lays out a plan to build the rest here. People's names stay out of this file; see `WEBSITE.md` (local only).

## Decision 1: this app, not Notion (decided)

| | Notion (the proposal) | SBE Event Manager (this app) |
|---|---|---|
| Cost | Notion Business, about $240 a year, plus paying for the build | $0 a month; Erik's time with Claude |
| How soon | A few days to set up | Timelines, event hub, inventory, to-dos and the booking page are built. The rest is roughly 4–5 months part-time (see *Effort and cost*). |
| Entering data | Everything is typed in by hand | Reads contracts, budgets and vendor sheets from Drive and pulls out dates, payments and contacts |
| Where client data lives | Notion's servers | Nicole's Google Drive |
| Replacing Timeline Genius | Rebuilt in Notion | Mostly built already (Phase 1) |

**Why:** one place for every event. Running Notion alongside the app would mean typing every event twice. The app already does about a third of the list, reads the documents instead of needing them typed in, and costs nothing to run.

**The proposal is still valuable.** The team member knows how SBE works: what each package includes, the tasks for each tradition, how clients should be greeted and reminded. That knowledge goes straight into the app's templates and the all-in-one's emails (see *Inputs needed*).

## Decision 2: an all-in-one for the business side (decided)

Contracts, invoices, online payments, the inquiry list, the website inquiry form and client emails go in **one all-in-one business service** (HoneyBook-style), in SBE's name. The app never handles money. Which service is still to be picked (Step 2).

**Who does what:**

| The all-in-one | The app |
|---|---|
| Inquiries, from first message to booked | Every booked event: page, checklist, timeline, vendors, inventory |
| Inquiry form on the website | The couple's vendor bookings and payments |
| Proposals and contracts with e-signature | Client budgets, guests, seating, mood boards |
| Invoices, payment schedule, card and bank payments | Home dashboard and calendar |
| Thank-you, welcome and payment-reminder emails | The client portal for the planning side, linking to the all-in-one for contracts and payments |

Avoid planner suites such as Aisle Planner: they repeat what the app does (timelines, checklists, vendors). A business tool like HoneyBook or Dubsado fits next to the app.

## The 25 ideas and where each stands

✅ built · 🟡 partly built · 📋 already planned · 🆕 new · 💼 the all-in-one

| # | Idea | In the app today | Plan |
|---|---|---|---|
| 1 | Home dashboard: upcoming events, open tasks, payments due or overdue | 📋 Phase 4's action center. The events list already shows upcoming events first. | Phase 4 |
| 2 | A page for every event | 🟡 The Overview has event details, vendors and contacts, payments, deadlines, budget and documents. The timeline is one click away. Missing: checklist, wedding party, guests. | Phases 4, 7 |
| 3 | Packages built in (Bee Blissful, Blossom & Bee, The Queen Bee, Other Event) | 🆕 | Phase 4 |
| 4 | Day-of timelines: starter button, lengths, shift everything at once | ✅ Starter timeline from a short questionnaire, templates, shift the whole day or from one stop, rehearsal and other days | Step 1 |
| 5 | Vendor timelines as PDF | ✅ **View as** one vendor, then **Print / PDF** | Step 1 |
| 6 | Vendor contact book, reused for every event | 🟡 Each event's vendors and contacts are read from its documents. No shared book across events. | Phase 5 |
| 7 | Venue and vendor scouting for Queen Bee clients | 🆕 Today this is a spreadsheet in the event folder. | Phase 5 |
| 8 | Vendor bookings and payments, with totals and overdue flags | 🟡 Status Update has contract and payment status per vendor, and payments are read from contracts. No paid-to-date totals. | Phase 5 |
| 9 | Checklists with due dates, who's responsible, tradition and event-type tasks | 📋 Phase 4's date-based checklist. Tradition and event-type lists are new. | Phase 4 |
| 10 | Décor inventory with reservations and check-in | 🟡 Inventory page: items, categories, quantities, photos. Storage location, reservations and check-in are planned. | Inventory |
| 11 | Accommodations and transportation | 🟡 Event details have a hotel / room block line; the timeline questionnaire asks about shuttles. | Phase 7 |
| 12 | Inquiries, from first message to booked | 💼 | Step 2, Phase 8 |
| 13 | Online inquiry form that feeds the inquiry list | 💼 Today the website's Contact form emails Nicole. | Step 2 |
| 14 | Booking consult calls | ✅ Booking page built (`docs/calendar.html`), waiting for Nicole's Google Calendar appointment schedule. The all-in-one may have its own scheduler (decision 5). | *To do* |
| 15 | Automatic emails: thank-you, welcome, payment reminders, overdue alerts | 💼 for client emails; the app for overdue-task alerts | Step 2, Phase 8 |
| 16 | Wedding party and family, with each person's schedule | 🟡 Timeline stops have role tags and **View as** a role. No list of people. | Phase 7 |
| 17 | Guest lists and RSVPs | 🆕 | Phase 7 |
| 18 | Seating board | 🆕 | Phase 7 |
| 19 | Mood boards, design, stationery tracking | 🆕 | Phase 9 |
| 20 | Client budgets: planned vs. actual by category | 🟡 Reads the client's budget sheet (actual, paid, due by category). No planned column or items without a vendor. | Phase 5 |
| 21 | Files marked private or OK to share | 🟡 The Documents view lists every file with Drive links. No share marking. | Phase 6 |
| 22 | One calendar for events, deadlines, payments, consults | 🆕 A calendar export was a "later" idea. | Phase 4 |
| 23 | Time tracking per event | 📋 Was a "later" idea | Small items |
| 24 | Pricing guide to share with inquiries | Not an app feature | Small items |
| 25 | A private page for each client | 📋 Client portal designed, mockup approved (`CLIENT_PORTAL.md`, `docs/portal-demo.html`) | Phase 6 |

## What the app won't do

| Need | Where it goes |
|---|---|
| Signing contracts | The all-in-one |
| Invoices and online payments | The all-in-one. Cards cost about 3% per payment; bank transfer is much cheaper (decision 4). |
| Text messages on the day | Later. Until then, texts from a phone. Some all-in-ones include texting. |
| Floor plans and room layouts | A free seating-chart tool or Canva; save the PDF in the event's Drive folder, where the app lists it with the documents |
| Designing invitations and signage | Canva; the app tracks each piece's status (Phase 9) |

## The business side of the client portal

The proposal suggests a private, password-protected page per client for the business side: view and sign the contract, see invoices and what's paid, a payment schedule, a **Pay now** button, and a link to the planning side.

The all-in-one comes with its own client pages for contracts, invoices and payments, so the app doesn't rebuild them. The client portal already designed in `CLIENT_PORTAL.md` (planning side: updates, to-dos, vendors, timeline, files) gets a **Payments and contracts** tab:

- Links to the client's contract and invoices in the all-in-one, where they sign, see what's paid and due, and pay. The app never sees card numbers.
- **Getting in:** a long private link per client, with an optional passcode. It can be upgraded to an email-code login later.
- **Branding:** the client starts from one SBE-branded page that matches the approved mockup. A "Client login" link on the website leads to it.

Once the all-in-one is chosen, the team member offered to work with the website people on this.

## Decisions

1. ✅ **This app, not Notion** (November 16, 2026).
2. ✅ **An all-in-one for the business side** (November 16, 2026).
3. **Which all-in-one:** Nicole picks it and signs up in SBE's name (Step 2).
4. **Card fees:** pass the ~3% on, absorb it, or offer bank transfer with no fee.
5. **Consult booking:** keep the Google Calendar booking page (free, built) or use the all-in-one's scheduler. Use one, not both.
6. **Guest lists:** keep guest lists and RSVPs for every couple, or only Queen Bee? Many couples already collect RSVPs on their wedding website, so importing that list may be enough. Decide before Phase 7.
7. **Client page updates:** the proposal has the client page update itself; the portal plan has a **Publish** button so nothing internal reaches a client by accident. Middle ground: once a section is marked shared, saving it in the app republishes it automatically. Decide in Phase 6.

## Inputs needed (no code)

1. **What Nicole uses in Timeline Genius**, and its renewal date. The proposal asks her the same question, so one answer serves both.
2. **What each package includes, as tasks:** the Bee Blissful, Blossom & Bee and Queen Bee task lists with timing (e.g. "confirm vendors, 6 weeks before"), the list of Queen Bee services a Blossom & Bee client can add, tasks for each tradition (Jewish, Hindu, Muslim, Sikh, interfaith, civil), and checklists for events that aren't weddings.
3. **Wording for the client emails** (thank-you for inquiring, welcome on booking, payment reminder), for the all-in-one.
4. **Pricing guide content.**
5. **Today's contract and invoice templates**, to move into the all-in-one.

The team member is well placed to write 2–4.

## The plan

In order: save money first (Timeline Genius), then set up the business side, then what gets used every day (dashboard and checklists), then money tracking, then the portal, then guests, then design. Each step ends with real use on a real event. As before, Erik starts each phase ("start phase N").

### Step 1. Replace Timeline Genius (5–7 weeks): ideas 4, 5, plus what Nicole uses a lot

Already in *To do* in `sbe-improvements.md`. **Nicole's checklist (November 16, 2026):** of 19 Timeline Genius features she uses 11 a lot and 8 sometimes, and none not at all. The app already covers four of her "a lot" features: the starter timeline, a version per vendor, files and branding. The other seven are built here, before she cancels, even where this plan had them later. Quick ones first:

1. ✅ **Each part's length** (built November 16, 2026): stops with an end time show "30 min" (past midnight too), and each day shows "Day runs 12:00 p.m. – 1:00 a.m. · 13 hr", or one role's span in a **View as** view ("Photographer: 3:30 p.m. – 11:30 p.m. · 8 hr"), on screen and on the PDF. Stops with only a start time show no length. Also fixed: a stop after midnight (a 12:15 a.m. shuttle) now stays at the end of the evening instead of jumping to the top, after edits, shifts and templates too.
2. ✅ **Team members** (built November 16, 2026): a **Team** section on the home page lists everyone with access to the events folder, whether each can save, when they last signed in (noted in `team.json`), and what's missing for each, with the "Add a team member" steps. It warns when a folder is open to anyone with the link, and a blocked sign-in now explains the test-user list. Still to do with real accounts: add whoever else uses Timeline Genius (the checklist question was left blank) and check they show ✅ All set.
3. **Time tracking:** log hours on each event (date, who, hours, what), with totals. Moved from *Small items*. 2–3 days.
4. **Vendor and contact book:** one shared list reused for every event, started from the vendors already found in event documents. Moved from Phase 5. About 1–1.5 weeks.
5. **Event checklist:** a to-do list for each event with due dates and who's responsible (SBE, the couple, a vendor, a team member), shown per role like the timeline. Moved from Phase 4; packages and templates stay there. About 1.5–2 weeks.
6. **Online timeline for the couple and vendors:** each gets a private link to their own version, always showing the latest times. It uses the Google Apps Script doorway planned for the client portal (Phase 6), built now for timelines only. Nicole approves the script in her Google account once. About 1.5–2 weeks.
7. **Send from the app:** a **Send** button emails each vendor, and the couple, their link and PDF from Nicole's Gmail, through the same script. About a week.

Used sometimes, already covered: ready-made templates, her own templates, shifting, PDF, phone, and turning old timelines into templates (Erik and Claude do it on request). The AI review is covered without AI: the app reads contract times and warns about conflicts. **Wedding-day text reminders** (used sometimes) stay on the *Later* list; until then, texts from a phone.

- **Still needed from Nicole:** the checklist's last six questions came back blank. Most urgent is the **renewal date and plan**; then how many upcoming events have timelines, how timelines reach people today, who else uses the account, and her must-haves.
- **If the renewal comes before this is done:** renew for the shortest period Timeline Genius sells (its monthly plan is $54.95) rather than a full year.
- **Done when:** one real event's timeline, checklist and contacts live in the app, and its vendors get their versions by email from the app. Then copy over the other upcoming events and cancel.

### Step 2. Set up the all-in-one (outside the app; start soon): ideas 12, 13, 15

This is setup in the service, not app work, so it can run alongside Step 1.

- **Pick one** (decision 3). Compare HoneyBook (the reference since September 2026) with Dubsado. Check each for:
  - contracts with e-signature
  - invoices with payment schedules and automatic reminders
  - card and bank-transfer payments, and their fees
  - an inquiry form for the website, with questions that change by package
  - an inquiry list from first message to booked
  - automatic emails
  - a branded client page
  - works with Gmail and Google Calendar
  - price
- **Sign up in SBE's name** (Nicole's account), with Erik given access.
- **Move in** today's contract and invoice templates (input 5) and the email wording (input 3): thank-you on inquiry, welcome on booking, payment reminders.
- **Website:** Jennifer puts its inquiry form on the new site, replacing the Contact form (see *Lead form and CRM* in `WEBSITE.md`).
- **Done when:** a test inquiry from the website lands in it and gets its thank-you email, and one real client signs and pays a deposit through it.

### Phase 4. Home dashboard, packages and checklists (2–3 weeks): ideas 1, 3, 9, 22

This grows the planned action center. The basic event checklist is built in Step 1; this phase adds packages, templates, the dashboard and the calendar on top of it.

- **Event setup:** pick the package (Bee Blissful, Blossom & Bee, The Queen Bee, Other Event). For Blossom & Bee, tick the Queen Bee services the client chose. Pick the ceremony tradition(s), or the event type for non-weddings.
- **Checklist templates:** each task has a "when" relative to the event date ("10 weeks before"), who does it (SBE or the couple), and which package, service or tradition adds it. Templates are edited in the app, like timeline templates.
- **Each event's checklist** is made from its templates with real due dates. It can be changed for that event afterward, and changing the package or a service adds or removes the matching tasks.
- **To-dos** gain the ideas already listed on the To Do page: a due date, a link to an event, and who it's assigned to.
- **Home dashboard:** upcoming events with a countdown and package, then tasks across all events (overdue, this week, next 30 days), vendor payments due or overdue, and what changed in Drive.
- **Calendar:** a month view of events, task due dates and payment dates. Consult calls stay in Google Calendar; a feed into Google Calendar can come later.
- **Done when:** every upcoming real event has a package and a checklist, and the dashboard is the first thing opened each morning.

### Inventory: finish it (1–2 weeks, any time after Phase 4): idea 10

Already planned in *Inventory and reservations* in `sbe-improvements.md`: storage location, condition and notes; reserve a number of items for an event's dates with a warning before double-booking; a pull list to pack and check items back in. After Phase 4, reservations show on the event's page and overdue returns on the dashboard.

### Phase 5. Vendors and money (about 2 weeks): ideas 6, 7, 8, 20

Money between the client and SBE lives in the all-in-one. This phase covers the couple's own vendors and budget.

- **Vendor contact book** (built in Step 1; this phase links it to bookings): one shared list for all events: name, category, contacts, website, insurance (with an expiry date that warns before it lapses), rating, notes, and the events they worked. It starts from the vendors already found in event documents. Adding a vendor to an event picks from the book, so nothing is typed twice.
- **Bookings and payments:** the Status Update table grows. For each booked vendor it adds the total price, deposit, payments made (amount and date), balance owed and due dates. It totals everything and flags anything overdue. Payments found in contracts fill it in to start.
- **Client budget:** planned vs. actual by category, including things without a vendor (attire, favors, DIY supplies). Today the app reads the client's budget sheet; to decide: keep the budget in that sheet and add a planned column there, or keep it in the app.
- **Scouting (Queen Bee):** for each category (venue, photographer, ...), a shortlist with tour date, quote, pros and cons, and a status (considering, toured, chosen, passed), shown side by side. **Book this one** moves the choice into bookings and the contact book.
- **Done when:** one real event's vendors, payments and budget are tracked in the app instead of a separate sheet.

### Phase 6. Client portal (2–3 weeks): ideas 21, 25

Build `CLIENT_PORTAL.md` from the approved mockup. The private links and the Apps Script doorway already exist from Step 1 (for timelines); this phase adds the rest of the portal, plus:

- **Share marking on files:** each document is **Private** (default) or **OK to share**. Shared files show in the portal.
- **Payments and contracts tab** linking to the all-in-one (see *The business side of the client portal*).
- Read-only first: timeline, the couple's to-dos (from Phase 4's checklist), vendor team, shared files, updates. Then light actions: comments, ticking off to-dos, uploads.
- **Done when:** one friendly client uses their portal for a month.

### Phase 7. People, guests and seating (3–4 weeks): ideas 11, 16, 17, 18

- **Wedding party and family:** name, role (bridesmaid, parent, officiant, ...) and phone. Roles connect to the timeline's **View as**, so one person's or one group's schedule prints on its own (just the bridesmaids, just the parents).
- **Accommodations and transportation:** hotel room blocks (hotel, rate, cutoff date, confirmation number), plus shuttles and cars (pickup times and places, company contact, confirmation number). Cutoff dates go on the dashboard; shuttle times feed the timeline.
- **Guest list:** import the couple's spreadsheet or their wedding website's export, or type it in. Each guest has RSVP status, meal choice, dietary needs, plus-one and table.
- **RSVP form** for guests, through the portal or a Google Form per event (decision 6).
- **Seating board:** each table is a column and each guest a card dragged between tables, with seat count and meal totals per table, plus a printable list for the caterer. Couples can move guests themselves through the portal.
- **Privacy:** guest names and dietary needs are personal data of people who aren't clients. They stay in "SBE App Data", never in this repo, and are archived after the event.

### Phase 8. From booked client to event (about 1 week): ideas 12, 15

The all-in-one handles inquiries and client emails (Step 2). The app adds:

- **New event from a booked client:** type the names, date and package. The app creates the dated event folder in "Client Files" (using the folder naming rules), fills in the event details, and applies the package's checklist (Phase 4). An automatic link from the all-in-one is possible later through Zapier, a paid connector service.
- **Daily email of overdue tasks** to SBE: the all-in-one doesn't know the app's checklists, so a small Google Apps Script in Nicole's account sends it. It's free and runs even when nobody has the app open.
- **Done when:** a client booked in the all-in-one becomes an event in the app with its checklist in under a minute.

### Phase 9. Mood boards and design (1–2 weeks): idea 19

- **Design section** per event: inspiration photos grouped by category (florals, attire, décor, stationery, ...), color palette swatches and notes. It reads photos from an inspiration folder in the event's Drive folder; uploads go to "SBE App Data", like inventory photos.
- **Stationery tracker (Queen Bee):** each piece (save-the-dates, invitations, inserts, signage) moves through Draft → Proof → Approved → Ordered → Printed, with due dates on the dashboard. The design itself happens in Canva.
- Shown in the portal when marked shared.

### Small items, any time

- **Time tracking** (idea 23): moved into Step 1 (Nicole uses it a lot). Phase 4 adds totals per package.
- **Pricing guide** (idea 24): not an app feature. A page on the new website, or a branded PDF made in Canva or Google Docs, from Nicole's content (input 4). Belongs with the website work in `WEBSITE.md`.
- **Booking consult calls** (idea 14): built. Nicole sets up her Google Calendar appointment schedule (*To do* in `sbe-improvements.md`), unless the all-in-one's scheduler replaces it (decision 5).

### Later

- **Ask SBE** (search, optional private AI chat): was Phase 5, now Phase 10. The proposal doesn't ask for it.
- Text messages on the event day.
- A calendar feed into Google Calendar.

## Changes to the app's principles

To record in `sbe-improvements.md` when the matching phase starts:

- **Writing to Drive:** the app reads event documents and writes only inside "SBE App Data". Two additions:
  - Phase 6: each event's client portal folder (already in `CLIENT_PORTAL.md`).
  - Phase 8: it creates a new event folder for a booked client. It still never changes existing documents.
- **Something runs in the background:** a Google Apps Script in Nicole's account serves the portal and sends the daily overdue email. Until now the app only runs while someone has it open.
- **Personal data of non-clients:** guest lists, wedding party phones and dietary needs. Same privacy rules as client data, and archived after the event.
- **Money stays out of the app:** contracts, invoices and payments live in the all-in-one; the app only links to them.

## Effort and cost

| Stage | Ideas | Effort |
|---|---|---|
| Step 1: replace Timeline Genius (grew after Nicole's checklist) | 4, 5, and parts of 6, 9, 23, 25 | 5–7 weeks |
| Step 2: set up the all-in-one | 12, 13, 15 | Setup time in the service, not app work |
| Phase 4: dashboard, packages, checklists, calendar | 1, 3, 9, 22 | 2–3 weeks |
| Inventory: finish | 10 | 1–2 weeks |
| Phase 5: vendors and money | 6, 7, 8, 20 | about 2 weeks |
| Phase 6: client portal | 21, 25 | 2–3 weeks |
| Phase 7: people, guests, seating | 11, 16, 17, 18 | 3–4 weeks |
| Phase 8: from booked client to event | 12, 15 | about 1 week |
| Phase 9: mood boards and design | 19 | 1–2 weeks |
| Small items | 23, 24 | under a week |

App work is part-time with Claude coding. **Total:** roughly 4–5 months. Nicole's checklist moved work earlier rather than adding much: Step 1 now carries the event checklist, contact book, time tracking and the online links, and the later phases shrink by the same amount. The everyday core (Step 1 and Phases 4–5) takes about 2–3 months.

**Running cost:** the app and the Apps Script are $0 a month. The all-in-one is a subscription (HoneyBook from about $29 a month billed yearly, about $350 a year), plus about 3% per card payment. Cancelling Timeline Genius saves about $500 a year, which roughly covers it.

## Status

- 2026-11-16: proposal received; ideas and plan written here. Decided the same day: build in this app, and use an all-in-one for the business side. Next: Nicole picks the all-in-one (Step 2); gather inputs 1–2; start Step 1.
- 2026-11-16: Nicole's Timeline Genius checklist answered (input 1, features only): 11 used a lot, 8 sometimes. Step 1 grew to cover the seven "a lot" features the app lacks. Her renewal date and the other end questions are still missing.
