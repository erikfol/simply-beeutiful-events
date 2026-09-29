// Old Word (.doc) files are read by letting Google Drive convert them; the temporary copy is deleted after.
// (Scanned PDFs take the same route; that path needs pdf.js, so it's covered by the browser test.)
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import { extractFile } from '../../docs/js/extract.js';
import { readChanged, reportFrom } from '../../docs/js/reader.js';

const DOC = 'application/msword';
let drive, event;
beforeEach(async () => {
  drive = createFakeDrive({ convert: (bytes, name) => (name.includes('Bartending') ? 'Bartending agreement. Event date June 12, 2027 from 5:00 PM. Deposit of $300.00 due May 1, 2027.' : '') });
  useFakeAuth(); useTransport(drive.transport); forgetAppData(); await signIn();
  // the planner owns this events folder here, so the shared "SBE App Data" is created inside it
  const events = drive.add({ name: 'SBE Events', mimeType: 'application/vnd.google-apps.folder', owner: drive.me });
  event = drive.add({ name: '6.12.27 Test Wedding', mimeType: 'application/vnd.google-apps.folder', parent: events, owner: drive.me });
  useEventsFolder(events);
  await sharedAccess();
});

test('an old .doc is converted by Google, read, and the temporary copy deleted', async () => {
  const id = drive.add({ name: 'Bartending contract (1).doc', mimeType: DOC, parent: event, owner: drive.me, content: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]) });
  const out = await extractFile(drive.files.get(id));
  assert.equal(out.via, 'google');
  assert.match(out.text, /June 12, 2027/);
  assert.deepEqual(drive.deleted, ['SBE reading copy - Bartending contract (1).doc']);
  assert.ok(![...drive.files.values()].some(f => f.name.startsWith('SBE reading copy')), 'no copy left behind');
  const appFolder = [...drive.files.values()].find(f => f.name === 'SBE App Data');
  assert.ok(appFolder, 'the copy was made inside SBE App Data');
  assert.ok(drive.calls.some(c => c.includes('uploadType=resumable') && c.includes('ocrLanguage=en')));
  assert.equal(drive.files.get(id).content.length, 4, 'the original is untouched');
});

test('the reader turns the converted text into dates and payments, marked "via Google"', async () => {
  drive.add({ name: 'Bartending contract (1).doc', mimeType: DOC, parent: event, owner: drive.me, content: new Uint8Array([1, 2, 3]) });
  const files = [...drive.files.values()].filter(f => f.parents.includes(event)).map(f => ({ ...f, path: '' }));
  const { cache } = await readChanged(event, files, { version: 4, files: {} });
  const report = reportFrom(files, cache, {});
  assert.deepEqual(report.timeline.map(e => e.date_iso), ['2027-05-01', '2027-06-12']);
  assert.equal(report.files[0].read, 'read');
  assert.equal(report.files[0].via, 'google');
  assert.deepEqual(report.needsLook.filter(n => n.file), []);
});
