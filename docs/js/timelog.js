// Time spent on each event: the date, who, how long, what kind of work, and what it was for.
// Saved per event as event-<id>.time.json in the shared "SBE App Data" folder. Each change re-reads the
// saved log first, so two planners logging time at once keep each other's entries.
import { readEventData, writeEventData } from './appdata.js';

// Kinds of work, so the totals show where the time goes. Optional on each entry.
export const TIME_TYPES = ['Meeting or call', 'Planning and email', 'Vendors', 'Site visit', 'Event day', 'Travel', 'Other'];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const iso = () => new Date().toISOString();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export const newEntryId = () => `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/**
 * How long, in minutes, from what someone typed: "1:30", "1.5", "1,5", "1h 30m", "1 hr 15 min", "2 hours",
 * "45 min". A bare number up to 12 means hours ("2" = 2 hr); above that, minutes ("45" = 45 min).
 * @returns {number|null} null when it can't be read
 */
export function parseDuration(raw) {
  const s = clean(raw).toLowerCase().replace(',', '.');
  if (!s) return null;
  let m;
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(s))) return +m[1] * 60 + +m[2];
  if ((m = /^(\d+(?:\.\d+)?)$/.exec(s))) { const n = +m[1]; return n <= 12 ? Math.round(n * 60) : Math.round(n); }
  m = /^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours))?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes))?$/.exec(s);
  if (m && (m[1] || m[2])) return Math.round(+(m[1] || 0) * 60 + +(m[2] || 0));
  return null;
}

// 85 -> "1:25", for putting a length back into the form.
export const toHM = (mins) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;

// What's wrong with an entry before saving it, in plain words ([] when it's fine).
export function checkEntry({ date, minutes }) {
  const problems = [];
  if (!isDate(date)) problems.push('Pick a date.');
  if (minutes == null) problems.push('Write how long, like 1:30, 1.5 or 45 min.');
  else if (!(minutes > 0)) problems.push('The time has to be more than 0.');
  else if (minutes > 24 * 60) problems.push('One entry can be at most 24 hours.');
  return problems;
}

export const emptyLog = () => ({ updated: null, entries: [] });

// Tidy whatever was saved: entries without an id, a date or a positive length are dropped.
export function normalizeLog(data) {
  const entries = Array.isArray(data && data.entries) ? data.entries : [];
  return {
    updated: (data && data.updated) || null,
    entries: entries
      .filter(e => e && e.id && isDate(e.date) && Number.isFinite(e.minutes) && e.minutes > 0)
      .map(e => ({
        id: String(e.id), date: e.date, minutes: Math.round(e.minutes),
        who: clean(e.who), type: TIME_TYPES.includes(e.type) ? e.type : '', what: clean(e.what),
        by: clean(e.by), at: e.at || null,
      })),
  };
}

export function addEntry(log, { id = newEntryId(), date, minutes, who = '', type = '', what = '', by = '' }, now = iso()) {
  const entry = { id, date, minutes: Math.round(minutes), who: clean(who), type: TIME_TYPES.includes(type) ? type : '', what: clean(what), by: clean(by), at: now };
  return { updated: now, entries: [...log.entries, entry] };
}

export const removeEntry = (log, id, now = iso()) => ({ updated: now, entries: log.entries.filter(e => e.id !== id) });

// Newest first: by date, then by when it was logged.
export const sortEntries = (entries) =>
  [...entries].sort((a, b) => b.date.localeCompare(a.date) || String(b.at || '').localeCompare(String(a.at || '')));

// Total minutes, and the minutes per person and per type ([[name, minutes]], largest first).
export function totals(entries) {
  const sum = (key) => {
    const m = new Map();
    for (const e of entries) m.set(e[key] || '', (m.get(e[key] || '') || 0) + e.minutes);
    return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  return { minutes: entries.reduce((n, e) => n + e.minutes, 0), count: entries.length, byWho: sum('who'), byType: sum('type') };
}

// The timer: minutes from start to stop (or now), rounded to the nearest 5, at least 5.
export function timerMinutes(startISO, endMs = Date.now()) {
  const mins = (endMs - Date.parse(startISO)) / 60000;
  if (!Number.isFinite(mins) || mins < 0) return 5;
  return Math.max(5, Math.round(mins / 5) * 5);
}

// ---------- saving to Drive ----------

export async function loadLog(driveId) {
  return normalizeLog(await readEventData(driveId, 'time'));
}

// Apply one change to the latest saved log and save it. Returns the saved log.
export async function changeLog(driveId, change) {
  const next = change(await loadLog(driveId));
  await writeEventData(driveId, 'time', next);
  return next;
}
