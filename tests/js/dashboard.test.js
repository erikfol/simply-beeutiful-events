import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess, writeEventData, readData, writeData, indexAppData } from '../../docs/js/appdata.js';
import { scanText, SCANNER_VERSION, withStatusPayments } from '../../docs/js/scan.js';
import { changeChecklist, addTask, setDone } from '../../docs/js/checklist.js';
import { eventActions, summarize, relevantEvents, loadDashboard } from '../../docs/js/dashboard.js';

const TODAY = '2026-11-17';
const ev = (driveId, name, weddingDate) => ({ id: `drive-${driveId}`, driveId, name, weddingDate, source: 'drive' });

// Reading results as the app saves them (event-<id>.reading.json), from a made-up proposal.
function readingOf(text, name = 'Hearth & Table Catering - Proposal') {
  return { version: SCANNER_VERSION, files: { f1: { modifiedTime: '2026-11-01T00:00:00Z', name, result: scanText(text, name) } } };
}

test('Status Update dates join the contract dates: a matching payment gets its status, others are added unless paid', () => {
  const actions = [{ type: 'payment', date_iso: '2027-03-01', vendor: 'Hearth & Table Catering', kind: 'Deposit' }];
  const out = withStatusPayments(actions, [
    { name: 'Hearth & Table', payment: 'Paid', dueDate: '2027-03-01' },
    { name: 'Glow Studio', payment: 'Due', dueDate: '2027-02-01', notes: 'second half' },
    { name: 'Bluebell Blooms', payment: 'Paid', dueDate: '2027-01-01' },
    { name: 'No date', payment: 'Due' },
  ]);
  assert.deepEqual(out.map(a => [a.date_iso, a.vendor, a.statusPayment || a.kind]), [
    ['2027-02-01', 'Glow Studio', 'Payment (Due)'],
    ['2027-03-01', 'Hearth & Table Catering', 'Paid'],
  ]);
});

test('eventActions finds payment dates and deadlines in saved reading results', () => {
  const actions = eventActions(readingOf('A deposit of $500 is due on March 1, 2027. The final guest count is due by May 29, 2027.'), {}, null);
  assert.deepEqual(actions.map(a => [a.type, a.date_iso, a.amount]), [['payment', '2027-03-01', 500], ['deadline', '2027-05-29', null]]);
  assert.equal(actions[0].vendor, 'Hearth & Table Catering');
  assert.equal(eventActions(null, {}, null), null, 'not read yet');
  assert.equal(eventActions({ version: -1, files: {} }, {}, null), null, 'read by an older version of the app: read again');
  const ignored = eventActions(readingOf('A deposit of $500 is due on March 1, 2027.'), { [`${actions[0].source}|${actions[0].date_raw}`]: { status: 'ignored' } }, null);
  assert.deepEqual(ignored, [], 'a fact marked Ignore on the Overview stays hidden');
});

test('the dashboard gathers upcoming events, tasks due soon, and contract dates across events', () => {
  const harper = ev('h', '6.12.27 Harper-Bennett Wedding', '2027-06-12');
  const lopez = ev('l', '10.30.26 Lopez-Kim Wedding', '2026-10-30');   // 18 days ago: still counts
  const old = ev('o', '3.1.26 Old Wedding', '2026-03-01');             // long past: left out
  const unread = ev('u', '12.5.26 Nguyen-Patel Wedding', '2026-12-05');
  assert.deepEqual(relevantEvents([harper, lopez, old, unread], TODAY).map(e => e.driveId), ['h', 'l', 'u']);

  const task = (id, title, due, extra = {}) => ({ id, title, due, who: 'SBE', notes: '', done: false, ...extra });
  const perEvent = new Map([
    ['h', {
      checklist: { tasks: [
        task('a', 'Send venue deposit', '2026-11-10'),
        task('b', 'Tasting', '2026-11-20'),
        task('c', 'Book shuttle', '2026-12-10'),
        task('d', 'Later thing', '2027-03-01'),
        task('e', 'Done thing', '2026-11-01', { done: true }),
      ] },
      actions: [
        { type: 'payment', kind: 'Deposit', date_iso: '2026-11-01', vendor: 'Juniper', amount: 500 },
        { type: 'payment', kind: 'Deposit', date_iso: '2026-11-02', vendor: 'Checked', amount: 1, confirmed: true },
        { type: 'payment', kind: 'Deposit', date_iso: '2026-11-03', vendor: 'Paid one', amount: 1, statusPayment: 'Paid' },
        { type: 'deadline', kind: 'Deadline', date_iso: '2026-11-25', vendor: 'Hearth', amount: null },
        { type: 'payment', kind: 'Balance', date_iso: '2027-05-01', vendor: 'Too far', amount: 9 },
      ],
    }],
    ['l', { checklist: { tasks: [task('x', 'Return rentals', '2026-11-05')] }, actions: [] }],
    ['u', { checklist: null, actions: null, setup: { package: 'queen-bee', traditions: ['sikh'] } }],
  ]);
  const book = { vendors: [
    { id: 'v1', name: 'Bluebell Blooms', insuranceExpires: '2026-10-01' },
    { id: 'v2', name: 'Juniper Lane', insuranceExpires: '2026-12-01' },
    { id: 'v3', name: 'Fine', insuranceExpires: '2027-12-01' },
  ] };
  const todos = { items: [{ status: 'in-progress' }, { status: 'not-started' }, { status: 'not-started' }, { status: 'done' }] };
  const d = summarize({ events: [harper, lopez, old, unread], perEvent, book, todos, today: TODAY });

  assert.deepEqual(d.upcoming.map(u => [u.event.driveId, u.days, u.open, u.overdue]), [['u', 18, 0, 0], ['h', 207, 4, 1]], 'soonest first; past events are not "coming up"');
  assert.deepEqual(d.upcoming.map(u => u.pkg), ['The Queen Bee · Sikh', ''], 'each event\'s package, when chosen');
  assert.deepEqual(d.tasks.overdue.map(r => r.task.id), ['x', 'a'], 'overdue tasks from past events still show');
  assert.deepEqual(d.tasks.soon.map(r => r.task.id), ['b']);
  assert.deepEqual(d.tasks.month.map(r => r.task.id), ['c']);
  assert.deepEqual(d.money.passed.map(m => m.action.vendor), ['Juniper'], 'checked and paid ones drop off');
  assert.deepEqual(d.money.ahead.map(m => m.action.vendor), ['Hearth']);
  assert.deepEqual(d.unread.map(e => e.driveId), ['u']);
  assert.deepEqual(d.insurance.map(x => x.vendor.name), ['Bluebell Blooms', 'Juniper Lane']);
  assert.deepEqual(d.todo, { inProgress: 1, notStarted: 2 });
});

// ---------- with the fake Google Drive ----------

const OWNER = 'owner@example.com';
let drive, ids, appId;

beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive);
  useFakeAuth();
  await signIn();
  forgetAppData();
  useTransport(drive.as(OWNER));
  useEventsFolder(ids.root);
  appId = (await sharedAccess()).folder.id;
});

test('loadDashboard reads each event\'s saved checklist and reading results, and saves nothing', async () => {
  await changeChecklist(ids.harper, l => setDone(addTask(addTask(l, { id: 'a', title: 'Send deposit', due: '2026-11-10' }), { id: 'b', title: 'Old', due: '2026-11-01' }), 'b', true));
  await writeEventData(ids.harper, 'reading', readingOf('A deposit of $500 is due on November 25, 2026.'));
  forgetAppData(); useEventsFolder(ids.root);
  const events = [ev(ids.harper, '6.12.27 Harper-Bennett Wedding (Demo)', '2027-06-12'), ev(ids.lopez, '12.1.26 Lopez-Kim Wedding', '2026-12-01')];
  const before = drive.files.size;
  const writes = drive.calls.length;
  const d = await loadDashboard(events, TODAY);
  assert.deepEqual(d.tasks.overdue.map(r => r.task.title), ['Send deposit']);
  assert.deepEqual(d.money.ahead.map(m => [m.action.kind, m.action.amount]), [['Deposit', 500]]);
  assert.deepEqual(d.unread.map(e => e.driveId), [ids.lopez]);
  assert.equal(drive.files.size, before, 'nothing created');
  assert.ok(!drive.calls.slice(writes).some(c => /^(POST|PATCH|PUT|DELETE) /.test(c)), 'only reads');
});

test('after reading the whole file list, saving still finds a file someone else just made', async () => {
  await indexAppData();
  drive.add({ name: 'team.json', mimeType: 'application/json', parent: appId, owner: OWNER, content: JSON.stringify({ people: { 'x@example.com': {} } }) });
  assert.equal(await readData('team.json'), null, 'reads trust the list read a moment ago');
  await writeData('team.json', { people: {} });
  assert.equal([...drive.files.values()].filter(f => f.name === 'team.json').length, 1, 'updated, not duplicated');
  await indexAppData();
  assert.deepEqual(await readData('team.json'), { people: {} }, 'reading the list again picks it up');
});
