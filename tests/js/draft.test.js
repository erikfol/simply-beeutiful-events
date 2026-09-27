import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_TEMPLATE, buildDraftItems, normalizeHHMM, shiftDay } from '../../docs/js/draft.js';

test('normalizeHHMM pads hours and rejects invalid times', () => {
  assert.equal(normalizeHHMM('4:30'), '04:30');
  assert.equal(normalizeHHMM(' 16:30 '), '16:30');
  assert.equal(normalizeHHMM('25:00'), null);
  assert.equal(normalizeHHMM('4pm'), null);
  assert.equal(normalizeHHMM(null), null);
});

test('buildDraftItems anchors every stop to the ceremony time', () => {
  const items = buildDraftItems('16:30');
  assert.equal(items.length, DRAFT_TEMPLATE.length);
  const byTitle = Object.fromEntries(items.map(i => [i.title, i]));
  assert.equal(byTitle['Venue access / vendor load-in begins'].time, '10:00');
  assert.equal(byTitle['Ceremony begins'].time, '16:30');
  assert.equal(byTitle['Reception'].time, '18:00');
  assert.equal(byTitle['Reception'].timeEnd, '22:00');
  assert.ok(items.every(i => i.confidence === 'estimated'));
});

test('shiftDay moves start and end times and keeps the day sorted', () => {
  const day = { items: [{ time: '23:30', title: 'late' }, { time: '16:00', timeEnd: '17:00', title: 'cocktails' }] };
  shiftDay(day, 45);
  assert.deepEqual(day.items.map(i => [i.title, i.time]), [['late', '00:15'], ['cocktails', '16:45']]);
  assert.equal(day.items[1].timeEnd, '17:45');
});
