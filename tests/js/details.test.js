import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { detailsFromText, scanText, buildReport } from '../../docs/js/scan.js';
import { eventDetails, coupleFromEventName } from '../../docs/js/details.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../docs/reports/${f}`, import.meta.url), 'utf8'));
const DEMO = new URL('../demo_event/6.12.27 Harper-Bennett Wedding (Demo)/', import.meta.url);
const meta = { name: '6.12.27 Harper-Bennett Wedding (Demo)', weddingDate: '2027-06-12', venue: '' };
const curated = load('6-12-27-harper-bennett-wedding-demo.timeline.json');
const field = (d, key) => d.fields.find(f => f.key === key);

// A Drive-style report: every demo document read in full.
function driveReport() {
  const files = readdirSync(DEMO).filter(n => !n.endsWith('.xlsx')).map(name => ({
    id: name, name, path: '', mimeType: 'text/plain', webViewLink: `https://drive.google.com/file/d/${encodeURIComponent(name)}/view`,
    result: scanText(readFileSync(new URL(name, DEMO), 'utf8'), name),
  }));
  return buildReport(files);
}

test('names written as labels in contracts', () => {
  assert.deepEqual(detailsFromText('Purchaser: Mike Petran & Katherine Mistretta. Address: 1 Main St').names, ['Mike Petran & Katherine Mistretta']);
  assert.deepEqual(detailsFromText('Bride: Olivia Harper\nGroom: James Bennett').names, ['Olivia Harper & James Bennett']);
  assert.deepEqual(detailsFromText('Clients: Olivia Harper & James Bennett. Contract signed March 2, 2026').names, ['Olivia Harper & James Bennett']);
  assert.deepEqual(detailsFromText('No labels here.').names, []);
});

test('guest counts skip other gatherings and dates', () => {
  assert.deepEqual(detailsFromText('Guest count: 120 guests maximum.').guests, [120]);
  assert.deepEqual(detailsFromText('Welcome party in the Tap Room: 60 guests.').guests, []);
  assert.deepEqual(detailsFromText('Dinner service on 6-12-27 guests seated at 6:00 PM.').guests, []);
});

test('event details from the documents, each with its source', () => {
  const d = eventDetails({ meta, report: driveReport(), curated });
  assert.equal(field(d, 'couple').value, 'Olivia Harper & James Bennett');
  assert.equal(field(d, 'couple').source, 'Juniper Lane Photography - Contract.txt');
  assert.match(field(d, 'couple').link, /^https:\/\/drive\.google\.com\//);
  assert.equal(field(d, 'guests').value, 'about 120');
  assert.equal(field(d, 'gettingReady').value, 'Birchwood Inn, Suite 4');
  assert.deepEqual(d.otherDays.map(x => x.date), ['2027-06-11', '2027-06-13', '2027-06-14']);
});

test('venue: the ceremony/reception vendor, else the event list, else the run sheet', () => {
  const report = load('6-12-27-harper-bennett-wedding-demo.json'); // has the vendor list
  assert.equal(field(eventDetails({ meta, report, curated }), 'venue').value, 'Willow Brook Barn, Maple Hollow, NH');
  const noVendors = { ...report, vendors: { booked: [] } };
  assert.equal(field(eventDetails({ meta: { ...meta, venue: 'Somewhere, NH' }, report: noVendors, curated }), 'venue').value, 'Somewhere, NH');
  assert.equal(field(eventDetails({ meta, report: noVendors, curated }), 'venue').value, 'Willow Brook Barn, Maple Hollow NH');
});

test('what the planner typed always wins; folder name is the last resort for the couple', () => {
  const d = eventDetails({ meta, report: { timeline: [], files: [] }, curated: null, saved: { venue: 'Riverside Hall', notes: 'Bride prefers texts' } });
  assert.deepEqual([field(d, 'venue').value, field(d, 'venue').edited], ['Riverside Hall', true]);
  assert.equal(field(d, 'notes').value, 'Bride prefers texts');
  assert.deepEqual([field(d, 'couple').value, field(d, 'couple').source], ['Harper-Bennett', 'event folder name']);
  assert.equal(coupleFromEventName('10.3.26 Alyssa & Mick'), 'Alyssa & Mick');
});

test('rooming lists and room blocks show up as the hotel', () => {
  const report = buildReport([{ id: 'r', name: 'A&M - Courtyard by Marriott Rooming List as of 7.7.26.pdf', path: '', mimeType: 'application/pdf', webViewLink: 'https://drive.google.com/x', result: scanText('Rooming list', 'x.pdf') }]);
  assert.equal(field(eventDetails({ meta, report, curated: null }), 'lodging').value, 'A&M - Courtyard by Marriott Rooming List as of 7.7.26');
});

test('vendors and contacts: sheet vendors first, document contacts merged in or added', async () => {
  const { vendorRows } = await import('../../docs/js/details.js');
  const report = {
    vendors: { booked: [
      { vendor: 'Juniper Lane Photography', location: 'Clearwater, NH', event: 'Wedding Day', contact: 'Priya Nair', email: 'priya@juniperlane.example.com', cost: '$3,200' },
      { vendor: 'The Midnight Owls Band', location: '', event: 'Reception', contact: '', email: '', cost: '' },
    ], vendorsFile: { name: 'Vendor Options', link: 'https://drive.google.com/v' } },
    contacts: [
      { vendor: 'Juniper Lane Photography', emails: ['priya@juniperlane.example.com'], phones: ['(603) 555-0102'], source: 'Juniper Lane Photography - Contract.pdf', link: 'https://drive.google.com/j' },
      { vendor: 'Midnight Owls', emails: ['bookings@midnightowls.example.com'], phones: [], source: 'Midnight Owls - Agreement.docx', link: 'https://drive.google.com/m' },
      { vendor: 'Bluebell Blooms', emails: ['sadie@bluebellblooms.example.com'], phones: ['(603) 555-0105'], source: 'Bluebell Blooms - Floral Quote.pdf', link: 'https://drive.google.com/b' },
    ],
  };
  const rows = vendorRows(report);
  assert.deepEqual(rows.map(r => r.vendor), ['Juniper Lane Photography', 'The Midnight Owls Band', 'Bluebell Blooms']);
  assert.deepEqual(rows[0].phones, ['(603) 555-0102'], 'phone from the contract added to the sheet row');
  assert.deepEqual(rows[0].emails, ['priya@juniperlane.example.com'], 'no duplicate email');
  assert.equal(rows[0].sources.length, 2);
  assert.deepEqual(rows[1].emails, ['bookings@midnightowls.example.com'], '"Midnight Owls" matches "The Midnight Owls Band"');
  assert.deepEqual([rows[2].fromSheet, rows[2].role], [false, 'Florist']);
  assert.deepEqual(vendorRows({}), []);
});

test('the vendor sheet and multi-vendor notes never pile contacts onto one vendor', async () => {
  const { vendorRows } = await import('../../docs/js/details.js');
  const booked = [
    { vendor: 'Willow Brook Barn', email: 'events@willowbrookbarn.example.com' },
    { vendor: 'Glow Studio', email: 'book@glowstudio.example.com' },
  ];
  const everyone = ['events@willowbrookbarn.example.com', 'book@glowstudio.example.com', 'priya@juniperlane.example.com'];
  const rows = vendorRows({
    vendors: { booked },
    contacts: [
      { vendor: 'Olivia & James Vendor Options', emails: everyone, phones: ['(603) 555-0101'], source: 'Olivia & James Vendor Options.xlsx', kind: 'vendors' },
      { vendor: 'Planner Notes', emails: everyone, phones: [], source: 'Planner Notes.md', kind: 'document' },
      { vendor: 'Katie_Mike Agreement', emails: ['book@glowstudio.example.com'], phones: ['(603) 555-0106'], source: 'Katie_Mike Agreement.pdf', kind: 'contract' },
    ],
  });
  assert.deepEqual(rows.find(r => r.vendor === 'Willow Brook Barn').emails, ['events@willowbrookbarn.example.com']);
  assert.deepEqual(rows.find(r => r.vendor === 'Glow Studio').phones, ['(603) 555-0106'], 'matched by its one email');
  assert.ok(rows.some(r => r.vendor === 'Planner Notes'), 'a document naming many vendors gets its own row');
  assert.ok(!rows.some(r => r.vendor === 'Olivia & James Vendor Options'), 'the vendor sheet is not a row of its own');
});
