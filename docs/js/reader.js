// Read a Drive event's documents: reuse cached results for unchanged files, read the rest, save the cache,
// and build the event report. Results live in "SBE App Data" (event-<id>.reading.json), never in the event folder.
import { readEventData, writeEventData } from './appdata.js';
import { extractFile } from './extract.js';
import { SCANNER_VERSION, scanText, parseBudget, parseVendors, buildReport } from './scan.js';
import { classifyFile } from './driveEvents.js';

const PARALLEL = 4;

async function readOne(f) {
  const rel = `${f.path}${f.name}`;
  try {
    const out = await extractFile(f);
    if (out.skip) return { skipped: out.skip, textLen: 0 };
    if (out.problem) return { problem: out.problem, textLen: 0 };
    const result = scanText(out.text, rel);
    if (out.via) result.via = out.via; // e.g. converted by Google Drive (old .doc, scanned PDF)
    const { kind } = classifyFile(f.name, f.mimeType);
    if (out.sheets && kind === 'budget') result.budget = parseBudget(out.sheets, f.name);
    if (out.sheets && kind === 'vendors') result.vendors = parseVendors(out.sheets);
    return result;
  } catch (e) {
    if (e.name === 'NeedsSignIn') throw e;
    return { problem: `Couldn't read this file: ${e.message}`, textLen: 0 };
  }
}

/** Cached results only (instant), so the event opens before any reading starts. */
export async function cachedReading(driveId) {
  const cache = await readEventData(driveId, 'reading');
  return cache && cache.version === SCANNER_VERSION ? cache : { version: SCANNER_VERSION, files: {} };
}

export function reportFrom(files, cache, corrections) {
  return buildReport(files.map(f => {
    const c = cache.files[f.id];
    return { ...f, result: c && c.modifiedTime === f.modifiedTime ? c.result : null };
  }), corrections);
}

/**
 * Read every new or changed file. onProgress(done, total) after each file; stillWanted() lets a newer
 * event switch stop the work early. Returns the updated cache.
 */
export async function readChanged(driveId, files, cache, { onProgress = () => {}, stillWanted = () => true } = {}) {
  const todo = files.filter(f => { const c = cache.files[f.id]; return !c || c.modifiedTime !== f.modifiedTime; });
  let done = 0;
  onProgress(done, todo.length);
  const queue = [...todo];
  async function worker() {
    while (queue.length && stillWanted()) {
      const f = queue.shift();
      const result = await readOne(f);
      cache.files[f.id] = { modifiedTime: f.modifiedTime, name: f.name, result };
      onProgress(++done, todo.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, worker));
  // forget files that were deleted or moved out of the event
  for (const id of Object.keys(cache.files)) if (!files.some(f => f.id === id)) delete cache.files[id];
  if (todo.length || Object.keys(cache.files).length !== files.length) {
    try {
      await writeEventData(driveId, 'reading', { ...cache, read: new Date().toISOString() });
    } catch (e) {
      // e.g. view-only access to the shared folder: the results still show, they just aren't kept for next time
      if (e.name === 'NeedsSignIn') throw e;
    }
  }
  return { cache, readCount: done };
}
