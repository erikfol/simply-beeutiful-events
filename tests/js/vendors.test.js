import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import {
  emptyBook, normalizeBook, checkVendor, upsertVendor, removeVendor, matchVendor, addFromEvent, insuranceState,
  categoryChoices, filterVendors, groupVendors, cleanWebsite, cleanEmails, cleanPhones, eventRef, loadBook, changeBook,
  VENDORS_FILE,
} from '../../docs/js/vendors.js';

const NOW = '2026-11-16T12:00:00.000Z';
const HARPER = { driveId: 'harper1', name: '6.12.27 Harper-Bennett Wedding (Demo)', date: '2027-06-12' };
const LOPEZ = { driveId: 'lopez1', name: '10.3.26 Lopez-Kim Wedding', date: '2026-10-03' };

test('contact details are tidied: emails, phones, websites', () => {
  assert.deepEqual(cleanEmails('Hello@Bluebell.com, hello@bluebell.com; events@bluebell.com'), ['hello@bluebell.com', 'events@bluebell.com']);
  assert.deepEqual(cleanPhones('(603) 555-0101, 603.555.0101, 603-555-0199'), ['(603) 555-0101', '603-555-0199']);
  assert.equal(cleanWebsite('bluebellblooms.com'), 'https://bluebellblooms.com');
  assert.equal(cleanWebsite('http://x.com/a'), 'http://x.com/a');
  assert.equal(cleanWebsite('  '), '');
});

test('checkVendor explains what is missing or wrong', () => {
  assert.deepEqual(checkVendor({ name: 'Bluebell Blooms', emails: 'hello@bluebell.com' }), []);
  assert.deepEqual(checkVendor({ name: ' ', emails: 'nope, a@b' }), ['Write the vendor\'s name.', 'Check the email addresses: nope, a@b.']);
  assert.deepEqual(checkVendor({ name: 'X', insuranceExpires: 'soon' }), ['Pick the insurance end date from the calendar.']);
});

test('vendors are added, edited (keeping when they were added and their events) and removed', () => {
  let book = upsertVendor(emptyBook(), { id: 'v1', name: ' Bluebell  Blooms ', category: 'Florist', emails: 'Hello@Bluebell.com', rating: '4', events: [HARPER] }, NOW, 'Nicole');
  const v = book.vendors[0];
  assert.deepEqual([v.name, v.emails, v.rating, v.created, v.createdBy, v.events.length], ['Bluebell Blooms', ['hello@bluebell.com'], 4, NOW, 'Nicole', 1]);
  book = upsertVendor(book, { id: 'v1', name: 'Bluebell Blooms', category: 'Florist', notes: 'Great with peonies', rating: 9 }, '2026-11-17T09:00:00.000Z', 'Grace');
  const e = book.vendors[0];
  assert.deepEqual([e.notes, e.rating, e.created, e.createdBy, e.events.length], ['Great with peonies', 0, NOW, 'Nicole', 1], 'an edit keeps the history; a bad rating becomes "not rated"');
  assert.equal(removeVendor(book, 'v1').vendors.length, 0);
});

test('normalizeBook drops vendors it cannot use', () => {
  const book = normalizeBook({ vendors: [{ id: 'a', name: 'Glow Studio' }, { id: 'b', name: '  ' }, { name: 'No id' }, null] });
  assert.deepEqual(book.vendors.map(v => v.name), ['Glow Studio']);
  assert.deepEqual(normalizeBook(null), emptyBook());
});

test('matchVendor finds a vendor by name (ignoring "The", "LLC") or by a shared email', () => {
  const vendors = normalizeBook({ vendors: [
    { id: 'a', name: 'The Midnight Owls Band, LLC', emails: ['book@midnightowls.com'] },
    { id: 'b', name: 'Juniper Lane Photography' },
  ] }).vendors;
  assert.equal(matchVendor(vendors, 'Midnight Owls Band').id, 'a');
  assert.equal(matchVendor(vendors, 'Katie_Mike Agreement', ['BOOK@midnightowls.com']).id, 'a');
  assert.equal(matchVendor(vendors, 'Hearth & Table Catering'), null);
});

test('addFromEvent adds new vendors and notes the event for ones already in the book', () => {
  let book = upsertVendor(emptyBook(), { id: 'v1', name: 'Bluebell Blooms', category: 'Florist', notes: 'Our favorite', events: [LOPEZ] }, NOW);
  const rows = [
    { vendor: 'Bluebell Blooms', role: 'Photographer', contact: 'Ana', emails: ['ana@bluebell.com'], phones: ['603-555-0101'] },
    { vendor: 'Glow Studio', role: 'Hair & makeup', contact: '', emails: ['hi@glow.com'], phones: [] },
    { vendor: 'Glow Studio LLC', role: '', emails: [], phones: ['603-555-0177'] }, // the same vendor twice in one event
  ];
  const r = addFromEvent(book, rows, HARPER, NOW, 'Nicole');
  assert.deepEqual([r.added, r.linked], [['Glow Studio'], ['Bluebell Blooms', 'Glow Studio']]);
  const bluebell = r.book.vendors.find(v => v.id === 'v1');
  assert.equal(bluebell.category, 'Florist', 'what was typed in the book stays');
  assert.equal(bluebell.notes, 'Our favorite');
  assert.equal(bluebell.contact, 'Ana', 'empty fields are filled in');
  assert.deepEqual(bluebell.events.map(e => e.driveId), ['harper1', 'lopez1'], 'newest event first');
  const glow = r.book.vendors.find(v => v.name === 'Glow Studio');
  assert.deepEqual([glow.category, glow.emails, glow.phones, glow.createdBy], ['Hair & makeup', ['hi@glow.com'], ['603-555-0177'], 'Nicole']);
  assert.equal(addFromEvent(r.book, rows.slice(0, 1), HARPER, NOW).book.vendors.find(v => v.id === 'v1').events.length, 2, 'an event is listed once');
  assert.deepEqual(eventRef({ driveId: 'd', name: 'N', weddingDate: '2027-01-02' }), { driveId: 'd', name: 'N', date: '2027-01-02' });
  const couple = addFromEvent(emptyBook(), [{ vendor: 'Olivia & James', role: 'Couple', emails: [], phones: [] }], HARPER, NOW);
  assert.equal(couple.book.vendors[0].category, '', 'a people role is never a vendor category');
});

test('insurance is flagged when it has ended or ends within 30 days', () => {
  const today = '2026-11-16';
  assert.equal(insuranceState({ insuranceExpires: '' }, today), null);
  assert.deepEqual(insuranceState({ insuranceExpires: '2026-11-01' }, today), { state: 'expired', days: -15 });
  assert.deepEqual(insuranceState({ insuranceExpires: '2026-12-16' }, today), { state: 'soon', days: 30 });
  assert.deepEqual(insuranceState({ insuranceExpires: '2026-12-17' }, today), { state: 'ok', days: 31 });
});

test('search, categories and grouping', () => {
  const vendors = normalizeBook({ vendors: [
    { id: 'a', name: 'Bluebell Blooms', category: 'Florist', notes: 'peonies', events: [HARPER] },
    { id: 'b', name: 'Glow Studio', category: 'hair & makeup' },
    { id: 'c', name: 'Aster Florals', category: 'florist' },
    { id: 'd', name: 'Mystery Co' },
  ] }).vendors;
  assert.deepEqual(filterVendors(vendors, { text: 'PEONIES' }).map(v => v.id), ['a']);
  assert.deepEqual(filterVendors(vendors, { text: 'harper' }).map(v => v.id), ['a'], 'event names are searched');
  assert.deepEqual(filterVendors(vendors, { category: 'Florist' }).map(v => v.id), ['a', 'c']);
  assert.deepEqual(groupVendors(vendors).map(g => [g.category, g.vendors.map(v => v.name)]), [
    ['Florist', ['Aster Florals', 'Bluebell Blooms']],
    ['hair & makeup', ['Glow Studio']],
    ['', ['Mystery Co']],
  ]);
  const cats = categoryChoices(vendors);
  assert.ok(cats.includes('Venue') && cats.includes('Florist'));
  assert.equal(cats.filter(c => c.toLowerCase() === 'florist').length, 1, 'no repeats');
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

test('the vendor book is one shared file, and two planners keep each other\'s changes', async () => {
  drive.share(appId, PLANNER, 'editor');
  await changeBook(b => upsertVendor(b, { id: 'v1', name: 'Bluebell Blooms' }, NOW, 'Owner'));
  await signedInAs(PLANNER);
  await changeBook(b => addFromEvent(b, [{ vendor: 'Glow Studio', role: 'Hair & makeup', emails: [], phones: [] }], HARPER, NOW, 'Planner').book);
  await signedInAs(OWNER);
  await changeBook(b => upsertVendor(b, { ...b.vendors.find(v => v.id === 'v1'), rating: 5 }, NOW, 'Owner'));
  const book = await loadBook();
  assert.deepEqual(book.vendors.map(v => [v.name, v.rating]), [['Bluebell Blooms', 5], ['Glow Studio', 0]]);
  const files = [...drive.files.values()].filter(f => f.name === VENDORS_FILE);
  assert.equal(files.length, 1);
  assert.equal(files[0].parents[0], appId);
});

test('without Editor access a planner can read the vendor book but not change it', async () => {
  await changeBook(b => upsertVendor(b, { id: 'v1', name: 'Bluebell Blooms' }, NOW));
  await signedInAs(PLANNER);
  assert.equal((await loadBook()).vendors.length, 1);
  await assert.rejects(changeBook(b => removeVendor(b, 'v1')), /Editor access/);
});
