// The home dashboard ("At a glance"): every event at once. Upcoming events with a countdown, checklist tasks
// that are overdue or due soon, payment dates and deadlines from the contracts, vendor insurance to renew,
// and open to-dos. Built from what the app already saved in "SBE App Data"; no documents are read here.
import { indexAppData, readEventData } from './appdata.js';
import { buildReport, deriveActions, withStatusPayments, SCANNER_VERSION } from './scan.js';
import { loadChecklist, taskState } from './checklist.js';
import { loadBook, insuranceState } from './vendors.js';
import { loadTodos } from './todo.js';
import { daysBetween } from './util.js';
import { normalizeSetup, setupText } from './packages.js';

// Events from this many days ago still count (a wedding last week can have open tasks and a final payment).
export const RECENT_DAYS = 60;
// "Coming up" and "From the contracts" look this far ahead.
export const AHEAD_DAYS = 30;

/**
 * Payment dates and deadlines found in an event's contracts, from its saved reading results, with the
 * planner's corrections and Status Update applied. null when the event's documents haven't been read yet.
 */
export function eventActions(reading, corrections, status) {
  if (!reading || reading.version !== SCANNER_VERSION || !reading.files) return null;
  const files = Object.entries(reading.files).map(([id, c]) => ({
    id, name: (c && c.name) || '', path: '', mimeType: '', modifiedTime: c && c.modifiedTime, webViewLink: '', result: c && c.result,
  }));
  const report = buildReport(files, corrections || {});
  return withStatusPayments(deriveActions(report.timeline), (status && status.vendors) || []);
}

// The events the dashboard looks at: upcoming ones, and ones from the last RECENT_DAYS days.
export const relevantEvents = (events, today) =>
  events.filter(e => e.driveId && e.weddingDate && daysBetween(e.weddingDate, today) <= RECENT_DAYS);

/**
 * Everything on the dashboard, from what was loaded for each event.
 * @param {{events, perEvent: Map<driveId, {checklist, actions}>, book, todos, today}} args
 *   actions: from eventActions (null = documents not read yet)
 */
export function summarize({ events, perEvent, book = null, todos = null, today }) {
  const evs = relevantEvents(events, today).sort((a, b) => a.weddingDate.localeCompare(b.weddingDate));
  const upcoming = [], tasks = { overdue: [], soon: [], month: [] }, money = { passed: [], ahead: [] }, unread = [];
  for (const e of evs) {
    const data = perEvent.get(e.driveId) || {};
    const open = ((data.checklist && data.checklist.tasks) || []).filter(t => !t.done);
    const days = daysBetween(today, e.weddingDate);
    for (const t of open) {
      const st = taskState(t, today);
      const row = { event: e, task: t, days: t.due ? daysBetween(today, t.due) : null };
      if (st === 'overdue') tasks.overdue.push(row);
      else if (st === 'soon') tasks.soon.push(row);
      else if (st === 'later' && row.days <= AHEAD_DAYS) tasks.month.push(row);
    }
    if (days >= 0) upcoming.push({ event: e, days, open: open.length, overdue: open.filter(t => taskState(t, today) === 'overdue').length, pkg: setupText(normalizeSetup(data.setup)) });
    if (data.actions === null || data.actions === undefined) { unread.push(e); continue; }
    for (const a of data.actions) {
      const d = daysBetween(today, a.date_iso);
      const paid = a.statusPayment === 'Paid';
      if (a.type === 'payment' && d < 0 && d >= -RECENT_DAYS && !a.confirmed && !paid) money.passed.push({ event: e, action: a, days: d });
      else if (d >= 0 && d <= AHEAD_DAYS && !paid) money.ahead.push({ event: e, action: a, days: d });
    }
  }
  const byDue = (a, b) => (a.task.due || '').localeCompare(b.task.due || '') || a.event.weddingDate.localeCompare(b.event.weddingDate);
  const byDate = (a, b) => a.action.date_iso.localeCompare(b.action.date_iso) || a.event.weddingDate.localeCompare(b.event.weddingDate);
  tasks.overdue.sort(byDue); tasks.soon.sort(byDue); tasks.month.sort(byDue);
  money.passed.sort(byDate); money.ahead.sort(byDate);

  const insurance = ((book && book.vendors) || [])
    .map(v => ({ vendor: v, ins: insuranceState(v, today) }))
    .filter(x => x.ins && x.ins.state !== 'ok')
    .sort((a, b) => a.ins.days - b.ins.days);
  const items = (todos && todos.items) || [];
  const todo = { inProgress: items.filter(t => t.status === 'in-progress').length, notStarted: items.filter(t => t.status !== 'in-progress' && t.status !== 'done').length };
  return { upcoming, tasks, money, unread, insurance, todo };
}

// ---------- with Google Drive ----------

// Run fn on each item, a few at a time.
async function eachLimited(items, limit, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift());
  }));
}

/**
 * Load what the dashboard needs for these events: each one's checklist, reading results, corrections and
 * Status Update, plus the vendor book and the to-do list. Reads only; nothing is saved.
 */
export async function loadDashboard(events, today) {
  await indexAppData();
  const perEvent = new Map();
  await eachLimited(relevantEvents(events, today), 4, async (e) => {
    const [checklist, reading, corrections, status, setup] = await Promise.all([
      loadChecklist(e.driveId),
      readEventData(e.driveId, 'reading'),
      readEventData(e.driveId, 'corrections'),
      readEventData(e.driveId, 'status'),
      readEventData(e.driveId, 'setup'),
    ]);
    perEvent.set(e.driveId, { checklist, setup, actions: eventActions(reading, corrections, status) });
  });
  const [book, todos] = await Promise.all([loadBook().catch(() => null), loadTodos().catch(() => null)]);
  return summarize({ events, perEvent, book, todos, today });
}
