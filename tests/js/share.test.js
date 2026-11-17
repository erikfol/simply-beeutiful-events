import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeDrive, seedSbeDrive } from './fakeDrive.js';
import { useFakeAuth, signIn } from '../../docs/js/google.js';
import { useTransport } from '../../docs/js/drive.js';
import { forgetAppData, useEventsFolder, sharedAccess } from '../../docs/js/appdata.js';
import {
  buildSnapshot, stopCount, linkUrl, eventTitle, normalizeShares, audienceOf, loadShares, createShareLink,
  refreshShareLinks, turnOffShareLink, SHARE_FOLDER,
} from '../../docs/js/share.js';
import { normalizeSnapshot, fetchSnapshot, linkId, LinkError } from '../../docs/js/sharedTimeline.js';

const NOW = '2026-11-16T15:00:00.000Z';
const META = { name: '6.12.27 Harper-Bennett Wedding', weddingDate: '2027-06-12', venue: 'Willow Brook Barn' };
const CURATED = {
  days: [
    { date: '2027-06-12', title: 'Wedding Day', items: [
      { time: '13:00', timeEnd: '13:30', title: 'Photographer arrives', detail: 'Details first', source: 'Juniper Lane - Contract.pdf', confidence: 'confirmed', roles: ['planner', 'photo'] },
      { time: '16:30', timeEnd: '17:00', title: 'Ceremony', source: 'Generated draft — confirm', confidence: 'estimated', roles: ['planner', 'couple', 'photo', 'music'] },
      { time: '15:00', title: 'Planner walkthrough', roles: ['planner'] },
    ] },
    { date: '2027-06-11', title: 'Rehearsal', items: [
      { time: '17:00', title: 'Rehearsal', roles: ['planner', 'couple', 'officiant'] },
    ] },
  ],
};

test('a link shows only that person\'s stops, without where each time came from', () => {
  const snap = buildSnapshot({ meta: META, curated: CURATED, role: 'photo', label: 'Juniper Lane Photography' }, NOW);
  assert.deepEqual(snap.event, { name: 'Harper-Bennett Wedding', date: '2027-06-12', venue: 'Willow Brook Barn' });
  assert.deepEqual([snap.audience, snap.label, snap.updated], ['Photographer', 'Juniper Lane Photography', NOW]);
  assert.deepEqual(snap.days.map(d => d.date), ['2027-06-12'], 'days with none of their stops are left out');
  assert.deepEqual(snap.days[0].items, [
    { time: '13:00', timeEnd: '13:30', title: 'Photographer arrives', detail: 'Details first' },
    { time: '16:30', timeEnd: '17:00', title: 'Ceremony', estimate: true },
  ]);
  assert.ok(!JSON.stringify(snap).includes('Contract.pdf'), 'sources stay private');
  assert.ok(!JSON.stringify(snap).includes('walkthrough'), 'planner-only stops stay private');
  const whole = buildSnapshot({ meta: META, curated: CURATED, role: '' }, NOW);
  assert.equal(whole.audience, 'Whole timeline');
  assert.equal(whole.days.reduce((n, d) => n + d.items.length, 0), 4);
  assert.equal(stopCount(CURATED, 'couple'), 2);
  assert.equal(stopCount(CURATED, 'florist'), 0);
  assert.equal(eventTitle({ name: 'Templates' }), 'Templates');
  assert.equal(audienceOf('hmua'), 'Hair & makeup');
});

test('the link address carries the file id after #, next to the app page', () => {
  assert.equal(linkUrl('https://erikfol.github.io/simply-beeutiful-events/events.html?event=x', 'abc123DEF_-xyz'),
    'https://erikfol.github.io/simply-beeutiful-events/timeline.html#abc123DEF_-xyz');
  assert.equal(linkId('#abc123DEF_-xyz'), 'abc123DEF_-xyz');
  assert.equal(linkId('#short'), '', 'too short to be a Drive file id');
  assert.equal(linkId('#abc<script>xyz'), '');
});

test('the public page reads only what it shows, in order, and refuses anything else', () => {
  const snap = normalizeSnapshot({
    v: 1, event: { name: 'Harper-Bennett', date: '2027-06-12', venue: 'Barn', secret: 'x' }, audience: 'Photographer', label: '',
    days: [
      { date: '2027-06-12', title: 'Day', items: [{ time: '00:15', title: 'Last shuttle' }, { time: '16:00', title: 'Ceremony', estimate: 1, extra: 'x' }, { time: 'soon', title: 'Bad' }] },
      { date: 'bad', items: [{ time: '10:00', title: 'Lost' }] },
    ],
    updated: NOW,
  });
  assert.deepEqual(snap.days[0].items.map(i => [i.time, i.title, i.estimate]), [['16:00', 'Ceremony', true], ['00:15', 'Last shuttle', false]]);
  assert.equal(snap.days.length, 1);
  assert.equal(snap.event.secret, undefined);
  assert.throws(() => normalizeSnapshot({ hello: 1 }), LinkError);
});

test('fetchSnapshot explains a missing or turned-off link plainly', async () => {
  const ok = async () => new Response(JSON.stringify(buildSnapshot({ meta: META, curated: CURATED, role: 'couple' }, NOW)), { status: 200 });
  assert.equal((await fetchSnapshot('abcdefghij12', 'KEY', ok)).audience, 'Couple');
  await assert.rejects(fetchSnapshot('', 'KEY', ok), /incomplete/);
  await assert.rejects(fetchSnapshot('abcdefghij12', 'KEY', async () => new Response('', { status: 404 })), /no longer active/);
  await assert.rejects(fetchSnapshot('abcdefghij12', 'KEY', async () => { throw new TypeError('offline'); }), /internet connection/);
  await assert.rejects(fetchSnapshot('abcdefghij12', 'KEY', async () => new Response('', { status: 500 })), /Try again/);
});

test('normalizeShares keeps only usable links', () => {
  const s = normalizeShares({ links: [{ id: 'a', role: 'photo', label: ' Juniper ' }, { id: 'b', role: 'nope' }, { role: 'couple' }, { id: 'c', role: '' }] });
  assert.deepEqual(s.links.map(l => [l.id, l.role, l.label]), [['a', 'photo', 'Juniper'], ['c', '', '']]);
});

// ---------- with the fake Google Drive ----------

const OWNER = 'owner@example.com';
const PLANNER = 'planner@example.com';
let drive, ids, appId, meta;

beforeEach(async () => {
  drive = createFakeDrive();
  ids = seedSbeDrive(drive);
  useFakeAuth();
  await signIn();
  appId = (await signedInAs(OWNER)).folder.id;
  meta = { ...META, driveId: ids.harper };
});

async function signedInAs(email) {
  forgetAppData();
  useTransport(drive.as(email));
  useEventsFolder(ids.root);
  return sharedAccess();
}

const fileOf = (id) => drive.files.get(id);

test('making a link saves one person\'s timeline, shares only that file by link, and lists it', async () => {
  const link = await createShareLink({ meta, curated: CURATED, role: 'photo', label: 'Juniper Lane Photography', by: 'Owner' }, NOW);
  const f = fileOf(link.id);
  assert.equal(f.anyone, 'reader', 'anyone with the link can read it');
  const folder = fileOf(f.parents[0]);
  assert.deepEqual([folder.name, folder.parents[0]], [SHARE_FOLDER, appId], 'kept in "SBE App Data/Shared Timelines"');
  assert.equal(fileOf(appId).anyone, undefined, '"SBE App Data" itself stays private');
  assert.deepEqual((await loadShares(ids.harper)).links.map(l => [l.id, l.role, l.label]), [[link.id, 'photo', 'Juniper Lane Photography']]);
  const seen = await fetchSnapshot(link.id, 'KEY', drive.publicFetch);
  assert.deepEqual(seen.days[0].items.map(i => i.title), ['Photographer arrives', 'Ceremony']);
});

test('saving the timeline updates every link for the event', async () => {
  const a = await createShareLink({ meta, curated: CURATED, role: 'photo' }, NOW);
  const b = await createShareLink({ meta, curated: CURATED, role: 'couple' }, NOW);
  const moved = { days: [{ ...CURATED.days[0], items: CURATED.days[0].items.map(i => (i.title === 'Ceremony' ? { ...i, time: '17:00', timeEnd: '17:30' } : i)) }] };
  assert.deepEqual(await refreshShareLinks(meta, moved, '2026-11-17T10:00:00.000Z'), { updated: 2, failed: 0 });
  for (const id of [a.id, b.id]) {
    const seen = await fetchSnapshot(id, 'KEY', drive.publicFetch);
    assert.equal(seen.days[0].items.find(i => i.title === 'Ceremony').time, '17:00');
    assert.equal(seen.updated, '2026-11-17T10:00:00.000Z');
  }
  assert.ok((await loadShares(ids.harper)).links.every(l => l.updated === '2026-11-17T10:00:00.000Z'));
});

test('turning a link off makes it stop working, even when someone else made it', async () => {
  drive.share(appId, PLANNER, 'editor');
  const link = await createShareLink({ meta, curated: CURATED, role: 'couple' }, NOW);
  await signedInAs(PLANNER);
  await turnOffShareLink(meta, link.id, NOW);
  await assert.rejects(fetchSnapshot(link.id, 'KEY', drive.publicFetch), /no longer active/);
  assert.deepEqual((await loadShares(ids.harper)).links, []);
  await turnOffShareLink(meta, link.id, NOW); // already off: no error
});

test('a planner without Editor access cannot make links', async () => {
  await signedInAs(PLANNER);
  await assert.rejects(createShareLink({ meta, curated: CURATED, role: 'couple' }, NOW));
  assert.ok(![...drive.files.values()].some(f => f.anyone), 'nothing was shared');
});
