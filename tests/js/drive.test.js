import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn, NeedsSignIn } from '../../docs/js/google.js';
import { useTransport, listChildren, listTree, searchFolders, listSharedFolders, listMyTopFolders, whoAmI, quote } from '../../docs/js/drive.js';
import { readEventData, writeEventData, readData, forgetAppData, useEventsFolder, sharedAccess, readSettings, writeSettings, migratePersonalData } from '../../docs/js/appdata.js';
import {
  parseEventFolderName, folderToEvent, sortEvents, parseFolderId, classifyFile, appDataName,
} from '../../docs/js/driveEvents.js';

let drive, ids;
beforeEach(async () => {
  drive = createFakeDrive({ pageSize: 3 }); // small pages exercise pagination
  ids = seedSbeDrive(drive);
  useFakeAuth();
  useTransport(drive.transport);
  forgetAppData();
  await signIn();
});

test('event folder names give the event date (M.D.YY or ISO); others are skipped', () => {
  assert.deepEqual(parseEventFolderName('6.12.27 Harper-Bennett Wedding'), { date: '2027-06-12', title: 'Harper-Bennett Wedding' });
  assert.deepEqual(parseEventFolderName('10.3.2026 Lopez-Kim'), { date: '2026-10-03', title: 'Lopez-Kim' });
  assert.equal(parseEventFolderName('2027-06-12 Harper').date, '2027-06-12');
  assert.equal(parseEventFolderName('Templates & Forms').date, null);
  assert.equal(parseEventFolderName('13.40.27 Bad date').date, null);
  assert.equal(folderToEvent({ id: 'x', name: 'Templates & Forms' }), null);
  const e = folderToEvent({ id: 'abc', name: '6.12.27 Harper-Bennett Wedding', webViewLink: 'https://drive.google.com/drive/folders/abc' });
  assert.deepEqual([e.id, e.driveId, e.weddingDate, e.source], ['drive-abc', 'abc', '2027-06-12', 'drive']);
});

test('events sort upcoming-soonest first, then most recent past', () => {
  const ev = (d) => ({ weddingDate: d });
  const sorted = sortEvents([ev('2026-05-16'), ev('2027-06-12'), ev('2026-10-03'), ev('2025-09-01')], '2026-09-29');
  assert.deepEqual(sorted.map(e => e.weddingDate), ['2026-10-03', '2027-06-12', '2026-05-16', '2025-09-01']);
});

test('folder links and bare IDs are both accepted', () => {
  assert.equal(parseFolderId('https://drive.google.com/drive/folders/1AbC_def-GHIjkl?usp=sharing'), '1AbC_def-GHIjkl');
  assert.equal(parseFolderId('https://drive.google.com/open?id=1AbC_def-GHIjkl'), '1AbC_def-GHIjkl');
  assert.equal(parseFolderId('1AbC_def-GHIjkl'), '1AbC_def-GHIjkl');
  assert.equal(parseFolderId('SBE Events'), null);
});

test('documents are recognized by the same naming rules as the scanner', () => {
  assert.equal(classifyFile('Harper_Bennett Wedding - Budget', 'application/vnd.google-apps.spreadsheet').kind, 'budget');
  assert.equal(classifyFile('Olivia & James Vendor Options.xlsx', '').kind, 'vendors');
  assert.equal(classifyFile('Willow Brook Barn - Venue Agreement.pdf', 'application/pdf').kind, 'contract');
  assert.equal(classifyFile('Color inspiration.jpg', 'image/jpeg').kind, 'photo');
  assert.equal(classifyFile('Budget notes', 'application/vnd.google-apps.document').kind, 'document', 'a budget-named Doc is not the budget sheet');
  assert.equal(classifyFile('Planner Notes', 'application/vnd.google-apps.document').type, 'Google Doc');
  assert.equal(appDataName('abc', 'timeline'), 'event-abc.timeline.json');
});

test('Drive listing follows every page and walks subfolders', async () => {
  const kids = await listChildren(ids.root);
  assert.deepEqual(kids.map(k => k.name).sort(), ['10.3.26 Lopez-Kim Wedding', '5.16.26 Nguyen-Patel Wedding', '6.12.27 Harper-Bennett Wedding (Demo)', 'Templates & Forms']);
  assert.ok(drive.calls.filter(c => c.includes('pageToken')).length >= 1, 'needed a second page');
  const tree = await listTree(ids.harper);
  assert.equal(tree.length, 9);
  const nested = tree.find(f => f.name.startsWith('Summit Coach'));
  assert.equal(nested.path, 'Vendor Agreements/');
  assert.ok(tree.every(f => f.mimeType !== 'application/vnd.google-apps.folder'));
});

test('folders shared with the planner are listed without searching', async () => {
  assert.deepEqual((await listSharedFolders()).map(f => f.name), ['SBE Events']);
});

test('folder search finds the events folder and escapes quotes safely', async () => {
  assert.deepEqual((await searchFolders('sbe')).map(f => f.name), ['SBE Events']);
  assert.equal(quote("Olivia's"), "'Olivia\\'s'");
  assert.deepEqual(await searchFolders("Olivia's"), []);
  assert.equal((await whoAmI()).emailAddress, 'planner@example.com');
});

// ---------- shared "SBE App Data" inside the events folder ----------
const OWNER = 'owner@example.com';
const PLANNER = 'planner@example.com';
const FOLDER = 'application/vnd.google-apps.folder';
const appFolders = () => [...drive.files.values()].filter(f => f.name === 'SBE App Data');
async function signedInAs(email) {
  forgetAppData(); // a different person in a fresh browser
  useTransport(email === PLANNER ? drive.transport : drive.as(email));
  useEventsFolder(ids.root);
}

test('the events folder owner gets the shared "SBE App Data" created inside it', async () => {
  await signedInAs(PLANNER);
  assert.equal(await readEventData(ids.harper, 'timeline'), null);
  assert.equal((await sharedAccess()).state, 'waiting', 'a Viewer cannot create it');
  assert.equal(appFolders().length, 0, 'reading and checking create nothing');

  await signedInAs(OWNER);
  const access = await sharedAccess();
  assert.equal(access.state, 'ready');
  assert.equal(appFolders().length, 1);
  assert.deepEqual(appFolders()[0].parents, [ids.root], 'next to the event folders');
  assert.deepEqual(appFolders()[0].owners, [OWNER]);
});

test('without Editor access a planner sees shared work but cannot save', async () => {
  await signedInAs(OWNER);
  await sharedAccess();
  await writeEventData(ids.harper, 'timeline', { days: [{ date: '2027-06-12', items: [{ time: '16:00', title: 'Ceremony' }] }] });

  await signedInAs(PLANNER);
  assert.equal((await readEventData(ids.harper, 'timeline')).days[0].items[0].title, 'Ceremony');
  const access = await sharedAccess();
  assert.equal(access.state, 'view-only');
  assert.equal(access.owner.emailAddress, OWNER);
  await assert.rejects(writeEventData(ids.harper, 'timeline', { days: [] }), /Editor access/);
});

test('with Editor access both planners save to the same files', async () => {
  await signedInAs(OWNER);
  await sharedAccess();
  await writeEventData(ids.harper, 'status', { vendors: [{ name: 'Glow Studio', payment: 'Due' }] });
  drive.share(appFolders()[0].id, PLANNER, 'editor');

  await signedInAs(PLANNER);
  assert.equal((await sharedAccess()).state, 'ready');
  await writeEventData(ids.harper, 'status', { vendors: [{ name: 'Glow Studio', payment: 'Paid' }] });
  assert.equal([...drive.files.values()].filter(f => f.name === appDataName(ids.harper, 'status')).length, 1, 'updated, not duplicated');

  await signedInAs(OWNER);
  assert.equal((await readEventData(ids.harper, 'status')).vendors[0].payment, 'Paid', 'the owner sees the planner change');
});

test('work saved before sharing existed moves into the shared folder once; settings stay personal', async () => {
  // the planner's personal "SBE App Data" from before (settings + a saved run sheet)
  const personal = drive.add({ name: 'SBE App Data', mimeType: FOLDER, owner: PLANNER });
  drive.add({ name: appDataName(ids.harper, 'timeline'), mimeType: 'application/json', parent: personal, owner: PLANNER, content: JSON.stringify({ days: [{ date: '2027-06-12', items: [] }] }) });
  drive.add({ name: 'settings.json', mimeType: 'application/json', parent: personal, owner: PLANNER, content: JSON.stringify({ eventsFolderId: ids.root }) });

  await signedInAs(OWNER);
  await sharedAccess();
  drive.share(appFolders().find(f => f.parents[0] === ids.root).id, PLANNER, 'editor');

  await signedInAs(PLANNER);
  assert.equal((await readSettings()).eventsFolderId, ids.root, 'settings are read from the personal folder');
  await sharedAccess();
  assert.equal(await migratePersonalData(), 1, 'the run sheet moves, settings do not');
  assert.equal((await readEventData(ids.harper, 'timeline')).days[0].date, '2027-06-12');
  assert.equal(await migratePersonalData(), 0, 'only once');
  assert.equal(await readData('settings.json'), null, 'settings are not shared');
});

test('the event documents themselves are never modified', async () => {
  const docs = () => JSON.stringify([...drive.files.values()].filter(f => f.name !== 'SBE App Data' && !f.name.endsWith('.json')));
  const before = docs();
  await signedInAs(OWNER);
  await sharedAccess();
  await listTree(ids.harper);
  await writeEventData(ids.harper, 'status', { vendors: [] });
  await writeSettings({ eventsFolderId: ids.root });
  assert.equal(docs(), before);
});

test('an expired sign-in surfaces as NeedsSignIn', async () => {
  drive.expire();
  await assert.rejects(listChildren(ids.root), NeedsSignIn);
});

test('checking access twice at the same moment still makes one shared folder', async () => {
  await signedInAs(OWNER);
  await Promise.all([sharedAccess(), sharedAccess()]);
  assert.equal(appFolders().length, 1);
});

test('the owner sees their own folders to pick from', async () => {
  useTransport(drive.as(OWNER));
  assert.deepEqual((await listMyTopFolders()).map(f => f.name), ['SBE Events']);
});
