import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn, NeedsSignIn } from '../../docs/js/google.js';
import { useTransport, listChildren, listTree, searchFolders, listSharedFolders, whoAmI, quote } from '../../docs/js/drive.js';
import { readEventData, writeEventData, readData, forgetAppData } from '../../docs/js/appdata.js';
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

test('app data is created once in "SBE App Data", then updated in place', async () => {
  assert.equal(await readEventData(ids.harper, 'timeline'), null);
  assert.equal([...drive.files.values()].filter(f => f.name === 'SBE App Data').length, 0, 'reading does not create the folder');
  await writeEventData(ids.harper, 'timeline', { days: [{ date: '2027-06-12', items: [] }] });
  await writeEventData(ids.harper, 'timeline', { days: [{ date: '2027-06-12', items: [{ time: '16:00', title: 'Ceremony' }] }] });
  const saved = [...drive.files.values()].filter(f => f.name === appDataName(ids.harper, 'timeline'));
  assert.equal(saved.length, 1, 'no duplicate files');
  const folders = [...drive.files.values()].filter(f => f.name === 'SBE App Data');
  assert.equal(folders.length, 1);
  assert.deepEqual(saved[0].parents, [folders[0].id]);
  assert.deepEqual(saved[0].owners, ['planner@example.com'], 'saved in the planner\'s own Drive');

  forgetAppData(); // e.g. a fresh browser: finds the existing folder and file again
  const back = await readEventData(ids.harper, 'timeline');
  assert.equal(back.days[0].items[0].title, 'Ceremony');
  assert.equal([...drive.files.values()].filter(f => f.name === 'SBE App Data').length, 1);
});

test('the event documents themselves are never modified', async () => {
  const before = JSON.stringify([...drive.files.values()].filter(f => f.owners.includes('owner@example.com')));
  await listTree(ids.harper);
  await writeEventData(ids.harper, 'status', { vendors: [] });
  await readData('settings.json');
  const after = JSON.stringify([...drive.files.values()].filter(f => f.owners.includes('owner@example.com')));
  assert.equal(after, before);
});

test('an expired sign-in surfaces as NeedsSignIn', async () => {
  drive.expire();
  await assert.rejects(listChildren(ids.root), NeedsSignIn);
});

test('two first saves at the same moment still make one app folder', async () => {
  await Promise.all([writeEventData(ids.harper, 'timeline', { days: [] }), writeEventData(ids.harper, 'status', { vendors: [] })]);
  assert.equal([...drive.files.values()].filter(f => f.name === 'SBE App Data').length, 1);
});
