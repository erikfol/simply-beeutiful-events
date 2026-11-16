import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import { appDataName } from '../../docs/js/driveEvents.js';
import {
  parseDuration, toHM, checkEntry, emptyLog, normalizeLog, addEntry, removeEntry, sortEntries, totals,
  timerMinutes, loadLog, changeLog, TIME_TYPES,
} from '../../docs/js/timelog.js';

test('parseDuration reads the ways people write a length of time', () => {
  const cases = {
    '1:30': 90, '0:45': 45, '1.5': 90, '1,5': 90, '2': 120, '12': 720, '45': 45, '90': 90,
    '45 min': 45, '45m': 45, '1h 30m': 90, '1 hr 15 min': 75, '2 hours': 120, '1.25 hr': 75, ' 3 HRS ': 180,
  };
  for (const [text, mins] of Object.entries(cases)) assert.equal(parseDuration(text), mins, text);
  for (const bad of ['', 'soon', '1:75', 'h', '1:30 pm']) assert.equal(parseDuration(bad), null, bad);
  assert.equal(toHM(85), '1:25');
  assert.equal(toHM(5), '0:05');
});

test('checkEntry explains what is missing', () => {
  assert.deepEqual(checkEntry({ date: '2026-11-16', minutes: 90 }), []);
  assert.deepEqual(checkEntry({ date: '', minutes: null }), ['Pick a date.', 'Write how long, like 1:30, 1.5 or 45 min.']);
  assert.deepEqual(checkEntry({ date: '2026-11-16', minutes: 0 }), ['The time has to be more than 0.']);
  assert.deepEqual(checkEntry({ date: '2026-11-16', minutes: 25 * 60 }), ['One entry can be at most 24 hours.']);
});

test('entries are added, removed, sorted newest first and totaled', () => {
  let log = emptyLog();
  log = addEntry(log, { id: 'a', date: '2026-11-10', minutes: 90, who: 'Nicole', type: 'Site visit', what: '  Venue  walkthrough ' }, '2026-11-10T20:00:00Z');
  log = addEntry(log, { id: 'b', date: '2026-11-12', minutes: 30, who: 'Grace', type: 'Not a type' }, '2026-11-12T15:00:00Z');
  log = addEntry(log, { id: 'c', date: '2026-11-12', minutes: 45, who: 'Nicole', type: 'Vendors' }, '2026-11-12T16:00:00Z');
  assert.equal(log.entries[0].what, 'Venue walkthrough', 'spaces tidied');
  assert.equal(log.entries[1].type, '', 'unknown types are dropped');
  assert.deepEqual(sortEntries(log.entries).map(e => e.id), ['c', 'b', 'a']);
  assert.deepEqual(totals(log.entries), {
    minutes: 165, count: 3,
    byWho: [['Nicole', 135], ['Grace', 30]],
    byType: [['Site visit', 90], ['Vendors', 45], ['', 30]],
  });
  log = removeEntry(log, 'b');
  assert.deepEqual(log.entries.map(e => e.id), ['a', 'c']);
  assert.ok(TIME_TYPES.includes('Event day'));
});

test('normalizeLog drops entries it cannot use', () => {
  const log = normalizeLog({ entries: [
    { id: 'ok', date: '2026-11-16', minutes: 30.4, who: 'Nicole' },
    { id: 'nodate', minutes: 30 },
    { id: 'zero', date: '2026-11-16', minutes: 0 },
    { date: '2026-11-16', minutes: 30 },
    null,
  ] });
  assert.deepEqual(log.entries.map(e => [e.id, e.minutes]), [['ok', 30]]);
  assert.deepEqual(normalizeLog(null), emptyLog());
});

test('the timer rounds to the nearest 5 minutes, at least 5', () => {
  const start = '2026-11-16T14:00:00Z';
  const at = (mins) => Date.parse(start) + mins * 60000;
  assert.equal(timerMinutes(start, at(1)), 5);
  assert.equal(timerMinutes(start, at(52)), 50);
  assert.equal(timerMinutes(start, at(53)), 55);
  assert.equal(timerMinutes(start, at(125)), 125);
  assert.equal(timerMinutes('not a date', at(10)), 5);
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

test('time saves per event in "SBE App Data", and two planners keep each other\'s entries', async () => {
  drive.share(appId, PLANNER, 'editor');
  await changeLog(ids.harper, log => addEntry(log, { date: '2026-11-16', minutes: 60, who: 'Owner' }));

  await signedInAs(PLANNER);
  const before = await loadLog(ids.harper); // the planner opened the Time view earlier...
  await signedInAs(OWNER);
  await changeLog(ids.harper, log => addEntry(log, { date: '2026-11-16', minutes: 30, who: 'Owner' })); // ...the owner adds one meanwhile
  await signedInAs(PLANNER);
  await changeLog(ids.harper, log => addEntry(log, { date: '2026-11-16', minutes: 45, who: 'Planner' }));
  assert.equal(before.entries.length, 1);

  const saved = await loadLog(ids.harper);
  assert.deepEqual(saved.entries.map(e => e.minutes).sort((a, b) => a - b), [30, 45, 60], 'nobody\'s entry was lost');
  const file = [...drive.files.values()].filter(f => f.name === appDataName(ids.harper, 'time'));
  assert.equal(file.length, 1);
  assert.equal(file[0].parents[0], appId, 'kept in the shared folder');
  assert.deepEqual((await loadLog(ids.lopez)).entries, [], 'each event has its own log');
});

test('without Editor access a planner can read the time log but not add to it', async () => {
  await changeLog(ids.harper, log => addEntry(log, { date: '2026-11-16', minutes: 60, who: 'Owner' }));
  await signedInAs(PLANNER);
  assert.equal((await loadLog(ids.harper)).entries.length, 1);
  await assert.rejects(changeLog(ids.harper, log => addEntry(log, { date: '2026-11-16', minutes: 15 })), /Editor access/);
});
