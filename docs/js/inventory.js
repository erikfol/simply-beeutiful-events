// SBE's supplies inventory: items with a name, category, subcategory and photos (optional; the first is the main one).
// Saved as inventory.json in the shared "SBE App Data" folder; photos go in its "Inventory Photos" folder.
// Each change re-reads the saved list first, so two planners editing at once don't erase each other's work.
import { readData, writeData, appSubfolderId } from './appdata.js';
import { uploadFile, deleteFile, fileBytes } from './drive.js';

export const INVENTORY_FILE = 'inventory.json';
export const PHOTOS_FOLDER = 'Inventory Photos';

// Offered in the category box alongside the categories already in use.
export const STARTER_CATEGORIES = [
  'Tents', 'Candles & votives', 'Florals', 'Linens', 'Signs', 'Table decor', 'Lighting', 'Backdrops & arches', 'Ceremony', 'Serving & glassware',
];

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export const emptyInventory = () => ({ updated: null, items: [] });

export function normalizeInventory(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  return {
    updated: (data && data.updated) || null,
    items: items.filter(i => i && i.id && clean(i.name)).map(i => ({
      id: String(i.id), name: clean(i.name), category: clean(i.category), subcategory: clean(i.subcategory),
      photoIds: photoIdsOf(i), created: i.created || null, updated: i.updated || null,
    })),
  };
}

// Photo ids of a saved item; items saved before several photos were allowed had one "photoId".
function photoIdsOf(i) {
  if (Array.isArray(i.photoIds)) return i.photoIds.filter(Boolean).map(String);
  return i.photoId ? [String(i.photoId)] : [];
}

export const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Problems with a filled-in form, as messages ([] = fine to save).
export function checkItem(fields) {
  return clean(fields.name) ? [] : ['Give the item a name.'];
}

// Add a new item, or change one (matched by id). Returns a new inventory; the old one is untouched.
export function upsertItem(inv, fields, now = new Date().toISOString()) {
  const existing = inv.items.find(i => i.id === fields.id);
  const item = {
    id: fields.id || newItemId(),
    name: clean(fields.name), category: clean(fields.category), subcategory: clean(fields.subcategory),
    photoIds: fields.photoIds === undefined ? (existing ? existing.photoIds : []) : [...fields.photoIds],
    created: existing ? existing.created : now, updated: now,
  };
  const items = existing ? inv.items.map(i => (i.id === item.id ? item : i)) : [...inv.items, item];
  return { updated: now, items };
}

export const removeItem = (inv, id, now = new Date().toISOString()) => ({ updated: now, items: inv.items.filter(i => i.id !== id) });

const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

// Category names in use (matching ignores capitals, so "florals" and "Florals" are one), plus the starters.
export function categoryChoices(items) {
  const seen = new Map();
  for (const c of [...items.map(i => i.category), ...STARTER_CATEGORIES]) {
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
  }
  return [...seen.values()].sort(byName);
}

export function subcategoryChoices(items, category) {
  const cat = clean(category).toLowerCase();
  const seen = new Map();
  for (const i of items) {
    if (i.subcategory && (!cat || i.category.toLowerCase() === cat) && !seen.has(i.subcategory.toLowerCase())) seen.set(i.subcategory.toLowerCase(), i.subcategory);
  }
  return [...seen.values()].sort(byName);
}

// Search text matches the name, category or subcategory; category '' = all.
export function filterItems(items, { text = '', category = '' } = {}) {
  const words = clean(text).toLowerCase().split(' ').filter(Boolean);
  return items.filter(i => {
    if (category && i.category.toLowerCase() !== category.toLowerCase()) return false;
    const hay = `${i.name} ${i.category} ${i.subcategory}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

// Groups for display: [{category, items}] by category, then subcategory and name. No category goes last.
export function groupByCategory(items) {
  const groups = new Map();
  for (const i of items) {
    const key = i.category.toLowerCase();
    if (!groups.has(key)) groups.set(key, { category: i.category, items: [] });
    groups.get(key).items.push(i);
  }
  for (const g of groups.values()) g.items.sort((a, b) => byName(a.subcategory, b.subcategory) || byName(a.name, b.name));
  return [...groups.values()].sort((a, b) => (!a.category) - (!b.category) || byName(a.category, b.category));
}

// File name for a photo in Drive, readable when browsing the folder: "white-votive-holder-i1ab2c-2.jpg".
export function photoName(item, n = 1, ext = 'jpg') {
  const slug = item.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'item';
  return `${slug}-${item.id}-${n}.${ext}`;
}

// ---------- saving to Drive ----------

export async function loadInventory() {
  return normalizeInventory(await readData(INVENTORY_FILE));
}

// Apply one change to the latest saved list and save it. Returns the saved inventory.
export async function changeInventory(change) {
  const next = change(await loadInventory());
  await writeData(INVENTORY_FILE, next);
  return next;
}

export async function uploadPhoto(item, blob, n = 1) {
  const file = await uploadFile(photoName(item, n), await appSubfolderId(PHOTOS_FOLDER), blob, blob.type || 'image/jpeg');
  return file.id;
}

// Photos are only ever ones this page uploaded; a photo that's already gone is fine.
export async function deletePhoto(id) {
  try { await deleteFile(id); } catch (e) { if (!/\(404\)/.test(e.message)) throw e; }
}

export async function photoBlob(id) {
  return new Blob([await fileBytes(id)], { type: 'image/jpeg' });
}
