// Basic event details for the Overview: best guesses from the documents (each with its source), and
// whatever the planner typed in, which always wins. Pure, no DOM.
import { detailsFromText } from './scan.js';
import { parseEventFolderName } from './driveEvents.js';
import { inferRoles, roleLabel } from './roles.js';

export const DETAIL_FIELDS = [
  ['couple', 'Couple'],
  ['venue', 'Venue'],
  ['guests', 'Guest count'],
  ['gettingReady', 'Getting ready'],
  ['lodging', 'Hotel / room block'],
  ['notes', 'Notes'],
];

// "10.3.26 Alyssa & Mick" -> "Alyssa & Mick"; "6.12.27 Harper-Bennett Wedding (Demo)" -> "Harper-Bennett"
export function coupleFromEventName(name) {
  const { title } = parseEventFolderName(name || '');
  return title.replace(/\(demo\)/i, '').replace(/\b(wedding|elopement|ceremony|reception)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
}

const mostCommon = (list) => {
  const counts = new Map();
  for (const x of list) counts.set(x.value, (counts.get(x.value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
};

// Reports made by the Python scanner have no details: read them out of the saved snippets instead.
function detailsFromSnippets(report) {
  const out = { names: [], guests: [], venues: [], lodging: [] };
  for (const e of report.timeline || []) {
    const d = detailsFromText(e.snippet || '');
    d.names.forEach(value => out.names.push({ value, source: e.source }));
    d.guests.forEach(value => out.guests.push({ value, source: e.source }));
    d.venues.forEach(value => out.venues.push({ value, source: e.source }));
  }
  for (const f of report.files || []) {
    if (/rooming\s*list|room\s*block|hotel|marriott|hilton|hyatt|courtyard|suites/i.test(f.file || f.name || '')) out.lodging.push({ file: f.file || f.name, link: f.webViewLink || '' });
  }
  return out;
}

/**
 * @returns {{fields: Array<{key, label, value, source?, link?, edited?}>, otherDays: Array<{date, title}>}}
 */
export function eventDetails({ meta, report, curated, saved = {} }) {
  const found = report.details || detailsFromSnippets(report);
  const pick = {};

  // couple: names written in a contract beat the folder name
  const names = mostCommon(found.names);
  if (names) {
    const first = found.names.find(n => n.value === names[0]);
    pick.couple = { value: names[0], source: first.source, link: first.link };
  } else if (coupleFromEventName(meta.name)) {
    pick.couple = { value: coupleFromEventName(meta.name), source: 'event folder name' };
  }

  // venue: the booked vendor for the ceremony or reception, then a "Venue:" label, then the index/run sheet
  const booked = (report.vendors && report.vendors.booked) || [];
  const venueVendor = booked.find(v => /ceremony|reception/i.test(v.event || ''));
  const venueLabel = mostCommon(found.venues);
  const weddingDay = curated && curated.days && curated.days.find(d => d.date === meta.weddingDate);
  if (venueVendor) {
    pick.venue = { value: [venueVendor.vendor, venueVendor.location].filter(Boolean).join(', '), source: 'vendor list' };
  } else if (venueLabel) {
    const first = found.venues.find(v => v.value === venueLabel[0]);
    pick.venue = { value: venueLabel[0], source: first.source, link: first.link };
  } else if (meta.venue) {
    pick.venue = { value: meta.venue, source: 'event list' };
  } else if (weddingDay && / [—–-] /.test(weddingDay.title)) {
    // "Wedding Day — Willow Brook Barn" (generated drafts use —, hand-made titles often a plain dash)
    pick.venue = { value: weddingDay.title.split(/ [—–-] /).slice(1).join(' - '), source: 'run sheet' };
  }

  // guest count: the number mentioned most often (contracts repeat the final count)
  const guests = mostCommon(found.guests);
  if (guests) {
    const first = found.guests.find(g => g.value === guests[0]);
    pick.guests = { value: `about ${guests[0]}`, source: first.source, link: first.link };
  }

  // getting ready: where the hair and makeup stop happens on the run sheet
  const hmu = weddingDay && weddingDay.items.find(it => /hair|makeup/i.test(it.title) && /\bat\s+[A-Z]/.test(`${it.title} ${it.detail || ''}`));
  if (hmu) {
    const m = /\bat\s+([A-Z][^.]*)/.exec(`${hmu.title} ${hmu.detail || ''}`);
    pick.gettingReady = { value: m[1].trim(), source: 'run sheet' };
  } else {
    const hmuDetail = weddingDay && weddingDay.items.find(it => /hair|makeup/i.test(it.title) && it.detail);
    if (hmuDetail && /[A-Z]/.test(hmuDetail.detail)) pick.gettingReady = { value: hmuDetail.detail.split(/\.(?:\s|$)/)[0].trim(), source: 'run sheet' };
  }

  // hotel: rooming lists and room-block documents
  if (found.lodging.length) {
    pick.lodging = { value: found.lodging.map(l => l.file.split('/').pop().replace(/\.[a-z]{2,5}$/i, '')).join('; '), source: found.lodging[0].file, link: found.lodging[0].link, all: found.lodging };
  }

  const fields = DETAIL_FIELDS.map(([key, label]) => {
    if (saved[key]) return { key, label, value: saved[key], edited: true };
    return { key, label, ...(pick[key] || { value: '' }) };
  });

  const otherDays = ((curated && curated.days) || [])
    .filter(d => d.date !== meta.weddingDate)
    .map(d => ({ date: d.date, title: d.title }));
  return { fields, otherDays };
}

// ---------- Vendors and contacts: one table ----------

// "The Midnight Owls Band, LLC" -> "midnight owls band"
const normName = (s) => (s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(the|llc|inc|co|company|and)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const sameVendor = (a, b) => {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const first = (s) => s.split(' ').filter(w => w.length > 2).slice(0, 2).join(' ');
  return first(x) !== '' && first(x) === first(y);
};

/**
 * Vendor list rows (from the "Vendor Options" sheet) merged with emails and phones found in documents.
 * @returns {Array<{vendor, role, contact, emails, phones, cost, location, sources: Array<{file, link}>, fromSheet}>}
 */
export function vendorRows(report) {
  const booked = (report.vendors && report.vendors.booked) || [];
  const sheetFile = report.vendors && report.vendors.vendorsFile;
  const rows = booked.map(v => ({
    vendor: v.vendor, role: v.event || '', contact: v.contact || '', location: v.location || '', cost: v.cost || '',
    emails: v.email ? [v.email.toLowerCase()] : [], phones: [],
    sources: sheetFile ? [{ file: sheetFile.name, link: sheetFile.link }] : [], fromSheet: true,
  }));
  for (const c of report.contacts || []) {
    // the vendor and budget sheets list everyone; their vendors are already rows
    if (c.kind === 'vendors' || c.kind === 'budget') continue;
    let row = rows.find(r => sameVendor(r.vendor, c.vendor));
    if (!row && c.emails.length && c.emails.length <= 2) {
      // a contract named differently (e.g. "Katie_Mike Agreement") still belongs to the vendor whose email it has
      const hits = new Set(c.emails.map(e => rows.find(r => r.emails.includes(e))).filter(Boolean));
      if (hits.size === 1) row = [...hits][0];
    }
    if (row) {
      for (const e of c.emails) if (!row.emails.includes(e)) row.emails.push(e);
      for (const p of c.phones) if (!row.phones.includes(p)) row.phones.push(p);
      row.sources.push({ file: c.source, link: c.link });
    } else {
      const roles = inferRoles({ title: c.vendor, source: c.source }).filter(r => r !== 'planner');
      rows.push({
        vendor: c.vendor, role: roles.length ? roleLabel(roles[0]) : '', contact: '', location: '', cost: '',
        emails: [...c.emails], phones: [...c.phones], sources: [{ file: c.source, link: c.link }], fromSheet: false,
      });
    }
  }
  const sheet = rows.filter(r => r.fromSheet);
  const docs = rows.filter(r => !r.fromSheet).sort((a, b) => a.vendor.localeCompare(b.vendor));
  return [...sheet, ...docs];
}
