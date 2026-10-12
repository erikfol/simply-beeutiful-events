// Inventory page entry point: list SBE's supplies with photos, and add, edit or delete items.
// Needs Google sign-in; everything is kept in the shared "SBE App Data" folder (see inventory.js).
import { $, setStatus, needSignIn } from './dom.js';
import { isConfigured } from './google.js';
import { initDriveBar, driveStatus } from './drivebar.js';
import {
  emptyInventory, loadInventory, changeInventory, upsertItem, removeItem, newItemId, checkItem,
  categoryChoices, subcategoryChoices, filterItems, groupByCategory, uploadPhoto, deletePhoto, photoBlob,
} from './inventory.js';
import { esc } from './util.js';

let inv = emptyInventory();
let loaded = false;
let busy = false;
let filter = { text: '', category: '' };
let form = null;       // the open add/edit form: {id, isNew, photoId, newPhoto: Blob|null, removePhoto}
let confirmId = null;  // item waiting for "Delete?" confirmation
const photoUrls = new Map(); // Drive photo id -> Promise<object URL>
let observer = null;

// ---------- photos ----------

// Phone photos are several MB; shrink to at most 1600 px on the long side as a JPEG before uploading.
async function shrinkPhoto(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { throw new Error('This photo type can\'t be opened here. Try a JPG or PNG photo.'); }
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not prepare the photo. Try another one.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

function photoUrl(id) {
  if (!photoUrls.has(id)) {
    const p = photoBlob(id).then(b => URL.createObjectURL(b));
    p.catch(() => photoUrls.delete(id)); // try again on the next render
    photoUrls.set(id, p);
  }
  return photoUrls.get(id);
}

async function showPhoto(el) {
  const id = el.dataset.photo;
  try {
    const url = await photoUrl(id);
    if (el.dataset.photo === id) el.innerHTML = `<img src="${esc(url)}" alt="${esc(el.dataset.alt)}" />`;
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    el.innerHTML = '<span class="inv-nophoto">Photo unavailable</span>';
  }
}

// Load photos as they scroll into view, so a long list doesn't download every photo at once.
function watchPhotos(root) {
  const els = root.querySelectorAll('[data-photo]:not([data-shown])');
  if (!observer && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); showPhoto(e.target); }
    }, { rootMargin: '300px' });
  }
  for (const el of els) {
    el.dataset.shown = '1';
    if (observer) observer.observe(el); else showPhoto(el);
  }
}

// ---------- rendering ----------

function message() {
  const s = driveStatus();
  if (!isConfigured()) return 'Google sign-in is not set up for this copy of the app.';
  if (!s.signedIn && !loaded) return 'Sign in with Google to see the inventory. It\'s kept privately in the shared "SBE App Data" folder.';
  if (!s.folder) return 'Choose the SBE events folder above. The inventory is kept in its "SBE App Data" folder.';
  if (s.access && s.access.state === 'waiting') return 'The shared "SBE App Data" folder isn\'t set up yet (see the note above).';
  if (!loaded) return 'Loading the inventory…';
  return '';
}

function render() {
  const msg = message();
  const canSave = driveStatus().canSave;
  $('invTools').hidden = !!msg;
  $('btnAddItem').disabled = !canSave || busy;
  const cats = categoryChoices(inv.items).filter(c => inv.items.some(i => i.category.toLowerCase() === c.toLowerCase()));
  const sel = $('invCategory');
  sel.innerHTML = `<option value="">All categories</option>${cats.map(c => `<option${c.toLowerCase() === filter.category.toLowerCase() ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
  renderPanel();
  if (msg) { $('invList').innerHTML = `<p class="empty">${esc(msg)}</p>`; $('invCount').textContent = ''; return; }

  const shown = filterItems(inv.items, filter);
  $('invCount').textContent = shown.length === inv.items.length ? `${inv.items.length} item${inv.items.length === 1 ? '' : 's'}` : `${shown.length} of ${inv.items.length} items`;
  if (!inv.items.length) {
    $('invList').innerHTML = `<p class="empty">No items yet.${canSave ? ' Click <strong>Add item</strong> to start the inventory.' : ''}</p>`;
    return;
  }
  if (!shown.length) { $('invList').innerHTML = '<p class="empty">No items match.</p>'; return; }
  $('invList').innerHTML = groupByCategory(shown).map(g => `
    <h3 class="inv-cat">${g.category ? esc(g.category) : '<span class="muted">No category</span>'} <small>${g.items.length}</small></h3>
    <div class="inv-grid">${g.items.map(i => itemCard(i, canSave)).join('')}</div>`).join('');
  watchPhotos($('invList'));
}

function itemCard(i, canSave) {
  const photo = i.photoId
    ? `<button type="button" class="inv-photo" data-act="zoom" data-id="${esc(i.id)}" data-photo="${esc(i.photoId)}" data-alt="${esc(i.name)}" aria-label="Show a larger photo of ${esc(i.name)}"><span class="inv-nophoto">Loading photo…</span></button>`
    : '<div class="inv-photo"><span class="inv-nophoto">No photo</span></div>';
  const acts = !canSave ? '' : confirmId === i.id
    ? `<span class="inv-confirm">Delete this item?</span><button type="button" class="mini danger" data-act="delete" data-id="${esc(i.id)}">Delete</button><button type="button" class="mini" data-act="keep">Keep</button>`
    : `<button type="button" class="mini" data-act="edit" data-id="${esc(i.id)}">Edit</button><button type="button" class="mini" data-act="askdelete" data-id="${esc(i.id)}">Delete</button>`;
  return `<article class="inv-item">${photo}
    <div class="inv-body"><strong>${esc(i.name)}</strong>${i.subcategory ? `<small>${esc(i.subcategory)}</small>` : ''}</div>
    ${acts ? `<div class="inv-acts">${acts}</div>` : ''}</article>`;
}

function renderPanel() {
  const panel = $('invPanel');
  if (!form) { panel.hidden = true; panel.innerHTML = ''; return; }
  if (panel.dataset.formId === form.id && !panel.hidden) return; // keep what's being typed
  const item = inv.items.find(i => i.id === form.id) || { name: '', category: '', subcategory: '' };
  panel.dataset.formId = form.id;
  panel.hidden = false;
  panel.innerHTML = `<form id="invForm" novalidate>
    <div class="panel-head"><h3>${form.isNew ? 'Add an item' : 'Edit item'}</h3><button type="button" class="mini" data-act="cancel">Close</button></div>
    <div class="fgrid">
      <label class="f">Name <input name="name" value="${esc(item.name)}" required autocomplete="off" placeholder="e.g. Gold mercury glass votive" /></label>
      <label class="f">Category <input name="category" value="${esc(item.category)}" list="invCatList" autocomplete="off" placeholder="e.g. Candles & votives" /></label>
      <label class="f">Subcategory <input name="subcategory" value="${esc(item.subcategory)}" list="invSubList" autocomplete="off" placeholder="e.g. Votive holders" /></label>
    </div>
    <datalist id="invCatList">${categoryChoices(inv.items).map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    <datalist id="invSubList"></datalist>
    <div class="inv-photoedit">
      <div class="inv-photo" id="invPreview"></div>
      <div class="panel-actions">
        <label class="btn inv-pick">Choose photo<input type="file" name="photo" accept="image/*" hidden /></label>
        <button type="button" class="mini" data-act="removephoto">Remove photo</button>
      </div>
    </div>
    <p class="panel-error" id="invError" hidden></p>
    <div class="panel-actions"><button type="submit" class="primary">${form.isNew ? 'Add item' : 'Save changes'}</button><button type="button" data-act="cancel">Cancel</button></div>
  </form>`;
  updateSubList();
  renderPreview();
}

function updateSubList() {
  const f = $('invForm');
  if (f) $('invSubList').innerHTML = subcategoryChoices(inv.items, f.elements.category.value).map(s => `<option value="${esc(s)}"></option>`).join('');
}

let previewUrl = null;
function renderPreview() {
  const el = $('invPreview');
  if (!el) return;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  el.removeAttribute('data-shown');
  el.removeAttribute('data-photo');
  if (form.newPhoto) {
    previewUrl = URL.createObjectURL(form.newPhoto);
    el.innerHTML = `<img src="${esc(previewUrl)}" alt="New photo" />`;
  } else if (form.photoId && !form.removePhoto) {
    el.dataset.photo = form.photoId; el.dataset.alt = 'Current photo';
    el.innerHTML = '<span class="inv-nophoto">Loading photo…</span>';
    showPhoto(el);
  } else {
    el.innerHTML = '<span class="inv-nophoto">No photo</span>';
  }
  const removeBtn = $('invPanel').querySelector('[data-act="removephoto"]');
  if (removeBtn) removeBtn.hidden = !form.newPhoto && (!form.photoId || form.removePhoto);
}

function showError(msg) {
  const el = $('invError');
  if (el) { el.textContent = msg; el.hidden = !msg; }
}

// ---------- actions ----------

async function reload() {
  const s = driveStatus();
  if (!s.signedIn || !s.folder || !s.access || s.access.state === 'waiting') {
    if (!s.signedIn && !s.folder) { inv = emptyInventory(); loaded = false; form = null; }
    render();
    return;
  }
  loaded = false; render();
  try {
    inv = await loadInventory();
    loaded = true;
    setStatus(`Inventory: ${inv.items.length} item${inv.items.length === 1 ? '' : 's'}.`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  }
  render();
}

function openForm(id) {
  const item = id && inv.items.find(i => i.id === id);
  form = item
    ? { id: item.id, isNew: false, photoId: item.photoId, newPhoto: null, removePhoto: false }
    : { id: newItemId(), isNew: true, photoId: null, newPhoto: null, removePhoto: false };
  confirmId = null;
  $('invPanel').dataset.formId = '';
  render();
  $('invPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('invForm').elements.name.focus({ preventScroll: true });
}

function closeForm() {
  form = null;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  render();
}

async function saveForm(f) {
  const fields = { id: form.id, name: f.elements.name.value, category: f.elements.category.value, subcategory: f.elements.subcategory.value };
  const problems = checkItem(fields);
  if (problems.length) { showError(problems.join(' ')); f.elements.name.focus(); return; }
  const submit = f.querySelector('button[type="submit"]');
  busy = true; submit.disabled = true; showError('');
  if (form.photoPending) { setStatus('Preparing the photo…'); await form.photoPending; }
  const { isNew, photoId: oldPhoto, newPhoto, removePhoto } = form;
  let uploaded = null;
  try {
    setStatus(newPhoto ? 'Uploading the photo…' : 'Saving…');
    if (newPhoto) uploaded = await uploadPhoto({ ...fields, name: fields.name.trim() }, newPhoto);
    const photoId = uploaded || (removePhoto ? null : oldPhoto);
    setStatus('Saving…');
    inv = await changeInventory(latest => {
      if (!isNew && !latest.items.some(i => i.id === fields.id)) throw new Error('Someone else deleted this item while you were editing it. Close this form and add it again if it\'s still needed.');
      return upsertItem(latest, { ...fields, photoId });
    });
    if (oldPhoto && oldPhoto !== photoId) await deletePhoto(oldPhoto).catch(() => {}); // old photo no longer used
    setStatus(`${isNew ? 'Added' : 'Saved'} "${fields.name.trim()}".`);
    form = null;
  } catch (e) {
    if (uploaded) deletePhoto(uploaded).catch(() => {}); // don't leave an unused photo behind
    if (e.name === 'NeedsSignIn') needSignIn();
    showError(e.message);
    setStatus('Not saved.');
  } finally {
    busy = false; submit.disabled = false;
  }
  render();
}

async function deleteItem(id) {
  const item = inv.items.find(i => i.id === id);
  if (!item) return;
  busy = true; confirmId = null; render();
  try {
    setStatus(`Deleting "${item.name}"…`);
    let gone = null;
    inv = await changeInventory(latest => { gone = latest.items.find(i => i.id === id); return removeItem(latest, id); });
    if (gone && gone.photoId) await deletePhoto(gone.photoId).catch(() => {});
    if (form && form.id === id) form = null;
    setStatus(`Deleted "${item.name}".`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  } finally { busy = false; }
  render();
}

async function zoom(id) {
  const item = inv.items.find(i => i.id === id);
  if (!item || !item.photoId) return;
  const dlg = $('invZoom');
  dlg.querySelector('figcaption').textContent = [item.name, item.category, item.subcategory].filter(Boolean).join(' · ');
  const img = dlg.querySelector('img');
  img.alt = item.name;
  try { img.src = await photoUrl(item.photoId); dlg.showModal(); } catch (e) { setStatus(e.message); }
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b || busy) return;
  const { act, id } = b.dataset;
  if (act === 'edit') openForm(id);
  else if (act === 'askdelete') { confirmId = id; render(); }
  else if (act === 'keep') { confirmId = null; render(); }
  else if (act === 'delete') deleteItem(id);
  else if (act === 'zoom') zoom(id);
  else if (act === 'cancel') closeForm();
  else if (act === 'removephoto') { form.newPhoto = null; form.removePhoto = true; renderPreview(); }
}

async function onChange(ev) {
  if (ev.target.name === 'photo' && ev.target.files[0]) {
    const target = form;
    const file = ev.target.files[0];
    ev.target.value = '';
    showError('');
    $('invPreview').innerHTML = '<span class="inv-nophoto">Preparing photo…</span>';
    // Saving waits for this, so a quick tap on Add item doesn't lose a photo that's still being prepared.
    target.photoPending = shrinkPhoto(file).then(blob => {
      target.newPhoto = blob; target.removePhoto = false;
    }).catch(e => {
      if (form === target) showError(e.message);
    }).finally(() => {
      target.photoPending = null;
      if (form === target) renderPreview();
    });
  }
}

function init() {
  render();
  $('btnAddItem').addEventListener('click', () => openForm(null));
  $('invSearch').addEventListener('input', (e) => { filter.text = e.target.value; render(); });
  $('invCategory').addEventListener('change', (e) => { filter.category = e.target.value; render(); });
  $('invPanel').addEventListener('click', onClick);
  $('invPanel').addEventListener('change', onChange);
  $('invPanel').addEventListener('input', (e) => { if (e.target.name === 'category') updateSubList(); });
  $('invPanel').addEventListener('submit', (e) => { e.preventDefault(); if (!busy) saveForm(e.target); });
  $('invList').addEventListener('click', onClick);
  $('invZoom').addEventListener('click', () => $('invZoom').close());
  // The Google bar calls this after sign-in, choosing a folder, Refresh and sign-out.
  initDriveBar(() => reload());
}

init();
