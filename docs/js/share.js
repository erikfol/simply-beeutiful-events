// Online timeline links: one person's or vendor's part of an event's timeline (the same as "View as"),
// saved as a file in "SBE App Data/Shared Timelines" that anyone with the link can read, and shown on the
// public timeline.html page. Saving the timeline updates every link for that event; turning a link off makes
// its file private and deletes it. Each event's links are listed in event-<id>.shares.json.
import { itemInView, roleLabel, ROLES } from './roles.js';
import { parseEventFolderName } from './driveEvents.js';
import { readEventData, writeEventData, appSubfolderId } from './appdata.js';
import { createJson, updateJson, deleteFile, shareWithLink, stopLinkSharing } from './drive.js';
import { SNAPSHOT_VERSION } from './sharedTimeline.js';

export const SHARE_FOLDER = 'Shared Timelines';
export const SHARE_PAGE = 'timeline.html';

// Who a link can be for: '' (the whole timeline) or one of the timeline's roles except "planner".
export const SHARE_ROLES = [['', 'Whole timeline'], ...ROLES.filter(([k]) => k !== 'planner')];
const ROLE_KEYS = SHARE_ROLES.map(([k]) => k);
export const audienceOf = (role) => (role ? roleLabel(role) : 'Whole timeline');

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const iso = () => new Date().toISOString();

// "6.12.27 Harper-Bennett Wedding (Demo)" -> "Harper-Bennett Wedding (Demo)"
export const eventTitle = (meta) => clean(parseEventFolderName(meta.name || '').title || meta.name);

/**
 * What a link shows: the event, who it's for, and only their stops (times, lengths, titles and details).
 * Where each time came from and planner-only stops stay out; times not confirmed yet are marked.
 */
export function buildSnapshot({ meta, curated, role = '', label = '' }, now = iso()) {
  const days = ((curated && curated.days) || []).map(d => ({
    date: d.date,
    title: d.title || '',
    items: (d.items || []).filter(it => it.time && it.title && itemInView(it, role)).map(it => ({
      time: it.time,
      ...(it.timeEnd ? { timeEnd: it.timeEnd } : {}),
      title: it.title,
      ...(it.detail ? { detail: it.detail } : {}),
      ...(it.confidence === 'confirmed' ? {} : { estimate: true }),
    })),
  })).filter(d => d.items.length);
  return {
    v: SNAPSHOT_VERSION, from: 'Simply Beeutiful Events',
    event: { name: eventTitle(meta), date: meta.weddingDate || '', venue: clean(meta.venue) },
    audience: audienceOf(role), label: clean(label), days, updated: now,
  };
}

// How many stops a link would show (for "They'll see 12 stops").
export const stopCount = (curated, role) => buildSnapshot({ meta: {}, curated, role }).days.reduce((n, d) => n + d.items.length, 0);

// The address to send: the public page with the file id after the # (never sent to the web server).
export const linkUrl = (pageUrl, id) => `${new URL(SHARE_PAGE, pageUrl).href}#${id}`;

export const emptyShares = () => ({ updated: null, links: [] });

export function normalizeShares(data) {
  const links = Array.isArray(data && data.links) ? data.links : [];
  return {
    updated: (data && data.updated) || null,
    links: links.filter(l => l && l.id && ROLE_KEYS.includes(l.role || '')).map(l => ({
      id: String(l.id), role: l.role || '', label: clean(l.label), created: l.created || null, createdBy: clean(l.createdBy), updated: l.updated || null,
    })),
  };
}

// ---------- with Google Drive ----------

export async function loadShares(driveId) {
  return normalizeShares(await readEventData(driveId, 'shares'));
}

async function changeShares(driveId, change) {
  const next = change(await loadShares(driveId));
  await writeEventData(driveId, 'shares', next);
  return next;
}

const fileName = (meta, role, label) => `${eventTitle(meta)} - ${clean(label) || audienceOf(role)}.json`.replace(/[\\/:*?"<>|]+/g, ' ');

/**
 * Make a new link: save the person's version of the timeline, share that one file by link, and list it.
 * @returns the link {id, role, label, created, createdBy, updated}
 */
export async function createShareLink({ meta, curated, role = '', label = '', by = '' }, now = iso()) {
  if (!ROLE_KEYS.includes(role)) throw new Error('Choose who the link is for.');
  const folder = await appSubfolderId(SHARE_FOLDER);
  const file = await createJson(fileName(meta, role, label), folder, buildSnapshot({ meta, curated, role, label }, now));
  try {
    await shareWithLink(file.id);
  } catch (e) {
    await deleteFile(file.id).catch(() => {});
    throw e;
  }
  const link = { id: file.id, role, label: clean(label), created: now, createdBy: clean(by), updated: now };
  await changeShares(meta.driveId, s => ({ updated: now, links: [...s.links.filter(l => l.id !== link.id), link] }));
  return link;
}

/**
 * After the timeline is saved: rewrite every link's file so people see the latest times.
 * @returns {{updated: number, failed: number}}
 */
export async function refreshShareLinks(meta, curated, now = iso()) {
  const shares = await loadShares(meta.driveId);
  const done = [];
  let failed = 0;
  for (const l of shares.links) {
    try {
      await updateJson(l.id, buildSnapshot({ meta, curated, role: l.role, label: l.label }, now));
      done.push(l.id);
    } catch (e) {
      if (e.name === 'NeedsSignIn') throw e;
      failed++;
    }
  }
  if (done.length) await changeShares(meta.driveId, s => ({ updated: now, links: s.links.map(l => (done.includes(l.id) ? { ...l, updated: now } : l)) }));
  return { updated: done.length, failed };
}

// Turn a link off: its file stops being shared and is deleted, and it leaves the event's list.
export async function turnOffShareLink(meta, id, now = iso()) {
  try {
    await stopLinkSharing(id);
  } catch (e) {
    if (e.name === 'NeedsSignIn' || !/\(404\)/.test(e.message)) throw e; // 404: already gone
  }
  // Only the person who made a link can delete its file; once it isn't shared, it's private either way.
  await deleteFile(id).catch(() => {});
  await changeShares(meta.driveId, s => ({ updated: now, links: s.links.filter(l => l.id !== id) }));
}
