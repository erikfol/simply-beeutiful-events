// Create Timeline view: editable curated run sheet (Knot-style spine) + document evidence.
import { state } from './state.js';
import { $, setStatus, updateDirty, downloadJSON, showSection, needSignIn } from './dom.js';
import { persistLocal, clearLocal } from './storage.js';
import { loadEvent, isDriveEvent } from './events.js';
import { writeEventData } from './appdata.js';
import { openShift, openSaveTemplate, closePanel } from './panel.js'; // circular with panel.js; only used inside handlers
import { ROLES, rolesOf, itemInView, roleLabel } from './roles.js';
import { docSuggestions } from './suggestions.js';
import { timelineConflicts } from './checks.js';
import { applyEdit } from './draft.js';
import { esc, fmtDate, fmt12, sortDay } from './util.js';

let timelineObj = null;

export function showTimeline() {
  if (!state.currentReport) { setStatus('Pick an event first.'); return; }
  showSection('timelineSection');
  $('timelineTitle').textContent = state.currentMeta.name;

  // 1) Curated run sheet (preferred) — mirrors the Knot template with actual event times
  if (state.currentCurated && state.currentCurated.days) {
    renderCurated();
    renderDocEvidence();
    setStatus(`Timeline: curated run sheet (${state.currentCurated.days.reduce((n, d) => n + d.items.length, 0)} stops) + document evidence.`);
    return;
  }
  // 2) No run sheet yet: point at the generator; document dates still show below
  $('curated').innerHTML = '<p class="empty">No run sheet for this event yet. Use <strong>Generate draft</strong> to start one from a few questions, or <strong>Add day</strong> to build it by hand.</p>';
  renderDocEvidence();
}

// Record an edit: mark unsaved, keep a browser copy, refresh the view.
export function commitEdit(keepEditing = false) {
  if (!keepEditing) state.editing = null;
  state.isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

// A timeline with no file yet still needs a filename for Export.
export function ensureCurated(template) {
  if (!state.currentCurated) state.currentCurated = { template, days: [] };
  if (!state.curatedFile) state.curatedFile = `${state.currentMeta.id}.timeline.json`;
}

// Suggestions shown under each day, kept so an "Add" click can find the one it belongs to.
let shownSuggestions = [];

const roleChips = (it) => rolesOf(it).filter(r => r !== 'planner')
  .map(r => `<span class="rchip">${esc(roleLabel(r))}</span>`).join('');

export function renderCurated() {
  const { editing, viewRole, currentCurated: curated, currentReport: report } = state;
  const conflicts = timelineConflicts({ timeline: report.timeline, curated, weddingDate: state.currentMeta.weddingDate });
  let html = conflicts.map(i => `<div class="alert warn">🟡 ${i.msg}</div>`).join('');
  html += `<p class="legend"><span class="badge okbadge">confirmed</span> = in contract/quote &nbsp; <span class="badge estbadge">estimated</span> = template slot, confirm with vendor${viewRole ? ` &nbsp;·&nbsp; Showing the <strong>${esc(roleLabel(viewRole))}</strong> view` : ''}</p>`;
  shownSuggestions = [];
  curated.days.forEach((day, di) => {
    html += `<div class="dayhead-row"><h3 class="dayhead">${fmtDate(day.date)} — ${esc(day.title)} <small>${esc(day.date)}</small></h3>
      <div class="day-actions"><button class="mini" data-act="savetpl" data-day="${di}">Save as template</button><button class="mini" data-act="delday" data-day="${di}">Delete day</button></div></div><div class="spine">`;
    let shown = 0;
    day.items.forEach((it, i) => {
      if (!itemInView(it, viewRole)) return;
      const side = shown++ % 2 === 0 ? 'left' : 'right';
      if (editing && editing.day === di && editing.item === i && !editing.isNew) {
        html += `<div class="slot ${side}"><div class="dot"></div><div class="tcard edit">${itemForm(di, i, it)}</div></div>`;
      } else {
        const range = it.timeEnd ? ` – ${fmt12(it.timeEnd)}` : '';
        const conf = it.confidence === 'confirmed' ? '<span class="badge okbadge">confirmed</span>' : '<span class="badge estbadge">estimated</span>';
        html += `<div class="slot ${side}"><div class="dot"></div><div class="tcard"><div class="ttime">${fmt12(it.time)}${range}</div><div class="ttitle">${esc(it.title)}</div><div class="tdetail">${esc(it.detail || '')}</div><div class="troles">${roleChips(it)}</div><div class="tsrc">${conf} <em>${esc(it.source || '')}</em></div><div class="tact"><button data-act="edit" data-day="${di}" data-item="${i}">Edit</button><button data-act="shiftfrom" data-day="${di}" data-item="${i}">Shift from here</button><button data-act="del" data-day="${di}" data-item="${i}" class="danger">Remove</button></div></div></div>`;
      }
    });
    if (!shown) html += `<p class="empty">${day.items.length ? 'No stops for this view.' : 'No stops yet.'}</p>`;
    html += `</div>`;
    if (editing && editing.day === di && editing.isNew) {
      html += `<div class="tcard edit newform">${itemForm(di, -1, { time: '', timeEnd: '', title: '', detail: '', source: '', confidence: 'confirmed', roles: viewRole ? ['planner', viewRole] : ['planner'] }, true)}</div>`;
    } else {
      html += `<button data-act="add" data-day="${di}" class="addbtn">+ Add stop on ${esc(day.date)}</button>`;
    }
    const sugg = docSuggestions(report.timeline, day).filter(x => itemInView(x, viewRole));
    shownSuggestions[di] = sugg;
    if (sugg.length) {
      html += `<details class="suggest"><summary>From the documents: ${sugg.length} time${sugg.length === 1 ? '' : 's'} not on this day yet</summary><ul>` +
        sugg.map((x, k) => `<li><span><strong>${fmt12(x.time)}</strong> ${esc(x.title)}<small>${esc(x.detail)}</small></span><button class="mini" data-act="suggest" data-day="${di}" data-item="${k}">Add</button></li>`).join('') +
        `</ul></details>`;
    }
  });
  $('curated').innerHTML = html;
}

function itemForm(di, i, it, isNew = false) {
  return `<form data-day="${di}" data-item="${i}" data-new="${isNew ? 1 : 0}">
    <label>Start <input name="time" type="time" value="${esc(it.time || '')}" required /></label>
    <label>End <input name="timeEnd" type="time" value="${esc(it.timeEnd || '')}" /></label>
    <label>Title <input name="title" value="${esc(it.title || '')}" required /></label>
    <label>Detail <input name="detail" value="${esc(it.detail || '')}" /></label>
    <label>Source <input name="source" value="${esc(it.source || '')}" /></label>
    <label>Confidence <select name="confidence"><option value="confirmed"${it.confidence === 'confirmed' ? ' selected' : ''}>confirmed</option><option value="estimated"${it.confidence !== 'confirmed' ? ' selected' : ''}>estimated</option></select></label>
    <fieldset class="rolepick"><legend>Who's involved</legend>${ROLES.filter(([k]) => k !== 'planner').map(([k, l]) => `<label><input type="checkbox" name="roles" value="${k}"${rolesOf(it).includes(k) ? ' checked' : ''} /> ${esc(l)}</label>`).join('')}</fieldset>
    ${isNew ? '' : `<label class="inline"><input type="checkbox" name="ripple" /> Move later stops by the same amount</label>`}
    <div class="tact"><button type="submit">${isNew ? 'Add' : 'Done'}</button><button type="button" data-act="cancel">Cancel</button></div>
  </form>`;
}

export function onCuratedClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act, di = +b.dataset.day, ii = +(b.dataset.item ?? -1);
  const days = state.currentCurated.days;
  if (act === 'edit') { state.editing = { day: di, item: ii }; renderCurated(); }
  else if (act === 'cancel') { state.editing = null; renderCurated(); }
  else if (act === 'add') { state.editing = { day: di, item: -1, isNew: true }; renderCurated(); }
  else if (act === 'shiftfrom') openShift(di, ii);
  else if (act === 'savetpl') openSaveTemplate(di);
  else if (act === 'del') {
    const items = days[di].items;
    const t = items[ii];
    if (!confirm(`Remove "${t.time || ''} ${t.title}"?`)) return;
    items.splice(ii, 1);
    commitEdit();
  } else if (act === 'delday') {
    const day = days[di];
    if (!confirm(`Delete ${day.date} (${day.title}) and its ${day.items.length} stops?`)) return;
    days.splice(di, 1);
    closePanel();
    commitEdit();
  } else if (act === 'suggest') {
    const x = shownSuggestions[di] && shownSuggestions[di][ii];
    if (!x) return;
    days[di].items.push({ ...x });
    sortDay(days[di]);
    commitEdit();
    setStatus(`Added ${fmt12(x.time)} ${x.title} from ${x.source}.`);
  }
}

export function onCuratedSubmit(ev) {
  ev.preventDefault();
  const f = ev.target;
  const di = +f.dataset.day, isNew = f.dataset.new === '1', ii = +f.dataset.item;
  const val = (n) => (new FormData(f).get(n) || '').toString().trim();
  const fd = new FormData(f);
  const obj = { time: val('time'), title: val('title'), detail: val('detail'), source: val('source'), confidence: val('confidence'), roles: ['planner', ...fd.getAll('roles')] };
  const te = val('timeEnd');
  if (te) obj.timeEnd = te;
  if (!obj.time || !obj.title) return;
  const day = state.currentCurated.days[di];
  let moved = 0;
  if (isNew) {
    day.items.push(obj);
    sortDay(day);
  } else {
    moved = applyEdit(day, ii, obj, fd.has('ripple'));
  }
  commitEdit();
  if (moved) setStatus(`Moved ${moved} later stop${moved === 1 ? '' : 's'} by the same amount. Save to keep.`);
}

export async function saveTimeline() {
  if (!state.currentCurated) { setStatus('Nothing to save.'); return; }
  if (isDriveEvent()) {
    const meta = state.currentMeta;
    const data = state.currentCurated;
    setStatus('Saving to Google Drive…');
    try {
      await writeEventData(meta.driveId, 'timeline', data);
      if (state.currentMeta !== meta) return;
      clearLocal();
      state.isDirty = false; updateDirty();
      setStatus('Saved to Google Drive (SBE App Data).');
    } catch (e) {
      if (state.currentMeta === meta) persistLocal();
      setStatus(`Not saved to Google Drive: ${e.message} Your changes are kept in this browser; save again once that's fixed.`);
      if (e.name === 'NeedsSignIn') needSignIn();
    }
    return;
  }
  if (!persistLocal()) { setStatus('Could not save in this browser (storage blocked) — use Export JSON.'); return; }
  state.isDirty = false; updateDirty();
  setStatus('Saved in this browser. Use Export JSON to share with others.');
}

export async function revertTimeline() {
  if (!confirm(isDriveEvent() ? 'Discard unsaved edits and reload the version saved in Google Drive?' : 'Discard edits and reload from file?')) return;
  clearLocal();
  state.editing = null; state.isDirty = false; updateDirty();
  await loadEvent(state.currentMeta.id);
  showTimeline();
}

export function exportTimeline() {
  if (!state.currentCurated) return;
  downloadJSON(state.currentCurated, state.curatedFile || 'timeline.json');
  setStatus('Exported timeline JSON (put it in docs/reports/ to share).');
}

function renderDocEvidence() {
  const report = state.currentReport;
  // group by date
  const byDate = {};
  for (const e of report.timeline) (byDate[e.date_iso] = byDate[e.date_iso] || []).push(e);
  const dates = Object.keys(byDate).sort();
  for (const d of dates) byDate[d].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));

  // visual timeline
  const items = new vis.DataSet(report.timeline.map((e, i) => ({
    id: i,
    content: `${e.time ? e.time + ' · ' : ''}${esc(e.date_raw)} — ${esc((e.label || e.source || '').slice(0, 40))}`,
    start: e.time ? `${e.date_iso}T${e.time}:00` : e.date_iso,
    title: `${e.date_iso}${e.time ? ' ' + e.time : ''}\n${e.snippet}\n[${e.source}]`
  })));
  if (timelineObj) timelineObj.destroy();
  timelineObj = new vis.Timeline($('timeline'), items, { height: '240px', showCurrentTime: true });

  // day-by-day breakdown with times
  const weddingDay = state.currentMeta.weddingDate;
  let html = '';
  for (const d of dates) {
    const isWedding = d === weddingDay ? ' <span class="badge gold">WEDDING DAY</span>' : '';
    html += `<div class="dayblock"><h3>${fmtDate(d)} <small>${d}</small>${isWedding}</h3><ul>`;
    for (const e of byDate[d]) {
      const t = e.time ? `<strong class="time">${e.time}</strong> ` : `<span class="notime">— no time listed — </span>`;
      const lab = e.label ? `<span class="badge">${esc(e.label)}</span> ` : '';
      html += `<li>${t}${lab}${esc(e.snippet)} <em>[${esc(e.source)}]</em></li>`;
    }
    html += `</ul></div>`;
  }
  // wedding-day call sheet at top if present
  const dayOf = weddingDay && byDate[weddingDay] ? byDate[weddingDay].filter(e => e.time) : [];
  if (dayOf.length) {
    html = `<div class="dayblock highlight"><h3>Day-of run sheet — ${fmtDate(weddingDay)}</h3><ol>` +
      dayOf.map(e => `<li><strong>${e.time}</strong> — ${esc(e.snippet)} <em>[${esc(e.source)}]</em></li>`).join('') +
      `</ol></div>` + html;
  }
  $('daySchedule').innerHTML = html || (report.source === 'drive'
    ? '<p class="empty">Dates and times from this event\'s documents will appear here once the app reads the documents (next phase). The document list is under <strong>Documents</strong>.</p>'
    : '<p>No dated items.</p>');
  setStatus(`Timeline: ${dates.length} dates, ${report.timeline.length} items.`);
}
