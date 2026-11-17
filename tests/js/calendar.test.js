import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthGrid, shiftMonth, parseMonth, monthKey, calendarItems, calendarEvents, byDate, eventTitle } from '../../docs/js/calendar.js';

const TODAY = '2026-11-17';
const ev = (driveId, name, weddingDate) => ({ id: `drive-${driveId}`, driveId, name, weddingDate });

test('a month is drawn as whole weeks, Sunday first', () => {
  const nov = monthGrid(2026, 11); // November 1, 2026 is a Sunday
  assert.equal(nov.length, 5);
  assert.ok(nov.every(w => w.length === 7));
  assert.deepEqual([nov[0][0].date, nov[4][6].date], ['2026-11-01', '2026-12-05']);
  assert.deepEqual([nov[0][0].inMonth, nov[4][6].inMonth], [true, false]);
  const feb = monthGrid(2027, 2); // February 1, 2027 is a Monday
  assert.deepEqual([feb[0][0].date, feb[0][1].date, feb[0][0].inMonth], ['2027-01-31', '2027-02-01', false]);
  assert.equal(feb.flat().filter(d => d.inMonth).length, 28);
  assert.equal(monthGrid(2028, 2).flat().filter(d => d.inMonth).length, 29, 'leap year');
});

test('moving between months, and the month in the address', () => {
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth(2027, 1, -1), { y: 2026, m: 12 });
  assert.deepEqual(shiftMonth(2026, 11, -14), { y: 2025, m: 9 });
  assert.deepEqual(parseMonth('#2027-06'), { y: 2027, m: 6 });
  assert.equal(parseMonth('#2027-13'), null);
  assert.equal(parseMonth('#d-2027-06-12'), null);
  assert.equal(monthKey(2027, 6), '2027-06');
});

test('every event, open task and contract date lands on its day', () => {
  const harper = ev('h', '6.12.27 Harper-Bennett Wedding', '2027-06-12');
  const old = ev('o', '5.1.25 Old Wedding', '2025-05-01');
  assert.deepEqual(calendarEvents([harper, old], TODAY).map(e => e.driveId), ['h'], 'events more than a year back aren\'t loaded');
  assert.equal(eventTitle(harper), 'Harper-Bennett Wedding');

  const perEvent = new Map([['h', {
    setup: { package: 'queen-bee' },
    checklist: { tasks: [
      { id: 'a', title: 'Send deposit', due: '2026-11-10', who: 'SBE', done: false },
      { id: 'b', title: 'Done already', due: '2026-11-12', done: true },
      { id: 'c', title: 'No date', due: '', done: false },
      { id: 'd', title: 'Ketubah', due: '2027-03-14', who: 'The couple', done: false },
    ] },
    actions: [
      { type: 'payment', kind: 'Deposit', date_iso: '2026-11-01', vendor: 'Juniper', amount: 500 },
      { type: 'payment', kind: 'Balance', date_iso: '2026-11-02', vendor: 'Paid one', amount: 9, statusPayment: 'Paid' },
      { type: 'deadline', kind: 'Deadline', date_iso: '2027-06-12', vendor: 'Hearth', amount: null },
    ],
  }]]);
  const items = calendarItems({ events: [harper, old], perEvent, today: TODAY });
  assert.deepEqual(items.map(i => [i.date, i.kind, i.title]), [
    ['2025-05-01', 'event', 'Old Wedding'],
    ['2026-11-01', 'payment', 'Deposit $500.00'],
    ['2026-11-02', 'payment', 'Balance $9.00'],
    ['2026-11-10', 'task', 'Send deposit'],
    ['2027-03-14', 'task', 'Ketubah'],
    ['2027-06-12', 'event', 'Harper-Bennett Wedding'],
    ['2027-06-12', 'deadline', 'Deadline'],
  ], 'done and undated tasks stay off; the event comes first on its day');
  const by = (title) => items.find(i => i.title.startsWith(title));
  assert.equal(by('Deposit').late, true, 'date passed, not marked paid');
  assert.deepEqual([by('Balance').paid, by('Balance').late], [true, false]);
  assert.equal(by('Send deposit').late, true);
  assert.equal(by('Ketubah').late, false);
  assert.equal(by('Harper').pkg, 'The Queen Bee');
  assert.deepEqual(byDate(items).get('2027-06-12').map(i => i.kind), ['event', 'deadline']);
});

test('to-dos with a due date show on the calendar as tasks, linked to their event when they have one', () => {
  const harper = ev('h', '6.12.27 Harper-Bennett Wedding', '2027-06-12');
  const todos = { items: [
    { id: 't1', title: 'Order linens', status: 'not-started', due: '2026-11-15', who: 'Grace', event: { driveId: 'h', name: harper.name } },
    { id: 't2', title: 'Renew website', status: 'in-progress', due: '2026-12-01' },
    { id: 't3', title: 'Done', status: 'done', due: '2026-11-20' },
    { id: 't4', title: 'Undated', status: 'not-started' },
  ] };
  const items = calendarItems({ events: [harper], perEvent: new Map(), today: TODAY, todos }).filter(i => i.todo);
  assert.deepEqual(items.map(i => [i.date, i.kind, i.title, i.late, i.event && i.event.driveId]), [
    ['2026-11-15', 'task', 'Order linens', true, 'h'],
    ['2026-12-01', 'task', 'Renew website', false, null],
  ]);
});
