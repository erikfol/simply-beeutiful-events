import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferRoles, rolesOf, itemInView, roleLabel } from '../../docs/js/roles.js';
import { docSuggestions, docEventToStop, vendorOf } from '../../docs/js/suggestions.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../demo_event/reports/${f}`, import.meta.url), 'utf8'));

test('inferRoles guesses who a stop involves, planner always included', () => {
  assert.deepEqual(inferRoles({ title: 'Photographer arrives' }), ['planner', 'photo']);
  const hmu = inferRoles({ title: 'Hair and makeup team arrives' });
  assert.ok(hmu.includes('hmua') && hmu.includes('couple'));
  assert.ok(inferRoles({ title: 'Guest shuttle pickup' }).includes('transport'));
  assert.deepEqual(inferRoles({ title: 'Quiet time' }), ['planner']);
});

test('explicit roles win over guesses; views filter by role', () => {
  const stop = { title: 'Photographer arrives', roles: ['planner', 'video'] };
  assert.deepEqual(rolesOf(stop), ['planner', 'video']);
  assert.ok(itemInView(stop, 'video'));
  assert.ok(!itemInView(stop, 'photo'));
  assert.ok(itemInView(stop, ''), 'full view shows everything');
  assert.ok(itemInView({ title: 'Anything', roles: [] }, 'planner'), 'planner view shows everything');
  assert.equal(roleLabel('hmua'), 'Hair & makeup');
});

test('document times become suggested stops unless the timeline already cites that vendor at that time', () => {
  const report = load('6-12-27-harper-bennett-wedding-demo.json');
  const curated = load('6-12-27-harper-bennett-wedding-demo.timeline.json');
  const weddingDay = curated.days.find(d => d.date === '2027-06-12');
  // the demo run sheet already covers every document time except the band's 4:30 ceremony note
  assert.deepEqual(docSuggestions(report.timeline, weddingDay).map(s => [s.time, vendorOf(s.source)]), [['16:30', 'The Midnight Owls Band']]);
  // an empty day gets every timed wedding-day item from the documents
  const empty = docSuggestions(report.timeline, { date: '2027-06-12', items: [] });
  assert.equal(empty.length, report.timeline.filter(e => e.date_iso === '2027-06-12' && e.time).length);
  assert.ok(empty.every(s => s.confidence === 'confirmed'));
});

test('docEventToStop builds a readable, sourced stop', () => {
  const s = docEventToStop({ time: '13:00', label: 'delivery', source: 'Bluebell Blooms - Floral Quote.txt', snippet: '…Floral delivery and setup at 1:00 PM…' });
  assert.equal(s.title, 'Delivery — Bluebell Blooms');
  assert.equal(s.source, 'Bluebell Blooms - Floral Quote');
  assert.equal(s.detail, 'Floral delivery and setup at 1:00 PM');
  assert.ok(s.roles.includes('florist'));
});

test('suggested stop details keep only the sentence with the date', async () => {
  const { keySentence } = await import('../../docs/js/suggestions.js');
  const e = { date_raw: '6/12/2027', snippet: '…ndard agreement on file; changes must be made in writing. Wedding day 6/12/2027: hair and makeup team arrives at 9:30 AM at Birchwood Inn. Services for the bride plus 5 attendants…' };
  assert.equal(keySentence(e), 'Wedding day 6/12/2027: hair and makeup team arrives at 9:30 AM at Birchwood Inn.');
  assert.equal(keySentence({ snippet: 'no date here' }), 'no date here');
});
