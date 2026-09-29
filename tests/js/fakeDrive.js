// In-memory stand-in for the Google Drive REST API, used by the Node tests and the browser smoke test.
// Handles exactly the requests docs/js/drive.js makes, with Drive-style sharing: owners and editors may
// write (also inside folders they can edit); everyone else may only read. All names are fictional.

const FOLDER = 'application/vnd.google-apps.folder';

// convert(bytes, contentType) stands in for Google's conversion/OCR when a file is uploaded as a Google Doc.
// `me` is the default signed-in person; drive.as(email) gives a transport for someone else.
export function createFakeDrive({ me = 'planner@example.com', pageSize, convert = () => '' } = {}) {
  const files = new Map();
  let seq = 0;
  let expired = false;
  const calls = [];
  const uploads = new Map(); // resumable upload id -> {meta}
  const deleted = [];

  const now = () => new Date().toISOString();
  // content: string or bytes (alt=media); exports: {mimeType: string or bytes} for Google Docs/Sheets.
  // sharedWithMe: shared (as Viewer) with the default signed-in person.
  function add({ name, mimeType = 'application/pdf', parent = 'root', owner = 'owner@example.com', content = null, exports = null, modifiedTime = now(), sharedWithMe = false, editors = [] }) {
    const id = `f${String(++seq).padStart(4, '0')}xxxxxxxx`;
    const link = mimeType === FOLDER ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`;
    const size = content ? String(content.byteLength ?? content.length) : '12345';
    files.set(id, { id, name, mimeType, parents: [parent], owners: [owner], editors: [...editors], sharedWith: sharedWithMe ? [me] : [], trashed: false, content, exports, modifiedTime, webViewLink: link, size });
    return id;
  }

  // Share a file or folder: 'editor' can write inside it, 'viewer' only sees it (under "Shared with me").
  function share(id, email, role = 'editor') {
    const f = files.get(id);
    if (role === 'editor' && !f.editors.includes(email)) f.editors.push(email);
    if (!f.sharedWith.includes(email)) f.sharedWith.push(email);
  }

  // Owners and editors can write, and so can anyone who can edit a folder above it. 'root' = the person's own Drive.
  function canWrite(f, who) {
    if (!f) return false;
    if (f.owners.includes(who) || f.editors.includes(who)) return true;
    const p = f.parents[0];
    return p !== 'root' && canWrite(files.get(p), who);
  }
  const canAddTo = (parentId, who) => parentId === 'root' || canWrite(files.get(parentId), who);

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const denied = () => json(403, { error: { message: 'The user does not have sufficient permissions for this file.' } });
  const pub = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink, size: f.size, parents: f.parents });
  const person = (email) => ({ emailAddress: email, displayName: email === me ? 'Test Planner' : `Test ${email.split('@')[0]}` });

  // Parse the subset of Drive query syntax drive.js produces.
  const unq = (s) => s.slice(1, -1).replace(/\\(.)/g, '$1');
  function matcher(q, who) {
    const tests = [];
    const re = /('(?:[^'\\]|\\.)*')\s+in\s+(parents|owners)|(mimeType|name)\s*(=|contains)\s*('(?:[^'\\]|\\.)*')|(trashed|sharedWithMe)\s*=\s*(true|false)/g;
    for (const m of q.matchAll(re)) {
      if (m[2] === 'parents') { const v = unq(m[1]); tests.push(f => f.parents.includes(v)); }
      else if (m[2] === 'owners') { const v = unq(m[1]); tests.push(f => f.owners.includes(v === 'me' ? who : v)); }
      else if (m[3]) {
        const field = m[3], op = m[4], v = unq(m[5]);
        tests.push(op === 'contains' ? (f => f[field].toLowerCase().includes(v.toLowerCase())) : (f => f[field] === v));
      } else if (m[6] === 'sharedWithMe') { const v = m[7] === 'true'; tests.push(f => f.sharedWith.includes(who) === v); }
      else if (m[6]) { const v = m[7] === 'true'; tests.push(f => f.trashed === v); }
    }
    return (f) => tests.every(t => t(f));
  }

  const transportFor = (who) => async function transport(method, url, { body } = {}) {
    calls.push(`${method} ${url}`);
    if (expired) return json(401, { error: { message: 'Invalid Credentials' } });
    const u = new URL(url);
    const path = u.pathname.replace(/^\/(upload\/)?drive\/v3/, '');
    const idMatch = /^\/files\/([^/]+)$/.exec(path);
    const exportMatch = /^\/files\/([^/]+)\/export$/.exec(path);

    if (method === 'GET' && exportMatch) {
      const f = files.get(decodeURIComponent(exportMatch[1]));
      const out = f && f.exports && f.exports[u.searchParams.get('mimeType')];
      if (out === undefined || out === null) return json(400, { error: { message: 'Export only supports Docs Editors files.' } });
      return new Response(out, { status: 200 });
    }

    if (method === 'GET' && path === '/about') return json(200, { user: person(who) });

    if (method === 'GET' && path === '/files') {
      const match = matcher(u.searchParams.get('q') || '', who);
      let list = [...files.values()].filter(match);
      const order = u.searchParams.get('orderBy') || 'name';
      list.sort(order.startsWith('modifiedTime') ? (a, b) => b.modifiedTime.localeCompare(a.modifiedTime) : order.startsWith('createdTime') ? (a, b) => a.id.localeCompare(b.id) : (a, b) => a.name.localeCompare(b.name));
      const size = pageSize || Number(u.searchParams.get('pageSize')) || 100;
      const start = Number(u.searchParams.get('pageToken') || 0);
      const page = list.slice(start, start + size);
      return json(200, { files: page.map(pub), ...(start + size < list.length ? { nextPageToken: String(start + size) } : {}) });
    }

    if (idMatch) {
      const f = files.get(decodeURIComponent(idMatch[1]));
      if (!f) return json(404, { error: { message: 'File not found' } });
      if (method === 'GET') {
        if (u.searchParams.get('alt') === 'media') return new Response(f.content ?? '', { status: 200 });
        return json(200, { ...pub(f), owners: f.owners.map(person), capabilities: { canAddChildren: f.mimeType === FOLDER && canWrite(f, who), canEdit: canWrite(f, who) } });
      }
      if (method === 'PATCH') {
        if (!canWrite(f, who)) return denied();
        f.content = body; f.modifiedTime = now();
        return json(200, pub(f));
      }
      if (method === 'DELETE') {
        if (!canWrite(f, who)) return denied();
        files.delete(f.id); deleted.push(f.name);
        return new Response(null, { status: 204 });
      }
    }

    // resumable upload, step 1: metadata -> upload URL
    if (method === 'POST' && path === '/files' && u.searchParams.get('uploadType') === 'resumable') {
      const meta = JSON.parse(body);
      if (!canAddTo(meta.parents[0], who)) return denied();
      const uploadId = `u${uploads.size + 1}`;
      uploads.set(uploadId, { meta });
      return new Response('', { status: 200, headers: { Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${uploadId}` } });
    }
    // resumable upload, step 2: the bytes -> the new (converted) file
    if (method === 'PUT' && path === '/files' && uploads.has(u.searchParams.get('upload_id'))) {
      const { meta } = uploads.get(u.searchParams.get('upload_id'));
      const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
      const text = meta.mimeType === 'application/vnd.google-apps.document' ? convert(bytes, meta.name) : null;
      const id = add({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0], owner: who, exports: text === null ? null : { 'text/plain': text } });
      return json(200, pub(files.get(id)));
    }

    if (method === 'POST' && path === '/files') {
      if (u.searchParams.get('uploadType') === 'multipart') {
        const parts = body.split(/--sbe_event_manager_boundary(?:--)?\r\n/).filter(Boolean);
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
        const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
        if (!canAddTo(meta.parents[0], who)) return denied();
        const id = add({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0], owner: who, content });
        return json(200, pub(files.get(id)));
      }
      const meta = JSON.parse(body);
      const parent = (meta.parents || ['root'])[0];
      if (!canAddTo(parent, who)) return denied();
      const id = add({ name: meta.name, mimeType: meta.mimeType, parent, owner: who });
      return json(200, pub(files.get(id)));
    }

    return json(404, { error: { message: `Fake Drive has no handler for ${method} ${path}` } });
  };

  return {
    transport: transportFor(me), as: transportFor, add, share, files, calls, me, deleted,
    expire: () => { expired = true; }, restore: () => { expired = false; },
  };
}

// A fictional SBE Drive: an events folder owned by the business owner, shared with the planner as Viewer.
export function seedSbeDrive(drive) {
  // only the events folder itself is shared with the planner; its contents are reachable through it
  const root = drive.add({ name: 'SBE Events', mimeType: FOLDER, sharedWithMe: true });
  const harper = drive.add({ name: '6.12.27 Harper-Bennett Wedding (Demo)', mimeType: FOLDER, parent: root });
  for (const [name, mimeType] of [
    ['Harper_Bennett Wedding - Budget', 'application/vnd.google-apps.spreadsheet'],
    ['Olivia & James Vendor Options', 'application/vnd.google-apps.spreadsheet'],
    ['Willow Brook Barn - Venue Agreement.pdf', 'application/pdf'],
    ['Juniper Lane Photography - Contract.pdf', 'application/pdf'],
    ['The Midnight Owls Band - Performance Agreement.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['Hearth & Table Catering - Proposal', 'application/vnd.google-apps.document'],
    ['Planner Notes - Harper-Bennett', 'application/vnd.google-apps.document'],
    ['Color inspiration.jpg', 'image/jpeg'],
  ]) drive.add({ name, mimeType, parent: harper });
  const agreements = drive.add({ name: 'Vendor Agreements', mimeType: FOLDER, parent: harper });
  drive.add({ name: 'Summit Coach Lines - Shuttle Quote.pdf', parent: agreements });

  const lopez = drive.add({ name: '10.3.26 Lopez-Kim Wedding', mimeType: FOLDER, parent: root });
  drive.add({ name: 'Lopez-Kim - Budget', mimeType: 'application/vnd.google-apps.spreadsheet', parent: lopez });
  drive.add({ name: 'Riverside Hall - Rental Agreement.pdf', parent: lopez, modifiedTime: new Date().toISOString() });

  const nguyen = drive.add({ name: '5.16.26 Nguyen-Patel Wedding', mimeType: FOLDER, parent: root });
  drive.add({ name: 'Final invoice - Nguyen-Patel.pdf', parent: nguyen, modifiedTime: '2026-05-20T15:00:00.000Z' });

  drive.add({ name: 'Templates & Forms', mimeType: FOLDER, parent: root });
  return { root, harper, lopez, nguyen };
}
