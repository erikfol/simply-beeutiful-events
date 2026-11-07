// To Do page entry point: a shared list of things to do, each marked not started, in progress or done,
// with dated notes. Needs Google sign-in; the list is kept in the shared "SBE App Data" folder (see todo.js).
import { $, setStatus, needSignIn } from './dom.js';
import { isConfigured } from './google.js';
import { initDriveBar, driveStatus } from './drivebar.js';
import {
  STATUSES, statusLabel, emptyTodos, loadTodos, changeTodos, newId, checkTitle, cleanNote,
  addTodo, renameTodo, setTodoStatus, addNote, removeNote, removeTodo, filterTodos, groupByStatus,
} from './todo.js';
import { esc } from './util.js';

let list = emptyTodos();   // what the page shows (includes changes still being saved)
let saved = emptyTodos();  // the list as last read from or saved to Drive
let loaded = false;
let search = '';
let editing = null;        // id of the to-do whose wording is being changed
let confirmId = null;      // "todo:<id>" or "note:<id>" waiting for "Delete?" confirmation
const open = new Set();    // to-dos showing all their notes
let doneOpen = false;      // the Done group stays folded until opened
const drafts = new Map();  // text being typed in a note or wording box, kept when the list redraws
let queue = Promise.resolve();
let waiting = 0;           // changes shown but not saved yet
let failed = false;

const now = () => new Date().toISOString();
const me = () => { const u = driveStatus().user; return (u && (u.displayName || u.emailAddress)) || ''; };
const find = (id) => list.items.find(t => t.id === id);

// "Nov 7" (with the year when it isn't this year), optionally with the time.
function when(iso, withTime = false) {
  const d = new Date(iso || '');
  if (isNaN(d)) return '';
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  return withTime ? `${date}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : date;
}

// ---------- rendering ----------

function message() {
  const s = driveStatus();
  if (!isConfigured()) return 'Google sign-in is not set up for this copy of the app.';
  if (!s.signedIn && !loaded) return 'Sign in with Google to see the to-do list. It\'s kept privately in the shared "SBE App Data" folder.';
  if (!s.folder) return 'Choose the SBE events folder above. The to-do list is kept in its "SBE App Data" folder.';
  if (s.access && s.access.state === 'waiting') return 'The shared "SBE App Data" folder isn\'t set up yet (see the note above).';
  if (!loaded) return 'Loading the to-do list…';
  return '';
}

function render() {
  const msg = message();
  const canSave = driveStatus().canSave;
  $('todoAdd').hidden = !!msg || !canSave;
  $('todoTools').hidden = !!msg || !list.items.length;
  if (msg) { draw(`<p class="empty">${esc(msg)}</p>`); $('todoCount').textContent = ''; return; }

  const shown = filterTodos(list.items, search);
  const groups = groupByStatus(shown);
  $('todoCount').textContent = search.trim()
    ? `${shown.length} of ${list.items.length} match`
    : groupByStatus(list.items).filter(g => g.items.length).map(g => `${g.items.length} ${g.label.toLowerCase()}`).join(' · ');
  if (!list.items.length) {
    draw(`<p class="empty">Nothing on the list yet.${canSave ? ' Type what needs to be done above and click <strong>Add</strong>.' : ''}</p>`);
    return;
  }
  if (!shown.length) { draw('<p class="empty">No to-dos match.</p>'); return; }

  const [doing, todo, done] = groups;
  let html = [doing, todo].filter(g => g.items.length).map(g => `
    <h3 class="todo-head">${esc(g.label)} <small>${g.items.length}</small></h3>
    <div class="todo-list">${g.items.map(t => item(t, canSave)).join('')}</div>`).join('');
  if (!doing.items.length && !todo.items.length) html += `<p class="empty">${search.trim() ? 'Only finished to-dos match.' : 'Nothing left to do. 🎉'}</p>`;
  if (done.items.length) {
    html += `<details class="todo-done"${doneOpen || search.trim() ? ' open' : ''}>
      <summary class="todo-head">${esc(done.label)} <small>${done.items.length}</small></summary>
      <div class="todo-list">${done.items.map(t => item(t, canSave)).join('')}</div></details>`;
  }
  draw(html);
}

// Redraw the list without losing the place of someone typing or using the keyboard.
function draw(html) {
  const el = $('todoList');
  const a = document.activeElement;
  const key = a && el.contains(a) ? a.dataset.key : null;
  const range = key && a.dataset.draft !== undefined ? [a.selectionStart, a.selectionEnd] : null;
  el.innerHTML = html;
  const again = key && el.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!again) return;
  again.focus({ preventScroll: true });
  if (range) try { again.setSelectionRange(...range); } catch { /* not a text box */ }
}

function item(t, canSave) {
  const id = esc(t.id);
  const isOpen = open.has(t.id);
  const status = `<div class="todo-seg" role="group" aria-label="Status">${STATUSES.map(s => `<button type="button" data-act="status" data-id="${id}" data-status="${s.key}" data-key="status:${id}:${s.key}" aria-pressed="${t.status === s.key}"${canSave ? '' : ' disabled'}>${esc(s.label)}</button>`).join('')}</div>`;

  const wording = canSave && editing === t.id
    ? `<form class="todo-rename" data-id="${id}">
        <input name="title" value="${esc(drafts.has(`title:${t.id}`) ? drafts.get(`title:${t.id}`) : t.title)}" data-key="title:${id}" data-draft aria-label="What needs to be done" autocomplete="off" maxlength="300" />
        <button type="submit" class="mini primary">Save</button><button type="button" class="mini" data-act="canceledit" data-id="${id}">Cancel</button></form>`
    : `<strong class="todo-title">${esc(t.title)}</strong>`;

  const meta = [
    t.created && `Added ${when(t.created)}${t.createdBy ? ` by ${esc(t.createdBy)}` : ''}`,
    t.status === 'done' && t.doneAt && `Done ${when(t.doneAt)}`,
  ].filter(Boolean).join(' · ');

  const n = t.notes.length;
  let acts = '';
  if (n || canSave) acts += `<button type="button" class="mini" data-act="notes" data-id="${id}" data-key="notes:${id}" aria-expanded="${isOpen}">${isOpen ? 'Hide notes' : n ? `Notes (${n})` : 'Add a note'}</button>`;
  if (canSave) {
    acts += confirmId === `todo:${t.id}`
      ? `<span class="todo-confirm">Delete this to-do and its notes?</span><button type="button" class="mini danger" data-act="delete" data-id="${id}" data-key="delete:${id}">Delete</button><button type="button" class="mini" data-act="keep" data-key="keep:${id}">Keep</button>`
      : `${editing === t.id ? '' : `<button type="button" class="mini" data-act="edit" data-id="${id}" data-key="edit:${id}">Edit</button>`}<button type="button" class="mini" data-act="askdelete" data-id="${id}" data-key="askdelete:${id}">Delete</button>`;
  }

  const last = n && !isOpen ? t.notes[n - 1] : null;
  return `<article class="todo-item s-${t.status}">
    <div class="todo-top">${wording}${status}</div>
    ${meta ? `<p class="todo-meta">${meta}</p>` : ''}
    ${last ? `<p class="todo-last"><span>Latest note${last.at ? `, ${when(last.at)}` : ''}:</span> ${esc(last.text)}</p>` : ''}
    ${isOpen ? notes(t, canSave) : ''}
    ${acts ? `<div class="todo-acts">${acts}</div>` : ''}
  </article>`;
}

function notes(t, canSave) {
  const id = esc(t.id);
  const rows = t.notes.map(n => {
    const del = !canSave ? '' : confirmId === `note:${n.id}`
      ? `<span class="todo-confirm">Delete this note?</span><button type="button" class="mini danger" data-act="deletenote" data-id="${id}" data-note="${esc(n.id)}" data-key="deletenote:${esc(n.id)}">Delete</button><button type="button" class="mini" data-act="keep" data-key="keepnote:${esc(n.id)}">Keep</button>`
      : `<button type="button" class="mini" data-act="asknote" data-note="${esc(n.id)}" data-key="asknote:${esc(n.id)}" aria-label="Delete this note">Delete</button>`;
    return `<li><p>${esc(n.text)}</p><small>${esc([when(n.at, true), n.by].filter(Boolean).join(' · '))}${del}</small></li>`;
  }).join('');
  const add = canSave
    ? `<form class="todo-noteform" data-id="${id}">
        <label class="f">Add a note <textarea name="note" rows="2" data-key="note:${id}" data-draft placeholder="e.g. Called the florist, waiting to hear back">${esc(drafts.get(`note:${t.id}`) || '')}</textarea></label>
        <button type="submit" class="mini primary">Add note</button></form>`
    : '';
  return `<div class="todo-notes">${rows ? `<ol class="todo-notelist">${rows}</ol>` : '<p class="hint">No notes yet.</p>'}${add}</div>`;
}

// ---------- saving ----------

// Show a change right away, then save it. Changes save one after another; each re-reads the latest list from
// Drive and applies the same change, so other planners' work is kept. If a save fails, the page goes back to
// what Drive has. onFail puts back text that was typed, so it can be tried again.
function save(change, done, onFail) {
  try { list = change(list); } catch (e) { setStatus(e.message); return; }
  confirmId = null;
  render();
  waiting++;
  setStatus('Saving…');
  queue = queue.then(async () => {
    try {
      saved = await changeTodos(change);
      if (waiting === 1 && !failed) setStatus(done);
    } catch (e) {
      failed = true;
      if (e.name === 'NeedsSignIn') needSignIn();
      setStatus(`Not saved. ${e.message}`);
      if (onFail) onFail();
    }
    if (--waiting) return;
    if (failed) { failed = false; try { saved = await loadTodos(); } catch { /* keep the last saved list */ } }
    list = saved; // includes anyone else's changes
    render();
  });
}

async function reload() {
  const s = driveStatus();
  if (!s.signedIn || !s.folder || !s.access || s.access.state === 'waiting') {
    if (!s.signedIn && !s.folder) { list = saved = emptyTodos(); loaded = false; }
    render();
    return;
  }
  if (waiting) return; // a save in progress shows the latest list when it finishes
  loaded = false; render();
  try {
    list = saved = await loadTodos();
    loaded = true;
    const left = list.items.filter(t => t.status !== 'done').length;
    setStatus(`To do: ${left} open, ${list.items.length - left} done.`);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(e.message);
  }
  render();
}

// ---------- actions ----------

function onAdd(ev) {
  ev.preventDefault();
  const input = ev.target.elements.title;
  const title = input.value;
  const problems = checkTitle(title);
  if (problems.length) { setStatus(problems[0]); input.focus(); return; }
  const id = newId(), at = now(), by = me();
  input.value = '';
  save(l => addTodo(l, { id, title, by }, at), `Added "${title.trim()}".`, () => { if (!input.value) input.value = title; });
}

function onSubmit(ev) {
  ev.preventDefault();
  const f = ev.target;
  const id = f.dataset.id;
  const t = find(id);
  if (!t) return;
  if (f.classList.contains('todo-rename')) {
    const title = f.elements.title.value;
    const problems = checkTitle(title);
    if (problems.length) { setStatus(problems[0]); f.elements.title.focus(); return; }
    editing = null; drafts.delete(`title:${id}`);
    if (title.trim() === t.title) { render(); return; }
    const at = now();
    save(l => renameTodo(l, id, title, at), 'Saved the change.', () => { editing = id; drafts.set(`title:${id}`, title); });
  } else if (f.classList.contains('todo-noteform')) {
    const text = f.elements.note.value;
    if (!cleanNote(text)) { setStatus('Write a note first.'); f.elements.note.focus(); return; }
    const noteId = newId('n'), at = now(), by = me();
    drafts.delete(`note:${id}`);
    save(l => addNote(l, id, { id: noteId, text, by }, at), `Added a note to "${t.title}".`, () => { open.add(id); drafts.set(`note:${id}`, text); });
  }
}

function onClick(ev) {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const { act, id, note } = b.dataset;
  const t = id && find(id);
  if (act === 'status' && t) {
    const status = b.dataset.status;
    if (t.status === status) return;
    const at = now();
    save(l => setTodoStatus(l, id, status, at), status === 'done' ? `Marked "${t.title}" done.` : `"${t.title}" is now ${statusLabel(status).toLowerCase()}.`);
  } else if (act === 'notes' && t) {
    if (open.has(id)) open.delete(id); else open.add(id);
    render();
    if (open.has(id)) { const box = $('todoList').querySelector(`textarea[data-key="note:${CSS.escape(id)}"]`); if (box) box.focus({ preventScroll: true }); }
  } else if (act === 'edit' && t) {
    editing = id; confirmId = null; drafts.set(`title:${id}`, t.title);
    render();
    const box = $('todoList').querySelector(`input[data-key="title:${CSS.escape(id)}"]`);
    if (box) { box.focus(); box.select(); }
  } else if (act === 'canceledit') {
    editing = null; drafts.delete(`title:${id}`); render();
  } else if (act === 'askdelete' && t) {
    confirmId = `todo:${id}`; render();
  } else if (act === 'asknote') {
    confirmId = `note:${note}`; render();
  } else if (act === 'keep') {
    confirmId = null; render();
  } else if (act === 'delete' && t) {
    const at = now();
    open.delete(id); if (editing === id) editing = null;
    save(l => removeTodo(l, id, at), `Deleted "${t.title}".`);
  } else if (act === 'deletenote' && t) {
    const at = now();
    save(l => removeNote(l, id, note, at), 'Deleted the note.');
  }
}

function onKeydown(ev) {
  if (ev.key === 'Escape' && editing && ev.target.closest('.todo-rename')) { editing = null; drafts.delete(`title:${ev.target.closest('form').dataset.id}`); render(); }
  // Ctrl+Enter (or ⌘+Enter) in a note box adds the note.
  if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && ev.target.name === 'note') ev.target.form.requestSubmit();
}

function init() {
  render();
  $('todoAdd').addEventListener('submit', onAdd);
  $('todoSearch').addEventListener('input', (e) => { search = e.target.value; render(); });
  const el = $('todoList');
  el.addEventListener('click', onClick);
  el.addEventListener('submit', onSubmit);
  el.addEventListener('keydown', onKeydown);
  el.addEventListener('input', (e) => { if (e.target.dataset.draft !== undefined) drafts.set(e.target.dataset.key, e.target.value); });
  el.addEventListener('toggle', (e) => { if (e.target.classList.contains('todo-done') && !search.trim()) doneOpen = e.target.open; }, true);
  // The Google bar calls this after sign-in, choosing a folder, Refresh and sign-out.
  initDriveBar(() => reload());
}

init();
