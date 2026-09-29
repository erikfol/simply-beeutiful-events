// Google bar above the event picker: sign in, choose the SBE events folder, see whether you can save to
// the shared "SBE App Data" folder, refresh, sign out.
import { $, setStatus } from './dom.js';
import { isConfigured, isReady, prepare, signIn, signOut, canReadDrive } from './google.js';
import { listChildren, listSharedFolders, listMyTopFolders, searchFolders, getFile, whoAmI } from './drive.js';
import { readData, writeData, readSettings, writeSettings, forgetAppData, useEventsFolder, sharedAccess, migratePersonalData } from './appdata.js';
import { FOLDER_MIME, folderToEvent, sortEvents, parseFolderId } from './driveEvents.js';
import { loadTemplates, saveTemplates } from './storage.js';
import { esc, todayISO } from './util.js';
import { APP_DATA_FOLDER } from './config.js';

const TEMPLATES = 'templates.json';

let user = null;        // {emailAddress, displayName}
let folder = null;      // {id, name, link}
let access = null;      // shared "SBE App Data" folder: {state: 'ready'|'view-only'|'waiting', folder, owner}
let expired = false;
let busy = '';
let results = null;     // folder search results
let choices = null;     // folders to pick from: shared with me + my own top-level folders
let skipped = [];       // subfolders without a date in their name
let movedCount = 0;     // items moved into the shared folder at the last check (shown once)
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

const who = (p) => esc((p && (p.displayName || p.emailAddress)) || 'the owner of the SBE events folder');
const linkTo = (f, text) => (f && /^https:\/\//.test(f.link || '') ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">${text}</a>` : text);

function accessNote() {
  if (!access) return '';
  const appFolder = `"${APP_DATA_FOLDER}"`;
  if (access.state === 'ready') {
    const moved = movedCount ? `<p class="db-note">✅ Moved ${movedCount} item${movedCount === 1 ? '' : 's'} you saved earlier (run sheets, statuses, notes) into the shared ${linkTo(access.folder, appFolder)} folder.</p>` : '';
    movedCount = 0;
    const mine = access.folder && access.owner && user && access.owner.emailAddress === user.emailAddress;
    return moved + (mine
      ? `<p class="db-note">Saved work is shared in ${linkTo(access.folder, appFolder)} inside the events folder. To let another planner save too, open it and share it with them as <strong>Editor</strong>.</p>`
      : '');
  }
  const again = '<button type="button" class="mini" data-act="checkaccess">Check again</button>';
  if (access.state === 'view-only') {
    return `<p class="db-warn">👀 View only: you can see everything, but saving needs <strong>Editor</strong> access to the shared ${linkTo(access.folder, appFolder)} folder. Ask ${who(access.owner)} to share it with you as Editor. ${again}</p>`;
  }
  return `<p class="db-warn">⏳ The shared ${appFolder} folder isn't set up yet. ${who(access.owner)} needs to sign in to the app once (it's created automatically), then share it with you as <strong>Editor</strong>. ${again}</p>`;
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
  } else if (!canReadDrive()) {
    html = `<span>Signed in as <strong>${esc(user.emailAddress || '')}</strong>, but Google didn't give the app permission to use your <strong>Google Drive files</strong>, so it can't see the SBE events folder.</span>
      <button type="button" class="primary" data-act="askagain">Ask for permission again</button>
      <p class="db-note">On Google's screen, tick the Google Drive box, then click Continue. The app only reads the event documents and only saves inside "SBE App Data".</p>
      <button type="button" class="mini" data-act="signout">Sign out</button>`;
  } else if (expired) {
    html = `<span>Your Google sign-in expired. Unsaved changes are kept in this browser.</span>
      <button type="button" class="primary" data-act="signin">Sign in again</button>`;
  } else if (!folder) {
    const pick = choices && choices.length
      ? `<span class="db-pick"><label for="sharedPick">Choose the SBE events folder</label>
          <select id="sharedPick">${choices.map(f => `<option value="${esc(f.id)}">${esc(f.name)}${f.mine ? '' : ' (shared with you)'}</option>`).join('')}</select>
          <button type="button" class="primary" data-act="useshared">Use this folder</button></span>`
      : `<p class="db-note">No folders found for ${esc(user.emailAddress || 'this account')} yet. If the SBE events folder belongs to someone else, ask them to share it with you, then click <strong>Check again</strong>. <button type="button" class="mini" data-act="checkshared">Check again</button></p>`;
    html = `<span>Signed in as <strong>${esc(user.emailAddress || '')}</strong>.</span>
      ${pick}
      <form class="db-find"><label for="folderQuery">${choices && choices.length ? 'Not listed? Search' : 'Or search'}</label>
        <input id="folderQuery" name="q" placeholder="Folder name or Google Drive link" required />
        <button type="submit">Find</button></form>
      ${results ? (results.length
        ? `<ul class="db-results">${results.map(f => `<li><button type="button" class="mini" data-act="choose" data-id="${esc(f.id)}" data-name="${esc(f.name)}" data-link="${esc(f.webViewLink || '')}">Use</button> ${esc(f.name)}</li>`).join('')}</ul>`
        : '<p class="db-note">No folders found. Try the start of a word in the name, or paste the folder link from Google Drive.</p>') : ''}
      <button type="button" class="mini" data-act="signout">Sign out</button>`;
  } else {
    html = `<span>Signed in as <strong>${esc(user.emailAddress || '')}</strong> · Events folder: ${linkTo(folder, esc(folder.name))} · ${eventCount} event${eventCount === 1 ? '' : 's'}</span>
      <span class="db-actions"><button type="button" class="mini" data-act="refresh">Refresh</button><button type="button" class="mini" data-act="change">Change folder</button><button type="button" class="mini" data-act="signout">Sign out</button></span>
      ${accessNote()}
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
  } else if (act === 'askagain') {
    const pending = signIn({ askAgain: true });
    run('Waiting for Google…', async () => { await pending; user = null; await afterSignIn(); });
  } else if (act === 'choose') {
    run('Opening folder…', () => chooseFolder({ id: b.dataset.id, name: b.dataset.name, link: b.dataset.link }));
  } else if (act === 'refresh') {
    run('Refreshing events…', async () => loadEvents(false, await setUpSharedData()));
  } else if (act === 'useshared') {
    const f = choices.find(x => x.id === $('sharedPick').value);
    if (f) run('Opening folder…', () => chooseFolder({ id: f.id, name: f.name, link: f.webViewLink || '' }));
  } else if (act === 'checkshared') {
    run('Looking for folders…', loadChoices);
  } else if (act === 'checkaccess') {
    run('Checking the shared folder…', async () => loadEvents(false, await setUpSharedData()));
  } else if (act === 'change') {
    folder = null; results = null; access = null;
    run('Looking for folders…', loadChoices);
  } else if (act === 'signout') {
    signOut(); forgetAppData();
    user = null; folder = null; access = null; results = null; choices = null; expired = false; skipped = []; eventCount = 0;
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
  if (!canReadDrive()) { setStatus('Google sign-in worked, but the permission to use Google Drive files was not given.'); return; }
  const settings = await readSettings();
  if (settings && settings.eventsFolderId) {
    folder = { id: settings.eventsFolderId, name: settings.eventsFolderName || 'SBE events', link: settings.eventsFolderLink || '' };
    await loadEvents(true, await setUpSharedData());
  } else {
    await loadChoices();
    onEvents([]); // updates the dropdown hint
    setStatus('Signed in. Choose the SBE events folder to see its events.');
  }
}

// Folders to pick from: shared with me, then my own top-level ones (for the events folder's owner).
async function loadChoices() {
  const [sharedList, mine] = await Promise.all([listSharedFolders(), listMyTopFolders()]);
  const seen = new Set();
  choices = [...sharedList.map(f => ({ ...f, mine: false })), ...mine.map(f => ({ ...f, mine: true }))]
    .filter(f => f.name !== APP_DATA_FOLDER && !seen.has(f.id) && seen.add(f.id));
}

async function chooseFolder(f) {
  folder = f; results = null;
  await writeSettings({ eventsFolderId: f.id, eventsFolderName: f.name, eventsFolderLink: f.link, chosen: new Date().toISOString() });
  await loadEvents(true, await setUpSharedData());
}

// Point saving at the shared folder, create it if this person owns the events folder, move over anything
// they saved before sharing existed, and bring templates in line. Returns how many items were moved.
async function setUpSharedData() {
  useEventsFolder(folder.id);
  access = await sharedAccess();
  if (access.state !== 'ready') return 0;
  const moved = await migratePersonalData();
  await syncTemplates();
  return moved;
}

async function loadEvents(openFirst, moved = 0) {
  const kids = (await listChildren(folder.id)).filter(k => k.mimeType === FOLDER_MIME && k.name !== APP_DATA_FOLDER);
  const events = sortEvents(kids.map(folderToEvent).filter(Boolean), todayISO());
  skipped = kids.filter(k => !folderToEvent(k)).map(k => k.name);
  eventCount = events.length;
  onEvents(events, openFirst);
  movedCount = moved;
  setStatus(events.length ? `Found ${events.length} events in "${folder.name}".` : `No event folders found in "${folder.name}". Event folders start with a date, like "6.12.27 Harper-Bennett Wedding".`);
}

// Saved templates are shared: merge the shared copy with this browser's (browser wins on the same name).
async function syncTemplates() {
  const remote = (await readData(TEMPLATES)) || [];
  const local = loadTemplates();
  const merged = [...remote.filter(r => !local.some(l => l.name === r.name)), ...local];
  saveTemplates(merged);
  if (JSON.stringify(merged) !== JSON.stringify(remote)) await writeData(TEMPLATES, merged);
}

export async function saveTemplatesToDrive(list) {
  if (!user || expired || !access || access.state !== 'ready') return false;
  await writeData(TEMPLATES, list);
  return true;
}
