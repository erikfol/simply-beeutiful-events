// Checklist view of an event: tasks with due dates and who does them, grouped by when they're due, with a
// "Show for" filter (one person or vendor), and copying tasks from another event. Changes show at once and save
// in the background, one after another, each re-reading the saved checklist first (see checklist.js).
import { state } from './state.js';
import { $, setStatus, showSection, needSignIn } from './dom.js';
import { isDriveEvent } from './events.js';
import { driveStatus } from './drivebar.js';
import { vendorRows } from './details.js';
import {
  SBE, COUPLE, BEFORE_CHOICES, dueBefore, emptyChecklist, checkTask, addTask, updateTask, setDone, removeTask,
  taskState, groupTasks, whoChoices, filterTasks, copyTasks, addTasks, loadChecklist, changeChecklist, newTaskId,
} from './checklist.js';
import { esc, todayISO, daysBetween } from './util.js';
import { showSetup } from './packagesView.js';

let list = emptyChecklist(); // what the view shows (includes changes still being saved)
let shownFor = null;         // the event the view belongs to
let loading = false;
let showFor = '';            // "Show for" filter: '' = everyone
let form = null;             // the open add/edit form: {id, isNew, values}
let problems = [];           // why the last Save didn't go through
let confirmId = null;        // task waiting for "Delete?" confirmation
let doneOpen = false;        // the Done group stays folded until opened
let copyOpen = false;        // the "Copy tasks from another event" box
let copyBusy = false;
let queue = Promise.resolve();
let waiting = 0;             // changes shown but not saved yet
let failed = false;

const me = () => { const u = driveStatus().user || {}; return u.displayName || u.emailAddress || ''; };
const shortDate = (d) => { try { return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };

export async function showChecklist() {
  const meta = state.currentMeta;
  if (!meta) { setStatus('Pick an event first.'); return; }
  showSection('checklistSection');
  $('checklistTitle').textContent = meta.name;
  // the package box above the checklist: it reads the tasks and saves through the same queue
  showSetup(meta, { tasks: () => (shownFor === meta ? list.tasks : []), save: (change, done) => save(change, done) });
  if (!isDriveEvent(meta)) { $('checklistBody').innerHTML = '<p class="empty">Checklists are kept for events from Google Drive.</p>'; return; }
  if (shownFor !== meta) {
    shownFor = meta; list = emptyChecklist(); form = null; problems = []; confirmId = null; showFor = ''; copyOpen = false;
    render({ reset: true });
  }
  if (waiting) { render(); return; } // a save in progress shows the latest checklist when it finishes
  loading = true; render();
  try {
    const saved = await loadChecklist(meta.driveId);
    if (shownFor !== meta) return;
    list = saved;
  } catch (e) {
    if (shownFor !== meta) return;
    setStatus(`Couldn't load the checklist: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
  } finally {
    if (shownFor === meta) { loading = false; render(); }
  }
}

// ---------- rendering ----------

function readForm() {
  const f = $('checklistForm');
  if (!f) return null;
  const v = (name) => (f.elements[name] ? f.elements[name].value : '');
  return { title: v('title'), before: v('before'), due: v('due'), who: v('who'), notes: v('notes') };
}

// "Who" suggestions: SBE, the couple, you, everyone already on a task, and the event's vendors.
function whoSuggestions() {
  const vendors = state.currentReport ? vendorRows(state.currentReport).map(r => r.vendor) : [];
  const seen = new Set();
  return [SBE, COUPLE, me(), ...list.tasks.map(t => t.who), ...vendors]
    .filter(w => w && !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
}

function formHtml() {
  const v = form.values;
  const eventDate = shownFor.weddingDate || '';
  const when = eventDate
    ? `<label for="ck-before">When<select id="ck-before" name="before"><option value="">Pick a date</option>${BEFORE_CHOICES.map(([d, label]) => `<option value="${d}"${String(d) === String(v.before) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></label>`
    : '';
  return `<form id="checklistForm" class="detailsform ckform">
      <label class="wide" for="ck-title">Task<input id="ck-title" name="title" value="${esc(v.title || '')}" placeholder="e.g. Confirm the final guest count with the caterer" autocomplete="off" maxlength="300" required /></label>
      ${when}
      <label for="ck-due">Due date<input id="ck-due" name="due" type="date" value="${esc(v.due || '')}" /></label>
      <label for="ck-who">Who<input id="ck-who" name="who" value="${esc(v.who || '')}" list="ck-whos" autocomplete="off" />
        <datalist id="ck-whos">${whoSuggestions().map(w => `<option value="${esc(w)}"></option>`).join('')}</datalist></label>
      <label class="wide" for="ck-notes">Notes<textarea id="ck-notes" name="notes" rows="2">${esc(v.notes || '')}</textarea></label>
      ${problems.length ? `<p class="db-warn wide">${problems.map(esc).join(' ')}</p>` : ''}
      <div class="wide"><button type="submit" class="primary">${form.isNew ? 'Add task' : 'Save task'}</button>
        <button type="button" class="mini" data-act="cancel">Cancel</button></div>
    </form>`;
}

function dueText(t, today) {
  if (t.done) return `Done${t.doneAt ? ` ${esc(shortDate(t.doneAt.slice(0, 10)))}` : ''}${t.doneBy ? ` by ${esc(t.doneBy)}` : ''}`;
  if (!t.due) return '';
  const days = daysBetween(today, t.due);
  const when = days < 0 ? `${-days} day${days === -1 ? '' : 's'} late` : days === 0 ? 'today' : days === 1 ? 'tomorrow' : days <= 30 ? `in ${days} days` : '';
  return `Due ${esc(shortDate(t.due))}${when ? ` · ${when}` : ''}`;
}

function taskHtml(t, canSave, today) {
  if (form && form.id === t.id) return `<li class="ck-task ck-editing">${formHtml()}</li>`;
  const id = esc(t.id);
  const st = taskState(t, today);
  const meta = [dueText(t, today), t.who ? `<span class="ck-who">${esc(t.who)}</span>` : ''].filter(Boolean).join(' · ');
  let acts = '';
  if (canSave) {
    acts = confirmId === t.id
      ? `<span class="todo-confirm">Delete this task?</span><button type="button" class="mini danger" data-act="delete" data-id="${id}">Delete</button><button type="button" class="mini" data-act="keep">Keep</button>`
      : `<button type="button" class="mini" data-act="edit" data-id="${id}">Edit</button><button type="button" class="mini" data-act="askdelete" data-id="${id}">Delete</button>`;
  }
  return `<li class="ck-task ck-${st}">
      <label class="ck-check"><input type="checkbox" data-act="toggle" data-id="${id}"${t.done ? ' checked' : ''}${canSave ? '' : ' disabled'} />
        <span class="ck-title">${esc(t.title)}</span></label>
      ${meta ? `<p class="ck-meta">${meta}</p>` : ''}
      ${t.notes ? `<p class="ck-notes">${esc(t.notes)}</p>` : ''}
      ${acts ? `<div class="todo-acts">${acts}</div>` : ''}
    </li>`;
}

function copyHtml() {
  const others = state.eventList.filter(e => e.id !== shownFor.id && e.driveId);
  return `<div class="ck-copy">
      <label for="ck-copyfrom">Copy tasks from <select id="ck-copyfrom">${others.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}</select></label>
      <button type="button" class="primary" data-act="copy"${copyBusy ? ' disabled' : ''}>${copyBusy ? 'Copying…' : 'Copy tasks'}</button>
      <button type="button" class="mini" data-act="copycancel">Cancel</button>
      <p class="hint">Copies every task this event doesn't have yet, as not done. Due dates keep the same distance from the event date${shownFor.weddingDate ? '' : ' (this event has no date, so copied tasks have no due date)'}.</p>
    </div>`;
}

// Draw the view. reset: start the form fresh; otherwise keep what's typed.
function render({ reset = false } = {}) {
  if (!shownFor || $('checklistSection').hidden) return;
  if (!reset && form) { const typed = readForm(); if (typed) form.values = typed; }
  const canSave = driveStatus().canSave;
  const today = todayISO();
  const all = list.tasks;
  const groups = groupTasks(all, today);
  const count = (key) => groups.find(g => g.key === key).tasks.length;
  const open = all.length - count('done');

  let html = '';
  html += all.length
    ? `<p class="time-total"><strong>${open} open</strong>${count('overdue') ? ` · <span class="ck-late">${count('overdue')} overdue</span>` : ''}${count('soon') ? ` · ${count('soon')} due this week` : ''} · ${count('done')} done</p>`
    : `<p class="time-total"><strong>${loading ? 'Loading the checklist…' : 'No tasks yet'}</strong></p>`;

  const people = whoChoices(all);
  if (showFor && !people.some(p => p.toLowerCase() === showFor.toLowerCase())) showFor = '';
  const tools = [];
  if (canSave) tools.push(`<button type="button" class="primary" data-act="add">+ Add task</button>`);
  if (people.length) tools.push(`<label for="ck-showfor" class="viewpick">Show for <select id="ck-showfor"><option value="">Everyone</option>${people.map(p => `<option${p.toLowerCase() === showFor.toLowerCase() ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></label>`);
  if (canSave && state.eventList.some(e => e.id !== shownFor.id)) tools.push(`<button type="button" data-act="copyopen">Copy tasks from another event</button>`);
  if (tools.length) html += `<div class="row toolbar">${tools.join('')}</div>`;
  if (!canSave) html += '<p class="db-warn">View only: changing the checklist needs <strong>Editor</strong> access to the shared “SBE App Data” folder (see the Google bar above).</p>';
  if (copyOpen && canSave) html += copyHtml();
  if (form && form.isNew) html += formHtml();

  const shown = groupTasks(filterTasks(all, showFor), today);
  if (!all.length && !loading) {
    html += `<p class="empty">${canSave ? 'Click <strong>+ Add task</strong>, or copy the tasks from another event.' : 'No tasks yet.'}</p>`;
  } else if (all.length && !shown.some(g => g.tasks.length)) {
    html += `<p class="empty">No tasks for ${esc(showFor)}.</p>`;
  }
  for (const g of shown) {
    if (!g.tasks.length) continue;
    const items = `<ul class="ck-list">${g.tasks.map(t => taskHtml(t, canSave, today)).join('')}</ul>`;
    html += g.key === 'done'
      ? `<details class="ck-donegroup"${doneOpen ? ' open' : ''}><summary class="todo-head">${g.label} <small>${g.tasks.length}</small></summary>${items}</details>`
      : `<h3 class="todo-head ck-head-${g.key}">${g.label} <small>${g.tasks.length}</small></h3>${items}`;
  }
  $('checklistBody').innerHTML = html;
}

// ---------- saving ----------

// Show a change right away, then save it. Changes save one after another; each re-reads the latest checklist
// and applies the same change, so other planners' work is kept. If a save fails, the view goes back to what
// Drive has; onFail puts back what was typed.
function save(change, done, onFail) {
  const meta = shownFor;
  try { list = change(list); } catch (e) { setStatus(e.message); return; }
  confirmId = null;
  render();
  waiting++;
  setStatus('Saving the checklist…');
  let latest = null;
  queue = queue.then(async () => {
    try {
      latest = await changeChecklist(meta.driveId, change);
      if (waiting === 1 && !failed) setStatus(done);
    } catch (e) {
      failed = true;
      if (e.name === 'NeedsSignIn') needSignIn();
      setStatus(`Not saved. ${e.message}`);
      if (onFail && shownFor === meta) onFail();
    }
    if (--waiting) return;
    if (failed) { failed = false; try { latest = await loadChecklist(meta.driveId); } catch { latest = null; } }
    if (latest && shownFor === meta) { list = latest; render(); } // includes anyone else's changes
  });
}

// ---------- actions ----------

export function onChecklistSubmit(ev) {
  ev.preventDefault();
  if (!form || !shownFor) return;
  const v = readForm();
  form.values = v;
  problems = checkTask(v);
  if (problems.length) { render(); return; }
  const at = new Date().toISOString(), by = me();
  const { id, isNew } = form;
  const keep = form;
  form = null; problems = [];
  if (isNew) save(l => addTask(l, { id, ...v }, at, by), `Added "${v.title.trim()}".`, () => { form = keep; render(); });
  else save(l => updateTask(l, id, v, at), 'Saved the task.', () => { form = keep; render(); });
}

export function onChecklistClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b || !shownFor) return;
  const { act, id } = b.dataset;
  const t = id && list.tasks.find(x => x.id === id);
  if (act === 'add') {
    form = { id: newTaskId(), isNew: true, values: { who: SBE } }; problems = []; render({ reset: true });
    const box = $('ck-title'); if (box) box.focus();
  } else if (act === 'edit' && t) {
    form = { id: t.id, isNew: false, values: { ...t, before: '' } }; problems = []; confirmId = null; render({ reset: true });
    const box = $('ck-title'); if (box) box.focus();
  } else if (act === 'cancel') {
    form = null; problems = []; render({ reset: true });
  } else if (act === 'askdelete' && t) {
    confirmId = t.id; render();
  } else if (act === 'keep') {
    confirmId = null; render();
  } else if (act === 'delete' && t) {
    const at = new Date().toISOString();
    save(l => removeTask(l, t.id, at), `Deleted "${t.title}".`);
  } else if (act === 'copyopen') {
    copyOpen = true; render();
  } else if (act === 'copycancel') {
    copyOpen = false; render();
  } else if (act === 'copy') {
    copyFrom($('ck-copyfrom') && $('ck-copyfrom').value);
  }
}

export function onChecklistChange(ev) {
  const el = ev.target;
  if (!shownFor) return;
  if (el.dataset.act === 'toggle') {
    const t = list.tasks.find(x => x.id === el.dataset.id);
    if (!t) return;
    const at = new Date().toISOString(), by = me(), done = el.checked;
    save(l => setDone(l, t.id, done, at, by), done ? `Done: "${t.title}".` : `"${t.title}" is open again.`);
  } else if (el.id === 'ck-before') {
    if (el.value !== '') $('ck-due').value = dueBefore(shownFor.weddingDate, Number(el.value));
  } else if (el.id === 'ck-due') {
    const before = $('ck-before'); if (before) before.value = ''; // a date picked by hand
  } else if (el.id === 'ck-showfor') {
    showFor = el.value; render();
  }
}

export function onChecklistToggle(ev) {
  if (ev.target.classList && ev.target.classList.contains('ck-donegroup')) doneOpen = ev.target.open;
}

async function copyFrom(eventId) {
  const meta = shownFor;
  const from = state.eventList.find(e => e.id === eventId);
  if (!from || copyBusy) return;
  copyBusy = true; render();
  setStatus(`Reading the checklist of ${from.name}…`);
  try {
    const theirs = await loadChecklist(from.driveId);
    if (shownFor !== meta) return;
    if (!theirs.tasks.length) { setStatus(`${from.name} has no checklist yet.`); return; }
    const at = new Date().toISOString();
    const tasks = copyTasks(theirs.tasks, { fromDate: from.weddingDate, toDate: meta.weddingDate, existing: list.tasks }, at, me());
    if (!tasks.length) { setStatus(`This event already has every task from ${from.name}.`); return; }
    copyOpen = false;
    save(l => addTasks(l, tasks.filter(t => !l.tasks.some(x => x.title.toLowerCase() === t.title.toLowerCase())), at),
      `Copied ${tasks.length} task${tasks.length === 1 ? '' : 's'} from ${from.name}.`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Couldn't copy: ${e.message}`);
  } finally {
    copyBusy = false;
    if (shownFor === meta) render();
  }
}
