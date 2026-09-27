import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHHMM, generateWeddingDay, applyTemplate, templateFromDay, DAY_TEMPLATES,
  shiftDay, shiftFrom, rippleLater,
} from '../../docs/js/draft.js';

const at = (day, title) => day.items.find(i => i.title === title);

test('normalizeHHMM pads hours and rejects invalid times', () => {
  assert.equal(normalizeHHMM('4:30'), '04:30');
  assert.equal(normalizeHHMM(' 16:30 '), '16:30');
  assert.equal(normalizeHHMM('25:00'), null);
  assert.equal(normalizeHHMM('4pm'), null);
  assert.equal(normalizeHHMM(null), null);
});

test('traditional wedding: ceremony, cocktail hour and reception chain from the answers', () => {
  const day = generateWeddingDay({ date: '2027-06-12', ceremony: '16:30', ceremonyLength: 30, cocktailMinutes: 60, receptionHours: 4 });
  assert.equal(day.date, '2027-06-12');
  assert.deepEqual([at(day, 'Ceremony').time, at(day, 'Ceremony').timeEnd], ['16:30', '17:00']);
  assert.deepEqual([at(day, 'Cocktail hour').time, at(day, 'Cocktail hour').timeEnd], ['17:00', '18:00']);
  assert.deepEqual([at(day, 'Reception').time, at(day, 'Reception').timeEnd], ['18:00', '22:00']);
  assert.ok(at(day, 'Family formals + couple portraits'));
  assert.equal(at(day, 'First look'), undefined);
  assert.ok(day.items.every(i => i.confidence === 'estimated' && i.roles.includes('planner')));
  const times = day.items.map(i => i.time);
  assert.deepEqual(times, [...times].sort(), 'stops come out in time order');
});

test('first look moves portraits and hair & makeup earlier', () => {
  const trad = generateWeddingDay({ ceremony: '16:30' });
  const fl = generateWeddingDay({ ceremony: '16:30', style: 'firstlook' });
  assert.equal(at(fl, 'First look').time, '14:00');
  assert.ok(at(fl, 'Hair and makeup complete').time < at(trad, 'Hair and makeup complete').time);
});

test('hair & makeup start depends on headcount and artists', () => {
  const day = generateWeddingDay({ ceremony: '16:30', hmuPeople: 6, hmuArtists: 2, hmuMinutes: 45 });
  // done 2h before ceremony (14:30); 3 rounds x 45 min = 135 min earlier
  assert.equal(at(day, 'Hair and makeup complete').time, '14:30');
  assert.equal(at(day, 'Hair and makeup begins').time, '12:15');
});

test('optional pieces follow the answers', () => {
  const plain = generateWeddingDay({ ceremony: '16:30', extras: { toasts: false, cake: false } });
  assert.equal(at(plain, 'Toasts'), undefined);
  assert.equal(at(plain, 'Cake cutting'), undefined);
  assert.equal(at(plain, 'Guest shuttle pickup'), undefined);

  const full = generateWeddingDay({ ceremony: '16:30', guestShuttle: true, partyShuttle: true, sunset: '20:25', extras: { sendOff: true } });
  assert.equal(at(full, 'Guest shuttle pickup').time, '15:30');
  assert.ok(at(full, 'Wedding-party shuttle departs'));
  assert.deepEqual([at(full, 'Golden-hour portraits').time, at(full, 'Golden-hour portraits').timeEnd], ['20:05', '20:30']);
  assert.equal(at(full, 'Send-off').time, '22:00');

  const earlySunset = generateWeddingDay({ ceremony: '16:30', sunset: '17:00' });
  assert.equal(at(earlySunset, 'Golden-hour portraits'), undefined, 'sunset outside the reception adds nothing');
});

test('elopement skips the reception program', () => {
  const day = generateWeddingDay({ ceremony: '11:00', style: 'elopement' });
  assert.ok(at(day, 'Ceremony'));
  assert.ok(at(day, 'Celebration dinner'));
  assert.equal(at(day, 'Reception'), undefined);
  assert.equal(at(day, 'Venue access / vendor load-in'), undefined);
});

test('built-in day templates place stops from a start time', () => {
  const items = applyTemplate(DAY_TEMPLATES.welcome, '18:00');
  assert.deepEqual(items.map(i => [i.time, i.title]), [['17:00', 'Welcome party setup'], ['18:00', 'Welcome party'], ['18:30', 'Welcome toast']]);
  assert.equal(items[1].timeEnd, '21:00');
});

test('a saved day template round-trips to a new start time', () => {
  const day = { title: 'Brunch', items: [
    { time: '10:00', timeEnd: '12:00', title: 'Brunch', detail: 'Inn', roles: ['planner', 'catering'] },
    { time: '09:30', title: 'Setup', roles: ['planner', 'venue'] },
  ] };
  const tpl = templateFromDay(day, 'My brunch');
  assert.deepEqual(tpl.items.map(t => [t.off, t.title]), [[30, 'Brunch'], [0, 'Setup']]);
  const placed = applyTemplate(tpl, '11:00');
  assert.deepEqual(placed.map(i => [i.time, i.timeEnd, i.title]), [['11:00', undefined, 'Setup'], ['11:30', '13:30', 'Brunch']]);
  assert.deepEqual(placed[1].roles, ['planner', 'catering']);
  assert.equal(templateFromDay({ items: [] }, 'empty'), null);
});

test('shiftDay moves start and end times and keeps the day sorted', () => {
  const day = { items: [{ time: '23:30', title: 'late' }, { time: '16:00', timeEnd: '17:00', title: 'cocktails' }] };
  shiftDay(day, 45);
  assert.deepEqual(day.items.map(i => [i.title, i.time]), [['late', '00:15'], ['cocktails', '16:45']]);
  assert.equal(day.items[1].timeEnd, '17:45');
});

test('shiftFrom moves a stop and everything after it', () => {
  const day = { items: [{ time: '10:00', title: 'a' }, { time: '12:00', title: 'b' }, { time: '14:00', timeEnd: '15:00', title: 'c' }] };
  shiftFrom(day, 1, 30);
  assert.deepEqual(day.items.map(i => i.time), ['10:00', '12:30', '14:30']);
  assert.equal(day.items[2].timeEnd, '15:30');
});

test('rippleLater carries an edited time change to later stops only', () => {
  const edited = { time: '16:30', title: 'Ceremony' };
  const day = { items: [{ time: '14:00', title: 'photos' }, edited, { time: '17:00', title: 'cocktails' }, { time: '18:00', title: 'reception' }] };
  // the user changed the ceremony from 16:00 to 16:30
  const moved = rippleLater(day, edited, '16:00', '16:30');
  assert.equal(moved, 2);
  assert.deepEqual(day.items.map(i => i.time), ['14:00', '16:30', '17:30', '18:30']);
  assert.equal(rippleLater(day, edited, '16:30', '16:30'), 0);
});

test('applyEdit keeps a stop\'s length when only its start moves, and can ripple', async () => {
  const { applyEdit } = await import('../../docs/js/draft.js');
  const day = { items: [{ time: '16:00', timeEnd: '16:30', title: 'Ceremony' }, { time: '16:30', timeEnd: '17:30', title: 'Cocktail hour' }] };
  const moved = applyEdit(day, 0, { time: '16:15', timeEnd: '16:30', title: 'Ceremony' }, true);
  assert.equal(moved, 1);
  assert.deepEqual(day.items.map(i => [i.time, i.timeEnd]), [['16:15', '16:45'], ['16:45', '17:45']]);
  // an explicitly changed end time is respected
  applyEdit(day, 0, { time: '16:15', timeEnd: '17:00', title: 'Ceremony' });
  assert.equal(day.items[0].timeEnd, '17:00');
});
