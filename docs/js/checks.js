// Pure validation rules: conflicts, missing items, deadline alerts. No DOM, so Node tests can import this file.
// Messages are HTML snippets; anything taken from documents is escaped.
import { esc, fmt$, daysBetween } from './util.js';

// Budget categories with money still owed, largest first.
export function dueCategories(budget) {
  return (budget.categories || []).filter(c => (c.due || 0) > 0.005).sort((x, y) => y.due - x.due);
}

const CONFLICT_KEYS = [
  { key: /ceremony/i, label: 'Ceremony start' },
  { key: /cocktail/i, label: 'Cocktail hour' },
  { key: /reception/i, label: 'Reception' },
];

const PLANNING_CHECKLIST = [
  { key: /venue|load-in|load in|setup|set up/i, label: 'venue access / setup time' },
  { key: /ceremony/i, label: 'ceremony time' },
  { key: /cocktail/i, label: 'cocktail hour' },
  { key: /reception|dinner|first dance/i, label: 'reception / dinner plan' },
  { key: /photo/i, label: 'photography coverage' },
  { key: /band|dj|music|guitar/i, label: 'music / band / DJ' },
  { key: /cater|food|bar|beverage/i, label: 'catering / bar' },
  { key: /shuttle|bus|transport|pickup|pick up/i, label: 'transportation / shuttles' },
  { key: /floral|flower/i, label: 'floral delivery' },
  { key: /hair|makeup/i, label: 'hair & makeup' },
];

/**
 * @param {object} p
 * @param {Array} p.timeline   document evidence events ({date_iso, time, snippet, source, label})
 * @param {object|null} p.curated  curated run sheet ({days: [{items}]})
 * @param {Array} p.vendors    status overlay vendors ({name, payment, dueDate})
 * @param {object} p.budget    budget block from the report
 * @param {string|null} p.weddingDate  YYYY-MM-DD
 * @param {string} p.today     YYYY-MM-DD
 * @returns {Array<{level: 'high'|'warn'|'info', msg: string}>}
 */
export function findIssues({ timeline, curated, vendors, budget, weddingDate, today }) {
  const issues = [];
  const dayDiff = weddingDate ? daysBetween(today, weddingDate) : null;
  const allText = [
    ...timeline.map(e => `${e.snippet || ''} ${e.source || ''} ${e.label || ''}`),
    ...(curated && curated.days ? curated.days.flatMap(d => d.items.map(it => `${it.title || ''} ${it.detail || ''} ${it.source || ''}`)) : [])
  ].join('\n');

  // 1) balances still due after the event
  if ((budget.total_due || 0) > 0.005 && dayDiff != null && dayDiff < 0) {
    issues.push({ level: 'high', msg: `Event is over but <strong>${fmt$(budget.total_due)}</strong> is still due — chase ${dueCategories(budget).map(c => esc(c.category)).join(', ') || 'open balances'}.` });
  }
  // 2) conflicting key times across documents (wedding day)
  if (weddingDate) {
    for (const c of CONFLICT_KEYS) {
      const seen = new Map(); // time -> source
      for (const e of timeline.filter(e => e.date_iso === weddingDate && e.time)) {
        if (c.key.test(`${e.snippet || ''} ${e.label || ''}`) && !seen.has(e.time)) seen.set(e.time, e.source);
      }
      if (seen.size > 1) {
        issues.push({ level: 'warn', msg: `${c.label} has <strong>conflicting times</strong>: ${[...seen.entries()].map(([t, s]) => `${t} [${esc(s)}]`).join(' vs ')} — confirm which is current.` });
      }
    }
  }
  // 3) missing common planning items
  for (const m of PLANNING_CHECKLIST.filter(c => !c.key.test(allText))) {
    issues.push({ level: 'info', msg: `No <strong>${m.label}</strong> found in documents — confirm it is planned.` });
  }
  // 4) vendor due dates vs today
  const soon = [];
  for (const s of vendors) {
    if (s.payment === 'Paid' || !s.dueDate) continue;
    if (s.dueDate < today) {
      issues.push({ level: 'high', msg: `<strong>${esc(s.name)}</strong> payment was due <strong>${s.dueDate}</strong> and is marked "${esc(s.payment)}".` });
    } else if (daysBetween(today, s.dueDate) <= 14) {
      soon.push(`${esc(s.name)} (${s.dueDate})`);
    }
  }
  if (soon.length) {
    issues.push({ level: 'warn', msg: `Due within 14 days: <strong>${soon.join('; ')}</strong>.` });
  }
  // 5) document dates after the wedding that are not load-out/returns
  if (weddingDate) {
    const odd = timeline.filter(e => e.date_iso > weddingDate && !/pickup|return|load-out|load out|checkout|check.out/i.test(`${e.snippet || ''} ${e.label || ''}`));
    if (odd.length) {
      issues.push({ level: 'info', msg: `${odd.length} dated item${odd.length === 1 ? '' : 's'} after the wedding — verify close-out tasks.` });
    }
  }
  return issues;
}
