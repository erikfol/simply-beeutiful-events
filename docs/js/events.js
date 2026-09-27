// Event list + loading one event's report, curated timeline, and status overlay.
import { state } from './state.js';
import { $, setStatus, updateDirty, updateStatusDirty } from './dom.js';
import { loadLocal, loadStatusLocal } from './storage.js';
import { enrichEvent } from './util.js';

const DEMO_EVENT = { id: '6-12-27-harper-bennett-wedding-demo', name: '6.12.27 Harper-Bennett Wedding (Demo)', report: '6-12-27-harper-bennett-wedding-demo.json', timeline: '6-12-27-harper-bennett-wedding-demo.timeline.json', status: '6-12-27-harper-bennett-wedding-demo.status.json', weddingDate: '2027-06-12', venue: 'Willow Brook Barn, Maple Hollow, NH' };

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

export async function loadEvent(id) {
  state.currentMeta = state.eventList.find(e => e.id === id) || state.eventList[0];
  const meta = state.currentMeta;
  if (!meta) return;
  setStatus(`Loading ${meta.name}…`);
  $('eventMeta').textContent = `${meta.venue || ''} · Wedding date: ${meta.weddingDate || 'n/a'}`;
  try {
    const r = await fetch(`reports/${meta.report}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} — run via python -m http.server, not file://`);
    const report = await r.json();
    // normalize timeline events (support old + new field names)
    report.timeline = (report.timeline || []).map(e => enrichEvent({
      date_raw: e.date_raw || e.dateRaw, date_iso: e.date_iso || e.dateISO,
      snippet: e.snippet || '', source: e.source || '',
      times: e.times || [], time: e.time || null, label: e.label || ''
    })).filter(e => e.date_iso);
    report.timeline.sort((a, b) => (a.date_iso + (a.time || '')).localeCompare(b.date_iso + (b.time || '')));
    state.currentReport = report;
    // curated Knot-style timeline (per-event, with actual times) — optional
    state.currentCurated = null;
    state.curatedFile = meta.timeline || null;
    state.isDirty = false; state.editing = null; updateDirty();
    if (state.curatedFile) {
      try {
        const rt = await fetch(`reports/${state.curatedFile}`);
        if (rt.ok) state.currentCurated = await rt.json();
      } catch { /* fallback to auto timeline */ }
      // local edits override file
      const local = loadLocal();
      if (local) state.currentCurated = local;
    }
    // contract + payment status overlay
    state.currentStatus = null;
    state.statusFile = meta.status || null;
    state.statusDirty = false; updateStatusDirty();
    if (state.statusFile) {
      try {
        const rs = await fetch(`reports/${state.statusFile}`);
        if (rs.ok) state.currentStatus = await rs.json();
      } catch { /* overlay optional */ }
      const slocal = loadStatusLocal();
      if (slocal) state.currentStatus = slocal;
    }
    setStatus(`Loaded ${meta.name}: ${report.timeline.length} dated items${state.currentCurated ? ' + curated run sheet' : ''}.`);
    $('timelineSection').hidden = true;
    $('statusSection').hidden = true;
  } catch (e) {
    setStatus(`Load failed: ${e.message}`);
  }
}
