import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess, readData } from '../../docs/js/appdata.js';
import { teamRows, otherShares, markSeen, loadTeam, recordSeen, TEAM_FILE } from '../../docs/js/team.js';

const OWNER = 'owner@example.com';
const PLANNER = 'planner@example.com';
const TODAY = '2026-11-16';
const user = (email, role, name = '') => ({ type: 'user', role, emailAddress: email, displayName: name });

test('teamRows: who can open the events, who can save, who has signed in', () => {
  const eventsPerms = [
    user('Owner@Example.com', 'owner', 'Owner'),
    user('planner@example.com', 'reader', 'Planner'),
    user('viewer@example.com', 'reader', 'Viewer'),
    user('newbie@example.com', 'reader', 'Newbie'),
    { ...user('gone@example.com', 'writer'), deleted: true },
    { type: 'anyone', role: 'reader' },
  ];
  const appPerms = [
    user('owner@example.com', 'owner', 'Owner'),
    user('planner@example.com', 'writer', 'Planner'),
    user('viewer@example.com', 'reader', 'Viewer'),
    user('newbie@example.com', 'writer', 'Newbie'),
    user('outsider@example.com', 'writer', 'Outsider'),
  ];
  const seen = { 'planner@example.com': { name: 'Planner', lastSeen: '2026-11-10' } };
  const rows = teamRows({ eventsPerms, appPerms, seen, me: { emailAddress: OWNER }, today: TODAY });
  const by = Object.fromEntries(rows.map(r => [r.email, r]));
  const pick = (e) => [by[e].events, by[e].saving, by[e].status];

  assert.equal(rows[0].email, OWNER, 'the owner comes first');
  assert.deepEqual(pick(OWNER), ['owner', 'yes', 'ready']);
  assert.equal(by[OWNER].lastSeen, TODAY, 'the person looking counts as signed in today');
  assert.deepEqual(pick(PLANNER), ['view', 'yes', 'ready']);
  assert.deepEqual(pick('viewer@example.com'), ['view', 'view', 'cant-save']);
  assert.deepEqual(pick('newbie@example.com'), ['view', 'yes', 'not-seen']);
  assert.deepEqual(pick('outsider@example.com'), [null, 'yes', 'no-events']);
  assert.equal(by['gone@example.com'], undefined, 'deleted accounts are left out');
  assert.equal(rows.length, 5, 'the link share is not a person');
});

test('teamRows without the events folder list leaves that column unknown', () => {
  const rows = teamRows({ eventsPerms: null, appPerms: [user('b@example.com', 'writer', 'Bea'), user('a@example.com', 'owner', 'Zed')] });
  assert.deepEqual(rows.map(r => [r.email, r.events, r.status]), [
    ['a@example.com', undefined, 'not-seen'], // owner of "SBE App Data" first
    ['b@example.com', undefined, 'not-seen'],
  ]);
});

test('otherShares lists link, domain and group shares once, with the folder they were found on', () => {
  const link = { type: 'anyone', role: 'reader' };
  const shares = otherShares([
    ['events', [link, user(OWNER, 'owner'), { type: 'domain', role: 'writer', domain: 'example.com' }]],
    ['app', [link, { type: 'group', role: 'reader', emailAddress: 'team@example.com', displayName: 'SBE team' }]],
  ]);
  assert.deepEqual(shares.map(s => [s.where, s.who, s.level, s.open]), [
    ['events', 'anyone with the link', 'view', true],
    ['events', 'anyone at example.com', 'edit', true],
    ['app', 'SBE team', 'view', false],
  ]);
});

test('markSeen notes each person once a day', () => {
  const first = markSeen(null, { emailAddress: 'Planner@Example.com', displayName: 'Test Planner' }, TODAY);
  assert.deepEqual(first, { people: { [PLANNER]: { name: 'Test Planner', lastSeen: TODAY } } });
  assert.equal(markSeen(first, { emailAddress: PLANNER, displayName: 'Test Planner' }, TODAY), null, 'nothing new the same day');
  const next = markSeen(first, { emailAddress: OWNER }, '2026-11-17');
  assert.deepEqual(Object.keys(next.people).sort(), [OWNER, PLANNER]);
  assert.equal(markSeen(first, {}, TODAY), null);
});

// ---------- with the fake Google Drive ----------

let drive, ids;
beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive); // the events folder belongs to OWNER and is shared with PLANNER as Viewer
  useFakeAuth();
  await signIn();
});

async function signedInAs(email) {
  forgetAppData();
  useTransport(drive.as(email));
  useEventsFolder(ids.root);
  return sharedAccess(); // the owner's first sign-in creates "SBE App Data"
}

test('the owner sees the whole team, and a planner shows as set up once they sign in', async () => {
  const appId = (await signedInAs(OWNER)).folder.id;
  drive.share(appId, PLANNER, 'editor');

  let team = await loadTeam({ eventsFolderId: ids.root, appFolderId: appId, me: { emailAddress: OWNER }, today: TODAY });
  assert.equal(team.eventsKnown, true);
  assert.deepEqual(team.rows.map(r => [r.email, r.events, r.saving, r.status]), [
    [OWNER, 'owner', 'yes', 'ready'],
    [PLANNER, 'view', 'yes', 'not-seen'],
  ]);

  assert.equal((await signedInAs(PLANNER)).state, 'ready');
  assert.equal(await recordSeen({ emailAddress: PLANNER, displayName: 'Test Planner' }, TODAY), true);
  assert.equal(await recordSeen({ emailAddress: PLANNER, displayName: 'Test Planner' }, TODAY), false, 'once a day');
  assert.equal((await readData(TEAM_FILE)).people[PLANNER].lastSeen, TODAY);

  await signedInAs(OWNER);
  team = await loadTeam({ eventsFolderId: ids.root, appFolderId: appId, me: { emailAddress: OWNER }, today: TODAY });
  assert.equal(team.rows.find(r => r.email === PLANNER).status, 'ready');
});

test('a planner who can only view the events folder still sees the team from "SBE App Data"', async () => {
  const appId = (await signedInAs(OWNER)).folder.id;
  drive.share(appId, PLANNER, 'editor');
  await signedInAs(PLANNER);
  const team = await loadTeam({ eventsFolderId: ids.root, appFolderId: appId, me: { emailAddress: PLANNER }, today: TODAY });
  assert.equal(team.eventsKnown, false);
  assert.equal(team.appKnown, true);
  assert.deepEqual(team.rows.map(r => [r.email, r.events, r.status]), [[OWNER, undefined, 'not-seen'], [PLANNER, undefined, 'ready']]);
});

test('someone who can see neither sharing list gets an empty team, not an error', async () => {
  const appId = (await signedInAs(OWNER)).folder.id;
  await signedInAs(PLANNER); // Viewer on the events folder, no Editor on "SBE App Data"
  const team = await loadTeam({ eventsFolderId: ids.root, appFolderId: appId });
  assert.deepEqual([team.rows.length, team.eventsKnown, team.appKnown], [0, false, false]);
});

test('an events folder open to anyone with the link is flagged once', async () => {
  const appId = (await signedInAs(OWNER)).folder.id;
  drive.shareLink(ids.root);
  const team = await loadTeam({ eventsFolderId: ids.root, appFolderId: appId });
  assert.deepEqual(team.shares.map(s => [s.where, s.who, s.open]), [['events', 'anyone with the link', true]]);
});

test('checking the team never changes any sharing or event documents', async () => {
  const appId = (await signedInAs(OWNER)).folder.id;
  const before = JSON.stringify([...drive.files.values()].map(f => [f.id, f.editors, f.sharedWith, f.anyone || null]));
  await loadTeam({ eventsFolderId: ids.root, appFolderId: appId, me: { emailAddress: OWNER }, today: TODAY });
  assert.equal(JSON.stringify([...drive.files.values()].map(f => [f.id, f.editors, f.sharedWith, f.anyone || null])), before);
  assert.ok(!drive.calls.some(c => /permissions/.test(c) && !c.startsWith('GET ')), 'only reads sharing');
});
