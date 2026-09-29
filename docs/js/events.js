// Event list + loading one event: demo/local events from reports/*.json, Drive events from Google Drive.
import { state } from './state.js';
import { $, setStatus, updateDirty, updateStatusDirty, showSection, needSignIn } from './dom.js';
import { loadLocal, loadStatusLocal } from './storage.js';
import { listTree } from './drive.js';
import { readEventData } from './appdata.js';
import { cachedReading, reportFrom, readChanged } from './reader.js';
import { loadCorrections, loadDetails } from './corrections.js';
import { applyCorrections } from './scan.js';
import { enrichEvent, esc, fmtDate } from './util.js';

const DEMO_EVENT = { id: '6-12-27-harper-bennett-wedding-demo', name: '6.12.27 Harper-Bennett Wedding (Demo)', report: '6-12-27-harper-bennett-wedding-demo.json', timeline: '6-12-27-harper-bennett-wedding-demo.timeline.json', status: '6-12-27-harper-bennett-wedding-demo.status.json', weddingDate: '2027-06-12', venue: 'Willow Brook Barn, Maple Hollow, NH' };

export const isDriveEvent = (meta = state.currentMeta) => !!meta && meta.source === 'drive';

// Views re-render when the report changes (documents finished reading, a correction was saved).
const reportUpdated = () => window.dispatchEvent(new CustomEvent('sbe:report-updated'));
const readingProgress = () => window.dispatchEvent(new CustomEvent('sbe:reading'));

export async function loadEventList() {
  try {
    const r = await fetch('reports/index.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.eventList = await r.json();
  } catch (e) {
    // fallback: the published demo event
    state.eventList = [DEMO_EVENT];
  }
  // real client events: listed in the git-ignored local-index.json, only present on the planner's machine
  try {
    const r = await fetch('reports/local-index.json');
    if (r.ok) state.eventList = [...(await r.json()), ...state.eventList];
  } catch { /* not present on the published site */ }
}

// Replace the Drive events in the list (after sign-in, refresh, or sign-out).
export function setDriveEvents(events) {
  state.eventList = [...events, ...state.eventList.filter(e => !isDriveEvent(e))];
}

function showMeta(meta) {
  const parts = [];
  if (meta.venue) parts.push(esc(meta.venue));
  parts.push(`Wedding date: ${meta.weddingDate ? esc(fmtDate(meta.weddingDate)) : 'n/a'}`);
  if (isDriveEvent(meta) && /^https:\/\//.test(meta.webViewLink)) parts.push(`<a href="${esc(meta.webViewLink)}" target="_blank" rel="noopener">Open folder in Google Drive</a>`);
  $('eventMeta').innerHTML = parts.join(' · ');
}

let loadSeq = 0; // a slower, earlier load must not overwrite the event picked after it

export async function loadEvent(id) {
  const meta = state.eventList.find(e => e.id === id) || state.eventList[0];
  if (!meta) return false;
  const ticket = ++loadSeq;
  state.currentMeta = meta;
  state.isDirty = false; state.statusDirty = false; state.editing = null; state.reading = null;
  updateDirty(); updateStatusDirty();
  showSection(null);
  showMeta(meta);
  setStatus(`Loading ${meta.name}…`);
  try {
    const loaded = isDriveEvent(meta) ? await loadFromDrive(meta, ticket) : await loadFromReports(meta, ticket);
    if (!loaded) return false;
    updateDirty(); updateStatusDirty();
    const where = isDriveEvent(meta) ? `from Google Drive: ${state.currentReport.num_files} documents` : `${state.currentReport.timeline.length} dated items`;
    setStatus(`Loaded ${meta.name} ${where}${state.currentCurated ? ' + run sheet' : ''}${state.isDirty ? ' (with unsaved changes from this browser)' : ''}.`);
    if (isDriveEvent(meta)) readInBackground(meta, ticket);
    return true;
  } catch (e) {
    if (ticket !== loadSeq) return false;
    state.currentReport = null;
    setStatus(`Could not open ${meta.name}: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
    return false;
  }
}

async function loadFromReports(meta, ticket) {
  const r = await fetch(`reports/${meta.report}`);
  if (!r.ok) throw new Error(`HTTP ${r.status} — run via python -m http.server, not file://`);
  const report = await r.json();
  // normalize timeline events (support old + new field names)
  const timeline = (report.timeline || []).map(e => enrichEvent({
    date_raw: e.date_raw || e.dateRaw, date_iso: e.date_iso || e.dateISO,
    snippet: e.snippet || '', source: e.source || '',
    times: e.times || [], time: e.time || null, label: e.label || ''
  })).filter(e => e.date_iso);
  timeline.sort((a, b) => (a.date_iso + (a.time || '')).localeCompare(b.date_iso + (b.time || '')));

  // curated Knot-style timeline (per-event, with actual times) — optional; browser edits override the file
  let curated = null;
  if (meta.timeline) {
    try { const rt = await fetch(`reports/${meta.timeline}`); if (rt.ok) curated = await rt.json(); } catch { /* optional */ }
  }
  // contract + payment status overlay
  let status = null;
  if (meta.status) {
    try { const rs = await fetch(`reports/${meta.status}`); if (rs.ok) status = await rs.json(); } catch { /* optional */ }
  }
  const [corrections, details] = await Promise.all([loadCorrections(meta), loadDetails(meta)]);
  if (ticket !== loadSeq) return false;
  state.corrections = corrections;
  state.details = details;
  state.rawTimeline = timeline;
  report.timeline = applyCorrections(timeline, corrections);
  state.currentReport = report;
  state.curatedFile = meta.timeline || null;
  state.statusFile = meta.status || null;
  state.currentCurated = (meta.timeline && loadLocal()) || curated;
  state.currentStatus = (meta.status && loadStatusLocal()) || status;
  return true;
}

// Drive events: files from the event folder; run sheet, statuses, corrections and earlier reading results
// from "SBE App Data". The event opens with what was already read; new or changed files are read after.
async function loadFromDrive(meta, ticket) {
  const [files, curated, status, corrections, cache, details] = await Promise.all([
    listTree(meta.driveId),
    readEventData(meta.driveId, 'timeline'),
    readEventData(meta.driveId, 'status'),
    loadCorrections(meta),
    cachedReading(meta.driveId),
    loadDetails(meta),
  ]);
  if (ticket !== loadSeq) return false;
  state.driveFiles = files;
  state.readingCache = cache;
  state.corrections = corrections;
  state.details = details;
  state.currentReport = reportFrom(files, cache, corrections);
  state.curatedFile = `${meta.id}.timeline.json`;
  state.statusFile = `${meta.id}.status.json`;
  // Edits not yet saved to Drive are kept in this browser and win until saved.
  const draft = loadLocal();
  const sdraft = loadStatusLocal();
  state.currentCurated = draft || curated;
  state.currentStatus = sdraft || status;
  state.isDirty = !!draft;
  state.statusDirty = !!sdraft;
  return true;
}

async function readInBackground(meta, ticket) {
  const stillWanted = () => ticket === loadSeq;
  try {
    const { cache, readCount } = await readChanged(meta.driveId, state.driveFiles, state.readingCache, {
      stillWanted,
      onProgress: (done, total) => {
        if (!stillWanted() || !total) return;
        state.reading = done < total ? { done, total } : null;
        setStatus(done < total ? `Reading ${meta.name}'s documents: ${done} of ${total}…` : `Read ${total} new or changed document${total === 1 ? '' : 's'} for ${meta.name}.`);
        readingProgress();
      },
    });
    if (!stillWanted()) return;
    state.reading = null;
    state.readingCache = cache;
    if (readCount) rebuildReport();
  } catch (e) {
    if (!stillWanted()) return;
    state.reading = null;
    setStatus(`Stopped reading documents: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
    readingProgress();
  }
}

// Re-apply corrections (after one is saved) or cached results (after reading) and refresh the views.
export function rebuildReport() {
  if (!state.currentMeta) return;
  if (isDriveEvent()) state.currentReport = reportFrom(state.driveFiles, state.readingCache, state.corrections);
  else state.currentReport = { ...state.currentReport, timeline: applyCorrections(state.rawTimeline, state.corrections) };
  reportUpdated();
}
