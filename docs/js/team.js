// The team: everyone with access to the SBE events folder, whether they can save in the shared
// "SBE App Data" folder, and when they last signed in to the app (team.json in "SBE App Data").
// Pure helpers first (no network), then loadTeam / recordSeen, which use Google Drive.
import { listPermissions } from './drive.js';
import { readData, writeData } from './appdata.js';

export const TEAM_FILE = 'team.json';

// Google Drive roles, simplified: owner, edit or view.
const LEVEL = { owner: 'owner', organizer: 'edit', fileOrganizer: 'edit', writer: 'edit', commenter: 'view', reader: 'view' };
const RANK = { owner: 3, edit: 2, view: 1 };
export const levelOf = (role) => LEVEL[role] || null;

// Each person's highest level on one folder, by lower-case email. Groups, domains and links are separate.
function byPerson(perms) {
  const out = new Map();
  for (const p of perms || []) {
    if (!p || p.deleted || p.type !== 'user' || !p.emailAddress) continue;
    const level = levelOf(p.role);
    if (!level) continue;
    const email = p.emailAddress.toLowerCase();
    const cur = out.get(email);
    if (!cur || RANK[level] > RANK[cur.level]) out.set(email, { level, name: p.displayName || (cur && cur.name) || '' });
  }
  return out;
}

/**
 * Shares that aren't a single person: anyone with the link, a whole domain, or a group.
 * @param {Array<[string, Array]>} lists [where, permissions] pairs; the same share inherited by a
 *   folder inside another is listed once, under the first folder.
 */
export function otherShares(lists) {
  const seen = new Set();
  const out = [];
  for (const [where, perms] of lists) {
    for (const p of perms || []) {
      if (!p || p.deleted || p.type === 'user') continue;
      const level = levelOf(p.role);
      if (!level) continue;
      const key = `${p.type}|${p.domain || ''}|${(p.emailAddress || '').toLowerCase()}|${level}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const who = p.type === 'anyone' ? 'anyone with the link'
        : p.type === 'domain' ? `anyone at ${p.domain || 'a domain'}`
        : (p.displayName || p.emailAddress || 'a group');
      out.push({ where, type: p.type, level, who, open: p.type === 'anyone' || p.type === 'domain' });
    }
  }
  return out;
}

/**
 * One row per person.
 * @param {{eventsPerms: Array|null, appPerms: Array|null, seen?: object, me?: object, today?: string}} args
 *   eventsPerms / appPerms: the folders' permission lists, or null when this person can't see them.
 *   seen: team.json's people {email: {name, lastSeen}}. me + today: the signed-in person counts as seen today.
 * @returns rows [{email, name, events, saving, lastSeen, status, level}], owner first, then by name.
 *   events: 'owner' | 'edit' | 'view' | null (no access) | undefined (not known)
 *   saving: 'yes' | 'view' | null (SBE App Data: edit or owner means they can save)
 *   status: 'ready' | 'not-seen' | 'cant-save' | 'no-events'
 */
export function teamRows({ eventsPerms, appPerms, seen = {}, me = null, today = '' }) {
  const eventsKnown = Array.isArray(eventsPerms);
  const ev = byPerson(eventsPerms), app = byPerson(appPerms);
  const seenBy = new Map(Object.entries(seen || {}).map(([email, s]) => [email.toLowerCase(), s || {}]));
  const myEmail = ((me && me.emailAddress) || '').toLowerCase();
  if (myEmail && today) seenBy.set(myEmail, { ...(seenBy.get(myEmail) || {}), lastSeen: today });

  const emails = new Set([...ev.keys(), ...app.keys(), ...seenBy.keys()]);
  const rows = [...emails].map(email => {
    const e = ev.get(email), a = app.get(email), s = seenBy.get(email);
    const events = eventsKnown ? (e ? e.level : null) : undefined;
    const saving = !a ? null : a.level === 'view' ? 'view' : 'yes';
    const status = events === null ? 'no-events' : saving !== 'yes' ? 'cant-save' : !(s && s.lastSeen) ? 'not-seen' : 'ready';
    return {
      email,
      name: (e && e.name) || (a && a.name) || (s && s.name) || '',
      events, saving, lastSeen: (s && s.lastSeen) || '', status,
      level: eventsKnown ? events : (a ? a.level : null), // for sorting: the owner first
    };
  });
  const order = (r) => ({ owner: 0, edit: 1, view: 2 })[r.level] ?? 3;
  return rows.sort((x, y) => order(x) - order(y) || (x.name || x.email).localeCompare(y.name || y.email));
}

// Record that someone signed in today. Returns the new team data, or null when nothing changed.
export function markSeen(data, user, today) {
  const email = ((user && user.emailAddress) || '').toLowerCase();
  if (!email || !today) return null;
  const people = { ...((data && data.people) || {}) };
  const cur = people[email] || {};
  const name = (user && user.displayName) || cur.name || '';
  if (cur.lastSeen === today && cur.name === name) return null;
  people[email] = { name, lastSeen: today };
  return { people };
}

// ---------- with Google Drive ----------

const denied = (e) => e && e.name !== 'NeedsSignIn' && /\((403|404)\)/.test(e.message || '');

async function permsOrNull(id) {
  if (!id) return null;
  try { return await listPermissions(id); }
  catch (e) { if (denied(e)) return null; throw e; }
}

/**
 * Everything the Team section shows. Folders this person may not see the sharing of come back as null.
 * @returns {Promise<{rows, shares, eventsKnown: boolean, appKnown: boolean}>}
 */
export async function loadTeam({ eventsFolderId, appFolderId, me = null, today = '' }) {
  const [eventsPerms, appPerms, data] = await Promise.all([
    permsOrNull(eventsFolderId),
    permsOrNull(appFolderId),
    appFolderId ? readData(TEAM_FILE).catch(() => null) : Promise.resolve(null),
  ]);
  const known = Array.isArray(eventsPerms) || Array.isArray(appPerms);
  return {
    rows: known ? teamRows({ eventsPerms, appPerms, seen: (data && data.people) || {}, me, today }) : [],
    shares: otherShares([['events', eventsPerms], ['app', appPerms]]),
    eventsKnown: Array.isArray(eventsPerms),
    appKnown: Array.isArray(appPerms),
  };
}

// Note today's sign-in in team.json (once a day per person). Needs Editor access to "SBE App Data".
export async function recordSeen(user, today) {
  const next = markSeen(await readData(TEAM_FILE), user, today);
  if (next) await writeData(TEAM_FILE, next);
  return !!next;
}
