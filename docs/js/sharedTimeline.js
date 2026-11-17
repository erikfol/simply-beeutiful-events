// A shared (online) timeline as the public timeline.html page reads it: one person's or vendor's part of an
// event's timeline, saved by the app as a Drive file that anyone with the link can read. Nothing here needs
// sign-in, and nothing here can change anything.
import { sortStops } from './util.js';

export const SNAPSHOT_VERSION = 1;

const text = (s, max = 500) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isTime = (s) => /^\d{2}:\d{2}$/.test(s || '');

// A problem with the link itself (missing, turned off), as opposed to a passing network problem.
export class LinkError extends Error {
  constructor(message) { super(message); this.name = 'LinkError'; }
}

// Keep only what the page shows, in the shape it expects; anything else in the file is ignored.
export function normalizeSnapshot(data) {
  if (!data || typeof data !== 'object' || data.v !== SNAPSHOT_VERSION) throw new LinkError('This link doesn\'t open a timeline. Ask Simply Beeutiful Events to send it again.');
  const event = data.event || {};
  const days = (Array.isArray(data.days) ? data.days : []).filter(d => d && isDate(d.date)).map(d => ({
    date: d.date,
    title: text(d.title, 200),
    items: sortStops((Array.isArray(d.items) ? d.items : []).filter(it => it && isTime(it.time) && text(it.title)).map(it => ({
      time: it.time, timeEnd: isTime(it.timeEnd) ? it.timeEnd : '', title: text(it.title, 300), detail: text(it.detail, 1000), estimate: !!it.estimate,
    }))),
  })).filter(d => d.items.length).sort((a, b) => a.date.localeCompare(b.date));
  return {
    event: { name: text(event.name, 200), date: isDate(event.date) ? event.date : '', venue: text(event.venue, 200) },
    audience: text(data.audience, 100), label: text(data.label, 200),
    days, updated: typeof data.updated === 'string' ? data.updated : '',
  };
}

// The file id from the page address (timeline.html#<id>); '' when there isn't a usable one.
export function linkId(hash) {
  const id = String(hash || '').replace(/^#/, '').trim();
  return /^[\w-]{10,200}$/.test(id) ? id : '';
}

/**
 * Read a shared timeline from Google Drive with the public API key.
 * @throws {LinkError} when the link is incomplete, turned off or doesn't exist; Error for passing problems
 */
export async function fetchSnapshot(id, key, fetchFn = fetch) {
  if (!id) throw new LinkError('This link is incomplete. Ask Simply Beeutiful Events to send it again.');
  if (!key) throw new Error('Online timelines aren\'t switched on yet.');
  let res;
  try {
    res = await fetchFn(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(key)}`);
  } catch {
    throw new Error('The timeline couldn\'t be loaded. Check the internet connection and reload the page.');
  }
  if (res.status === 404 || res.status === 403) throw new LinkError('This timeline link is no longer active. Ask Simply Beeutiful Events for a new one.');
  if (!res.ok) throw new Error(`The timeline couldn't be loaded right now (Google said ${res.status}). Try again in a minute.`);
  let data;
  try { data = await res.json(); } catch { throw new LinkError('This link doesn\'t open a timeline. Ask Simply Beeutiful Events to send it again.'); }
  return normalizeSnapshot(data);
}
