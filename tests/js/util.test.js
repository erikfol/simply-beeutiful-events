import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmt12, shiftHHMM, daysBetween, to24, extractTimes, enrichEvent, sortDay, isLateDay, nightMinutes } from '../../docs/js/util.js';

test('shiftHHMM moves forward, backward, and wraps midnight', () => {
  assert.equal(shiftHHMM('16:30', 15), '16:45');
  assert.equal(shiftHHMM('16:30', -390), '10:00');
  assert.equal(shiftHHMM('23:30', 45), '00:15');
  assert.equal(shiftHHMM('00:10', -20), '23:50');
});

test('daysBetween counts whole days either way', () => {
  assert.equal(daysBetween('2026-09-27', '2027-06-12'), 258);
  assert.equal(daysBetween('2026-09-27', '2026-09-15'), -12);
  assert.equal(daysBetween('2026-09-27', '2026-09-27'), 0);
});

test('to24 needs an am/pm clue and handles noon and midnight', () => {
  assert.equal(to24('4pm'), '16:00');
  assert.equal(to24('6:30 PM'), '18:30');
  assert.equal(to24('12 a.m.'), '00:00');
  assert.equal(to24('12pm'), '12:00');
  assert.equal(to24('10:00'), null);
});

test('extractTimes reads ranges and single times, sorted and unique', () => {
  assert.deepEqual(extractTimes('Dinner 6-10pm, speeches at 7:30 PM, again 7:30pm'), ['18:00', '19:30', '22:00']);
  assert.deepEqual(extractTimes('no times here, just 2026'), []);
});

test('enrichEvent keeps existing times and falls back to the snippet', () => {
  assert.equal(enrichEvent({ times: ['09:00'], snippet: 'at 4pm' }).time, '09:00');
  assert.equal(enrichEvent({ snippet: 'Ceremony at 4:00 PM' }).time, '16:00');
  assert.equal(enrichEvent({ snippet: 'no time' }).time, null);
});

test('fmt12 formats 24h times for display', () => {
  assert.equal(fmt12('16:05'), '4:05 p.m.');
  assert.equal(fmt12('00:30'), '12:30 a.m.');
  assert.equal(fmt12(''), '');
});

test('esc escapes HTML', () => {
  assert.equal(esc(`<b>"Tom's" & co</b>`), '&lt;b&gt;&quot;Tom&#39;s&quot; &amp; co&lt;/b&gt;');
  assert.equal(esc(null), '');
});

test('sortDay orders stops by time, untimed last', () => {
  const day = { items: [{ time: '16:00' }, { time: '' }, { time: '09:30' }] };
  sortDay(day);
  assert.deepEqual(day.items.map(i => i.time), ['09:30', '16:00', '']);
});

test('sortDay puts after-midnight stops at the end of an evening', () => {
  const day = { items: [{ time: '00:15', title: 'Final shuttle' }, { time: '' }, { time: '23:30' }, { time: '18:00' }, { time: '01:00' }] };
  sortDay(day);
  assert.deepEqual(day.items.map(i => i.time), ['18:00', '23:30', '00:15', '01:00', '']);
});

test('sortDay keeps early-morning stops first on a morning-only day', () => {
  const day = { items: [{ time: '09:00' }, { time: '03:30' }, { time: '11:00' }] };
  sortDay(day);
  assert.deepEqual(day.items.map(i => i.time), ['03:30', '09:00', '11:00']);
});

test('nightMinutes and isLateDay count a late night past 24:00', () => {
  assert.equal(isLateDay([{ time: '09:00' }, { time: '12:00' }]), true);
  assert.equal(isLateDay([{ time: '09:00' }, { title: 'untimed' }]), false);
  assert.equal(nightMinutes('00:15', true), 1455);
  assert.equal(nightMinutes('00:15', false), 15);
  assert.equal(nightMinutes('05:00', true), 300);
});
