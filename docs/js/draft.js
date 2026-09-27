// Pure timeline-building logic (no DOM), shared by the generator UI and the Node tests.
import { shiftHHMM, sortDay } from './util.js';

// Genius-style starter run sheet: offsets in minutes from the ceremony start.
export const DRAFT_TEMPLATE = [
  { off: -390, title: 'Venue access / vendor load-in begins', detail: 'Setup in ceremony + reception spaces.' },
  { off: -330, title: 'Hair and makeup team arrives', detail: 'Bride + party at prep location.' },
  { off: -300, title: 'Wedding-party transport pickup', detail: 'Shuttle to venue.' },
  { off: -210, title: 'Hair & makeup complete', detail: 'Buffer before photos.' },
  { off: -120, title: 'Photographer arrives / pre-ceremony coverage', detail: 'Details, getting ready, portraits.' },
  { off: -65, title: 'Guest transport pickup', detail: 'Buses from hotels.' },
  { off: -35, title: 'Guest transport arrives at venue', detail: 'Guests seated ahead of prelude.' },
  { off: -30, title: 'Ceremony prelude music begins', detail: '' },
  { off: 0, title: 'Ceremony begins', detail: '' },
  { off: 30, endOff: 90, title: 'Cocktail hour', detail: 'Family + wedding party portraits.' },
  { off: 90, endOff: 330, title: 'Reception', detail: 'Dinner, dances, speeches.' },
  { off: 100, title: 'Wedding party + couple entrance', detail: '' },
  { off: 145, title: 'First dance / welcome speech / dinner', detail: 'Confirm order with band.' },
  { off: 245, title: 'Speeches + parent dances', detail: '' },
  { off: 315, title: 'Cake / dessert + open dancing', detail: '' },
  { off: 330, title: 'Last dance / reception ends', detail: '' },
];

// "4:30" / "16:30" -> "16:30"; null when not a valid 24h HH:MM.
export function normalizeHHMM(raw) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((raw || '').trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function buildDraftItems(ceremony, template = DRAFT_TEMPLATE) {
  return template.map(t => {
    const o = { time: shiftHHMM(ceremony, t.off), title: t.title, detail: t.detail, source: 'Generated draft — confirm', confidence: 'estimated' };
    if (t.endOff != null) o.timeEnd = shiftHHMM(ceremony, t.endOff);
    return o;
  });
}

// Move every stop on a day by `mins` minutes (start and end times), then re-sort.
export function shiftDay(day, mins) {
  for (const it of day.items) {
    if (it.time) it.time = shiftHHMM(it.time, mins);
    if (it.timeEnd) it.timeEnd = shiftHHMM(it.timeEnd, mins);
  }
  sortDay(day);
}
