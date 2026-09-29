// Google bar above the event picker: sign in, choose the SBE events folder, refresh, sign out.
import { $, setStatus } from './dom.js';
import { isConfigured, isReady, prepare, signIn, signOut } from './google.js';
import { listChildren, searchFolders, getFile, whoAmI } from './drive.js';
import { readData, writeData, forgetAppData } from './appdata.js';
import { FOLDER_MIME, folderToEvent, sortEvents, parseFolderId } from './driveEvents.js';
import { loadTemplates, saveTemplates } from './storage.js';
import { esc, todayISO } from './util.js';
import { APP_DATA_FOLDER } from './config.js';

const SETTINGS = 'settings.json';
const TEMPLATES = 'templates.json';

let user = null;        // {emailAddress, displayName}
let folder = null;      // {id, name, link}
let expired = false;
let busy = '';
let results = null;     // folder search results
let skipped = [];       // subfolders without a date in their name
let eventCount = 0;
let onEvents = () => {};

export function initDriveBar(onDriveEvents) {
  onEvents = onDriveEvents;
  if (!isConfigured()) { $('driveBar').hidden = true; return; }
  $('driveBar').hidden = false;
  $('driveBar').addEventListener('click', onClick);
  $('driveBar').addEventListener('submit', onSubmit);
  window.addEventListener('sbe:needs-signin', () => { expired = true; render(); });
  render();
  prepare().then(render).catch(e => { busy = ''; render(); setStatus(e.message); });
}

function render() {
  const bar = $('driveBar');
  if (!isConfigured()) return;
  let html;
  if (busy) {
    html = `<span class="db-busy">${esc(busy)}</span>`;
  } else if (!user) {
    html = `<button type="button" class="primary" data-act="signin"${isReady() ? '' : ' disabled'}>Sign in with Google</button>
      <span class="db-note">SBE staff: open your events straight from Google Drive.</span>`;
  } else if (expired) {
    html = `<span>Your Google sign-in expired. Unsaved changes are kept in this browser.</span>
      <button type="button" class="primary" data-act="signin">Sign in again</button>`;
  } else if (!folder) {
    html = `<span>Signed in as <strong>${esc(user.emailAddress || '')}</strong>.</span>
      <form class="db-find"><label for="folderQuery">Choose the SBE events folder</label>
        <input id="folderQuery" name="q" placeholder="Folder name or Google Drive link" required />
        <button type="submit">Find</button></form>
      ${results ? (results.length
        ? `<ul class="db-results">${results.map(f => `<li><button type="button" class="mini" data-act="choose" data-id="${esc(f.id)}" data-name="${esc(f.name)}" data-link="${esc(f.webViewLink || '')}">Use</button> ${esc(f.name)}</li>`).join('')}</ul>`
        : '<p class="db-note">No folders found. Try part of the name, or paste the folder link from Google Drive.</p>') : ''}
      <button type="button" class="mini" data-act="signout">Sign out</button>`;
  } else {
    const link = /^https:\/\//.test(folder.link) ? `<a href="${esc(folder.link)}" target="_blank" rel="noopener">${esc(folder.name)}</a>` : esc(folder.name);
    html = `<span>Signed in as <strong>${esc(user.emailAddress || '')}</strong> · Events folder: ${link} · ${eventCount} event${eventCount === 1 ? '' : 's'}</span>
      <span class="db-actions"><button type="button" class="mini" data-act="refresh">Refresh</button><button type="button" class="mini" data-act="change">Change folder</button><button type="button" class="mini" data-act="signout">Sign out</button></span>
      ${skipped.length ? `<p class="db-note">Skipped (no date at the start of the name): ${skipped.map(esc).join(', ')}</p>` : ''}`;
  }
  bar.innerHTML = html;
}

async function run(label, fn) {
  busy = label; render();
  try { await fn(); }
  catch (e) {
    if (e.name === 'NeedsSignIn') expired = true;
    setStatus(e.message);
  } finally { busy = ''; render(); }
}

function onClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'signin') {
    // signIn() must start inside the click for the Google popup to be allowed
    const pending = signIn();
    run('Signing in…', async () => { await pending; await afterSignIn(); });
  } else if (act === 'choose') {
    run('Opening folder…', () => chooseFolder({ id: b.dataset.id, name: b.dataset.name, link: b.dataset.link }));
  } else if (act === 'refresh') {
    run('Refreshing events…', () => loadEvents(false));
  } else if (act === 'change') {
    folder = null; results = null; render();
  } else if (act === 'signout') {
    signOut(); forgetAppData();
    user = null; folder = null; results = null; expired = false; skipped = []; eventCount = 0;
    onEvents([]);
    render();
    setStatus('Signed out of Google. Drive events are hidden until you sign in again.');
  }
}

function onSubmit(ev) {
  ev.preventDefault();
  const q = new FormData(ev.target).get('q').trim();
  if (!q) return;
  run('Searching Google Drive…', async () => {
    const id = parseFolderId(q);
    if (id) {
      const f = await getFile(id);
      if (f.mimeType !== FOLDER_MIME) throw new Error('That link is a file, not a folder. Paste the link to the SBE events folder.');
      await chooseFolder({ id: f.id, name: f.name, link: f.webViewLink });
    } else {
      results = (await searchFolders(q)).filter(f => f.name !== APP_DATA_FOLDER); // never offer the app's own folder
    }
  });
}

async function afterSignIn() {
  const wasExpired = expired;
  expired = false;
  if (wasExpired && user) { setStatus('Signed in again. You can save now.'); return; }
  user = await whoAmI();
  const settings = await readData(SETTINGS);
  await syncTemplates();
  if (settings && settings.eventsFolderId) {
    folder = { id: settings.eventsFolderId, name: settings.eventsFolderName || 'SBE events', link: settings.eventsFolderLink || '' };
    await loadEvents(true);
  } else {
    setStatus('Signed in. Choose the SBE events folder to see its events.');
  }
}

async function chooseFolder(f) {
  folder = f; results = null;
  await writeData(SETTINGS, { eventsFolderId: f.id, eventsFolderName: f.name, eventsFolderLink: f.link, chosen: new Date().toISOString() });
  await loadEvents(true);
}

async function loadEvents(openFirst) {
  const kids = (await listChildren(folder.id)).filter(k => k.mimeType === FOLDER_MIME);
  const events = sortEvents(kids.map(folderToEvent).filter(Boolean), todayISO());
  skipped = kids.filter(k => !folderToEvent(k)).map(k => k.name);
  eventCount = events.length;
  onEvents(events, openFirst);
  setStatus(events.length ? `Found ${events.length} events in "${folder.name}".` : `No event folders found in "${folder.name}". Event folders start with a date, like "6.12.27 Harper-Bennett Wedding".`);
}

// Saved templates follow the planner: merge Drive and browser copies (browser wins on the same name).
async function syncTemplates() {
  const remote = (await readData(TEMPLATES)) || [];
  const local = loadTemplates();
  const merged = [...remote.filter(r => !local.some(l => l.name === r.name)), ...local];
  saveTemplates(merged);
  if (JSON.stringify(merged) !== JSON.stringify(remote)) await writeData(TEMPLATES, merged);
}

export async function saveTemplatesToDrive(list) {
  if (!user || expired) return false;
  await writeData(TEMPLATES, list);
  return true;
}
