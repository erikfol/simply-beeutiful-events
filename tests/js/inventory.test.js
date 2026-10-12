import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import {
  emptyInventory, normalizeInventory, upsertItem, removeItem, checkItem, categoryChoices, subcategoryChoices,
  filterItems, groupByCategory, photoName, loadInventory, changeInventory, uploadPhoto, deletePhoto, photoBlob,
  INVENTORY_FILE, PHOTOS_FOLDER, STARTER_CATEGORIES,
} from '../../docs/js/inventory.js';

const T = '2026-10-12T10:00:00.000Z';
const sample = () => [
  { id: 'a', name: 'Gold votive', category: 'Candles & votives', subcategory: 'Votive holders' },
  { id: 'b', name: '10x10 pop-up tent', category: 'Tents', subcategory: '' },
  { id: 'c', name: 'Clear votive', category: 'candles & votives', subcategory: 'Votive holders' },
  { id: 'd', name: 'Pillar candle', category: 'Candles & votives', subcategory: 'Candles' },
  { id: 'e', name: 'Mystery box', category: '', subcategory: '' },
].reduce((inv, f) => upsertItem(inv, f, T), emptyInventory()).items;

test('adding, editing and deleting items', () => {
  let inv = upsertItem(emptyInventory(), { name: '  White   linen ', category: 'Linens', subcategory: '' }, T);
  assert.equal(inv.items.length, 1);
  const [item] = inv.items;
  assert.equal(item.name, 'White linen', 'extra spaces are tidied');
  assert.ok(item.id);
  assert.equal(item.photoId, null);

  inv = upsertItem(inv, { id: item.id, name: 'White linen 90x132', category: 'Linens', subcategory: 'Rectangle', photoId: 'p1' }, '2026-10-13T00:00:00.000Z');
  assert.equal(inv.items.length, 1, 'edited, not duplicated');
  assert.deepEqual([inv.items[0].name, inv.items[0].subcategory, inv.items[0].photoId, inv.items[0].created], ['White linen 90x132', 'Rectangle', 'p1', T]);

  inv = upsertItem(inv, { id: item.id, name: 'White linen 90x132', category: 'Linens', subcategory: 'Rectangle' });
  assert.equal(inv.items[0].photoId, 'p1', 'editing without touching the photo keeps it');

  assert.equal(removeItem(inv, item.id).items.length, 0);
  assert.deepEqual(checkItem({ name: '  ' }), ['Give the item a name.']);
  assert.deepEqual(checkItem({ name: 'Arch' }), []);
});

test('saved data is cleaned up when read', () => {
  assert.deepEqual(normalizeInventory(null), emptyInventory());
  const inv = normalizeInventory({ items: [{ id: 'x', name: 'Arch' }, { id: 'y', name: '' }, null, { name: 'no id' }] });
  assert.deepEqual(inv.items.map(i => [i.id, i.category, i.photoId]), [['x', '', null]]);
});

test('categories ignore capitals, include the starters, and subcategories follow the category', () => {
  const items = sample();
  const cats = categoryChoices(items);
  assert.equal(cats.filter(c => c.toLowerCase() === 'candles & votives').length, 1);
  for (const c of STARTER_CATEGORIES) assert.ok(cats.includes(c));
  assert.deepEqual(subcategoryChoices(items, 'CANDLES & VOTIVES'), ['Candles', 'Votive holders']);
  assert.deepEqual(subcategoryChoices(items, 'Tents'), []);
});

test('search and category filter', () => {
  const items = sample();
  assert.deepEqual(filterItems(items, { text: 'votive' }).map(i => i.id), ['a', 'c', 'd'], 'matches the category too');
  assert.deepEqual(filterItems(items, { text: 'gold VOTIVE' }).map(i => i.id), ['a']);
  assert.deepEqual(filterItems(items, { category: 'Tents' }).map(i => i.id), ['b']);
  assert.equal(filterItems(items, {}).length, 5);
});

test('groups by category (no category last), then subcategory and name', () => {
  const groups = groupByCategory(sample());
  assert.deepEqual(groups.map(g => g.category), ['Candles & votives', 'Tents', '']);
  assert.deepEqual(groups[0].items.map(i => i.name), ['Pillar candle', 'Clear votive', 'Gold votive']);
});

test('photo file names are readable', () => {
  assert.equal(photoName({ id: 'i1', name: 'Gold Mercury-Glass Votive (set of 12)!' }), 'gold-mercury-glass-votive-set-of-12-i1.jpg');
  assert.equal(photoName({ id: 'i2', name: '***' }), 'item-i2.jpg');
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

test('the inventory and its photos save in the shared "SBE App Data" folder', async () => {
  await as(OWNER);
  assert.deepEqual(await loadInventory(), emptyInventory());

  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const photoId = await uploadPhoto({ id: 'i1', name: 'Gold votive' }, new Blob([bytes], { type: 'image/jpeg' }));
  await changeInventory(inv => upsertItem(inv, { id: 'i1', name: 'Gold votive', category: 'Candles & votives', subcategory: '', photoId }));

  const appData = named('SBE App Data')[0];
  const [file] = named(INVENTORY_FILE);
  assert.deepEqual(file.parents, [appData.id]);
  const [photos] = named(PHOTOS_FOLDER);
  assert.deepEqual(photos.parents, [appData.id]);
  assert.deepEqual(drive.files.get(photoId).parents, [photos.id]);
  assert.equal(drive.files.get(photoId).name, 'gold-votive-i1.jpg');
  assert.deepEqual([...new Uint8Array(await (await photoBlob(photoId)).arrayBuffer())], [...bytes]);

  await uploadPhoto({ id: 'i2', name: 'Tent' }, new Blob([bytes], { type: 'image/jpeg' }));
  assert.equal(named(PHOTOS_FOLDER).length, 1, 'one photos folder');

  await deletePhoto(photoId);
  assert.equal(drive.files.has(photoId), false);
  await deletePhoto(photoId); // already gone is fine
});

test('two planners editing at once keep each other\'s items', async () => {
  await as(OWNER);
  drive.share(named('SBE App Data')[0].id, PLANNER, 'editor');
  await changeInventory(inv => upsertItem(inv, { name: 'Arch', category: 'Backdrops & arches' }));

  assert.equal((await as(PLANNER)).state, 'ready');
  await changeInventory(inv => upsertItem(inv, { name: 'Tent', category: 'Tents' }));

  await as(OWNER);
  await changeInventory(inv => upsertItem(inv, { name: 'Votive', category: 'Candles & votives' }));
  assert.deepEqual((await loadInventory()).items.map(i => i.name), ['Arch', 'Tent', 'Votive']);
  assert.equal(named(INVENTORY_FILE).length, 1);
});

test('a planner without Editor access can see the inventory but not change it', async () => {
  await as(OWNER);
  await changeInventory(inv => upsertItem(inv, { name: 'Arch' }));

  assert.equal((await as(PLANNER)).state, 'view-only');
  assert.equal((await loadInventory()).items[0].name, 'Arch');
  await assert.rejects(changeInventory(inv => upsertItem(inv, { name: 'Tent' })), /Editor access/);
});
