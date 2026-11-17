// Each event's checklist: what needs doing, by when, and who does it (SBE, the couple, a vendor, a team member).
// Saved per event as event-<id>.checklist.json in the shared "SBE App Data" folder. Each change re-reads the
// saved checklist first, so two planners working on it at once keep each other's changes.
import { readEventData, writeEventData } from './appdata.js';
import { daysBetween } from './util.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanNotes = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const iso = () => new Date().toISOString();
export const newTaskId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Who's responsible, offered first in the "Who" box.
export const SBE = 'SBE';
export const COUPLE = 'The couple';

// Quick due dates, counted back from the event date: [days before, label].
export const BEFORE_CHOICES = [
  [0, 'Day of the event'], [3, '3 days before'], [7, '1 week before'], [14, '2 weeks before'], [30, '1 month before'],
  [60, '2 months before'], [90, '3 months before'], [180, '6 months before'], [365, '1 year before'],
];

// Tasks due within this many days count as "due this week".
export const SOON_DAYS = 7;

// "2027-06-12" + -14 -> "2027-05-29"
export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export const dueBefore = (eventDate, days) => (isDate(eventDate) ? addDays(eventDate, -days) : '');

export const emptyChecklist = () => ({ updated: null, tasks: [] });

// from: the checklist template task it came from ({tpl, item}); edited: changed by hand since (see packages.js).
function cleanTask(t) {
  return {
    id: String(t.id), title: clean(t.title), due: isDate(t.due) ? t.due : '', who: clean(t.who), notes: cleanNotes(t.notes),
    done: !!t.done, doneAt: t.done ? (t.doneAt || null) : null, doneBy: t.done ? clean(t.doneBy) : '',
    created: t.created || null, createdBy: clean(t.createdBy),
    ...(t.from && t.from.tpl && t.from.item ? { from: { tpl: String(t.from.tpl), item: String(t.from.item) }, edited: !!t.edited } : {}),
  };
}

// Tidy whatever was saved: tasks without an id or a title are dropped.
export function normalizeChecklist(data) {
  const tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
  return { updated: (data && data.updated) || null, tasks: tasks.filter(t => t && t.id && clean(t.title)).map(cleanTask) };
}

// What's wrong with a task before saving it, in plain words ([] when it's fine).
export function checkTask({ title, due }) {
  const problems = [];
  if (!clean(title)) problems.push('Write what needs to be done.');
  if (due && !isDate(due)) problems.push('Pick the due date from the calendar.');
  return problems;
}

export function addTask(list, { id = newTaskId(), title, due = '', who = '', notes = '' }, now = iso(), by = '') {
  return { updated: now, tasks: [...list.tasks, cleanTask({ id, title, due, who, notes, created: now, createdBy: by })] };
}

// Change a task's wording, due date, who or notes (not whether it's done).
// A task from a template that is changed by hand is marked edited, so the template never moves or removes it.
export function updateTask(list, id, { title, due, who, notes }, now = iso()) {
  return {
    updated: now,
    tasks: list.tasks.map(t => {
      if (t.id !== id) return t;
      const next = cleanTask({ ...t, title, due, who, notes });
      const changed = ['title', 'due', 'who', 'notes'].some(k => next[k] !== t[k]);
      return t.from && changed ? { ...next, edited: true } : next;
    }),
  };
}

export function setDone(list, id, done, now = iso(), by = '') {
  return {
    updated: now,
    tasks: list.tasks.map(t => (t.id === id ? cleanTask({ ...t, done, doneAt: done ? now : null, doneBy: done ? by : '' }) : t)),
  };
}

export const removeTask = (list, id, now = iso()) => ({ updated: now, tasks: list.tasks.filter(t => t.id !== id) });

// Where a task stands today: done, overdue, soon (due within a week), later, or nodate.
export function taskState(t, today) {
  if (t.done) return 'done';
  if (!t.due) return 'nodate';
  const days = daysBetween(today, t.due);
  return days < 0 ? 'overdue' : days <= SOON_DAYS ? 'soon' : 'later';
}

const GROUPS = [
  ['overdue', 'Overdue'], ['soon', 'Due this week'], ['later', 'Coming up'], ['nodate', 'No due date'], ['done', 'Done'],
];

// Open tasks by due date (earliest first), done ones most recently finished first.
export function groupTasks(tasks, today) {
  const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title);
  const byDone = (a, b) => String(b.doneAt || '').localeCompare(String(a.doneAt || '')) || a.title.localeCompare(b.title);
  return GROUPS.map(([key, label]) => ({
    key, label, tasks: tasks.filter(t => taskState(t, today) === key).sort(key === 'done' ? byDone : byDue),
  }));
}

// "Show for" choices: everyone named on the tasks, SBE and the couple first, then A-Z.
export function whoChoices(tasks) {
  const names = new Map(); // lower case -> as first written
  for (const t of tasks) if (t.who && !names.has(t.who.toLowerCase())) names.set(t.who.toLowerCase(), t.who);
  const firsts = [SBE, COUPLE].map(w => w.toLowerCase());
  const first = firsts.filter(k => names.has(k)).map(k => names.get(k));
  const rest = [...names].filter(([k]) => !firsts.includes(k)).map(([, v]) => v).sort((a, b) => a.localeCompare(b));
  return [...first, ...rest];
}

export const filterTasks = (tasks, who) => (who ? tasks.filter(t => t.who.toLowerCase() === who.toLowerCase()) : tasks);

/**
 * Tasks copied from another event's checklist, as new open tasks. Due dates keep the same distance from the
 * event date (a task 2 weeks before that wedding is 2 weeks before this one). Tasks with the same wording as
 * one already here are skipped.
 * @returns {Array} the new tasks (ids not yet in use)
 */
export function copyTasks(fromTasks, { fromDate, toDate, existing = [] }, now = iso(), by = '') {
  const have = new Set(existing.map(t => t.title.toLowerCase()));
  const shift = isDate(fromDate) && isDate(toDate) ? daysBetween(fromDate, toDate) : null;
  const out = [];
  for (const t of fromTasks) {
    const key = clean(t.title).toLowerCase();
    if (!key || have.has(key)) continue;
    have.add(key);
    out.push(cleanTask({
      id: newTaskId(), title: t.title, who: t.who, notes: t.notes,
      due: t.due && shift !== null ? addDays(t.due, shift) : '', created: now, createdBy: by,
    }));
  }
  return out;
}

export const addTasks = (list, tasks, now = iso()) => ({ updated: now, tasks: [...list.tasks, ...tasks] });

// ---------- saving to Drive ----------

export async function loadChecklist(driveId) {
  return normalizeChecklist(await readEventData(driveId, 'checklist'));
}

// Apply one change to the latest saved checklist and save it. Returns the saved checklist.
export async function changeChecklist(driveId, change) {
  const next = change(await loadChecklist(driveId));
  await writeEventData(driveId, 'checklist', next);
  return next;
}
