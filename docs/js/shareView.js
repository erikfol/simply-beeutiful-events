// "Share online" panel in the timeline view: the event's online timeline links (copy, open, turn off) and
// making a new one for a person or vendor. The links themselves are kept up to date by saving the timeline.
import { state } from './state.js';
import { $, setStatus, needSignIn } from './dom.js';
import { isDriveEvent } from './events.js';
import { driveStatus } from './drivebar.js';
import { vendorRows } from './details.js';
import { PUBLIC_API_KEY } from './config.js';
import { SHARE_ROLES, audienceOf, stopCount, linkUrl, loadShares, createShareLink, turnOffShareLink, emptyShares } from './share.js';
import { esc } from './util.js';

let open = false;
let shares = emptyShares();
let shownFor = null;
let busy = false;
let confirmId = null;   // link waiting for "Turn off?" confirmation
let copied = null;      // link whose address was just copied
let draft = { role: '', label: '' };

const when = (isoString) => {
  const d = new Date(isoString || '');
  return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const me = () => { const u = driveStatus().user || {}; return u.displayName || u.emailAddress || ''; };

export function isShareOpen() { return open; }

export async function toggleShare() {
  open = !open;
  if (!open) { $('sharePanel').hidden = true; return; }
  await loadAndRender();
}

// The timeline view was redrawn for a (maybe different) event: keep the panel in step.
export function syncShare() {
  if (!open) return;
  if (shownFor !== state.currentMeta) loadAndRender();
  else render();
}

async function loadAndRender() {
  const meta = state.currentMeta;
  const fresh = shownFor !== meta;
  if (fresh) { shownFor = meta; shares = emptyShares(); confirmId = null; copied = null; draft = { role: '', label: '' }; }
  render({ reset: fresh });
  if (!meta || !isDriveEvent(meta)) return;
  try {
    const s = await loadShares(meta.driveId);
    if (state.currentMeta !== meta) return;
    shares = s;
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Couldn't load the online links: ${e.message}`);
  }
  render();
}

function readDraft() {
  const role = $('shareRole'), label = $('shareLabel');
  if (role) draft = { role: role.value, label: label ? label.value : '' };
}

function linkRow(l, canSave) {
  const url = linkUrl(location.href, l.id);
  const id = esc(l.id);
  const who = l.label ? `<strong>${esc(l.label)}</strong> <small>(${esc(audienceOf(l.role))} view)</small>` : `<strong>${esc(audienceOf(l.role))}</strong>`;
  const acts = confirmId === l.id
    ? `<span class="todo-confirm">Turn this link off? Anyone who has it won't be able to open it.</span><button type="button" class="mini danger" data-act="shareoff" data-id="${id}"${busy ? ' disabled' : ''}>Turn off</button><button type="button" class="mini" data-act="sharekeep">Keep</button>`
    : `<button type="button" class="mini" data-act="sharecopy" data-id="${id}">${copied === l.id ? 'Copied' : 'Copy link'}</button><a class="mini-link" href="${esc(url)}" target="_blank" rel="noopener">Open</a>${canSave ? `<button type="button" class="mini" data-act="shareask" data-id="${id}">Turn off</button>` : ''}`;
  return `<li class="share-link">
      <div>${who}<small class="share-when">${l.updated ? `Updated ${esc(when(l.updated))}` : ''}${l.createdBy ? ` · made by ${esc(l.createdBy)}` : ''}</small></div>
      <input class="share-url" readonly value="${esc(url)}" aria-label="Link for ${esc(l.label || audienceOf(l.role))}" data-url="${id}" />
      <div class="todo-acts">${acts}</div>
    </li>`;
}

// reset: start the new-link form fresh; otherwise keep what's typed in it.
function render({ reset = false } = {}) {
  const panel = $('sharePanel');
  if (!open) { panel.hidden = true; return; }
  if (!reset) readDraft();
  panel.hidden = false;
  const meta = state.currentMeta;
  const canSave = driveStatus().canSave;
  let html = `<div class="share-head"><h3>Online links</h3><button type="button" class="mini" data-act="shareclose">Close</button></div>
    <p class="hint">Each link opens one person's or vendor's part of this timeline on a simple SBE page, the same as <strong>View as</strong>. Saving the timeline updates every link. Anyone who has a link can open it, so send each one only to that person, and turn links off after the event.</p>`;
  if (!meta || !isDriveEvent(meta)) { panel.innerHTML = `${html}<p class="empty">Online links are for events from Google Drive.</p>`; return; }
  if (!PUBLIC_API_KEY) {
    panel.innerHTML = `${html}<p class="db-warn">Online links need a one-time setup first: a public API key from Google Cloud (see <em>Online timeline links</em> in GOOGLE_SETUP.md).</p>`;
    return;
  }
  html += shares.links.length
    ? `<ul class="share-list">${shares.links.map(l => linkRow(l, canSave)).join('')}</ul>`
    : '<p class="hint">No links for this event yet.</p>';

  if (!canSave) {
    html += '<p class="db-warn">View only: making links needs <strong>Editor</strong> access to the shared “SBE App Data” folder.</p>';
  } else if (!state.currentCurated || !state.currentCurated.days.length) {
    html += '<p class="hint">Make the timeline first (Generate draft or Add day), then share it.</p>';
  } else if (state.isDirty) {
    html += '<p class="db-warn">Save the timeline first, so new links start from the saved version.</p>';
  } else {
    const names = state.currentReport ? vendorRows(state.currentReport).map(r => r.vendor) : [];
    const n = stopCount(state.currentCurated, draft.role);
    html += `<form id="shareForm" class="share-new">
        <label for="shareRole">New link for <select id="shareRole">${SHARE_ROLES.map(([k, l]) => `<option value="${esc(k)}"${k === draft.role ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label for="shareLabel">Name on the page <input id="shareLabel" value="${esc(draft.label)}" list="shareNames" placeholder="e.g. Juniper Lane Photography" autocomplete="off" />
          <datalist id="shareNames">${names.map(v => `<option value="${esc(v)}"></option>`).join('')}</datalist></label>
        <button type="submit" class="primary"${busy || !n ? ' disabled' : ''}>${busy ? 'Making the link…' : 'Make link'}</button>
        <span class="hint">${n ? `They'll see ${n} stop${n === 1 ? '' : 's'}.` : 'No stops on the timeline involve them yet.'}</span>
      </form>`;
  }
  panel.innerHTML = html;
}

export async function onShareClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  const meta = state.currentMeta;
  if (act === 'shareclose') { open = false; render(); }
  else if (act === 'shareask') { confirmId = id; render(); }
  else if (act === 'sharekeep') { confirmId = null; render(); }
  else if (act === 'sharecopy') {
    const url = linkUrl(location.href, id);
    try { await navigator.clipboard.writeText(url); copied = id; setStatus('Link copied. Paste it into a text or email to that person.'); }
    catch { const box = $('sharePanel').querySelector(`[data-url="${CSS.escape(id)}"]`); if (box) { box.focus(); box.select(); } setStatus('Copy the selected link (Ctrl+C).'); }
    render();
  } else if (act === 'shareoff' && meta) {
    busy = true; render();
    try {
      await turnOffShareLink(meta, id);
      if (state.currentMeta !== meta) return;
      shares = { ...shares, links: shares.links.filter(l => l.id !== id) };
      setStatus('Link turned off.');
    } catch (e) {
      if (e.name === 'NeedsSignIn') needSignIn();
      setStatus(`Couldn't turn the link off: ${e.message}`);
    } finally { busy = false; confirmId = null; render(); }
  }
}

export function onShareChange(ev) {
  if (ev.target.id === 'shareRole') render(); // updates "They'll see N stops"
}

export async function onShareSubmit(ev) {
  ev.preventDefault();
  const meta = state.currentMeta;
  if (busy || !meta || !state.currentCurated) return;
  readDraft();
  const { role, label } = draft;
  let made = false;
  busy = true; render();
  setStatus('Making the link…');
  try {
    const link = await createShareLink({ meta, curated: state.currentCurated, role, label, by: me() });
    if (state.currentMeta !== meta) return;
    shares = { ...shares, links: [...shares.links, link] };
    draft = { role: '', label: '' };
    made = true;
    setStatus(`Link made for ${label.trim() || audienceOf(role)}. Copy it and send it to them.`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Couldn't make the link: ${e.message}`);
  } finally { busy = false; render({ reset: made }); }
}
