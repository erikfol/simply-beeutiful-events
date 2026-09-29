// Runs the validation rules against the fictional demo event in docs/reports/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dueCategories, findIssues, timelineConflicts } from '../../docs/js/checks.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../demo_event/reports/${f}`, import.meta.url), 'utf8'));
const report = load('6-12-27-harper-bennett-wedding-demo.json');
const curated = load('6-12-27-harper-bennett-wedding-demo.timeline.json');
const status = load('6-12-27-harper-bennett-wedding-demo.status.json');

const issuesOn = (today, overrides = {}) => findIssues({
  timeline: report.timeline, curated, vendors: status.vendors, budget: report.budget,
  weddingDate: '2027-06-12', today, ...overrides,
});

test('demo event flags the venue-vs-band ceremony conflict', () => {
  const conflict = issuesOn('2026-09-27').find(i => i.msg.startsWith('Ceremony start'));
  assert.ok(conflict, 'expected a ceremony conflict');
  assert.equal(conflict.level, 'warn');
  assert.match(conflict.msg, /16:00/);
  assert.match(conflict.msg, /16:30/);
});

test('overdue and due-soon vendor payments depend on today', () => {
  const issues = issuesOn('2026-09-27');
  const overdue = issues.filter(i => i.level === 'high').map(i => i.msg).join(' ');
  assert.match(overdue, /Summit Coach Lines/);
  const soon = issues.find(i => i.msg.startsWith('Due within 14 days'));
  assert.match(soon.msg, /Ridgeline Tent/);
  assert.match(soon.msg, /Bluebell Blooms/);

  // earlier in the year nothing is overdue yet
  assert.equal(issuesOn('2026-08-01').filter(i => i.level === 'high').length, 0);
});

test('demo documents cover the whole planning checklist', () => {
  assert.equal(issuesOn('2026-09-27').filter(i => i.msg.startsWith('No ')).length, 0);
  const bare = issuesOn('2026-09-27', { timeline: [], curated: null });
  assert.ok(bare.some(i => /photography coverage/.test(i.msg)));
});

test('balance still due after the wedding is flagged as high', () => {
  const after = issuesOn('2027-07-01', { vendors: [] });
  assert.ok(after.some(i => i.level === 'high' && /still due/.test(i.msg)));
});

test('dueCategories lists owed categories, largest first', () => {
  const cats = dueCategories(report.budget);
  assert.equal(cats[0].category, 'Catering');
  assert.ok(cats.every((c, i) => i === 0 || cats[i - 1].due >= c.due));
});

test('timeline stops that disagree with every document time are flagged', () => {
  assert.deepEqual(timelineConflicts({ timeline: report.timeline, curated, weddingDate: '2027-06-12' }), [], 'demo run sheet matches the venue');
  const moved = structuredClone(curated);
  const day = moved.days.find(d => d.date === '2027-06-12');
  day.items.find(i => i.title === 'Ceremony begins').time = '17:00';
  day.items.find(i => i.title === 'Cocktail hour').time = '16:30';
  const issues = timelineConflicts({ timeline: report.timeline, curated: moved, weddingDate: '2027-06-12' });
  assert.equal(issues.length, 1, 'only the ceremony moved away from the documents');
  assert.match(issues[0].msg, /Ceremony begins.*17:00.*Venue Agreement.*16:00/);
  assert.ok(!issues.some(i => /prelude/i.test(i.msg)), 'the prelude stop is not the ceremony');
  assert.ok(findIssues({ timeline: report.timeline, curated: moved, vendors: [], budget: {}, weddingDate: '2027-06-12', today: '2026-09-27' })
    .some(i => /Timeline has/.test(i.msg)), 'status page shows it too');
});

test('missing-item warnings can be turned off for events whose documents are not read yet', () => {
  const base = { timeline: [], curated: null, vendors: [], budget: {}, weddingDate: '2027-06-12', today: '2026-09-27' };
  assert.ok(findIssues(base).some(i => i.msg.startsWith('No ')));
  assert.equal(findIssues({ ...base, checkMissing: false }).filter(i => i.msg.startsWith('No ')).length, 0);
});
