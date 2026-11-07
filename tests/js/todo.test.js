import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import {
  STATUSES, statusLabel, emptyTodos, normalizeTodos, checkTitle, cleanNote, addTodo, renameTodo, setTodoStatus,
  addNote, removeNote, removeTodo, filterTodos, groupByStatus, loadTodos, changeTodos, TODO_FILE,
} from '../../docs/js/todo.js';

const T1 = '2026-11-07T10:00:00.000Z';
const T2 = '2026-11-08T10:00:00.000Z';
const T3 = '2026-11-09T10:00:00.000Z';

test('adding, rewording and deleting to-dos', () => {
  let list = addTodo(emptyTodos(), { id: 'a', title: '  Order   linens ', by: 'Erik' }, T1);
  assert.deepEqual(list.items[0], { id: 'a', title: 'Order linens', status: 'not-started', notes: [], created: T1, createdBy: 'Erik', updated: T1, doneAt: null }, 'starts not started; extra spaces tidied');
  assert.equal(list.updated, T1);

  const before = list;
  list = renameTodo(list, 'a', 'Order linens for Lopez-Kim', T2);
  assert.equal(list.items[0].title, 'Order linens for Lopez-Kim');
  assert.equal(list.items[0].created, T1, 'keeps when it was added');
  assert.equal(list.items[0].updated, T2);
  assert.equal(before.items[0].title, 'Order linens', 'the old list is untouched');

  list = addTodo(list, { id: 'b', title: 'Call the florist' }, T2);
  assert.deepEqual(removeTodo(list, 'a', T3).items.map(t => t.id), ['b']);
  assert.deepEqual(removeTodo(list, 'zzz', T3).items.length, 2, 'deleting one that\'s already gone is fine');

  assert.deepEqual(checkTitle('   '), ['Write what needs to be done.']);
  assert.deepEqual(checkTitle('Call the florist'), []);
});

test('status: not started, in progress, done (remembers when it was finished)', () => {
  assert.deepEqual(STATUSES.map(s => s.label), ['Not started', 'In progress', 'Done']);
  assert.equal(statusLabel('in-progress'), 'In progress');
  assert.equal(statusLabel('nonsense'), 'Not started');

  let list = addTodo(emptyTodos(), { id: 'a', title: 'Book the shuttle' }, T1);
  list = setTodoStatus(list, 'a', 'in-progress', T2);
  assert.deepEqual([list.items[0].status, list.items[0].doneAt], ['in-progress', null]);
  list = setTodoStatus(list, 'a', 'done', T2);
  assert.deepEqual([list.items[0].status, list.items[0].doneAt], ['done', T2]);
  list = setTodoStatus(list, 'a', 'done', T3);
  assert.equal(list.items[0].doneAt, T2, 'marking done again keeps the first finish date');
  list = setTodoStatus(list, 'a', 'not-started', T3);
  assert.deepEqual([list.items[0].status, list.items[0].doneAt], ['not-started', null], 'reopening clears it');
  assert.equal(setTodoStatus(list, 'a', 'bogus', T3).items[0].status, 'not-started');
});

test('notes: added with date and name, kept in order, deleted one at a time', () => {
  let list = addTodo(emptyTodos(), { id: 'a', title: 'Final count to caterer' }, T1);
  list = addNote(list, 'a', { id: 'n1', text: 'Emailed Hearth & Table  ', by: 'Erik' }, T2);
  list = addNote(list, 'a', { id: 'n2', text: 'They replied:\r\n\r\n\r\n\r\n  need it by Friday', by: 'Nicole' }, T3);
  assert.deepEqual(list.items[0].notes, [
    { id: 'n1', text: 'Emailed Hearth & Table', at: T2, by: 'Erik' },
    { id: 'n2', text: 'They replied:\n\n  need it by Friday', at: T3, by: 'Nicole' },
  ], 'line breaks are kept, runs of blank lines shortened');
  assert.equal(list.items[0].updated, T3);

  list = removeNote(list, 'a', 'n1', T3);
  assert.deepEqual(list.items[0].notes.map(n => n.id), ['n2']);
  assert.equal(removeNote(list, 'a', 'n1', T3), list, 'deleting a note that\'s already gone changes nothing');
  assert.equal(removeNote(list, 'zzz', 'n2', T3), list);
  assert.equal(cleanNote('  \n  '), '');
});

test('changing a to-do someone else deleted says so', () => {
  const list = addTodo(emptyTodos(), { id: 'a', title: 'x' }, T1);
  for (const change of [() => renameTodo(list, 'gone', 'y'), () => setTodoStatus(list, 'gone', 'done'), () => addNote(list, 'gone', { text: 'hi' })]) {
    assert.throws(change, /Someone else deleted this to-do/);
  }
});

test('saved data is cleaned up when read', () => {
  assert.deepEqual(normalizeTodos(null), emptyTodos());
  const list = normalizeTodos({ items: [
    { id: 'a', title: 'Keep me', status: 'done', doneAt: T1, notes: [{ id: 'n', text: 'ok' }, { id: 'm', text: '  ' }, { text: 'no id' }, null] },
    { id: 'b', title: 'Odd status', status: 'waiting', doneAt: T1 },
    { id: 'c', title: '  ' }, null, { title: 'no id' },
  ] });
  assert.deepEqual(list.items.map(t => [t.id, t.status, t.doneAt]), [['a', 'done', T1], ['b', 'not-started', null]]);
  assert.deepEqual(list.items[0].notes, [{ id: 'n', text: 'ok', at: null, by: '' }]);
  assert.deepEqual(list.items[1].notes, []);
});

test('search looks in the to-do and its notes', () => {
  let list = addTodo(emptyTodos(), { id: 'a', title: 'Call the florist' }, T1);
  list = addTodo(list, { id: 'b', title: 'Order linens' }, T1);
  list = addNote(list, 'b', { id: 'n', text: 'Ivory, 90x132 for the Lopez-Kim wedding' }, T2);
  assert.deepEqual(filterTodos(list.items, 'FLORIST').map(t => t.id), ['a']);
  assert.deepEqual(filterTodos(list.items, 'ivory lopez').map(t => t.id), ['b'], 'every word must match');
  assert.deepEqual(filterTodos(list.items, 'ivory florist'), []);
  assert.equal(filterTodos(list.items, '  ').length, 2);
});

test('groups: in progress, then not started (newest first), then done (latest finished first)', () => {
  let list = emptyTodos();
  for (const [id, at] of [['old', T1], ['mid', T2], ['new', T3], ['d1', T1], ['d2', T1], ['w', T1]]) list = addTodo(list, { id, title: id }, at);
  list = setTodoStatus(list, 'd1', 'done', T3);
  list = setTodoStatus(list, 'd2', 'done', T2);
  list = setTodoStatus(list, 'w', 'in-progress', T2);
  const groups = groupByStatus(list.items);
  assert.deepEqual(groups.map(g => [g.key, g.label, g.items.map(t => t.id)]), [
    ['in-progress', 'In progress', ['w']],
    ['not-started', 'Not started', ['new', 'mid', 'old']],
    ['done', 'Done', ['d1', 'd2']],
  ]);
  assert.deepEqual(groupByStatus([]).map(g => g.items.length), [0, 0, 0], 'empty groups are still listed');
});

// ---------- saving to Drive ----------
const OWNER = 'owner@example.com';
const PLANNER = 'planner@example.com';
let drive, ids;
const named = (name) => [...drive.files.values()].filter(f => f.name === name);

beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive);
  useFakeAuth();
  await signIn();
});

async function as(email) {
  forgetAppData();
  useTransport(email === PLANNER ? drive.transport : drive.as(email));
  useEventsFolder(ids.root);
  return sharedAccess();
}

test('the to-do list saves in the shared "SBE App Data" folder', async () => {
  await as(OWNER);
  assert.deepEqual(await loadTodos(), emptyTodos());
  await changeTodos(l => addTodo(l, { id: 'a', title: 'Order linens' }, T1));
  await changeTodos(l => addNote(l, 'a', { id: 'n', text: 'Ivory', by: 'Nicole' }, T2));
  await changeTodos(l => setTodoStatus(l, 'a', 'in-progress', T2));
  const saved = await loadTodos();
  assert.deepEqual([saved.items[0].status, saved.items[0].notes[0].text], ['in-progress', 'Ivory']);

  const [file] = named(TODO_FILE);
  assert.deepEqual(file.parents, [named('SBE App Data')[0].id]);
  assert.equal(named(TODO_FILE).length, 1, 'one file, updated in place');
});

test('two planners editing at once keep each other\'s changes', async () => {
  await as(OWNER);
  drive.share(named('SBE App Data')[0].id, PLANNER, 'editor');
  await changeTodos(l => addTodo(l, { id: 'a', title: 'Call the florist' }, T1));

  assert.equal((await as(PLANNER)).state, 'ready');
  await changeTodos(l => addTodo(l, { id: 'b', title: 'Order linens' }, T2));
  await changeTodos(l => setTodoStatus(l, 'a', 'done', T2));

  await as(OWNER);
  await changeTodos(l => addNote(l, 'b', { id: 'n', text: 'Ivory' }, T3));
  const list = await loadTodos();
  assert.deepEqual(list.items.map(t => [t.id, t.status, t.notes.length]), [['a', 'done', 0], ['b', 'not-started', 1]]);
});

test('a planner without Editor access can see the list but not change it', async () => {
  await as(OWNER);
  await changeTodos(l => addTodo(l, { id: 'a', title: 'Call the florist' }, T1));

  assert.equal((await as(PLANNER)).state, 'view-only');
  assert.equal((await loadTodos()).items[0].title, 'Call the florist');
  await assert.rejects(changeTodos(l => setTodoStatus(l, 'a', 'done')), /Editor access/);
});
