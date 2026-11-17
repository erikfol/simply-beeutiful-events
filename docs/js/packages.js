// SBE's packages and checklist templates. Each event has a setup (event-<id>.setup.json): its package, the
// Queen Bee services a Blossom & Bee client chose, and its ceremony traditions. Checklist templates are shared
// (checklist-templates.json in "SBE App Data"): named lists of tasks, each "N days before" the event, for a
// package, a service, a tradition or every event. Applying the setup adds the matching template tasks to the
// event's checklist with real due dates, and takes away ones that no longer apply (never done or edited ones).
import { readData, writeData, readEventData, writeEventData } from './appdata.js';
import { addDays, newTaskId } from './checklist.js';

// Names from the team's description of the packages (November 2026); change them here if they change.
export const PACKAGES = [
  ['bee-blissful', 'Bee Blissful', 'Event Management'],
  ['blossom-bee', 'Blossom & Bee', 'Partial Planning'],
  ['queen-bee', 'The Queen Bee', 'Full Planning'],
  ['other', 'Other Event', 'Not a wedding'],
];
// The wedding packages build on each other: Blossom & Bee includes Bee Blissful, The Queen Bee includes both.
const LEVEL = { 'bee-blissful': 1, 'blossom-bee': 2, 'queen-bee': 3 };

// Queen Bee services a Blossom & Bee client can add (all are part of The Queen Bee).
export const SERVICES = [
  ['venues-vendors', 'Venue and vendor recommendations and tours'],
  ['travel', 'Accommodations and transportation'],
  ['stationery', 'Invitations and signage'],
  ['rsvp-website', 'RSVPs and the wedding website'],
  ['design', 'Menu, décor, design and layout planning'],
];

export const TRADITIONS = [
  ['jewish', 'Jewish'], ['hindu', 'Hindu'], ['muslim', 'Muslim'], ['sikh', 'Sikh'], ['interfaith', 'Interfaith'], ['civil', 'Civil'],
];

const label = (list, key) => (list.find(([k]) => k === key) || [])[1] || '';
export const packageLabel = (key) => label(PACKAGES, key);
export const serviceLabel = (key) => label(SERVICES, key);
export const traditionLabel = (key) => label(TRADITIONS, key);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cleanNotes = (s) => String(s ?? '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, '')).join('\n').trim();
const iso = () => new Date().toISOString();
const keysIn = (list, values) => [...new Set((Array.isArray(values) ? values : []).filter(v => list.some(([k]) => k === v)))];
export const newTemplateId = () => `tpl${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newItemId = () => `ti${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---------- "when": days before the event ----------

/**
 * "6 weeks before" -> 42, "3 months" -> 90, "10 days" -> 10, "day of" -> 0, "2 days after" -> -2.
 * A number alone is days. @returns {number|null} null when it can't be read; '' means no due date.
 */
export function parseWhen(text) {
  const s = clean(text).toLowerCase();
  if (!s) return '';
  if (/^(the )?day of( the event)?$|^on the day$|^wedding day$/.test(s)) return 0;
  const m = /^(\d+(?:\.\d+)?)\s*(d|days?|w|wks?|weeks?|m|mos?|months?|y|yrs?|years?)?\s*(before|ahead|prior|after|later)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] || 'd')[0];
  const days = Math.round(n * ({ d: 1, w: 7, m: 30, y: 365 })[unit]);
  return m[3] === 'after' || m[3] === 'later' ? -days : days;
}

// 42 -> "6 weeks before", 90 -> "3 months before", 0 -> "Day of the event", -2 -> "2 days after"
export function formatWhen(days) {
  if (days === '' || days == null) return '';
  if (days === 0) return 'Day of the event';
  const n = Math.abs(days);
  const side = days > 0 ? 'before' : 'after';
  const unit = n % 365 === 0 ? [n / 365, 'year'] : n % 30 === 0 ? [n / 30, 'month'] : n % 7 === 0 ? [n / 7, 'week'] : [n, 'day'];
  return `${unit[0]} ${unit[1]}${unit[0] === 1 ? '' : 's'} ${side}`;
}

// ---------- an event's setup ----------

export const emptySetup = () => ({ package: '', services: [], traditions: [], updated: null });

export function normalizeSetup(data) {
  const d = data || {};
  return {
    package: PACKAGES.some(([k]) => k === d.package) ? d.package : '',
    services: keysIn(SERVICES, d.services),
    traditions: keysIn(TRADITIONS, d.traditions),
    updated: d.updated || null,
  };
}

// "The Queen Bee · Jewish" (for headers and the dashboard); '' when no package is chosen.
export function setupText(setup) {
  if (!setup || !setup.package) return '';
  const parts = [packageLabel(setup.package)];
  if (setup.package === 'blossom-bee' && setup.services.length) parts.push(`+ ${setup.services.map(serviceLabel).join(', ')}`);
  if (setup.traditions.length) parts.push(setup.traditions.map(traditionLabel).join(', '));
  return parts.join(' · ');
}

// ---------- templates ----------

// What a template is for: {kind: 'all'} | {kind: 'package'|'service'|'tradition', key}.
const KINDS = { package: PACKAGES, service: SERVICES, tradition: TRADITIONS };

function cleanFor(f) {
  if (!f || f.kind === 'all') return { kind: 'all' };
  return KINDS[f.kind] && KINDS[f.kind].some(([k]) => k === f.key) ? { kind: f.kind, key: f.key } : { kind: 'all' };
}

export function forText(f) {
  if (f.kind === 'all') return 'Every event';
  if (f.kind === 'package') return `${packageLabel(f.key)} package`;
  if (f.kind === 'service') return `Service: ${serviceLabel(f.key)}`;
  return `${traditionLabel(f.key)} ceremony`;
}

// Every "applies to" choice, for the template form: [value, label] with value "kind:key".
export const FOR_CHOICES = [
  ['all', 'Every event'],
  ...PACKAGES.map(([k, l]) => [`package:${k}`, `${l} package`]),
  ...SERVICES.map(([k, l]) => [`service:${k}`, `Service: ${l}`]),
  ...TRADITIONS.map(([k, l]) => [`tradition:${k}`, `${l} ceremony`]),
];
export const forValue = (f) => (f.kind === 'all' ? 'all' : `${f.kind}:${f.key}`);
export const forFromValue = (v) => { const [kind, key] = String(v || 'all').split(':'); return cleanFor({ kind, key }); };

function cleanItem(it) {
  const before = typeof it.before === 'number' && Number.isFinite(it.before) ? Math.round(it.before) : '';
  return { id: String(it.id || newItemId()), title: clean(it.title), before, who: clean(it.who), notes: cleanNotes(it.notes) };
}

function cleanTemplate(t) {
  return {
    id: String(t.id), name: clean(t.name) || 'Untitled template', for: cleanFor(t.for),
    items: (Array.isArray(t.items) ? t.items : []).filter(it => it && clean(it.title)).map(cleanItem),
    updated: t.updated || null, updatedBy: clean(t.updatedBy),
  };
}

export const emptyTemplates = () => ({ updated: null, templates: [] });

export function normalizeTemplates(data) {
  const list = Array.isArray(data && data.templates) ? data.templates : [];
  return { updated: (data && data.updated) || null, templates: list.filter(t => t && t.id).map(cleanTemplate) };
}

export function upsertTemplate(book, t, now = iso(), by = '') {
  const next = cleanTemplate({ ...t, updated: now, updatedBy: by });
  const has = book.templates.some(x => x.id === next.id);
  return { updated: now, templates: has ? book.templates.map(x => (x.id === next.id ? next : x)) : [...book.templates, next] };
}

export const removeTemplate = (book, id, now = iso()) => ({ updated: now, templates: book.templates.filter(t => t.id !== id) });

// A template from an event's checklist: each task's due date becomes "N days before" that event.
export function templateFromChecklist(tasks, eventDate, { name, for: f }) {
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const daysBefore = (due) => (isDate(due) && isDate(eventDate)
    ? Math.round((Date.parse(`${eventDate}T12:00:00Z`) - Date.parse(`${due}T12:00:00Z`)) / 86400000) : '');
  return cleanTemplate({
    id: newTemplateId(), name, for: f,
    items: tasks.map(t => ({ id: newItemId(), title: t.title, before: daysBefore(t.due), who: t.who, notes: t.notes })),
  });
}

// Does a template apply to an event with this setup?
export function applies(f, setup) {
  if (!setup || !setup.package) return false;
  if (f.kind === 'all') return true;
  if (f.kind === 'tradition') return setup.traditions.includes(f.key);
  if (f.kind === 'package') {
    if (f.key === 'other' || setup.package === 'other') return f.key === setup.package;
    return (LEVEL[setup.package] || 0) >= (LEVEL[f.key] || 9);
  }
  if (f.kind === 'service') return setup.package === 'queen-bee' || (setup.package === 'blossom-bee' && setup.services.includes(f.key));
  return false;
}

// ---------- bringing an event's checklist in line with its setup ----------

/**
 * What applying the setup would change in an event's checklist:
 * add: new tasks from templates that apply; remove: template tasks that no longer apply (not done, not edited);
 * move: template tasks whose due date changed (the event date or the template's "when" changed).
 * Tasks a planner added by hand are never touched.
 */
export function planSync(tasks, templates, setup, eventDate, now = iso(), by = '') {
  const wanted = new Map(); // "tpl/item" -> {tpl, item}
  for (const t of templates) if (applies(t.for, setup)) for (const it of t.items) wanted.set(`${t.id}/${it.id}`, { t, it });
  const dueOf = (it) => (it.before === '' || !eventDate ? '' : addDays(eventDate, -it.before));
  const have = new Map();
  const remove = [], move = [];
  for (const task of tasks) {
    if (!task.from) continue;
    const key = `${task.from.tpl}/${task.from.item}`;
    have.set(key, task);
    const w = wanted.get(key);
    if (!w) { if (!task.done && !task.edited) remove.push(task); continue; }
    const due = dueOf(w.it);
    if (!task.done && !task.edited && due !== task.due) move.push({ task, due });
  }
  // a task already on the checklist with the same wording (added by hand, copied, or saved as this template)
  const titles = new Set(tasks.map(task => task.title.toLowerCase()));
  const add = [];
  for (const [key, { t, it }] of wanted) {
    if (have.has(key) || titles.has(it.title.toLowerCase())) continue;
    titles.add(it.title.toLowerCase());
    add.push({ id: newTaskId(), title: it.title, due: dueOf(it), who: it.who, notes: it.notes, done: false, doneAt: null, doneBy: '', created: now, createdBy: by, from: { tpl: t.id, item: it.id } });
  }
  return { add, remove, move };
}

// Apply a plan to the (latest saved) checklist. Safe to apply again: it adds nothing that's already there.
export function applySync(list, plan, now = iso()) {
  const removeIds = new Set(plan.remove.map(t => t.id));
  const moves = new Map(plan.move.map(m => [m.task.id, m.due]));
  const present = new Set(list.tasks.filter(t => t.from).map(t => `${t.from.tpl}/${t.from.item}`));
  return {
    updated: now,
    tasks: [
      ...list.tasks.filter(t => !removeIds.has(t.id)).map(t => (moves.has(t.id) ? { ...t, due: moves.get(t.id) } : t)),
      ...plan.add.filter(t => !present.has(`${t.from.tpl}/${t.from.item}`)),
    ],
  };
}

// ---------- saving to Drive ----------

export const TEMPLATES_FILE = 'checklist-templates.json';

export async function loadTemplates() { return normalizeTemplates(await readData(TEMPLATES_FILE)); }

export async function changeTemplates(change) {
  const next = change(await loadTemplates());
  await writeData(TEMPLATES_FILE, next);
  return next;
}

export async function loadSetup(driveId) { return normalizeSetup(await readEventData(driveId, 'setup')); }

export async function saveSetup(driveId, setup, now = iso()) {
  const next = { ...normalizeSetup(setup), updated: now };
  await writeEventData(driveId, 'setup', next);
  return next;
}
