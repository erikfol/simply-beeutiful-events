// The app's own saved data (timelines, statuses, settings, templates), kept as JSON files in an
// "SBE App Data" folder in the signed-in person's Drive. Event documents are never written.
import { APP_DATA_FOLDER } from './config.js';
import { FOLDER_MIME, appDataName } from './driveEvents.js';
import { listFiles, quote, createFolder, readJson, createJson, updateJson } from './drive.js';

let folderId = null;
let creating = null; // one folder even if two first saves overlap
const fileIds = new Map(); // name -> Drive file id, so saves update instead of creating duplicates

export function forgetAppData() { folderId = null; creating = null; fileIds.clear(); }

// Reads never create anything; the folder is made on the first save.
async function appFolder({ create }) {
  if (folderId) return folderId;
  const found = await listFiles(`name = ${quote(APP_DATA_FOLDER)} and mimeType = ${quote(FOLDER_MIME)} and 'root' in parents and 'me' in owners and trashed = false`);
  if (found.length) folderId = found[0].id;
  else if (create) {
    creating = creating || createFolder(APP_DATA_FOLDER).then(f => f.id);
    folderId = await creating;
  }
  return folderId;
}

async function findId(name) {
  if (fileIds.has(name)) return fileIds.get(name);
  const parent = await appFolder({ create: false });
  if (!parent) return null;
  const found = await listFiles(`name = ${quote(name)} and ${quote(parent)} in parents and trashed = false`, { orderBy: 'modifiedTime desc' });
  const id = found.length ? found[0].id : null;
  if (id) fileIds.set(name, id);
  return id;
}

export async function readData(name) {
  const id = await findId(name);
  return id ? readJson(id) : null;
}

export async function writeData(name, data) {
  const id = await findId(name);
  if (id) return updateJson(id, data);
  const created = await createJson(name, await appFolder({ create: true }), data);
  fileIds.set(name, created.id);
  return created;
}

export const readEventData = (driveId, kind) => readData(appDataName(driveId, kind));
export const writeEventData = (driveId, kind, data) => writeData(appDataName(driveId, kind), data);
