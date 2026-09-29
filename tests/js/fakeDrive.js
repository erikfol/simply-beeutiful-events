// In-memory stand-in for the Google Drive REST API, used by the Node tests and the browser smoke test.
// Handles exactly the requests docs/js/drive.js makes. All names and contents are fictional.

const FOLDER = 'application/vnd.google-apps.folder';

export function createFakeDrive({ me = 'planner@example.com', pageSize } = {}) {
  const files = new Map();
  let seq = 0;
  let expired = false;
  const calls = [];

  const now = () => new Date().toISOString();
  function add({ name, mimeType = 'application/pdf', parent = 'root', owner = 'owner@example.com', content = null, modifiedTime = now(), sharedWithMe = false }) {
    const id = `f${String(++seq).padStart(4, '0')}xxxxxxxx`;
    const link = mimeType === FOLDER ? `https://drive.google.com/drive/folders/${id}` : `https://drive.google.com/file/d/${id}/view`;
    files.set(id, { id, name, mimeType, parents: [parent], owners: [owner], trashed: false, sharedWithMe, content, modifiedTime, webViewLink: link, size: content ? String(content.length) : '12345' });
    return id;
  }

  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const pub = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink, size: f.size, parents: f.parents });

  // Parse the subset of Drive query syntax drive.js produces.
  const unq = (s) => s.slice(1, -1).replace(/\\(.)/g, '$1');
  function matcher(q) {
    const tests = [];
    const re = /('(?:[^'\\]|\\.)*')\s+in\s+(parents|owners)|(mimeType|name)\s*(=|contains)\s*('(?:[^'\\]|\\.)*')|(trashed|sharedWithMe)\s*=\s*(true|false)/g;
    for (const m of q.matchAll(re)) {
      if (m[2] === 'parents') { const v = unq(m[1]); tests.push(f => f.parents.includes(v)); }
      else if (m[2] === 'owners') { const v = unq(m[1]); tests.push(f => f.owners.includes(v === 'me' ? me : v)); }
      else if (m[3]) {
        const field = m[3], op = m[4], v = unq(m[5]);
        tests.push(op === 'contains' ? (f => f[field].toLowerCase().includes(v.toLowerCase())) : (f => f[field] === v));
      } else if (m[6]) { const field = m[6], v = m[7] === 'true'; tests.push(f => f[field] === v); }
    }
    return (f) => tests.every(t => t(f));
  }

  async function transport(method, url, { body } = {}) {
    calls.push(`${method} ${url}`);
    if (expired) return json(401, { error: { message: 'Invalid Credentials' } });
    const u = new URL(url);
    const path = u.pathname.replace(/^\/(upload\/)?drive\/v3/, '');
    const idMatch = /^\/files\/([^/]+)$/.exec(path);

    if (method === 'GET' && path === '/about') return json(200, { user: { displayName: 'Test Planner', emailAddress: me } });

    if (method === 'GET' && path === '/files') {
      const match = matcher(u.searchParams.get('q') || '');
      let list = [...files.values()].filter(match);
      const order = u.searchParams.get('orderBy') || 'name';
      list.sort(order.startsWith('modifiedTime') ? (a, b) => b.modifiedTime.localeCompare(a.modifiedTime) : (a, b) => a.name.localeCompare(b.name));
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
        return json(200, pub(f));
      }
      if (method === 'PATCH') {
        f.content = body; f.modifiedTime = now();
        return json(200, pub(f));
      }
    }

    if (method === 'POST' && path === '/files') {
      if (u.searchParams.get('uploadType') === 'multipart') {
        const parts = body.split(/--sbe_event_manager_boundary(?:--)?\r\n/).filter(Boolean);
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
        const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
        const id = add({ name: meta.name, mimeType: meta.mimeType, parent: meta.parents[0], owner: me, content });
        return json(200, pub(files.get(id)));
      }
      const meta = JSON.parse(body);
      const id = add({ name: meta.name, mimeType: meta.mimeType, parent: (meta.parents || ['root'])[0], owner: me });
      return json(200, pub(files.get(id)));
    }

    return json(404, { error: { message: `Fake Drive has no handler for ${method} ${path}` } });
  }

  return { transport, add, files, calls, me, expire: () => { expired = true; }, restore: () => { expired = false; } };
}

// A fictional SBE Drive: an events folder owned by the business owner, shared with the planner.
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
