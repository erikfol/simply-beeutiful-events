// Create Timeline view: editable curated run sheet (Knot-style spine) + document evidence.
import { state } from './state.js';
import { $, setStatus, updateDirty, downloadJSON } from './dom.js';
import { persistLocal, clearLocal } from './storage.js';
import { loadEvent } from './events.js';
import { esc, fmtDate, fmt12, sortDay, todayISO } from './util.js';

let timelineObj = null;

export function showTimeline() {
  if (!state.currentReport) { setStatus('Pick an event first.'); return; }
  $('statusSection').hidden = true;
  $('timelineSection').hidden = false;
  $('timelineTitle').textContent = state.currentMeta.name;

  // 1) Curated run sheet (preferred) — mirrors the Knot template with actual event times
  if (state.currentCurated && state.currentCurated.days) {
    renderCurated();
    renderDocEvidence();
    setStatus(`Timeline: curated run sheet (${state.currentCurated.days.reduce((n, d) => n + d.items.length, 0)} stops) + document evidence.`);
    return;
  }
  // 2) Fallback: auto-generated from document dates
  $('curated').innerHTML = '<p>No curated run sheet for this event — showing document dates only.</p>';
  renderDocEvidence();
}

// Record an edit: mark unsaved, keep a browser copy, refresh the view.
export function commitEdit() {
  state.editing = null; state.isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

// A timeline with no file yet still needs a filename for Export.
export function ensureCurated(template) {
  if (!state.currentCurated) state.currentCurated = { template, days: [] };
  if (!state.curatedFile) state.curatedFile = `${state.currentMeta.id}.timeline.json`;
}

export function renderCurated() {
  const { editing } = state;
  let html = `<p class="legend"><span class="badge okbadge">confirmed</span> = in contract/quote &nbsp; <span class="badge estbadge">estimated</span> = template slot, confirm with vendor</p>`;
  state.currentCurated.days.forEach((day, di) => {
    html += `<h3 class="dayhead">${fmtDate(day.date)} — ${esc(day.title)} <small>${esc(day.date)}</small></h3><div class="spine">`;
    day.items.forEach((it, i) => {
      const side = i % 2 === 0 ? 'left' : 'right';
      if (editing && editing.day === di && editing.item === i && !editing.isNew) {
        html += `<div class="slot ${side}"><div class="dot"></div><div class="tcard edit">${itemForm(di, i, it)}</div></div>`;
      } else {
        const range = it.timeEnd ? ` – ${fmt12(it.timeEnd)}` : '';
        const conf = it.confidence === 'confirmed' ? '<span class="badge okbadge">confirmed</span>' : '<span class="badge estbadge">estimated</span>';
        html += `<div class="slot ${side}"><div class="dot"></div><div class="tcard"><div class="ttime">${fmt12(it.time)}${range}</div><div class="ttitle">${esc(it.title)}</div><div class="tdetail">${esc(it.detail || '')}</div><div class="tsrc">${conf} <em>${esc(it.source || '')}</em></div><div class="tact"><button data-act="edit" data-day="${di}" data-item="${i}">Edit</button><button data-act="del" data-day="${di}" data-item="${i}" class="danger">Remove</button></div></div></div>`;
      }
    });
    html += `</div>`;
    if (editing && editing.day === di && editing.isNew) {
      html += `<div class="tcard edit newform">${itemForm(di, -1, { time: '', timeEnd: '', title: '', detail: '', source: '', confidence: 'confirmed' }, true)}</div>`;
    } else {
      html += `<button data-act="add" data-day="${di}" class="addbtn">+ Add stop on ${esc(day.date)}</button>`;
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
    <div class="tact"><button type="submit">${isNew ? 'Add' : 'Done'}</button><button type="button" data-act="cancel">Cancel</button></div>
  </form>`;
}

export function onCuratedClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act, di = +b.dataset.day, ii = +(b.dataset.item ?? -1);
  if (act === 'edit') { state.editing = { day: di, item: ii }; renderCurated(); }
  else if (act === 'cancel') { state.editing = null; renderCurated(); }
  else if (act === 'add') { state.editing = { day: di, item: -1, isNew: true }; renderCurated(); }
  else if (act === 'del') {
    const items = state.currentCurated.days[di].items;
    const t = items[ii];
    if (!confirm(`Remove "${t.time || ''} ${t.title}"?`)) return;
    items.splice(ii, 1);
    commitEdit();
  }
}

export function onCuratedSubmit(ev) {
  ev.preventDefault();
  const f = ev.target;
  const di = +f.dataset.day, isNew = f.dataset.new === '1', ii = +f.dataset.item;
  const val = (n) => (new FormData(f).get(n) || '').toString().trim();
  const obj = { time: val('time'), title: val('title'), detail: val('detail'), source: val('source'), confidence: val('confidence') };
  const te = val('timeEnd');
  if (te) obj.timeEnd = te;
  if (!obj.time || !obj.title) return;
  const day = state.currentCurated.days[di];
  if (isNew) day.items.push(obj);
  else day.items[ii] = obj;
  sortDay(day);
  commitEdit();
}

export function addDay() {
  ensureCurated('custom');
  const days = state.currentCurated.days;
  const d = prompt('Day date (YYYY-MM-DD):', state.currentMeta.weddingDate || todayISO());
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  days.push({ date: d, title: 'New day', items: [] });
  days.sort((a, b) => a.date.localeCompare(b.date));
  state.editing = { day: days.findIndex((x) => x.date === d), item: -1, isNew: true };
  state.isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

export function saveTimeline() {
  if (!state.currentCurated) { setStatus('Nothing to save.'); return; }
  if (!persistLocal()) { setStatus('Could not save in this browser (storage blocked) — use Export JSON.'); return; }
  state.isDirty = false; updateDirty();
  setStatus('Saved in this browser. Use Export JSON to share with others.');
}

export async function revertTimeline() {
  if (!confirm('Discard edits and reload from file?')) return;
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
  $('daySchedule').innerHTML = html || '<p>No dated items.</p>';
  setStatus(`Timeline: ${dates.length} dates, ${report.timeline.length} items.`);
}
