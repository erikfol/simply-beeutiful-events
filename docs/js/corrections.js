// Planner corrections to facts read from documents ({factId: {status, date_iso?, time?, amount?, note?, at}}).
// Drive events keep them in "SBE App Data"; demo and local events in this browser.
import { readEventData, writeEventData } from './appdata.js';

const localKey = (meta) => `sbe-corrections-${meta.id}`;

export async function loadCorrections(meta) {
  if (meta.source === 'drive') return (await readEventData(meta.driveId, 'corrections')) || {};
  try { return JSON.parse(localStorage.getItem(localKey(meta)) || '{}'); } catch { return {}; }
}

export async function saveCorrections(meta, data) {
  if (meta.source === 'drive') { await writeEventData(meta.driveId, 'corrections', data); return; }
  try { localStorage.setItem(localKey(meta), JSON.stringify(data)); } catch { throw new Error('This browser is blocking storage, so the correction could not be saved.'); }
}

// Event details the planner typed in (couple, venue, guest count…), same storage rules.
const detailsKey = (meta) => `sbe-details-${meta.id}`;

export async function loadDetails(meta) {
  if (meta.source === 'drive') return (await readEventData(meta.driveId, 'details')) || {};
  try { return JSON.parse(localStorage.getItem(detailsKey(meta)) || '{}'); } catch { return {}; }
}

export async function saveDetails(meta, data) {
  if (meta.source === 'drive') { await writeEventData(meta.driveId, 'details', data); return; }
  try { localStorage.setItem(detailsKey(meta), JSON.stringify(data)); } catch { throw new Error('This browser is blocking storage, so the details could not be saved.'); }
}
