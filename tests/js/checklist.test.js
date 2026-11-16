import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import { appDataName } from '../../docs/js/driveEvents.js';
import {
  addDays, dueBefore, emptyChecklist, normalizeChecklist, checkTask, addTask, updateTask, setDone, removeTask,
  taskState, groupTasks, whoChoices, filterTasks, copyTasks, addTasks, loadChecklist, changeChecklist, BEFORE_CHOICES,
} from '../../docs/js/checklist.js';

const NOW = '2026-11-16T15:00:00.000Z';
const TODAY = '2026-11-16';

test('dates count back from the event date, across months and years', () => {
  assert.equal(addDays('2027-06-12', -14), '2027-05-29');
  assert.equal(addDays('2027-01-03', -7), '2026-12-27');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29', 'leap year');
  assert.equal(dueBefore('2027-06-12', 30), '2027-05-13');
  assert.equal(dueBefore('', 30), '', 'no event date, no due date');
  assert.deepEqual(BEFORE_CHOICES[0], [0, 'Day of the event']);
});

test('checkTask explains what is missing', () => {
  assert.deepEqual(checkTask({ title: 'Confirm florist', due: '2027-06-01' }), []);
  assert.deepEqual(checkTask({ title: '  ', due: 'soon' }), ['Write what needs to be done.', 'Pick the due date from the calendar.']);
  assert.deepEqual(checkTask({ title: 'No date is fine', due: '' }), []);
});

test('tasks are added, edited, ticked off, reopened and deleted', () => {
  let list = addTask(emptyChecklist(), { id: 'a', title: '  Confirm   florist ', due: '2026-11-20', who: 'SBE' }, NOW, 'Nicole');
  assert.deepEqual(list.tasks[0], { id: 'a', title: 'Confirm florist', due: '2026-11-20', who: 'SBE', notes: '', done: false, doneAt: null, doneBy: '', created: NOW, createdBy: 'Nicole' });
  list = updateTask(list, 'a', { title: 'Confirm florist delivery', due: '2026-11-21', who: 'Bluebell Blooms', notes: 'Ask about arch' }, NOW);
  assert.deepEqual([list.tasks[0].title, list.tasks[0].who, list.tasks[0].created], ['Confirm florist delivery', 'Bluebell Blooms', NOW]);
  list = setDone(list, 'a', true, '2026-11-17T09:00:00.000Z', 'Grace');
  assert.deepEqual([list.tasks[0].done, list.tasks[0].doneAt, list.tasks[0].doneBy], [true, '2026-11-17T09:00:00.000Z', 'Grace']);
  list = setDone(list, 'a', false, NOW);
  assert.deepEqual([list.tasks[0].done, list.tasks[0].doneAt, list.tasks[0].doneBy], [false, null, '']);
  assert.equal(removeTask(list, 'a').tasks.length, 0);
});

test('normalizeChecklist drops tasks it cannot use', () => {
  const list = normalizeChecklist({ tasks: [{ id: 'a', title: 'Book shuttle', due: 'next week' }, { id: 'b', title: ' ' }, { title: 'no id' }, null] });
  assert.deepEqual(list.tasks.map(t => [t.id, t.due]), [['a', '']]);
  assert.deepEqual(normalizeChecklist(null), emptyChecklist());
});

test('tasks are grouped by when they are due', () => {
  const tasks = normalizeChecklist({ tasks: [
    { id: 'late', title: 'Send deposit', due: '2026-11-10' },
    { id: 'today', title: 'Call venue', due: TODAY },
    { id: 'week', title: 'Tasting', due: '2026-11-23' },
    { id: 'later2', title: 'B later', due: '2027-03-01' },
    { id: 'later1', title: 'A later', due: '2027-01-15' },
    { id: 'nodate', title: 'Someday' },
    { id: 'done1', title: 'Older done', due: '2026-11-01', done: true, doneAt: '2026-11-01T10:00:00Z' },
    { id: 'done2', title: 'Newer done', done: true, doneAt: '2026-11-15T10:00:00Z' },
  ] }).tasks;
  assert.equal(taskState(tasks[0], TODAY), 'overdue');
  assert.equal(taskState(tasks[1], TODAY), 'soon');
  assert.equal(taskState(tasks[2], TODAY), 'soon', 'a week out is still "this week"');
  assert.deepEqual(groupTasks(tasks, TODAY).map(g => [g.key, g.tasks.map(t => t.id)]), [
    ['overdue', ['late']], ['soon', ['today', 'week']], ['later', ['later1', 'later2']], ['nodate', ['nodate']], ['done', ['done2', 'done1']],
  ]);
});

test('"Show for" lists who is on the tasks, SBE and the couple first, and filters by them', () => {
  const tasks = normalizeChecklist({ tasks: [
    { id: '1', title: 'a', who: 'Juniper Lane Photography' }, { id: '2', title: 'b', who: 'the couple' },
    { id: '3', title: 'c', who: 'SBE' }, { id: '4', title: 'd', who: 'Grace' }, { id: '5', title: 'e', who: 'sbe' }, { id: '6', title: 'f' },
  ] }).tasks;
  assert.deepEqual(whoChoices(tasks), ['SBE', 'the couple', 'Grace', 'Juniper Lane Photography']);
  assert.deepEqual(filterTasks(tasks, 'SBE').map(t => t.id), ['3', '5']);
  assert.equal(filterTasks(tasks, '').length, 6);
});

test('copying tasks from another event keeps each task the same distance from the event date', () => {
  const theirs = normalizeChecklist({ tasks: [
    { id: 'x', title: 'Final guest count', due: '2026-09-19', who: 'The couple', done: true, doneAt: NOW },
    { id: 'y', title: 'Confirm shuttles', due: '2026-10-01', who: 'SBE', notes: 'Two buses' },
    { id: 'z', title: 'Pick linens' },
    { id: 'dup', title: 'already HERE' },
  ] }).tasks;
  const existing = [{ title: 'Already here' }];
  // their wedding: 10.3.26; this one: 6.12.27
  const copied = copyTasks(theirs, { fromDate: '2026-10-03', toDate: '2027-06-12', existing }, NOW, 'Nicole');
  assert.deepEqual(copied.map(t => [t.title, t.due, t.who, t.done]), [
    ['Final guest count', '2027-05-29', 'The couple', false], // 2 weeks before, and not done
    ['Confirm shuttles', '2027-06-10', 'SBE', false],
    ['Pick linens', '', '', false],
  ]);
  assert.ok(copied.every(t => !['x', 'y', 'z'].includes(t.id)), 'new ids');
  assert.equal(copied[1].notes, 'Two buses');
  const noDate = copyTasks(theirs, { fromDate: '2026-10-03', toDate: '', existing: [] });
  assert.ok(noDate.every(t => t.due === ''), 'no event date here: no due dates');
  assert.equal(addTasks(emptyChecklist(), copied, NOW).tasks.length, 3);
});

// ---------- with the fake Google Drive ----------

const OWNER = 'owner@example.com';
const PLANNER = 'planner@example.com';
let drive, ids, appId;

beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive);
  useFakeAuth();
  await signIn();
  appId = (await signedInAs(OWNER)).folder.id;
});

async function signedInAs(email) {
  forgetAppData();
  useTransport(drive.as(email));
  useEventsFolder(ids.root);
  return sharedAccess();
}

test('each event\'s checklist saves in "SBE App Data", and two planners keep each other\'s changes', async () => {
  drive.share(appId, PLANNER, 'editor');
  await changeChecklist(ids.harper, l => addTask(l, { id: 'a', title: 'Book shuttle', due: '2027-05-01', who: 'SBE' }, NOW));
  await signedInAs(PLANNER);
  await changeChecklist(ids.harper, l => addTask(l, { id: 'b', title: 'Send playlist', who: 'The couple' }, NOW));
  await signedInAs(OWNER);
  await changeChecklist(ids.harper, l => setDone(l, 'a', true, NOW, 'Owner'));
  const saved = await loadChecklist(ids.harper);
  assert.deepEqual(saved.tasks.map(t => [t.id, t.done]), [['a', true], ['b', false]]);
  const files = [...drive.files.values()].filter(f => f.name === appDataName(ids.harper, 'checklist'));
  assert.equal(files.length, 1);
  assert.equal(files[0].parents[0], appId);
  assert.deepEqual((await loadChecklist(ids.lopez)).tasks, [], 'each event has its own checklist');
});

test('without Editor access a planner can read the checklist but not change it', async () => {
  await changeChecklist(ids.harper, l => addTask(l, { id: 'a', title: 'Book shuttle' }, NOW));
  await signedInAs(PLANNER);
  assert.equal((await loadChecklist(ids.harper)).tasks.length, 1);
  await assert.rejects(changeChecklist(ids.harper, l => setDone(l, 'a', true, NOW)), /Editor access/);
});
