// Toolbar actions that build or bulk-edit the curated timeline.
import { state } from './state.js';
import { setStatus } from './dom.js';
import { commitEdit, ensureCurated } from './timeline.js';
import { buildDraftItems, normalizeHHMM, shiftDay } from './draft.js';
import { todayISO } from './util.js';

// ---------- Draft generator (Genius-style): ceremony time -> starter run sheet ----------
export function generateDraft() {
  const meta = state.currentMeta;
  const day = prompt('Wedding day date (YYYY-MM-DD):', meta.weddingDate || todayISO());
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const base = normalizeHHMM(prompt('Ceremony time (HH:MM, 24h):', '16:30'));
  if (!base) return;
  const items = buildDraftItems(base);
  ensureCurated('generated draft');
  const days = state.currentCurated.days;
  const ix = days.findIndex(d => d.date === day);
  if (ix >= 0 && !confirm(`${day} already has ${days[ix].items.length} stops. Replace with generated draft?`)) return;
  const entry = { date: day, title: `Wedding Day — ${meta.name}`, items };
  if (ix >= 0) days[ix] = entry;
  else days.push(entry);
  days.sort((a, b) => a.date.localeCompare(b.date));
  commitEdit();
  setStatus(`Generated ${items.length}-stop draft for ${day} from ${base} ceremony. Review, edit, then Save.`);
}

// ---------- Bulk time-shift: move every stop on a day by +/- minutes ----------
export function shiftTimes() {
  const curated = state.currentCurated;
  if (!curated || !curated.days.length) { setStatus('No timeline to shift. Generate a draft first.'); return; }
  let day = state.currentMeta.weddingDate;
  if (curated.days.length > 1) {
    day = prompt(`Which day? (${curated.days.map(d => d.date).join(', ')})`, day || curated.days[0].date);
    if (!day) return;
  }
  const d = curated.days.find(x => x.date === day);
  if (!d) { setStatus(`No stops on ${day}.`); return; }
  const raw = prompt(`Shift all ${d.items.length} stops on ${day} by minutes (e.g. 15 or -15):`, '15');
  if (raw === null) return;
  const mins = parseInt(raw, 10);
  if (isNaN(mins) || mins === 0) { setStatus('No shift applied.'); return; }
  shiftDay(d, mins);
  commitEdit();
  setStatus(`Shifted ${day} by ${mins > 0 ? '+' : ''}${mins} min. Save to keep.`);
}
