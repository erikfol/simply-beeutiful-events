// Timed items found in the documents, offered as timeline stops. Pure, no DOM.
import { inferRoles } from './roles.js';

const stripExt = (f) => (f || '').replace(/\.[a-z0-9]{2,5}$/i, '');
export const vendorOf = (source) => stripExt(source).split(' - ')[0].trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The sentence(s) of the snippet that mention the date, without the clipped context around them.
export function keySentence(e) {
  const text = (e.snippet || '').replace(/^…|…$/g, '').replace(/\s+/g, ' ').trim();
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hits = sentences.filter(x => e.date_raw && x.includes(e.date_raw));
  return (hits.length ? hits.join(' ') : text).trim();
}

export function docEventToStop(e) {
  const vendor = vendorOf(e.source);
  const title = e.label ? `${cap(e.label)} — ${vendor}` : vendor;
  const detail = keySentence(e).slice(0, 160);
  const s = { time: e.time, title, detail, source: stripExt(e.source), confidence: 'confirmed' };
  s.roles = inferRoles(s);
  return s;
}

// A document time counts as already on the timeline when a stop at the same time cites the same vendor.
const covered = (day, e) => day.items.some(it => it.time === e.time && vendorOf(it.source) === vendorOf(e.source));

export function docSuggestions(docTimeline, day) {
  return docTimeline
    .filter(e => e.date_iso === day.date && e.time && !covered(day, e))
    .map(docEventToStop);
}
