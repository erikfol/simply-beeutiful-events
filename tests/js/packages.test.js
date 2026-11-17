import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import { emptyChecklist, addTask, updateTask, setDone, normalizeChecklist } from '../../docs/js/checklist.js';
import {
  parseWhen, formatWhen, normalizeSetup, setupText, applies, templateFromChecklist, planSync, applySync,
  normalizeTemplates, upsertTemplate, removeTemplate, forFromValue, forValue, forText, loadSetup, saveSetup,
  loadTemplates, changeTemplates, emptyTemplates,
} from '../../docs/js/packages.js';

const NOW = '2026-11-17T12:00:00.000Z';
const WEDDING = '2027-06-12';

test('"when" is read the way people write it, and written back plainly', () => {
  const cases = { '6 weeks before': 42, '6 weeks': 42, '3 months': 90, '10 days': 10, '10': 10, 'day of': 0, 'Day of the event': 0, '2 days after': -2, '1 year before': 365, '1.5 weeks': 11, '': '' };
  for (const [text, days] of Object.entries(cases)) assert.equal(parseWhen(text), days, text);
  assert.equal(parseWhen('soon'), null);
  assert.deepEqual([42, 90, 10, 0, -2, 365, 14, 1].map(formatWhen), ['6 weeks before', '3 months before', '10 days before', 'Day of the event', '2 days after', '1 year before', '2 weeks before', '1 day before']);
  assert.equal(formatWhen(''), '');
});

test('an event\'s setup keeps only known choices, and reads as one line', () => {
  const s = normalizeSetup({ package: 'blossom-bee', services: ['travel', 'nope', 'travel'], traditions: ['jewish', 'x'] });
  assert.deepEqual([s.package, s.services, s.traditions], ['blossom-bee', ['travel'], ['jewish']]);
  assert.equal(setupText(s), 'Blossom & Bee · + Accommodations and transportation · Jewish');
  assert.equal(setupText(normalizeSetup({ package: 'queen-bee', services: ['travel'] })), 'The Queen Bee', 'services are only listed for Blossom & Bee');
  assert.equal(setupText(normalizeSetup({ package: 'bogus' })), '');
});

test('which templates apply: packages build on each other, services and traditions add on', () => {
  const s = (pkg, services = [], traditions = []) => normalizeSetup({ package: pkg, services, traditions });
  const pkg = (k) => ({ kind: 'package', key: k });
  assert.ok(applies(pkg('bee-blissful'), s('bee-blissful')));
  assert.ok(applies(pkg('bee-blissful'), s('blossom-bee')), 'Blossom & Bee includes Bee Blissful');
  assert.ok(applies(pkg('bee-blissful'), s('queen-bee')));
  assert.ok(applies(pkg('blossom-bee'), s('queen-bee')));
  assert.ok(!applies(pkg('queen-bee'), s('blossom-bee')));
  assert.ok(!applies(pkg('bee-blissful'), s('other')), 'Other Event is not a wedding package');
  assert.ok(applies(pkg('other'), s('other')));
  assert.ok(!applies(pkg('other'), s('queen-bee')));
  const svc = { kind: 'service', key: 'travel' };
  assert.ok(applies(svc, s('queen-bee')), 'The Queen Bee includes every service');
  assert.ok(applies(svc, s('blossom-bee', ['travel'])));
  assert.ok(!applies(svc, s('blossom-bee', ['design'])));
  assert.ok(!applies(svc, s('bee-blissful')));
  assert.ok(applies({ kind: 'tradition', key: 'hindu' }, s('bee-blissful', [], ['hindu'])));
  assert.ok(!applies({ kind: 'tradition', key: 'hindu' }, s('bee-blissful')));
  assert.ok(applies({ kind: 'all' }, s('other')));
  assert.ok(!applies({ kind: 'all' }, s('')), 'nothing applies before a package is chosen');
  assert.deepEqual(forFromValue('service:travel'), { kind: 'service', key: 'travel' });
  assert.deepEqual(forFromValue('service:nope'), { kind: 'all' });
  assert.equal(forValue({ kind: 'tradition', key: 'sikh' }), 'tradition:sikh');
  assert.equal(forText({ kind: 'package', key: 'queen-bee' }), 'The Queen Bee package');
});

test('a checklist saved as a template remembers each task as so many days before the event', () => {
  const tasks = [
    { title: 'Confirm vendors', due: '2027-05-01', who: 'SBE', notes: 'All of them' },
    { title: 'Send playlist', due: '', who: 'The couple', notes: '' },
    { title: 'Return rentals', due: '2027-06-14', who: 'SBE', notes: '' },
  ];
  const t = templateFromChecklist(tasks, WEDDING, { name: 'Bee Blissful basics', for: { kind: 'package', key: 'bee-blissful' } });
  assert.deepEqual(t.items.map(i => [i.title, i.before, i.who]), [['Confirm vendors', 42, 'SBE'], ['Send playlist', '', 'The couple'], ['Return rentals', -2, 'SBE']]);
  assert.deepEqual(t.for, { kind: 'package', key: 'bee-blissful' });
});

const TEMPLATES = normalizeTemplates({ templates: [
  { id: 'base', name: 'Bee Blissful basics', for: { kind: 'package', key: 'bee-blissful' }, items: [
    { id: 'i1', title: 'Confirm venue', before: 42, who: 'SBE' },
    { id: 'i2', title: 'Day-of setup', before: 0, who: 'SBE' },
  ] },
  { id: 'travel', name: 'Travel', for: { kind: 'service', key: 'travel' }, items: [{ id: 't1', title: 'Book room block', before: 120, who: 'SBE' }] },
  { id: 'jew', name: 'Jewish ceremony', for: { kind: 'tradition', key: 'jewish' }, items: [{ id: 'j1', title: 'Order the ketubah', before: 90, who: 'The couple' }] },
] }).templates;

test('applying a package adds its template tasks with real due dates, once', () => {
  const setup = normalizeSetup({ package: 'blossom-bee', services: ['travel'], traditions: ['jewish'] });
  let list = addTask(emptyChecklist(), { id: 'hand', title: 'Confirm venue', due: '2027-04-01' }, NOW); // already there, by hand
  const plan = planSync(list.tasks, TEMPLATES, setup, WEDDING, NOW, 'Nicole');
  assert.deepEqual(plan.add.map(t => [t.title, t.due, t.who]), [['Day-of setup', '2027-06-12', 'SBE'], ['Book room block', '2027-02-12', 'SBE'], ['Order the ketubah', '2027-03-14', 'The couple']]);
  assert.deepEqual([plan.remove, plan.move], [[], []]);
  list = applySync(list, plan, NOW);
  assert.equal(list.tasks.length, 4, 'the hand-made "Confirm venue" isn\'t doubled');
  assert.equal(applySync(list, plan, NOW).tasks.length, 4, 'applying the same plan twice adds nothing');
  const again = planSync(list.tasks, TEMPLATES, setup, WEDDING, NOW);
  assert.deepEqual([again.add.length, again.remove.length, again.move.length], [0, 0, 0], 'up to date');
  assert.ok(normalizeChecklist(list).tasks.filter(t => t.from).every(t => t.from.tpl && t.from.item && t.edited === false), 'template links survive saving');
});

test('changing the package removes tasks that no longer apply, but never done or hand-edited ones', () => {
  const full = normalizeSetup({ package: 'queen-bee', traditions: ['jewish'] });
  let list = applySync(emptyChecklist(), planSync([], TEMPLATES, full, WEDDING, NOW), NOW);
  const id = (title) => list.tasks.find(t => t.title === title).id;
  list = setDone(list, id('Order the ketubah'), true, NOW);
  list = updateTask(list, id('Day-of setup'), { title: 'Day-of setup', due: '2027-06-12', who: 'Grace', notes: '' }, NOW);
  assert.equal(list.tasks.find(t => t.title === 'Day-of setup').edited, true, 'changed by hand');
  const same = updateTask(list, id('Confirm venue'), { title: 'Confirm venue', due: '2027-05-01', who: 'SBE', notes: '' }, NOW);
  assert.equal(same.tasks.find(t => t.title === 'Confirm venue').edited, false, 'saving without changes is not an edit');

  const smaller = normalizeSetup({ package: 'other' }); // nothing applies to it but "Other Event" templates
  const plan = planSync(list.tasks, TEMPLATES, smaller, WEDDING, NOW);
  assert.deepEqual(plan.remove.map(t => t.title).sort(), ['Book room block', 'Confirm venue']);
  list = applySync(list, plan, NOW);
  assert.deepEqual(list.tasks.map(t => t.title).sort(), ['Day-of setup', 'Order the ketubah'], 'done and edited tasks stay');
});

test('when the event date moves, untouched template tasks move with it', () => {
  const setup = normalizeSetup({ package: 'bee-blissful' });
  let list = applySync(emptyChecklist(), planSync([], TEMPLATES, setup, WEDDING, NOW), NOW);
  const plan = planSync(list.tasks, TEMPLATES, setup, '2027-07-10', NOW);
  assert.deepEqual(plan.move.map(m => [m.task.title, m.due]).sort(), [['Confirm venue', '2027-05-29'], ['Day-of setup', '2027-07-10']]);
  list = applySync(list, plan, NOW);
  assert.equal(list.tasks.find(t => t.title === 'Confirm venue').due, '2027-05-29');
});

test('templates are added, changed and removed', () => {
  let book = upsertTemplate(emptyTemplates(), { id: 'a', name: '  Basics ', for: { kind: 'package', key: 'bee-blissful' }, items: [{ id: 'x', title: 'One', before: 7 }, { title: '' }] }, NOW, 'Nicole');
  assert.deepEqual([book.templates[0].name, book.templates[0].items.length, book.templates[0].updatedBy], ['Basics', 1, 'Nicole']);
  book = upsertTemplate(book, { ...book.templates[0], name: 'Basics v2' }, NOW);
  assert.deepEqual(book.templates.map(t => t.name), ['Basics v2']);
  assert.equal(removeTemplate(book, 'a').templates.length, 0);
});

// ---------- with the fake Google Drive ----------

let drive, ids;
beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive);
  useFakeAuth();
  await signIn();
  forgetAppData();
  useTransport(drive.as('owner@example.com'));
  useEventsFolder(ids.root);
  await sharedAccess();
});

test('each event\'s setup and the shared templates save in "SBE App Data"', async () => {
  assert.equal((await loadSetup(ids.harper)).package, '');
  await saveSetup(ids.harper, { package: 'queen-bee', traditions: ['hindu'] }, NOW);
  assert.deepEqual(await loadSetup(ids.harper), { package: 'queen-bee', services: [], traditions: ['hindu'], updated: NOW });
  assert.equal((await loadSetup(ids.lopez)).package, '', 'each event has its own');
  await changeTemplates(b => upsertTemplate(b, TEMPLATES[0], NOW));
  assert.deepEqual((await loadTemplates()).templates.map(t => t.name), ['Bee Blissful basics']);
});
