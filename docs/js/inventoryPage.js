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
// The open add/edit form: photos in order (first = main), each {id} (saved in Drive) or {blob, url} (new);
// removed = saved photo ids to delete once the item is saved; pending = photos still being prepared.
let form = null;
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
  const n = i.photoIds.length;
  const photo = n
    ? `<div class="inv-cover"><button type="button" class="inv-photo" data-act="zoom" data-id="${esc(i.id)}" data-photo="${esc(i.photoIds[0])}" data-alt="${esc(i.name)}" aria-label="Show the photos of ${esc(i.name)}"><span class="inv-nophoto">Loading photo…</span></button>${n > 1 ? `<span class="inv-count">${n} photos</span>` : ''}</div>`
    : '<div class="inv-photo"><span class="inv-nophoto">No photo</span></div>';
  const acts = !canSave ? '' : confirmId === i.id
    ? `<span class="inv-confirm">Delete this item?</span><button type="button" class="mini danger" data-act="delete" data-id="${esc(i.id)}">Delete</button><button type="button" class="mini" data-act="keep">Keep</button>`
    : `<button type="button" class="mini" data-act="edit" data-id="${esc(i.id)}">Edit</button><button type="button" class="mini" data-act="askdelete" data-id="${esc(i.id)}">Delete</button>`;
  return `<article class="inv-item">${photo}
    <div class="inv-body"><strong>${esc(i.name)}</strong>${i.subcategory ? `<small>${esc(i.subcategory)}</small>` : ''}<small class="inv-qty">Quantity: ${i.quantity}</small></div>
    ${acts ? `<div class="inv-acts">${acts}</div>` : ''}</article>`;
}

function renderPanel() {
  const panel = $('invPanel');
  if (!form) { panel.hidden = true; panel.innerHTML = ''; return; }
  if (panel.dataset.formId === form.id && !panel.hidden) return; // keep what's being typed
  const item = inv.items.find(i => i.id === form.id) || { name: '', category: '', subcategory: '', quantity: 1 };
  panel.dataset.formId = form.id;
  panel.hidden = false;
  panel.innerHTML = `<form id="invForm" novalidate>
    <div class="panel-head"><h3>${form.isNew ? 'Add an item' : 'Edit item'}</h3><button type="button" class="mini" data-act="cancel">Close</button></div>
    <div class="fgrid">
      <label class="f">Name <input name="name" value="${esc(item.name)}" required autocomplete="off" placeholder="e.g. Gold mercury glass votive" /></label>
      <label class="f">Category <input name="category" value="${esc(item.category)}" list="invCatList" autocomplete="off" placeholder="e.g. Candles & votives" /></label>
      <label class="f">Subcategory <input name="subcategory" value="${esc(item.subcategory)}" list="invSubList" autocomplete="off" placeholder="e.g. Votive holders" /></label>
      <label class="f">Quantity <input name="quantity" value="${item.quantity}" inputmode="numeric" autocomplete="off" placeholder="1" /></label>
    </div>
    <datalist id="invCatList">${categoryChoices(inv.items).map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
    <datalist id="invSubList"></datalist>
    <fieldset class="inv-photoedit"><legend>Photos <span class="hint">(optional · the first one shows in the list)</span></legend>
      <div class="inv-thumbs" id="invThumbs"></div>
    </fieldset>
    <p class="panel-error" id="invError" hidden></p>
    <div class="panel-actions"><button type="submit" class="primary">${form.isNew ? 'Add item' : 'Save changes'}</button><button type="button" data-act="cancel">Cancel</button></div>
  </form>`;
  updateSubList();
  renderThumbs();
}

function updateSubList() {
  const f = $('invForm');
  if (f) $('invSubList').innerHTML = subcategoryChoices(inv.items, f.elements.category.value).map(s => `<option value="${esc(s)}"></option>`).join('');
}

function renderThumbs() {
  const el = $('invThumbs');
  if (!el) return;
  el.innerHTML = form.photos.map((p, n) => `<div class="inv-thumb">
      <div class="inv-photo"${p.id ? ` data-photo="${esc(p.id)}" data-alt="Photo ${n + 1}"` : ''}>${p.url ? `<img src="${esc(p.url)}" alt="Photo ${n + 1}" />` : '<span class="inv-nophoto">Loading…</span>'}</div>
      ${n === 0 ? '<span class="inv-main">Main photo</span>' : `<button type="button" class="mini" data-act="mainphoto" data-n="${n}">Make main</button>`}
      <button type="button" class="mini" data-act="removephoto" data-n="${n}" aria-label="Remove photo ${n + 1}">Remove</button>
    </div>`).join('')
    + (form.pending ? `<div class="inv-thumb"><div class="inv-photo"><span class="inv-nophoto">Preparing ${form.pending > 1 ? `${form.pending} photos` : 'photo'}…</span></div></div>` : '')
    + `<label class="inv-thumb inv-add"><span>+ ${form.photos.length ? 'Add more photos' : 'Add photos'}</span><input type="file" name="photo" accept="image/*" multiple hidden /></label>`;
  watchPhotos(el);
}

const forgetUrls = (photos) => { for (const p of photos) if (p.url) URL.revokeObjectURL(p.url); };

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
  form = {
    id: item ? item.id : newItemId(), isNew: !item,
    photos: item ? item.photoIds.map(id => ({ id })) : [], removed: [], pending: 0, ready: Promise.resolve(),
  };
  confirmId = null;
  $('invPanel').dataset.formId = '';
  render();
  $('invPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('invForm').elements.name.focus({ preventScroll: true });
}

function closeForm() {
  if (form) forgetUrls(form.photos);
  form = null;
  render();
}

async function saveForm(f) {
  const fields = { id: form.id, name: f.elements.name.value, category: f.elements.category.value, subcategory: f.elements.subcategory.value, quantity: f.elements.quantity.value };
  const problems = checkItem(fields);
  if (problems.length) { showError(problems.join(' ')); (f.elements.name.value.trim() ? f.elements.quantity : f.elements.name).focus(); return; }
  const submit = f.querySelector('button[type="submit"]');
  const target = form;
  busy = true; submit.disabled = true; showError('');
  if (target.pending) { setStatus('Preparing the photos…'); await target.ready; }
  const uploaded = [];
  try {
    const item = { ...fields, name: fields.name.trim() };
    const photoIds = [];
    const toUpload = target.photos.filter(p => !p.id).length;
    for (const [n, p] of target.photos.entries()) {
      if (p.id) { photoIds.push(p.id); continue; }
      setStatus(toUpload > 1 ? `Uploading photo ${uploaded.length + 1} of ${toUpload}…` : 'Uploading the photo…');
      const id = await uploadPhoto(item, p.blob, `${n + 1}${Date.now().toString(36).slice(-4)}`);
      uploaded.push(id); photoIds.push(id);
    }
    setStatus('Saving…');
    inv = await changeInventory(latest => {
      if (!target.isNew && !latest.items.some(i => i.id === fields.id)) throw new Error('Someone else deleted this item while you were editing it. Close this form and add it again if it\'s still needed.');
      return upsertItem(latest, { ...fields, photoIds });
    });
    for (const id of target.removed) await deletePhoto(id).catch(() => {}); // no longer used
    setStatus(`${target.isNew ? 'Added' : 'Saved'} "${item.name}".`);
    forgetUrls(target.photos);
    if (form === target) form = null;
  } catch (e) {
    for (const id of uploaded) deletePhoto(id).catch(() => {}); // don't leave unused photos behind
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
    for (const photoId of (gone ? gone.photoIds : [])) await deletePhoto(photoId).catch(() => {});
    if (form && form.id === id) form = null;
    setStatus(`Deleted "${item.name}".`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  } finally { busy = false; }
  render();
}

// The enlarged view: one photo at a time, with arrows when the item has several.
let zoomed = null; // {item, n}
async function zoom(id, n = 0) {
  const item = inv.items.find(i => i.id === id);
  if (!item || !item.photoIds.length) return;
  n = (n + item.photoIds.length) % item.photoIds.length;
  zoomed = { item, n };
  const dlg = $('invZoom');
  const many = item.photoIds.length > 1;
  dlg.querySelector('figcaption').textContent = [item.name, item.category, item.subcategory, `Quantity: ${item.quantity}`].filter(Boolean).join(' · ') + (many ? ` (photo ${n + 1} of ${item.photoIds.length})` : '');
  for (const b of dlg.querySelectorAll('.inv-arrow')) b.hidden = !many;
  const img = dlg.querySelector('img');
  img.alt = item.name;
  try {
    img.src = await photoUrl(item.photoIds[n]);
    if (!dlg.open) dlg.showModal();
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  }
}

function onZoomClick(ev) {
  const b = ev.target.closest('[data-step]');
  if (b && zoomed) zoom(zoomed.item.id, zoomed.n + Number(b.dataset.step));
  else $('invZoom').close();
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
  else if (act === 'removephoto' || act === 'mainphoto') {
    const [p] = form.photos.splice(Number(b.dataset.n), 1);
    if (act === 'mainphoto') form.photos.unshift(p);
    else if (p.id) form.removed.push(p.id);
    else if (p.url) URL.revokeObjectURL(p.url);
    renderThumbs();
  }
}

// Photos chosen in the form are shrunk one after another and added in the order picked. Saving waits for
// them, so a quick tap on Add item doesn't lose a photo that's still being prepared.
function onChange(ev) {
  if (ev.target.name !== 'photo' || !ev.target.files.length) return;
  const target = form;
  const files = [...ev.target.files];
  ev.target.value = '';
  showError('');
  target.pending += files.length;
  target.ready = target.ready.then(async () => {
    const failed = [];
    for (const file of files) {
      try {
        const blob = await shrinkPhoto(file);
        target.photos.push({ blob, url: URL.createObjectURL(blob) });
      } catch { failed.push(file.name); }
      target.pending--;
      if (form === target) renderThumbs();
    }
    if (failed.length && form === target) showError(`Couldn't open ${failed.join(', ')}. Try JPG or PNG photos.`);
  });
  renderThumbs();
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
  $('invZoom').addEventListener('click', onZoomClick);
  $('invZoom').addEventListener('keydown', (e) => {
    if (zoomed && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) zoom(zoomed.item.id, zoomed.n + (e.key === 'ArrowLeft' ? -1 : 1));
  });
  // The Google bar calls this after sign-in, choosing a folder, Refresh and sign-out.
  initDriveBar(() => reload());
}

init();
