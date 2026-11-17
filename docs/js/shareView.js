// "Share online" panel in the timeline view: the event's online timeline links (copy, open, turn off) and
// making a new one for a person or vendor. The links themselves are kept up to date by saving the timeline.
import { state } from './state.js';
import { $, setStatus, needSignIn } from './dom.js';
import { isDriveEvent } from './events.js';
import { driveStatus } from './drivebar.js';
import { vendorRows, sameVendor } from './details.js';
import { loadBook, matchVendor } from './vendors.js';
import { PUBLIC_API_KEY } from './config.js';
import {
  SHARE_ROLES, audienceOf, stopCount, linkUrl, loadShares, createShareLink, turnOffShareLink, emptyShares,
  emailDraft, parseRecipients, gmailComposeUrl, mailtoUrl, markEmailed,
} from './share.js';
import { esc, fmtDate } from './util.js';

let open = false;
let shares = emptyShares();
let shownFor = null;
let busy = false;
let confirmId = null;   // link waiting for "Turn off?" confirmation
let copied = null;      // link whose address was just copied
let draft = { role: '', label: '' };
let emailFor = null;    // link whose email form is open
let mail = null;        // that email: {to, subject, body}, kept while it's being changed
let mailProblem = '';
let book = null;        // the vendor book, to fill in a vendor's email address

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
  if (fresh) { shownFor = meta; shares = emptyShares(); confirmId = null; copied = null; draft = { role: '', label: '' }; emailFor = null; mail = null; }
  render({ reset: fresh });
  if (!meta || !isDriveEvent(meta)) return;
  if (!book) loadBook().then(b => { book = b; }).catch(() => {}); // only used to fill in email addresses
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
    : `<button type="button" class="mini" data-act="sharecopy" data-id="${id}">${copied === l.id ? 'Copied' : 'Copy link'}</button><a class="mini-link" href="${esc(url)}" target="_blank" rel="noopener">Open</a><button type="button" class="mini" data-act="shareemail" data-id="${id}" aria-expanded="${emailFor === l.id}">Email</button>${canSave ? `<button type="button" class="mini" data-act="shareask" data-id="${id}">Turn off</button>` : ''}`;
  const emailed = l.emailedAt ? `<br>Email opened ${esc(when(l.emailedAt))}${l.emailedTo ? ` for ${esc(l.emailedTo)}` : ''}${l.emailedBy ? ` by ${esc(l.emailedBy)}` : ''}` : '';
  return `<li class="share-link">
      <div>${who}<small class="share-when">${l.updated ? `Updated ${esc(when(l.updated))}` : ''}${l.createdBy ? ` · made by ${esc(l.createdBy)}` : ''}${emailed}</small></div>
      <input class="share-url" readonly value="${esc(url)}" aria-label="Link for ${esc(l.label || audienceOf(l.role))}" data-url="${id}" />
      <div class="todo-acts">${acts}</div>
      ${emailFor === l.id && mail ? mailForm(l) : ''}
    </li>`;
}

// ---------- emailing a link ----------

// Who to send a link to: the vendor's email from this event's documents, else from the vendor book.
function recipientsFor(l) {
  if (!l.label) return [];
  const row = state.currentReport && vendorRows(state.currentReport).find(r => sameVendor(r.vendor, l.label));
  if (row && row.emails.length) return row.emails;
  const v = book && matchVendor(book.vendors, l.label, []);
  return v ? v.emails : [];
}

function startEmail(l) {
  const meta = state.currentMeta;
  const u = driveStatus().user || {};
  const { subject, body } = emailDraft({
    url: linkUrl(location.href, l.id), meta, label: l.label, sender: u.displayName || '',
    dateText: meta.weddingDate ? fmtDate(meta.weddingDate) : '',
  });
  emailFor = l.id;
  mail = { to: recipientsFor(l).join(', '), subject, body };
  mailProblem = '';
}

function mailUrls() {
  const to = parseRecipients(mail.to) || [];
  const account = (driveStatus().user || {}).emailAddress || '';
  return {
    gmail: gmailComposeUrl({ to, subject: mail.subject, body: mail.body, account }),
    other: mailtoUrl({ to, subject: mail.subject, body: mail.body }),
  };
}

function mailForm(l) {
  const id = esc(l.id);
  const { gmail, other } = mailUrls();
  const account = (driveStatus().user || {}).emailAddress || '';
  return `<div class="share-mail">
      <label for="mailTo">To<input id="mailTo" data-mail="to" value="${esc(mail.to)}" placeholder="name@example.com (several? separate with commas)" autocomplete="off" /></label>
      <label for="mailSubject">Subject<input id="mailSubject" data-mail="subject" value="${esc(mail.subject)}" autocomplete="off" /></label>
      <label for="mailBody">Message<textarea id="mailBody" data-mail="body" rows="10">${esc(mail.body)}</textarea></label>
      ${mailProblem ? `<p class="db-warn">${esc(mailProblem)}</p>` : ''}
      <div class="todo-acts">
        <a class="share-gmail" id="mailGmail" data-act="mailgmail" data-id="${id}" href="${esc(gmail)}" target="_blank" rel="noopener">Open in Gmail</a>
        <a class="mini-link" id="mailOther" data-act="mailother" data-id="${id}" href="${esc(other)}">Other email app</a>
        <button type="button" class="mini" data-act="mailcopy">Copy message</button>
        <button type="button" class="mini" data-act="mailcancel">Cancel</button>
      </div>
      <p class="hint">Gmail opens a new message with all of this filled in${account ? `, in the Gmail account ${esc(account)}` : ''}. Check it, then click Send there. Nothing is sent from this page.</p>
    </div>`;
}

// Typing in the email form: keep it, and keep the Gmail and email app links in step (without redrawing).
export function onShareInput(ev) {
  const key = ev.target.dataset && ev.target.dataset.mail;
  if (!key || !mail) return;
  mail = { ...mail, [key]: ev.target.value };
  mailProblem = '';
  const { gmail, other } = mailUrls();
  const g = $('mailGmail'), o = $('mailOther');
  if (g) g.href = gmail;
  if (o) o.href = other;
}

// Opening the email: check the addresses first, then note on the link who it was emailed to.
function onMailOpen(ev, a) {
  const to = parseRecipients(mail.to);
  if (!to) {
    ev.preventDefault();
    mailProblem = 'Check the email address in "To" (several? separate them with commas).';
    render();
    return;
  }
  const { gmail, other } = mailUrls();
  a.href = a.dataset.act === 'mailgmail' ? gmail : other;
  const meta = state.currentMeta;
  const id = a.dataset.id;
  const by = me();
  const now = new Date().toISOString();
  setStatus(a.dataset.act === 'mailgmail'
    ? 'Gmail opened with the message. Check it and click Send there.'
    : 'Your email app opened with the message. Check it and send it there.');
  shares = { ...shares, links: shares.links.map(l => (l.id === id ? { ...l, emailedTo: to.join(', '), emailedAt: now, emailedBy: by } : l)) };
  emailFor = null; mail = null;
  setTimeout(render, 0); // after the browser has followed the link
  markEmailed(meta, id, to, by, now).catch(e => { if (e.name === 'NeedsSignIn') needSignIn(); });
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
  const a = ev.target.closest('a[data-act]');
  if (a && mail) { onMailOpen(ev, a); return; }
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  const meta = state.currentMeta;
  if (act === 'shareclose') { open = false; render(); }
  else if (act === 'shareemail') {
    const l = shares.links.find(x => x.id === id);
    if (emailFor === id) { emailFor = null; mail = null; } else if (l) startEmail(l);
    render();
    const box = $('mailTo'); if (box && !box.value) box.focus();
  } else if (act === 'mailcancel') {
    emailFor = null; mail = null; render();
  } else if (act === 'mailcopy' && mail) {
    const text = `${mail.subject}\n\n${mail.body}`;
    try { await navigator.clipboard.writeText(text); setStatus('Message copied. Paste it into your email.'); }
    catch { const box = $('mailBody'); if (box) { box.focus(); box.select(); } setStatus('Copy the selected message (Ctrl+C).'); }
  }
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
