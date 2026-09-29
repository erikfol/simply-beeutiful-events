// The app's own saved data, kept as JSON files in Google Drive. Event documents are never written.
//
// Shared: an "SBE App Data" folder inside the SBE events folder holds everything the team shares:
//   timelines, statuses, corrections, event details, templates, and cached reading results.
//   The events folder's owner creates it (automatically, on sign-in) and shares it with the other
//   planners as Editor. Without Editor access a planner can still see everything, but not save.
// Personal: an "SBE App Data" folder at the top of each planner's own Drive keeps only settings.json
//   (which events folder they chose). Before the shared folder existed, it held everything; those files
//   are copied to the shared folder once (see migratePersonalData).
import { APP_DATA_FOLDER } from './config.js';
import { FOLDER_MIME, appDataName } from './driveEvents.js';
import { listFiles, quote, createFolder, readJson, createJson, updateJson, getAccess } from './drive.js';

// ---------- personal folder (settings only) ----------
let personalId = null;
let personalCreating = null;

async function personalFolder({ create }) {
  if (personalId) return personalId;
  const found = await listFiles(`name = ${quote(APP_DATA_FOLDER)} and mimeType = ${quote(FOLDER_MIME)} and 'root' in parents and 'me' in owners and trashed = false`);
  if (found.length) personalId = found[0].id;
  else if (create) {
    personalCreating = personalCreating || createFolder(APP_DATA_FOLDER).then(f => f.id);
    personalId = await personalCreating;
  }
  return personalId;
}

// ---------- shared folder (inside the events folder) ----------
let eventsFolderId = null;
let sharedId = null;
let sharedCreating = null;
const fileIds = new Map(); // "<folder>/<name>" -> Drive file id, so saves update instead of duplicating

export function forgetAppData() {
  personalId = null; personalCreating = null;
  eventsFolderId = null; sharedId = null; sharedCreating = null;
  fileIds.clear();
}

// Everything shared is stored next to the events: call when an events folder is chosen.
export function useEventsFolder(id) {
  if (id !== eventsFolderId) { eventsFolderId = id; sharedId = null; sharedCreating = null; fileIds.clear(); }
}

async function sharedFolder({ create }) {
  if (sharedId) return sharedId;
  if (!eventsFolderId) throw new Error('Choose the SBE events folder first.');
  const found = await listFiles(`name = ${quote(APP_DATA_FOLDER)} and mimeType = ${quote(FOLDER_MIME)} and ${quote(eventsFolderId)} in parents and trashed = false`, { orderBy: 'createdTime' });
  if (found.length) sharedId = found[0].id;
  else if (create) {
    sharedCreating = sharedCreating || createFolder(APP_DATA_FOLDER, eventsFolderId).then(f => f.id);
    sharedId = await sharedCreating;
  }
  return sharedId;
}

/**
 * Can this person use the shared folder? Creates it when they own (or may edit) the events folder.
 * @returns {Promise<{state: 'ready'|'view-only'|'waiting', folder?, eventsFolder, owner}>}
 *   ready: can save · view-only: folder exists but no Editor access · waiting: folder doesn't exist
 *   yet and this person can't create it (the events folder's owner has to sign in once)
 */
export async function sharedAccess() {
  const events = await getAccess(eventsFolderId);
  let id = await sharedFolder({ create: false });
  if (!id && events.canWrite) id = await sharedFolder({ create: true });
  if (!id) return { state: 'waiting', eventsFolder: events, owner: events.owner };
  const folder = await getAccess(id);
  return { state: folder.canWrite ? 'ready' : 'view-only', folder, eventsFolder: events, owner: folder.owner.emailAddress ? folder.owner : events.owner };
}

// ---------- files in a folder ----------
async function findIn(folder, name) {
  const key = `${folder}/${name}`;
  if (fileIds.has(key)) return fileIds.get(key);
  const found = await listFiles(`name = ${quote(name)} and ${quote(folder)} in parents and trashed = false`, { orderBy: 'modifiedTime desc' });
  const id = found.length ? found[0].id : null;
  if (id) fileIds.set(key, id);
  return id;
}

const noWriteAccess = () => new Error('You can view the shared "SBE App Data" folder but not save to it yet. Ask the owner of the SBE events folder to give you Editor access to "SBE App Data" (inside the events folder). Your changes are kept in this browser until then.');

async function writeIn(folder, name, data) {
  try {
    const id = await findIn(folder, name);
    if (id) return await updateJson(id, data);
    const created = await createJson(name, folder, data);
    fileIds.set(`${folder}/${name}`, created.id);
    return created;
  } catch (e) {
    if (/\(403\)/.test(e.message)) throw noWriteAccess();
    throw e;
  }
}

async function readIn(folder, name) {
  if (!folder) return null;
  const id = await findIn(folder, name);
  return id ? readJson(id) : null;
}

// Shared data (everything except the personal settings).
export async function readData(name) {
  return readIn(await sharedFolder({ create: false }), name);
}

export async function writeData(name, data) {
  const folder = await sharedFolder({ create: false });
  if (!folder) throw new Error('The shared "SBE App Data" folder isn\'t set up yet. The owner of the SBE events folder needs to sign in to the app once to create it. Your changes are kept in this browser until then.');
  return writeIn(folder, name, data);
}

// The shared folder id (for temporary converted copies while reading documents).
export async function appFolderId() {
  const id = await sharedFolder({ create: false });
  if (!id) throw new Error('The shared "SBE App Data" folder isn\'t set up yet, so scanned files can\'t be converted.');
  return id;
}

export const readEventData = (driveId, kind) => readData(appDataName(driveId, kind));
export const writeEventData = (driveId, kind, data) => writeData(appDataName(driveId, kind), data);

// Personal settings: which events folder this planner uses.
export async function readSettings() {
  return readIn(await personalFolder({ create: false }), 'settings.json');
}

export async function writeSettings(data) {
  return writeIn(await personalFolder({ create: true }), 'settings.json', data);
}

/**
 * One-time move of data saved before the shared folder existed: copies each file from the personal
 * folder that the shared folder doesn't have yet. Returns how many were copied.
 */
export async function migratePersonalData() {
  const personal = await personalFolder({ create: false });
  const shared = await sharedFolder({ create: false });
  if (!personal || !shared || personal === shared) return 0;
  const files = (await listFiles(`${quote(personal)} in parents and trashed = false`)).filter(f => f.name !== 'settings.json' && f.name.endsWith('.json'));
  let copied = 0;
  for (const f of files) {
    if (await findIn(shared, f.name)) continue;
    await writeIn(shared, f.name, await readJson(f.id));
    copied++;
  }
  return copied;
}
