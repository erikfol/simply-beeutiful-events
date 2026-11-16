// SBE's vendor and contact book: every vendor SBE has worked with, entered once and reused for every event.
// Saved as vendors.json in the shared "SBE App Data" folder. Each change re-reads the saved book first, so two
// planners editing at once don't erase each other's work. Pure helpers first, then loading and saving.
import { readData, writeData } from './appdata.js';
import { sameVendor } from './details.js';
import { roleLabel } from './roles.js';
import { daysBetween } from './util.js';

export const VENDORS_FILE = 'vendors.json';

// Offered in the category box alongside the categories already in use (they match the timeline's roles).
export const STARTER_CATEGORIES = [
  'Venue', 'Photographer', 'Videographer', 'Hair & makeup', 'Florist', 'Catering & bar', 'Cake & desserts',
  'Band / DJ', 'Officiant', 'Transportation', 'Rentals', 'Hotel', 'Stationery', 'Lighting', 'Other',
];

// Insurance that runs out within this many days is flagged.
export const INSURANCE_WARN_DAYS = 30;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanNotes = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const iso = () => new Date().toISOString();
export const newVendorId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// "a@x.com, b@y.com" or ['a@x.com'] -> tidy list without repeats.
const splitList = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[,;\n]/)).map(clean).filter(Boolean);
function unique(items, key) {
  const seen = new Set();
  return items.filter(x => { const k = key(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
}
const digits = (p) => p.replace(/\D/g, '');
export const cleanEmails = (v) => unique(splitList(v).map(e => e.toLowerCase()), e => e);
export const cleanPhones = (v) => unique(splitList(v), digits);

// "bluebellblooms.com" -> "https://bluebellblooms.com"
export function cleanWebsite(v) {
  const s = clean(v).replace(/\s/g, '');
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export const parseRating = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= 5 ? n : 0; };

// The events a vendor worked: [{driveId, name, date}], one per event.
function cleanEvents(list) {
  return unique((Array.isArray(list) ? list : []).filter(e => e && e.driveId)
    .map(e => ({ driveId: String(e.driveId), name: clean(e.name), date: isDate(e.date) ? e.date : '' })), e => e.driveId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name));
}

// An event as a vendor's book entry remembers it.
export const eventRef = (meta) => ({ driveId: meta.driveId, name: meta.name, date: meta.weddingDate || '' });

function cleanVendor(v) {
  return {
    id: String(v.id), name: clean(v.name), category: clean(v.category), contact: clean(v.contact),
    emails: cleanEmails(v.emails), phones: cleanPhones(v.phones), website: cleanWebsite(v.website),
    insuranceExpires: isDate(v.insuranceExpires) ? v.insuranceExpires : '', rating: parseRating(v.rating),
    notes: cleanNotes(v.notes), events: cleanEvents(v.events),
    created: v.created || null, createdBy: clean(v.createdBy), updated: v.updated || null,
  };
}

export const emptyBook = () => ({ updated: null, vendors: [] });

// Tidy whatever was saved: vendors without an id or a name are dropped.
export function normalizeBook(data) {
  const vendors = Array.isArray(data && data.vendors) ? data.vendors : [];
  return { updated: (data && data.updated) || null, vendors: vendors.filter(v => v && v.id && clean(v.name)).map(cleanVendor) };
}

// What's wrong with a vendor before saving it, in plain words ([] when it's fine).
export function checkVendor(v) {
  const problems = [];
  if (!clean(v.name)) problems.push('Write the vendor\'s name.');
  const bad = cleanEmails(v.emails).filter(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (bad.length) problems.push(`Check the email address${bad.length === 1 ? '' : 'es'}: ${bad.join(', ')}.`);
  if (v.insuranceExpires && !isDate(v.insuranceExpires)) problems.push('Pick the insurance end date from the calendar.');
  return problems;
}

// Add a vendor, or replace one with the same id. Keeps when and by whom it was first added, and its events.
export function upsertVendor(book, v, now = iso(), by = '') {
  const old = book.vendors.find(x => x.id === v.id);
  const next = cleanVendor({
    ...v,
    events: v.events || (old && old.events) || [],
    created: (old && old.created) || now, createdBy: (old && old.createdBy) || by, updated: now,
  });
  return { updated: now, vendors: old ? book.vendors.map(x => (x.id === v.id ? next : x)) : [...book.vendors, next] };
}

export const removeVendor = (book, id, now = iso()) => ({ updated: now, vendors: book.vendors.filter(v => v.id !== id) });

// The book entry for a vendor found in an event: same name (ignoring "The", "LLC", ...) or a shared email.
export function matchVendor(vendors, name, emails = []) {
  const mine = cleanEmails(emails);
  return vendors.find(v => sameVendor(v.name, name)) || (mine.length ? vendors.find(v => v.emails.some(e => mine.includes(e))) : null) || null;
}

// "For" labels that describe people at the event, never a vendor's category.
const PEOPLE_LABELS = ['couple', 'party', 'family', 'guests', 'planner'].map(r => roleLabel(r).toLowerCase());
const categoryFrom = (role) => (PEOPLE_LABELS.includes(clean(role).toLowerCase()) ? '' : clean(role));

/**
 * Put an event's vendors (rows from the Overview's vendor table) into the book. A vendor already in the book
 * gets the event added to its list, plus any new emails and phones; its name, category and notes stay as they are.
 * @returns {{book, added: string[], linked: string[]}} names added as new, and names that were already there
 */
export function addFromEvent(book, rows, event, now = iso(), by = '') {
  let vendors = [...book.vendors];
  const added = [], linked = [];
  for (const r of rows) {
    const name = clean(r.vendor);
    if (!name) continue;
    const found = matchVendor(vendors, name, r.emails);
    if (found) {
      const next = cleanVendor({
        ...found,
        category: found.category || categoryFrom(r.role), contact: found.contact || r.contact,
        emails: [...found.emails, ...(r.emails || [])], phones: [...found.phones, ...(r.phones || [])],
        events: [...found.events, event], updated: now,
      });
      vendors = vendors.map(v => (v.id === found.id ? next : v));
      linked.push(found.name);
    } else {
      vendors.push(cleanVendor({
        id: newVendorId(), name, category: categoryFrom(r.role), contact: r.contact, emails: r.emails, phones: r.phones,
        events: [event], created: now, createdBy: by, updated: now,
      }));
      added.push(name);
    }
  }
  return { book: { updated: now, vendors }, added, linked };
}

/**
 * Insurance on file: null when no end date is known, else {state: 'expired' | 'soon' | 'ok', days}
 * (days until it ends; negative once it has ended).
 */
export function insuranceState(v, today) {
  if (!v.insuranceExpires) return null;
  const days = daysBetween(today, v.insuranceExpires);
  return { state: days < 0 ? 'expired' : days <= INSURANCE_WARN_DAYS ? 'soon' : 'ok', days };
}

// Categories to offer: the starters plus every category in use, without repeats (ignoring capitals).
export function categoryChoices(vendors) {
  return unique([...STARTER_CATEGORIES, ...vendors.map(v => v.category).filter(Boolean)], c => c.toLowerCase())
    .sort((a, b) => a.localeCompare(b));
}

// Search everything about a vendor, including the events they worked.
export function filterVendors(vendors, { text = '', category = '' } = {}) {
  const words = clean(text).toLowerCase().split(' ').filter(Boolean);
  return vendors.filter(v => {
    if (category && v.category.toLowerCase() !== category.toLowerCase()) return false;
    const hay = [v.name, v.category, v.contact, v.website, v.notes, ...v.emails, ...v.phones, ...v.events.map(e => e.name)].join(' ').toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// Grouped by category (A-Z, "no category" last), then by name.
export function groupVendors(vendors) {
  const groups = new Map();
  for (const v of vendors) {
    const key = v.category.toLowerCase();
    if (!groups.has(key)) groups.set(key, { category: v.category, vendors: [] });
    groups.get(key).vendors.push(v);
  }
  return [...groups.values()]
    .sort((a, b) => (!a.category) - (!b.category) || a.category.localeCompare(b.category))
    .map(g => ({ ...g, vendors: g.vendors.sort((a, b) => a.name.localeCompare(b.name)) }));
}

// ---------- saving to Drive ----------

export async function loadBook() {
  return normalizeBook(await readData(VENDORS_FILE));
}

// Apply one change to the latest saved book and save it. Returns the saved book.
export async function changeBook(change) {
  const next = change(await loadBook());
  await writeData(VENDORS_FILE, next);
  return next;
}
