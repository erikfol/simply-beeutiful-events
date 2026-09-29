// Document reading rules: the same rules as tools/scan_event.py, ported to run in the browser, plus
// payments, deadlines, contacts and a "needs a look" list. Pure: text and spreadsheet rows in, facts out.
import { extractTimes } from './util.js';
import { classifyFile } from './driveEvents.js';

// Bump when the rules change, so cached results are re-read.
export const SCANNER_VERSION = 5;

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
// Dates end at "not another digit" rather than a word boundary: Word text can run a date straight into the
// next word ("June 6, 2026Event") where the Python library had put a line break.
const DATE_RES = [
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2},?\\s+\\d{4}(?!\\d)`, 'gi'),
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}(?!\d)/g,
  /\b\d{4}-\d{2}-\d{2}(?!\d)/g,
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}(?!\d)/g,
];
const AMOUNT_RE = /\$\s?[\d,]+(?:\.\d{2})?/g;
const DAYPART_RE = /(ceremony|prelude|cocktail hour|reception|cocktails|dinner|welcome dinner|welcome party|after party|pick\s?up|delivery|setup|set\s?up|bus|shuttle|photos?|first look|hair|makeup|venue access|check[\s-]?in|check[\s-]?out)\b/i;

const pad = (n) => String(n).padStart(2, '0');
const validDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(+y, m, 0)).getUTCDate();

// "6/6/26", "6.6.26" (M.D.YY), "2026-06-06", "June 6, 2026" -> "2026-06-06"; null if not a real date.
export function toISO(raw) {
  const s = raw.trim();
  let m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/.exec(s);
  if (m) {
    const y = m[3].length === 4 ? m[3] : m[3].length === 2 ? `20${m[3]}` : null;
    if (!y || !validDate(y, +m[1], +m[2])) return null;
    return `${y}-${pad(m[1])}-${pad(m[2])}`;
  }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(m[1], +m[2], +m[3]) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = new RegExp(`^(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})$`, 'i').exec(s);
  if (m) {
    const month = MONTHS.toLowerCase().split('|').indexOf(m[1].toLowerCase()) + 1;
    return validDate(m[3], month, +m[2]) ? `${m[3]}-${pad(month)}-${pad(m[2])}` : null;
  }
  return null;
}

// ±100 characters around the first mention, newlines flattened (same as the Python scanner).
export function snippet(text, needle, r = 100) {
  const i = text.indexOf(needle);
  if (i < 0) return needle.slice(0, 160);
  return (`…${text.slice(Math.max(0, i - r), i + needle.length + r).replace(/\n/g, ' ').trim()}…`).slice(0, 220);
}

export function daypart(text) {
  const m = DAYPART_RE.exec(text);
  return m ? m[1].toLowerCase() : '';
}

const uniqSorted = (arr) => [...new Set(arr)].sort();
const byDateTime = (a, b) => (a.date_iso + (a.time || '')).localeCompare(b.date_iso + (b.time || ''));

/** Dates (with nearby times and a label), amounts, emails and phone numbers found in one document's text. */
export function scanText(rawText, source) {
  const text = (rawText || '').replace(/\r\n?/g, '\n');
  const dates = uniqSorted(DATE_RES.flatMap(re => text.match(re) || []));
  const events = [];
  let badDates = 0;
  for (const d of dates) {
    const iso = toISO(d);
    if (!iso) { badDates++; continue; }
    const snip = snippet(text, d);
    const times = extractTimes(snip);
    events.push({ date_raw: d, date_iso: iso, snippet: snip, source, times, time: times[0] || null, label: daypart(snip) });
  }
  events.sort(byDateTime);
  return {
    dates: dates.slice(0, 30),
    amounts: uniqSorted(text.match(AMOUNT_RE) || []).slice(0, 30),
    events,
    badDates,
    emails: uniqSorted((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(e => e.toLowerCase())),
    phones: uniqSorted((text.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g) || []).map(p => p.trim())),
    details: detailsFromText(text),
    textLen: text.length,
  };
}

// ---------- Basic event details written as labels in contracts ----------

// A name is 1-4 capitalized words or initials ("J."); a sentence-ending period stops it.
const NAME = "(?:[A-Z][a-z'’-]+|[A-Z]\\.)(?:[ \\t]+(?:[A-Z][a-z'’-]+|[A-Z]\\.)){0,3}";
const NAMES_RE = new RegExp(`\\b(?:Clients?|Couple|Purchaser|Bride\\s*(?:&|and)\\s*Groom|Wedding\\s+of|Names?)\\s*[:\\-–]\\s*(${NAME}(?:\\s*(?:&|and)\\s*${NAME})?)`, 'g');
const BRIDE_RE = new RegExp(`\\bBride\\s*[:\\-–]\\s*(${NAME})`, 'g');
const GROOM_RE = new RegExp(`\\bGroom\\s*[:\\-–]\\s*(${NAME})`, 'g');
// (?<![\d/.-]) keeps the year of "6-12-27 guests seated" from reading as 27 guests
const GUESTS_RE = /(?<![\d/.-])\b(\d{2,3})\s+(?:guests|people|attendees)\b|\bguest\s+count\s*[:\-–]?\s*(\d{2,3})\b/gi;
const VENUE_RE = /\b(?:Venue|(?:Event|Ceremony|Reception|Wedding)\s+(?:location|venue)|Location)\s*[:\-–]\s*([^\n.;]{3,80})/gi;
const LODGING_RE = /\b(?:room\s*block|rooming\s+list|hotel\s+block|guest\s+rooms?)\b/i;
const OTHER_GATHERING_RE = /welcome|rehearsal|brunch|after[- ]?party|shuttle|passenger|bus\b|tap\s*room/i;

// The sentence around a position (for judging what a number refers to).
function sentenceAt(text, i) {
  const start = Math.max(text.lastIndexOf('.', i - 1), text.lastIndexOf('\n', i - 1)) + 1;
  const ends = [text.indexOf('.', i), text.indexOf('\n', i)].filter(x => x >= 0);
  return text.slice(start, ends.length ? Math.min(...ends) : text.length);
}

// Names, guest counts, venues and lodging mentions a planner would look for first.
export function detailsFromText(text) {
  const t = text || '';
  const names = [...t.matchAll(NAMES_RE)].map(m => m[1].trim());
  const bride = [...t.matchAll(BRIDE_RE)].map(m => m[1].trim())[0];
  const groom = [...t.matchAll(GROOM_RE)].map(m => m[1].trim())[0];
  if (bride && groom) names.unshift(`${bride} & ${groom}`);
  return {
    names: uniqSorted(names).slice(0, 5),
    // counts in sentences about other gatherings (welcome party, shuttles…) aren't the wedding's guest count
    guests: [...t.matchAll(GUESTS_RE)]
      .filter(m => !OTHER_GATHERING_RE.test(sentenceAt(t, m.index)))
      .map(m => Number(m[1] || m[2])).filter(n => n >= 10 && n <= 999),
    venues: uniqSorted([...t.matchAll(VENUE_RE)].map(m => m[1].trim().replace(/\s+/g, ' '))).slice(0, 5),
    lodging: LODGING_RE.test(t),
  };
}

// ---------- Spreadsheets: {sheetName: rows[][]} ----------

const isDate = (v) => Object.prototype.toString.call(v) === '[object Date]';
const dateCell = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

// SheetJS workbook (read with cellDates: true) -> {sheet: rows}. Date cells read like Python's "2026-06-06 00:00:00".
export function workbookToSheets(XLSX, wb) {
  const out = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) { out[name] = []; continue; }
    // Always start at A1 so column letters line up (B = label, G/H/I = amounts) even when column A is empty.
    const used = XLSX.utils.decode_range(ws['!ref']);
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false, range: { s: { r: 0, c: 0 }, e: used.e } });
    out[name] = Array.from(rows, row => Array.from(row, v => (isDate(v) ? dateCell(v) : v)));
  }
  return out;
}

// Same flattening the Python scanner used for .xlsx text: sheet names, then non-empty cells joined by " | ".
export function sheetsToText(sheets) {
  const out = Object.keys(sheets).map(n => `[sheet: ${n}]`);
  for (const rows of Object.values(sheets)) {
    for (const row of rows) {
      const vals = row.filter(v => v !== null && v !== undefined && v !== '').map(v => String(v).trim());
      if (vals.length) out.push(vals.join(' | '));
      if (out.length > 400) break;
    }
  }
  return out.join('\n');
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const f = (vals, i) => num(vals[i]) ?? 0;
const nonEmpty = (rows) => rows.filter(r => r.some(v => v !== null && v !== undefined && v !== ''));

/** "Budget Calculator" tab (or the first tab): label in column B; actual, paid, due in G, H, I. */
export function parseBudget(sheets, file) {
  const name = 'Budget Calculator' in sheets ? 'Budget Calculator' : Object.keys(sheets)[0];
  const rows = nonEmpty(sheets[name] || []);
  let budgetTotal = null;
  let totals = {};
  const categories = [];
  for (const vals of rows) {
    const label = String(vals[1] ?? '').trim();
    if (vals.slice(1).some(v => String(v ?? '').includes('Total Wedding Budget'))) {
      const v = vals.find(x => num(x) !== null && x > 1000);
      if (v !== undefined) budgetTotal = v;
    }
    if (label === 'Total Cost:') totals = { actual: f(vals, 6), paid: f(vals, 7), due: f(vals, 8) };
    else if (label && vals.length > 8 && num(vals[6]) !== null && label !== 'Total Wedding Budget:') {
      categories.push({ category: label, actual: f(vals, 6), paid: f(vals, 7), due: f(vals, 8) });
    }
  }
  let remaining = null;
  for (const r of rows) {
    if (r.some(v => String(v ?? '').includes('Remaining Budget'))) for (const v of r) if (num(v) !== null) remaining = v;
  }
  return {
    file, budget_total: budgetTotal, total_actual: totals.actual ?? null, total_paid: totals.paid ?? null,
    total_due: totals.due ?? null, remaining_budget: remaining, categories,
    recognized: 'actual' in totals, sheet: name,
  };
}

/** "Booked" tab (or the first tab): vendor, location, event, -, contact, email, cost; first row is the header. */
export function parseVendors(sheets) {
  const name = 'Booked' in sheets ? 'Booked' : Object.keys(sheets)[0];
  const col = (r, i) => String(r[i] ?? '');
  return (sheets[name] || []).slice(1)
    .filter(r => r && r[0] !== null && r[0] !== undefined && String(r[0]).trim())
    .map(r => ({ vendor: String(r[0]).trim(), location: col(r, 1), event: col(r, 2), contact: col(r, 4), email: col(r, 5), cost: col(r, 6) }));
}

// ---------- Payments and deadlines (from dated mentions) ----------

const PAY_RE = /\b(deposit|retainer|balance|payment|paid|pay|invoice)\b/i;
const DEADLINE_RE = /\bdue\b|deadline|no later than|\brsvp\b|final (?:guest )?count/i;
// "must go in the mail by March 12, 2027" is a deadline; "rentals must be cleared" on a pickup date is not.
const isDeadline = (sentence, dateRaw) => DEADLINE_RE.test(sentence) || new RegExp(`\\b(?:by|before)\\s+${dateRaw.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`, 'i').test(sentence);
const stripExt = (n) => (n || '').replace(/\.[a-z0-9]{2,5}$/i, '');
export const vendorOfSource = (source) => stripExt(source.split('/').pop()).split(' - ')[0].trim();

// The sentence of a snippet that contains the date (neighbouring sentences often belong to other dates).
export function sentenceWith(snip, dateRaw) {
  const text = (snip || '').replace(/^…|…$/g, '').trim();
  const hit = text.split(/(?<=[.!?])\s+/).find(x => x.includes(dateRaw));
  return (hit || text).replace(/^\s*[-*•]\s+/, ''); // drop a list bullet at the start
}

function nearestAmount(snip, dateRaw) {
  const at = snip.indexOf(dateRaw);
  let best = null;
  for (const m of snip.matchAll(AMOUNT_RE)) {
    const dist = Math.abs(m.index - at);
    if (!best || dist < best.dist) best = { text: m[0], dist };
  }
  if (!best) return null;
  return Number(best.text.replace(/[$,\s]/g, ''));
}

// Dated mentions that read like a payment (with an amount) or a deadline, e.g. "balance of $900.00 due May 11, 2027".
export function deriveActions(timeline) {
  const out = [];
  for (const e of timeline) {
    const sentence = sentenceWith(e.snippet, e.date_raw);
    const found = nearestAmount(sentence, e.date_raw);
    const base = { id: factId(e), date_raw: e.date_raw, date_iso: e.date_iso, time: e.time, vendor: vendorOfSource(e.source), source: e.source, snippet: sentence, confirmed: e.confirmed, corrected: e.corrected, note: e.note };
    if (PAY_RE.test(sentence) && (found !== null || e.amount != null)) {
      const kind = /deposit|retainer/i.test(sentence) ? 'Deposit' : /balance|final/i.test(sentence) ? 'Balance' : 'Payment';
      out.push({ ...base, type: 'payment', kind, amount: e.amount ?? found });
    } else if (isDeadline(sentence, e.date_raw)) {
      out.push({ ...base, type: 'deadline', kind: 'Deadline', amount: null });
    }
  }
  return out.sort(byDateTime);
}

// Stable identity for a dated mention, so a planner's correction survives re-reading the documents.
export const factId = (e) => `${e.source}|${e.date_raw}`;

/** Apply planner corrections: {id: {status: 'ok'|'ignored'|'edited', date_iso?, time?, amount?, note?}}. */
export function applyCorrections(items, corrections = {}) {
  return items
    .filter(it => (corrections[factId(it)] || {}).status !== 'ignored')
    .map(it => {
      const c = corrections[factId(it)];
      if (!c) return it;
      const edited = { ...it, confirmed: c.status === 'ok' || c.status === 'edited', note: c.note || '' };
      if (c.status === 'edited') {
        if (c.date_iso) edited.date_iso = c.date_iso;
        if (c.time !== undefined) edited.time = c.time || null;
        if (c.amount !== undefined && c.amount !== null && c.amount !== '') edited.amount = Number(c.amount);
        edited.corrected = true;
      }
      return edited;
    });
}

// ---------- One event: file results -> report (same shape as the Python scanner's JSON) ----------

/**
 * @param {Array} files  [{id, name, path, mimeType, modifiedTime, webViewLink, result}] where result is the
 *   cached reading of that file: {events, amounts, emails, phones, textLen, budget?, vendors?, problem?, skipped?}
 */
export function buildReport(files, corrections = {}) {
  const sorted = [...files].sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));
  const docs = sorted.map(fl => ({
    file: `${fl.path}${fl.name}`, name: fl.name, path: fl.path, mimeType: fl.mimeType, modifiedTime: fl.modifiedTime,
    webViewLink: fl.webViewLink, id: fl.id, ...classifyFile(fl.name, fl.mimeType),
    read: fl.result ? (fl.result.problem ? 'problem' : fl.result.skipped ? 'skipped' : 'read') : 'pending',
    textLen: fl.result ? fl.result.textLen || 0 : 0,
    via: fl.result && fl.result.via ? fl.result.via : '',
  }));
  const results = sorted.filter(fl => fl.result && !fl.result.problem);
  const timelineAll = results.flatMap(fl => fl.result.events || []).sort(byDateTime);
  const timeline = applyCorrections(timelineAll, corrections);

  const budgetFile = sorted.find(fl => fl.path === '' && fl.result && fl.result.budget);
  const vendorFile = sorted.find(fl => fl.path === '' && fl.result && fl.result.vendors);
  const needsLook = [];
  for (const fl of sorted) {
    const r = fl.result;
    if (!r) continue;
    if (r.problem) needsLook.push({ file: `${fl.path}${fl.name}`, link: fl.webViewLink, problem: r.problem });
    else if (r.badDates) needsLook.push({ file: `${fl.path}${fl.name}`, link: fl.webViewLink, problem: `${r.badDates} date${r.badDates === 1 ? '' : 's'} that aren't real calendar dates (e.g. 13/45/2026) were skipped.` });
  }
  if (!sorted.some(fl => classifyFile(fl.name, fl.mimeType).kind === 'budget')) needsLook.push({ file: '', problem: 'No budget spreadsheet found (a spreadsheet with "Budget" in its name, at the top of the event folder).' });
  else if (budgetFile && !budgetFile.result.budget.recognized) needsLook.push({ file: budgetFile.name, link: budgetFile.webViewLink, problem: `Budget sheet found, but no "Total Cost:" row in column B of the "${budgetFile.result.budget.sheet}" tab, so totals couldn't be read.` });

  const contacts = [];
  for (const fl of results) {
    const r = fl.result;
    if ((r.emails && r.emails.length) || (r.phones && r.phones.length)) {
      contacts.push({ vendor: vendorOfSource(fl.name), emails: r.emails || [], phones: r.phones || [], source: `${fl.path}${fl.name}`, link: fl.webViewLink, kind: classifyFile(fl.name, fl.mimeType).kind });
    }
  }

  // basic event details, each with the document it came from
  const details = { names: [], guests: [], venues: [], lodging: [] };
  for (const fl of sorted) {
    const d = fl.result && fl.result.details;
    const source = `${fl.path}${fl.name}`;
    if (d) {
      d.names.forEach(value => details.names.push({ value, source, link: fl.webViewLink }));
      d.guests.forEach(value => details.guests.push({ value, source, link: fl.webViewLink }));
      d.venues.forEach(value => details.venues.push({ value, source, link: fl.webViewLink }));
    }
    if ((d && d.lodging) || LODGING_FILE_RE.test(fl.name)) details.lodging.push({ file: source, link: fl.webViewLink });
  }

  const readCount = docs.filter(d => d.read === 'read').length;
  return {
    source: 'drive',
    num_files: docs.length,
    num_text_parsed: docs.filter(d => d.textLen > 0).length,
    num_read: readCount,
    num_pending: docs.filter(d => d.read === 'pending').length,
    num_timeline_events: timeline.length,
    all_amounts: uniqSorted(results.flatMap(fl => fl.result.amounts || [])).slice(0, 50),
    budget: budgetFile ? { ...budgetFile.result.budget, link: budgetFile.webViewLink } : {},
    vendors: {
      booked: vendorFile ? vendorFile.result.vendors : [],
      vendorsFile: vendorFile ? { name: vendorFile.name, link: vendorFile.webViewLink } : null,
      contract_files: docs.filter(d => d.kind === 'contract').map(d => d.name).sort().slice(0, 40),
    },
    timeline: timeline.slice(0, 200),
    files: docs,
    contacts,
    needsLook,
    details,
  };
}

const LODGING_FILE_RE = /rooming\s*list|room\s*block|hotel|marriott|hilton|hyatt|courtyard|suites/i;
