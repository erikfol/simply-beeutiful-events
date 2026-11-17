// The month calendar: every event on its date, every open checklist task on its due date, and every payment
// date and deadline from the contracts. Pure: built from what loadEventData (dashboard.js) gathered.
import { taskState, addDays } from './checklist.js';
import { normalizeSetup, setupText } from './packages.js';
import { parseEventFolderName } from './driveEvents.js';
import { daysBetween, fmt$ } from './util.js';
import { todoEvent } from './todo.js';

// Events from up to this many days ago are loaded (a year back, so last season's months aren't empty).
export const CALENDAR_PAST_DAYS = 400;

export const calendarEvents = (events, today) =>
  events.filter(e => e.driveId && e.weddingDate && daysBetween(e.weddingDate, today) <= CALENDAR_PAST_DAYS);

// "6.12.27 Harper-Bennett Wedding" -> "Harper-Bennett Wedding"
export const eventTitle = (e) => (parseEventFolderName(e.name || '').title || e.name || '').trim();

const KIND_ORDER = { event: 0, payment: 1, deadline: 2, task: 3 };

/**
 * One item per thing on a day: {date, kind: 'event'|'task'|'payment'|'deadline', title, event, ...}.
 * Tasks: open ones only, late when overdue. Payments: paid when marked so on Status Update; late when the date
 * passed and it isn't checked or paid.
 */
export function calendarItems({ events, perEvent, today, todos = null }) {
  const items = [];
  // to-dos with a due date, as tasks (todo: the to-do, so the calendar links to the To Do page)
  for (const t of ((todos && todos.items) || []).filter(x => x.status !== 'done' && x.due)) {
    items.push({ date: t.due, kind: 'task', title: t.title, who: t.who || '', event: todoEvent(t, events), todo: t, late: t.due < today });
  }
  for (const e of events) {
    if (!e.weddingDate) continue;
    const data = perEvent.get(e.driveId) || {};
    items.push({ date: e.weddingDate, kind: 'event', title: eventTitle(e), event: e, pkg: setupText(normalizeSetup(data.setup)) });
    for (const t of (data.checklist && data.checklist.tasks) || []) {
      if (!t.due || t.done) continue;
      items.push({ date: t.due, kind: 'task', title: t.title, who: t.who, event: e, late: taskState(t, today) === 'overdue' });
    }
    for (const a of data.actions || []) {
      const paid = a.statusPayment === 'Paid';
      items.push({
        date: a.date_iso, kind: a.type === 'payment' ? 'payment' : 'deadline',
        title: `${a.kind}${a.amount != null ? ` ${fmt$(a.amount)}` : ''}`, vendor: a.vendor || '', event: e, paid,
        late: a.type === 'payment' && a.date_iso < today && !a.confirmed && !paid,
      });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title));
}

export function byDate(items) {
  const m = new Map();
  for (const it of items) { if (!m.has(it.date)) m.set(it.date, []); m.get(it.date).push(it); }
  return m;
}

const pad = (n) => String(n).padStart(2, '0');
export const monthKey = (y, m) => `${y}-${pad(m)}`;

// The month before or after: shiftMonth(2027, 12, 1) -> {y: 2028, m: 1}
export function shiftMonth(y, m, delta) {
  const i = y * 12 + (m - 1) + delta;
  return { y: Math.floor(i / 12), m: (i % 12) + 1 };
}

// "2027-06" -> {y: 2027, m: 6}; null when it isn't a month.
export function parseMonth(s) {
  const r = /^(\d{4})-(\d{2})$/.exec(String(s || '').replace(/^#/, ''));
  return r && +r[2] >= 1 && +r[2] <= 12 ? { y: +r[1], m: +r[2] } : null;
}

/**
 * The weeks to draw for a month, Sunday first: [[{date, inMonth}, ...7], ...] covering the whole month.
 */
export function monthGrid(y, m) {
  const first = `${y}-${pad(m)}-01`;
  const startDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = addDays(first, -startDow);
  const total = Math.ceil((startDow + days) / 7) * 7;
  const weeks = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(start, i);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ date, inMonth: date.slice(0, 7) === monthKey(y, m) });
  }
  return weeks;
}
