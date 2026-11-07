// SBE's to-do list: things that need doing, each with a status (not started, in progress, done) and dated notes.
// Saved as todos.json in the shared "SBE App Data" folder, so every planner sees the same list.
// Each change re-reads the saved list first, so two planners editing at once don't erase each other's work.
import { readData, writeData } from './appdata.js';

export const TODO_FILE = 'todos.json';

// In the order the status buttons show them (the list itself shows what's in progress first).
export const STATUSES = [
  { key: 'not-started', label: 'Not started' },
  { key: 'in-progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
];
const KEYS = STATUSES.map(s => s.key);
const GROUP_ORDER = ['in-progress', 'not-started', 'done'];
const statusOf = (s) => (KEYS.includes(s) ? s : 'not-started');
export const statusLabel = (key) => STATUSES.find(s => s.key === statusOf(key)).label;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
// Notes keep their line breaks; trailing spaces and runs of blank lines are tidied.
export const cleanNote = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();

export const emptyTodos = () => ({ updated: null, items: [] });
export const newId = (prefix = 't') => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const iso = () => new Date().toISOString();

export function normalizeTodos(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  return {
    updated: (data && data.updated) || null,
    items: items.filter(t => t && t.id && clean(t.title)).map(t => {
      const status = statusOf(t.status);
      return {
        id: String(t.id), title: clean(t.title), status,
        notes: (Array.isArray(t.notes) ? t.notes : []).filter(n => n && n.id && cleanNote(n.text))
          .map(n => ({ id: String(n.id), text: cleanNote(n.text), at: n.at || null, by: clean(n.by) })),
        created: t.created || null, createdBy: clean(t.createdBy), updated: t.updated || null,
        doneAt: status === 'done' ? (t.doneAt || null) : null,
      };
    }),
  };
}

// Problems with a to-do's wording, as messages ([] = fine to save).
export const checkTitle = (title) => (clean(title) ? [] : ['Write what needs to be done.']);

const gone = () => new Error('Someone else deleted this to-do in the meantime, so the change wasn\'t saved.');

// Change one to-do (matched by id). Returns a new list; the old one is untouched.
function changeOne(list, id, fn, now) {
  if (!list.items.some(t => t.id === id)) throw gone();
  return { updated: now, items: list.items.map(t => (t.id === id ? { ...fn(t), updated: now } : t)) };
}

// The page picks the id and time before saving, so showing the change and saving it give the same result.
export function addTodo(list, { id = newId(), title, status = 'not-started', by = '' }, now = iso()) {
  const s = statusOf(status);
  const todo = { id, title: clean(title), status: s, notes: [], created: now, createdBy: clean(by), updated: now, doneAt: s === 'done' ? now : null };
  return { updated: now, items: [...list.items, todo] };
}

export const renameTodo = (list, id, title, now = iso()) => changeOne(list, id, t => ({ ...t, title: clean(title) }), now);

export function setTodoStatus(list, id, status, now = iso()) {
  const s = statusOf(status);
  return changeOne(list, id, t => ({ ...t, status: s, doneAt: s !== 'done' ? null : t.status === 'done' ? t.doneAt : now }), now);
}

export function addNote(list, id, { id: noteId = newId('n'), text, by = '' }, now = iso()) {
  return changeOne(list, id, t => ({ ...t, notes: [...t.notes, { id: noteId, text: cleanNote(text), at: now, by: clean(by) }] }), now);
}

// Deleting something that's already gone is fine.
export function removeNote(list, id, noteId, now = iso()) {
  const t = list.items.find(x => x.id === id);
  if (!t || !t.notes.some(n => n.id === noteId)) return list;
  return changeOne(list, id, x => ({ ...x, notes: x.notes.filter(n => n.id !== noteId) }), now);
}

export const removeTodo = (list, id, now = iso()) => ({ updated: now, items: list.items.filter(t => t.id !== id) });

// Search words must all appear in the to-do or one of its notes.
export function filterTodos(items, text = '') {
  const words = clean(text).toLowerCase().split(' ').filter(Boolean);
  if (!words.length) return items;
  return items.filter(t => {
    const hay = `${t.title} ${t.notes.map(n => n.text).join(' ')}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// Groups for display: in progress, not started, done. Newest first; done ones by when they were finished.
export function groupByStatus(items) {
  const newest = (a, b) => (b.created || '').localeCompare(a.created || '');
  const lastDone = (a, b) => (b.doneAt || b.updated || '').localeCompare(a.doneAt || a.updated || '') || newest(a, b);
  return GROUP_ORDER.map(key => ({
    key, label: statusLabel(key),
    items: items.filter(t => t.status === key).sort(key === 'done' ? lastDone : newest),
  }));
}

// ---------- saving to Drive ----------

export async function loadTodos() {
  return normalizeTodos(await readData(TODO_FILE));
}

// Apply one change to the latest saved list and save it. Returns the saved list.
export async function changeTodos(change) {
  const next = change(await loadTodos());
  await writeData(TODO_FILE, next);
  return next;
}
