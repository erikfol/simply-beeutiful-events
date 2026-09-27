// Pure timeline-building logic (no DOM), shared by the timeline UI and the Node tests.
import { shiftHHMM, sortDay } from './util.js';

export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMin = (mins) => shiftHHMM('00:00', mins);

// "4:30" / "16:30" -> "16:30"; null when not a valid 24h HH:MM.
export function normalizeHHMM(raw) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export const STYLES = [
  ['traditional', 'Traditional'],
  ['firstlook', 'First look'],
  ['elopement', 'Elopement / micro'],
];

export const EXTRAS = [
  ['entrance', 'Grand entrance', true],
  ['firstDance', 'First dance', true],
  ['toasts', 'Toasts', true],
  ['parentDances', 'Parent dances', true],
  ['cake', 'Cake cutting', true],
  ['bouquet', 'Bouquet / garter toss', false],
  ['sendOff', 'Send-off (sparklers, bubbles)', false],
];

export const WEDDING_DEFAULTS = {
  ceremony: '16:30', ceremonyLength: 30, style: 'traditional', venue: '', readyLocation: '',
  hmuPeople: 6, hmuArtists: 2, hmuMinutes: 45, cocktailMinutes: 60, receptionHours: 4,
  partyShuttle: false, guestShuttle: false, sunset: '',
  extras: Object.fromEntries(EXTRAS.map(([k, , on]) => [k, on])),
};

const SOURCE = 'Generated draft — confirm';

/**
 * Build a wedding-day run sheet from questionnaire answers.
 * Times are rules of thumb relative to the ceremony start; every stop is marked estimated.
 */
export function generateWeddingDay(answers) {
  const a = { ...WEDDING_DEFAULTS, ...answers, extras: { ...WEDDING_DEFAULTS.extras, ...(answers.extras || {}) } };
  const C = toMin(a.ceremony);
  const L = +a.ceremonyLength;
  const x = a.extras;
  const venue = a.venue || 'the venue';
  const ready = a.readyLocation || 'the getting-ready location';
  const firstLook = a.style === 'firstlook';
  const elopement = a.style === 'elopement';
  const rows = [];
  const add = (start, title, detail, roles, end) => rows.push({ start, end, title, detail, roles });

  // --- before the ceremony ---
  if (!elopement) add(C - 360, 'Venue access / vendor load-in', `Setup at ${venue}.`, ['venue', 'rentals', 'catering', 'florist']);
  add(elopement ? C - 120 : C - 240, 'Florals delivered and set', '', ['florist', 'venue']);

  const hmuDone = firstLook ? C - 180 : elopement ? C - 90 : C - 120;
  const hmuLength = Math.ceil(Math.max(1, +a.hmuPeople) / Math.max(1, +a.hmuArtists)) * Math.max(15, +a.hmuMinutes);
  add(hmuDone - hmuLength, 'Hair and makeup begins', `${a.hmuPeople} people, ${a.hmuArtists} artists at ${ready}.`, ['hmua', 'couple', 'party']);
  add(hmuDone, 'Hair and makeup complete', 'Buffer before getting dressed.', ['hmua', 'couple', 'party']);

  const photoStart = firstLook ? C - 240 : elopement ? C - 60 : C - 150;
  add(photoStart, 'Photographer arrives', 'Details and getting-ready photos.', ['photo', 'video']);

  if (a.partyShuttle && !elopement) {
    add(firstLook ? C - 170 : C - 100, 'Wedding-party shuttle departs', `From ${ready} to ${venue}.`, ['transport', 'party', 'couple']);
  }
  if (firstLook) {
    add(C - 150, 'First look', 'Private moment before portraits.', ['couple', 'photo', 'video']);
    add(C - 140, 'Couple + wedding party portraits', '', ['couple', 'party', 'photo', 'video'], C - 75);
    add(C - 75, 'Family portraits', 'Immediate family only; share the list with the photographer.', ['family', 'couple', 'photo'], C - 50);
  } else if (!elopement) {
    add(C - 80, 'Wedding party portraits (separately)', 'Each side photographed apart before the ceremony.', ['party', 'couple', 'photo'], C - 45);
  }
  if (a.guestShuttle && !elopement) {
    add(C - 60, 'Guest shuttle pickup', 'From the hotels.', ['transport', 'guests']);
    add(C - 35, 'Guest shuttle arrives', `Drop-off at ${venue}.`, ['transport', 'guests', 'venue']);
  }
  if (!elopement) add(C - 30, 'Guest seating + prelude music', '', ['guests', 'music', 'venue']);

  // --- ceremony ---
  add(C, 'Ceremony', '', ['couple', 'party', 'family', 'officiant', 'photo', 'video', 'music'], C + L);

  if (elopement) {
    add(C + L, 'Couple portraits', '', ['couple', 'photo', 'video'], C + L + 60);
    add(C + L + 90, 'Celebration dinner', '', ['couple', 'catering'], C + L + 210);
  } else {
    // --- cocktail hour + reception ---
    const R = C + L + +a.cocktailMinutes;
    const end = R + Math.round(+a.receptionHours * 60);
    add(C + L, 'Cocktail hour', '', ['catering', 'music', 'guests'], R);
    if (!firstLook) add(C + L + 5, 'Family formals + couple portraits', 'Immediate family, then wedding party.', ['family', 'couple', 'party', 'photo'], C + L + 45);
    add(R, 'Reception', '', ['catering', 'music', 'venue', 'guests'], end);
    if (x.entrance) add(R + 10, 'Grand entrance', '', ['music', 'couple', 'party', 'photo', 'video']);
    if (x.firstDance) add(R + 15, 'First dance', '', ['music', 'couple', 'photo', 'video']);
    add(R + 20, 'Dinner service', '', ['catering', 'guests']);
    if (x.toasts) add(R + 70, 'Toasts', '', ['music', 'family', 'party', 'photo', 'video']);
    if (x.parentDances) add(R + 90, 'Parent dances', '', ['music', 'family', 'couple', 'photo', 'video']);
    add(R + 100, 'Open dancing', '', ['music', 'guests']);
    if (x.cake) add(R + 120, 'Cake cutting', '', ['catering', 'couple', 'photo', 'video']);
    if (x.bouquet) add(R + 150, 'Bouquet / garter toss', '', ['music', 'couple', 'photo']);
    const sunset = normalizeHHMM(a.sunset);
    if (sunset) {
      const s = toMin(sunset);
      if (s - 20 >= R && s <= end) add(s - 20, 'Golden-hour portraits', `Sunset ${sunset}.`, ['couple', 'photo', 'video'], s + 5);
    }
    add(Math.min(photoStart + 480, end), 'Photographer coverage ends', 'Based on 8 hours of coverage; adjust to the contract.', ['photo']);
    add(end - 10, 'Last dance', '', ['music', 'couple']);
    if (x.sendOff) add(end, 'Send-off', '', ['couple', 'guests', 'photo', 'video']);
    if (a.guestShuttle) {
      add(end, 'Return shuttle #1', 'To the hotels.', ['transport', 'guests']);
      add(end + 45, 'Final return shuttle', '', ['transport', 'guests']);
    }
    add(end, 'Vendor load-out', '', ['venue', 'rentals', 'catering', 'music', 'florist'], end + 90);
  }

  rows.sort((p, q) => p.start - q.start);
  return {
    date: a.date,
    title: `Wedding Day — ${a.venue || 'venue TBD'}`,
    items: rows.map(r => stop(r.start, r.end, r.title, r.detail, r.roles)),
  };
}

function stop(start, end, title, detail, roles) {
  const o = { time: fromMin(start), title, detail: detail || '', source: SOURCE, confidence: 'estimated', roles: ['planner', ...roles] };
  if (end != null) o.timeEnd = fromMin(end);
  return o;
}

// ---------- Other days: built-in templates with offsets from a start time ----------
export const DAY_TEMPLATES = {
  rehearsal: {
    name: 'Rehearsal + rehearsal dinner', title: 'Rehearsal & Dinner',
    items: [
      { off: 0, endOff: 60, title: 'Ceremony rehearsal', roles: ['couple', 'party', 'family', 'officiant', 'venue'] },
      { off: 90, endOff: 210, title: 'Rehearsal dinner', roles: ['couple', 'party', 'family', 'catering'] },
    ],
  },
  welcome: {
    name: 'Welcome party', title: 'Welcome Party',
    items: [
      { off: -60, title: 'Welcome party setup', roles: ['venue', 'catering'] },
      { off: 0, endOff: 180, title: 'Welcome party', roles: ['couple', 'guests', 'catering', 'venue'] },
      { off: 30, title: 'Welcome toast', roles: ['couple', 'family'] },
    ],
  },
  brunch: {
    name: 'Farewell brunch', title: 'Farewell Brunch',
    items: [
      { off: 0, endOff: 120, title: 'Farewell brunch', roles: ['couple', 'family', 'guests', 'catering'] },
    ],
  },
};

// Template {items: [{off, endOff?, title, detail?, roles?}]} placed at a start time.
export function applyTemplate(template, start, detail = '') {
  const base = toMin(start);
  return template.items
    .map(t => {
      const o = { time: fromMin(base + t.off), title: t.title, detail: t.detail || detail, source: 'Template — confirm', confidence: 'estimated', roles: ['planner', ...(t.roles || []).filter(r => r !== 'planner')] };
      if (t.endOff != null) o.timeEnd = fromMin(base + t.endOff);
      return o;
    })
    .sort((p, q) => p.time.localeCompare(q.time));
}

// Save a day as a reusable template: offsets from its earliest stop.
export function templateFromDay(day, name) {
  const timed = day.items.filter(it => it.time);
  if (!timed.length) return null;
  const base = Math.min(...timed.map(it => toMin(it.time)));
  return {
    name, title: day.title,
    items: timed.map(it => {
      const t = { off: toMin(it.time) - base, title: it.title, detail: it.detail || '', roles: it.roles };
      if (it.timeEnd) t.endOff = toMin(it.timeEnd) - base;
      return t;
    }),
  };
}

// ---------- Shifting ----------
function shiftItem(it, mins) {
  if (it.time) it.time = shiftHHMM(it.time, mins);
  if (it.timeEnd) it.timeEnd = shiftHHMM(it.timeEnd, mins);
}

// Move every stop on a day by `mins` minutes (start and end times), then re-sort.
export function shiftDay(day, mins) {
  day.items.forEach(it => shiftItem(it, mins));
  sortDay(day);
}

// Move one stop and everything after it (by position in the sorted day).
export function shiftFrom(day, fromIndex, mins) {
  day.items.slice(fromIndex).forEach(it => shiftItem(it, mins));
  sortDay(day);
}

// After a stop's start time is edited from `oldTime` to `newTime`, move the later stops by the same amount.
export function rippleLater(day, editedItem, oldTime, newTime) {
  const delta = toMin(newTime) - toMin(oldTime);
  if (!delta) return 0;
  const later = day.items.filter(it => it !== editedItem && it.time && it.time > oldTime);
  later.forEach(it => shiftItem(it, delta));
  sortDay(day);
  return later.length;
}

/**
 * Replace stop `index` with `updated`. If only the start time changed, the end time moves with it
 * (a stop keeps its length). With `ripple`, later stops move by the same amount.
 * @returns {number} how many later stops moved
 */
export function applyEdit(day, index, updated, ripple = false) {
  const old = day.items[index];
  if (old.time && updated.time && old.timeEnd && updated.timeEnd === old.timeEnd) {
    const delta = toMin(updated.time) - toMin(old.time);
    if (delta) updated.timeEnd = shiftHHMM(old.timeEnd, delta);
  }
  day.items[index] = updated;
  if (ripple && old.time) return rippleLater(day, updated, old.time, updated.time);
  sortDay(day);
  return 0;
}
