// Minimal Google Drive REST client (v3). Every request goes through one transport, so tests can swap in a fake Drive.
import { accessToken, NeedsSignIn } from './google.js';
import { FOLDER_MIME } from './driveEvents.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,size,parents';

async function fetchTransport(method, url, { body, headers = {} } = {}) {
  return fetch(url, { method, body, headers: { Authorization: `Bearer ${accessToken()}`, ...headers } });
}

let transport = fetchTransport;
export function useTransport(fn) { transport = fn || fetchTransport; }

async function request(method, url, opts) {
  const res = await transport(method, url, opts);
  if (res.status === 401) throw new NeedsSignIn('Your Google sign-in expired. Sign in again to continue.');
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error.message; } catch { /* no JSON body */ }
    throw new Error(`Google Drive said no (${res.status})${detail ? `: ${detail}` : ''}.`);
  }
  return res;
}

// Drive query strings quote values with single quotes.
export const quote = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export async function listFiles(q, { orderBy = 'name', pageSize = 1000 } = {}) {
  const out = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q, orderBy, pageSize: String(pageSize), fields: `nextPageToken,files(${FILE_FIELDS})`,
      supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await (await request('GET', `${API}/files?${params}`)).json();
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

export const listChildren = (folderId) => listFiles(`${quote(folderId)} in parents and trashed = false`);

export const searchFolders = (text) =>
  listFiles(`mimeType = ${quote(FOLDER_MIME)} and name contains ${quote(text)} and trashed = false`);

// All files under a folder, with their subfolder path ("Vendor Agreements/"), a few levels deep.
export async function listTree(folderId, path = '', depth = 0) {
  const out = [];
  for (const f of await listChildren(folderId)) {
    if (f.mimeType === FOLDER_MIME) {
      if (depth < 3) out.push(...await listTree(f.id, `${path}${f.name}/`, depth + 1));
    } else {
      out.push({ ...f, path });
    }
  }
  return out;
}

export async function getFile(id) {
  const params = new URLSearchParams({ fields: FILE_FIELDS, supportsAllDrives: 'true' });
  return (await request('GET', `${API}/files/${encodeURIComponent(id)}?${params}`)).json();
}

export async function whoAmI() {
  const data = await (await request('GET', `${API}/about?fields=user(displayName,emailAddress)`)).json();
  return data.user || {};
}

export async function createFolder(name, parentId) {
  const meta = { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) };
  const res = await request('POST', `${API}/files?fields=${FILE_FIELDS}`, { body: JSON.stringify(meta), headers: { 'Content-Type': 'application/json' } });
  return res.json();
}

export async function readJson(id) {
  return (await request('GET', `${API}/files/${encodeURIComponent(id)}?alt=media`)).json();
}

const BOUNDARY = 'sbe_event_manager_boundary';

export async function createJson(name, parentId, data) {
  const body = [
    `--${BOUNDARY}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify({ name, parents: [parentId], mimeType: 'application/json' }),
    `--${BOUNDARY}`, 'Content-Type: application/json', '', JSON.stringify(data, null, 2),
    `--${BOUNDARY}--`, '',
  ].join('\r\n');
  const res = await request('POST', `${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { body, headers: { 'Content-Type': `multipart/related; boundary=${BOUNDARY}` } });
  return res.json();
}

export async function updateJson(id, data) {
  const res = await request('PATCH', `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, { body: JSON.stringify(data, null, 2), headers: { 'Content-Type': 'application/json' } });
  return res.json();
}
