// Event list + loading one event: demo/local events from reports/*.json, Drive events from Google Drive.
import { state } from './state.js';
import { $, setStatus, updateDirty, updateStatusDirty, showSection, needSignIn } from './dom.js';
import { loadLocal, loadStatusLocal } from './storage.js';
import { listTree } from './drive.js';
import { readEventData } from './appdata.js';
import { cachedReading, reportFrom, readChanged } from './reader.js';
import { loadCorrections, loadDetails } from './corrections.js';
import { esc, fmtDate } from './util.js';

export const isDriveEvent = (meta = state.currentMeta) => !!meta && meta.source === 'drive';

// Views re-render when the report changes (documents finished reading, a correction was saved).
const reportUpdated = () => window.dispatchEvent(new CustomEvent('sbe:report-updated'));
const readingProgress = () => window.dispatchEvent(new CustomEvent('sbe:reading'));

// Events come only from Google Drive, after sign-in; the list is empty until then.
export function setDriveEvents(events) {
  state.eventList = [...events];
}

// No event open (before sign-in, or after signing out): nothing from the last event stays on screen.
export function clearEvent() {
  loadSeq++;
  state.currentMeta = null; state.currentReport = null; state.currentCurated = null; state.currentStatus = null;
  state.driveFiles = []; state.readingCache = null; state.reading = null; state.corrections = {}; state.details = {};
  state.isDirty = false; state.statusDirty = false; state.editing = null;
  updateDirty(); updateStatusDirty();
  showSection(null);
  $('eventMeta').textContent = '';
}

function showMeta(meta) {
  const parts = [];
  if (meta.venue) parts.push(esc(meta.venue));
  parts.push(`Wedding date: ${meta.weddingDate ? esc(fmtDate(meta.weddingDate)) : 'n/a'}`);
  if (/^https:\/\//.test(meta.webViewLink || '')) parts.push(`<a href="${esc(meta.webViewLink)}" target="_blank" rel="noopener">Open folder in Google Drive</a>`);
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
    if (!await loadFromDrive(meta, ticket)) return false;
    updateDirty(); updateStatusDirty();
    setStatus(`Loaded ${meta.name} from Google Drive: ${state.currentReport.num_files} documents${state.currentCurated ? ' + run sheet' : ''}${state.isDirty ? ' (with unsaved changes from this browser)' : ''}.`);
    readInBackground(meta, ticket);
    return true;
  } catch (e) {
    if (ticket !== loadSeq) return false;
    state.currentReport = null;
    setStatus(`Could not open ${meta.name}: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
    return false;
  }
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
  state.currentReport = reportFrom(state.driveFiles, state.readingCache, state.corrections);
  reportUpdated();
}
