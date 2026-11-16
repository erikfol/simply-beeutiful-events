// Vendors page entry point: SBE's shared vendor and contact book. Add, edit and delete vendors, search them,
// and see whose insurance needs renewing. Needs Google sign-in; kept in "SBE App Data" (see vendors.js).
import { $, setStatus, needSignIn } from './dom.js';
import { isConfigured } from './google.js';
import { initDriveBar, driveStatus } from './drivebar.js';
import {
  emptyBook, loadBook, changeBook, upsertVendor, removeVendor, newVendorId, checkVendor, insuranceState,
  categoryChoices, filterVendors, groupVendors, cleanEmails, cleanPhones, INSURANCE_WARN_DAYS,
} from './vendors.js';
import { esc, fmtDate, todayISO } from './util.js';

let book = emptyBook();
let loaded = false;
let saving = false;
let filter = { text: '', category: '' };
let form = null;       // the open add/edit form: {id, isNew, values}
let problems = [];     // why the last Save didn't go through
let confirmId = null;  // vendor waiting for "Delete?" confirmation
let jumped = false;    // scrolled to the vendor named in the address (#v-...) once

const me = () => { const u = driveStatus().user; return (u && (u.displayName || u.emailAddress)) || ''; };
const find = (id) => book.vendors.find(v => v.id === id);
const httpLink = (url, text) => (/^https?:\/\//i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>` : esc(text));
const stars = (n) => (n ? `<span class="vendor-stars" title="Rated ${n} of 5" aria-label="Rated ${n} of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>` : '');

// ---------- rendering ----------

function message() {
  const s = driveStatus();
  if (!isConfigured()) return 'Google sign-in is not set up for this copy of the app.';
  if (!s.signedIn && !loaded) return 'Sign in with Google to see the vendor book. It\'s kept privately in the shared "SBE App Data" folder.';
  if (!s.folder) return 'Choose the SBE events folder above. The vendor book is kept in its "SBE App Data" folder.';
  if (s.access && s.access.state === 'waiting') return 'The shared "SBE App Data" folder isn\'t set up yet (see the note above).';
  if (!loaded) return 'Loading the vendor book…';
  return '';
}

function insuranceBadge(v, today) {
  const ins = insuranceState(v, today);
  if (!ins) return '';
  const date = esc(fmtDate(v.insuranceExpires));
  if (ins.state === 'expired') return `<span class="pill st-due">Insurance ended ${date}</span>`;
  if (ins.state === 'soon') return `<span class="pill st-partial">Insurance ends ${date} (${ins.days === 0 ? 'today' : `in ${ins.days} day${ins.days === 1 ? '' : 's'}`})</span>`;
  return `<span class="pill st-paid">Insured until ${date}</span>`;
}

function card(v, canSave, today) {
  if (form && form.id === v.id) return formHtml();
  const id = esc(v.id);
  const lines = [
    ...v.emails.map(e => `<li><span aria-hidden="true">✉</span> <a href="mailto:${esc(e)}">${esc(e)}</a></li>`),
    ...v.phones.map(p => `<li><span aria-hidden="true">☎</span> <a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a></li>`),
    v.website ? `<li><span aria-hidden="true">🌐</span> ${httpLink(v.website, v.website.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''))}</li>` : '',
  ].filter(Boolean).join('');
  const events = v.events.map(e => `<a href="events.html?event=${encodeURIComponent(`drive-${e.driveId}`)}">${esc(e.name)}</a>${e.date ? ` <small>(${esc(fmtDate(e.date))})</small>` : ''}`).join(', ');
  let acts = '';
  if (canSave) {
    acts = confirmId === v.id
      ? `<span class="todo-confirm">Delete ${esc(v.name)} from the vendor book?</span><button type="button" class="mini danger" data-act="delete" data-id="${id}">Delete</button><button type="button" class="mini" data-act="keep">Keep</button>`
      : `<button type="button" class="mini" data-act="edit" data-id="${id}">Edit</button><button type="button" class="mini" data-act="askdelete" data-id="${id}">Delete</button>`;
  }
  return `<article class="vendor-card" id="v-${id}">
    <div class="vendor-top"><h4>${esc(v.name)}</h4>${stars(v.rating)}</div>
    ${v.contact ? `<p class="vendor-contact">${esc(v.contact)}</p>` : ''}
    ${lines ? `<ul class="vendor-lines">${lines}</ul>` : ''}
    ${insuranceBadge(v, today)}
    ${v.notes ? `<p class="vendor-notes">${esc(v.notes)}</p>` : ''}
    ${events ? `<p class="vendor-events"><span>Events:</span> ${events}</p>` : ''}
    ${acts ? `<div class="todo-acts">${acts}</div>` : ''}
  </article>`;
}

function formHtml() {
  const v = form.values;
  const field = (key, label, attrs = '') => `<label for="vf-${key}">${label}<input id="vf-${key}" name="${key}" value="${esc(v[key] || '')}" ${attrs} /></label>`;
  return `<form id="vendorForm" class="detailsform vendorform${form.isNew ? ' vendorform-new' : ''}">
      <h4 class="wide">${form.isNew ? 'New vendor' : `Edit ${esc(form.name || 'vendor')}`}</h4>
      ${field('name', 'Name', 'required autocomplete="off" maxlength="200"')}
      <label for="vf-category">Category<input id="vf-category" name="category" value="${esc(v.category || '')}" list="vf-categories" autocomplete="off" />
        <datalist id="vf-categories">${categoryChoices(book.vendors).map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
      ${field('contact', 'Contact person', 'autocomplete="off"')}
      ${field('emails', 'Email', 'autocomplete="off" placeholder="Several? Separate with commas"')}
      ${field('phones', 'Phone', 'autocomplete="off" placeholder="Several? Separate with commas"')}
      ${field('website', 'Website', 'autocomplete="off" placeholder="example.com"')}
      <label for="vf-insuranceExpires">Insurance ends<input id="vf-insuranceExpires" name="insuranceExpires" type="date" value="${esc(v.insuranceExpires || '')}" /></label>
      <label for="vf-rating">Rating<select id="vf-rating" name="rating">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}"${String(n) === String(v.rating || 0) ? ' selected' : ''}>${n ? `${'★'.repeat(n)} ${n}` : 'Not rated'}</option>`).join('')}</select></label>
      <label class="wide" for="vf-notes">Notes<textarea id="vf-notes" name="notes" rows="3" placeholder="e.g. Great with timelines; needs a 2-hour setup window">${esc(v.notes || '')}</textarea></label>
      ${problems.length ? `<p class="db-warn wide">${problems.map(esc).join(' ')}</p>` : ''}
      <div class="wide"><button type="submit" class="primary"${saving ? ' disabled' : ''}>${saving ? 'Saving…' : 'Save vendor'}</button>
        <button type="button" class="mini" data-act="cancel">Cancel</button></div>
    </form>`;
}

function readForm() {
  const f = $('vendorForm');
  if (!f) return null;
  const v = (name) => (f.elements[name] ? f.elements[name].value : '');
  return { name: v('name'), category: v('category'), contact: v('contact'), emails: v('emails'), phones: v('phones'), website: v('website'), insuranceExpires: v('insuranceExpires'), rating: v('rating'), notes: v('notes') };
}

function render() {
  if (form) { const typed = readForm(); if (typed) form.values = typed; }
  const msg = message();
  const canSave = driveStatus().canSave;
  $('vendorTools').hidden = !!msg;
  $('vendorAdd').hidden = !canSave;
  if (msg) { $('vendorList').innerHTML = `<p class="empty">${esc(msg)}</p>`; $('vendorCount').textContent = ''; return; }

  const cats = groupVendors(book.vendors).map(g => g.category).filter(Boolean); // only categories in use
  $('vendorCategory').innerHTML = `<option value="">All categories</option>${cats.map(c => `<option${c.toLowerCase() === filter.category.toLowerCase() ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;

  const today = todayISO();
  const shown = filterVendors(book.vendors, filter);
  $('vendorCount').textContent = filter.text.trim() || filter.category
    ? `${shown.length} of ${book.vendors.length} match`
    : `${book.vendors.length} vendor${book.vendors.length === 1 ? '' : 's'}`;

  let html = '';
  const due = book.vendors.map(v => ({ v, ins: insuranceState(v, today) })).filter(x => x.ins && x.ins.state !== 'ok');
  if (due.length) {
    const names = (state) => due.filter(x => x.ins.state === state).map(x => `<a href="#v-${esc(x.v.id)}">${esc(x.v.name)}</a>`).join(', ');
    const expired = names('expired'), soon = names('soon');
    html += `<p class="db-warn">⚠️ Insurance to renew: ${[expired && `ended for ${expired}`, soon && `ends within ${INSURANCE_WARN_DAYS} days for ${soon}`].filter(Boolean).join('; ')}. Ask them for a new certificate.</p>`;
  }
  if (form && form.isNew) html += formHtml();
  if (!book.vendors.length) {
    html += `<p class="empty">No vendors yet.${canSave ? ' Click <strong>+ Add vendor</strong>, or open an event in the Event Manager and use <strong>Add all to the vendor book</strong> under its vendors.' : ''}</p>`;
  } else if (!shown.length) {
    html += '<p class="empty">No vendors match.</p>';
  } else {
    html += groupVendors(shown).map(g => `<h3 class="todo-head">${esc(g.category || 'No category')} <small>${g.vendors.length}</small></h3>
      <div class="vendor-grid">${g.vendors.map(v => card(v, canSave, today)).join('')}</div>`).join('');
  }
  $('vendorList').innerHTML = html;

  if (!jumped && location.hash.startsWith('#v-')) {
    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (el) { jumped = true; el.scrollIntoView({ block: 'center' }); el.classList.add('vendor-flash'); }
  }
}

// ---------- saving ----------

async function save(change, done) {
  saving = true; render();
  setStatus('Saving the vendor book…');
  try {
    book = await changeBook(change);
    form = null; problems = []; confirmId = null;
    setStatus(done);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Not saved. ${e.message}`);
  } finally {
    saving = false; render();
  }
}

async function reload() {
  const s = driveStatus();
  if (!s.signedIn || !s.folder || !s.access || s.access.state === 'waiting') {
    if (!s.signedIn && !s.folder) { book = emptyBook(); loaded = false; }
    render();
    return;
  }
  if (saving) return;
  loaded = false; render();
  try {
    book = await loadBook();
    loaded = true;
    setStatus(`Vendor book: ${book.vendors.length} vendor${book.vendors.length === 1 ? '' : 's'}.`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  }
  render();
}

// ---------- actions ----------

function onSubmit(ev) {
  ev.preventDefault();
  if (!form || saving) return;
  const values = readForm();
  form.values = values;
  problems = checkVendor({ ...values, emails: cleanEmails(values.emails) });
  if (problems.length) { render(); return; }
  const id = form.id, isNew = form.isNew, at = new Date().toISOString(), by = me();
  const vendor = { ...values, id, emails: cleanEmails(values.emails), phones: cleanPhones(values.phones) };
  save(b => upsertVendor(b, vendor, at, by), isNew ? `Added ${values.name.trim()} to the vendor book.` : `Saved ${values.name.trim()}.`);
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  const v = id && find(id);
  if (act === 'edit' && v) {
    form = { id: v.id, isNew: false, name: v.name, values: { ...v, emails: v.emails.join(', '), phones: v.phones.join(', ') } };
    problems = []; confirmId = null; render();
    const box = $('vf-name'); if (box) box.focus();
  } else if (act === 'cancel') {
    form = null; problems = []; render();
  } else if (act === 'askdelete' && v) {
    confirmId = v.id; render();
  } else if (act === 'keep') {
    confirmId = null; render();
  } else if (act === 'delete' && v) {
    save(bk => removeVendor(bk, v.id), `Deleted ${v.name} from the vendor book.`);
  }
}

function init() {
  render();
  $('vendorAdd').addEventListener('click', () => {
    form = { id: newVendorId(), isNew: true, name: '', values: {} };
    problems = []; render();
    const box = $('vf-name'); if (box) box.focus();
  });
  $('vendorSearch').addEventListener('input', (e) => { filter.text = e.target.value; render(); });
  $('vendorCategory').addEventListener('change', (e) => { filter.category = e.target.value; render(); });
  const el = $('vendorList');
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  // The Google bar calls this after sign-in, choosing a folder, Refresh and sign-out.
  initDriveBar(() => reload());
}

init();
