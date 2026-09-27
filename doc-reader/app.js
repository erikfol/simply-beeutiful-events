// SBE Event Manager - event dropdown + timeline + status
let eventList = [];
let currentMeta = null;
let currentReport = null;
let currentCurated = null;
let curatedFile = null;
let isDirty = false;
let editing = null; // {day, item} or {day, isNew:true}

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
function setStatus(m) { statusEl.textContent = m; }
function esc(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso) {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}
function fmt$ (n) {
  return (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---------- Time extraction (fallback for old reports without times) ----------
function to24(raw) {
  const m = raw.trim().toLowerCase().replace(/\./g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m || !m[3]) return null;
  let h = parseInt(m[1], 10), mi = parseInt(m[2] || '0', 10);
  if (m[3] === 'pm' && h !== 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
function extractTimes(text) {
  const out = new Set();
  for (const m of (text.match(/(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\s*(AM|PM|am|pm)\b/g) || [])) {
    const r = m.match(/(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\s*(AM|PM|am|pm)/i);
    if (r) for (const h of [r[1], r[2]]) { const t = to24(`${h}${r[3]}`); if (t) out.add(t); }
  }
  const res = [/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/g, /(?<![\d:])\b\d{1,2}\s*(?:AM|PM|am|pm)\b/g];
  for (const re of res) {
    for (const m of (text.match(re) || [])) {
      const t = to24(m);
      if (t) out.add(t);
    }
  }
  return [...out].sort();
}
function enrichEvent(e) {
  const times = (e.times && e.times.length ? e.times : extractTimes(`${e.snippet || ''} ${e.source || ''}`));
  const time = e.time || times[0] || null;
  return { ...e, times, time };
}

// ---------- Load events ----------
async function init() {
  try {
    const r = await fetch('reports/index.json');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    eventList = await r.json();
  } catch (e) {
    // fallback: single known event
    eventList = [{ id: '6-6-26-mistretta-petran-wedding', name: '6.6.26 Mistretta-Petran Wedding', report: '6-6-26-mistretta-petran-wedding.json', weddingDate: '2026-06-06', venue: 'The Greatful Dane Lodge, Newport, NH' }];
  }
  const sel = $('eventSelect');
  sel.innerHTML = eventList.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (eventList.length) {
    sel.value = eventList[0].id;
    await loadEvent(sel.value);
  }
  sel.addEventListener('change', () => loadEvent(sel.value));
  $('btnTimeline').addEventListener('click', showTimeline);
  $('btnStatus').addEventListener('click', showStatus);
  $('btnSave').addEventListener('click', saveTimeline);
  $('btnRevert').addEventListener('click', revertTimeline);
  $('btnExport').addEventListener('click', exportTimeline);
  $('btnAddDay').addEventListener('click', addDay);
  $('curated').addEventListener('click', onCuratedClick);
  $('curated').addEventListener('submit', onCuratedSubmit);
}

async function loadEvent(id) {
  currentMeta = eventList.find(e => e.id === id) || eventList[0];
  if (!currentMeta) return;
  setStatus(`Loading ${currentMeta.name}…`);
  $('eventMeta').textContent = `${currentMeta.venue || ''} · Wedding date: ${currentMeta.weddingDate || 'n/a'}`;
  try {
    const r = await fetch(`reports/${currentMeta.report}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} — run via python -m http.server, not file://`);
    currentReport = await r.json();
    // normalize timeline events (support old + new field names)
    currentReport.timeline = (currentReport.timeline || []).map(e => enrichEvent({
      date_raw: e.date_raw || e.dateRaw, date_iso: e.date_iso || e.dateISO,
      snippet: e.snippet || '', source: e.source || '',
      times: e.times || [], time: e.time || null, label: e.label || ''
    })).filter(e => e.date_iso);
    currentReport.timeline.sort((a, b) => (a.date_iso + (a.time || '')).localeCompare(b.date_iso + (b.time || '')));
    // curated Knot-style timeline (per-event, with actual times) — optional
    currentCurated = null;
    curatedFile = currentMeta.timeline || null;
    isDirty = false; editing = null; updateDirty();
    if (curatedFile) {
      try {
        const rt = await fetch(`reports/${curatedFile}`);
        if (rt.ok) currentCurated = await rt.json();
      } catch { /* fallback to auto timeline below */ }
      // local edits override file
      const local = loadLocal();
      if (local) { currentCurated = local; isDirty = true; updateDirty(); }
    }
    setStatus(`Loaded ${currentMeta.name}: ${currentReport.timeline.length} dated items${currentCurated ? ' + curated run sheet' : ''}.`);
    $('timelineSection').hidden = true;
    $('statusSection').hidden = true;
  } catch (e) {
    setStatus(`Load failed: ${e.message}`);
  }
}

// ---------- Create Timeline (Knot-style spine, like typical_wedding_timeline.png) ----------
let timelineObj = null;
function showTimeline() {
  if (!currentReport) { setStatus('Pick an event first.'); return; }
  $('statusSection').hidden = true;
  $('timelineSection').hidden = false;
  $('timelineTitle').textContent = currentMeta.name;

  // 1) Curated run sheet (preferred) — mirrors the Knot template with actual event times
  if (currentCurated && currentCurated.days) {
    renderCurated();
    renderDocEvidence();
    setStatus(`Timeline: curated run sheet (${currentCurated.days.reduce((n, d) => n + d.items.length, 0)} stops) + document evidence.`);
    return;
  }
  // 2) Fallback: auto-generated from document dates
  $('curated').innerHTML = '<p>No curated run sheet for this event — showing document dates only.</p>';
  renderDocEvidence();
}

// ---------- Editable curated timeline ----------
function lsKey() { return `sbe-timeline-${currentMeta ? currentMeta.id : 'none'}`; }
function loadLocal() {
  try { const raw = localStorage.getItem(lsKey()); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function updateDirty() { $('dirty').textContent = isDirty ? '● unsaved changes' : ''; }
function sortDay(day) { day.items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); }

function renderCurated() {
  let html = `<p class="legend"><span class="badge okbadge">confirmed</span> = in contract/quote &nbsp; <span class="badge estbadge">estimated</span> = template slot, confirm with vendor</p>`;
  currentCurated.days.forEach((day, di) => {
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

function onCuratedClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const act = b.dataset.act, di = +b.dataset.day, ii = +(b.dataset.item ?? -1);
  if (act === 'edit') { editing = { day: di, item: ii }; renderCurated(); }
  else if (act === 'cancel') { editing = null; renderCurated(); }
  else if (act === 'add') { editing = { day: di, item: -1, isNew: true }; renderCurated(); }
  else if (act === 'del') {
    const t = currentCurated.days[di].items[ii];
    if (!confirm(`Remove "${t.time || ''} ${t.title}"?`)) return;
    currentCurated.days[di].items.splice(ii, 1);
    editing = null; isDirty = true; persistLocal(); updateDirty(); renderCurated();
  }
}

function onCuratedSubmit(ev) {
  ev.preventDefault();
  const f = ev.target;
  const di = +f.dataset.day, isNew = f.dataset.new === '1', ii = +f.dataset.item;
  const val = (n) => (new FormData(f).get(n) || '').toString().trim();
  const obj = { time: val('time'), title: val('title'), detail: val('detail'), source: val('source'), confidence: val('confidence') };
  const te = val('timeEnd');
  if (te) obj.timeEnd = te;
  if (!obj.time || !obj.title) return;
  if (isNew) currentCurated.days[di].items.push(obj);
  else currentCurated.days[di].items[ii] = obj;
  sortDay(currentCurated.days[di]);
  editing = null; isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

function persistLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(currentCurated)); } catch { /* ignore */ } }

function addDay() {
  if (!currentCurated) { currentCurated = { template: 'custom', days: [] }; curatedFile = currentCurated; }
  const d = prompt('Day date (YYYY-MM-DD):', currentMeta.weddingDate || todayISO());
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  currentCurated.days.push({ date: d, title: 'New day', items: [] });
  currentCurated.days.sort((a, b) => a.date.localeCompare(b.date));
  editing = { day: currentCurated.days.findIndex((x) => x.date === d), item: -1, isNew: true };
  isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

async function saveTimeline() {
  if (!currentCurated) { setStatus('Nothing to save.'); return; }
  persistLocal();
  // try server-side save to reports/*.timeline.json
  if (curatedFile) {
    try {
      const r = await fetch('/api/save-timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: curatedFile.split('/').pop(), data: currentCurated }) });
      const j = await r.json();
      if (j.ok) { isDirty = false; updateDirty(); setStatus(`Saved to reports/${curatedFile}.`); return; }
      throw new Error(j.error || r.status);
    } catch (e) {
      setStatus(`Server save failed (${e.message}) — kept in browser + downloading file.`);
      downloadTimeline();
      return;
    }
  }
  setStatus('Saved in browser (no server file linked).');
}

async function revertTimeline() {
  if (!confirm('Discard edits and reload from file?')) return;
  try { localStorage.removeItem(lsKey()); } catch { /* ignore */ }
  editing = null; isDirty = false; updateDirty();
  await loadEvent(currentMeta.id);
  showTimeline();
}

function downloadTimeline() {
  const blob = new Blob([JSON.stringify(currentCurated, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (curatedFile || 'timeline.json').split('/').pop();
  a.click();
}
function exportTimeline() {
  if (!currentCurated) return;
  downloadTimeline();
  setStatus('Exported timeline JSON (put it in doc-reader/reports/ to share).');
}

function renderDocEvidence() {

  // group by date
  const byDate = {};
  for (const e of currentReport.timeline) (byDate[e.date_iso] = byDate[e.date_iso] || []).push(e);
  const dates = Object.keys(byDate).sort();
  for (const d of dates) byDate[d].sort((a, b) => (a.time || '99') .localeCompare(b.time || '99'));

  // visual timeline
  const tlEl = $('timeline');
  const items = new vis.DataSet(currentReport.timeline.map((e, i) => ({
    id: i,
    content: `${e.time ? e.time + ' · ' : ''}${esc(e.date_raw)} — ${esc((e.label || e.source || '').slice(0, 40))}`,
    start: e.time ? `${e.date_iso}T${e.time}:00` : e.date_iso,
    title: `${e.date_iso}${e.time ? ' ' + e.time : ''}\n${e.snippet}\n[${e.source}]`
  })));
  if (timelineObj) timelineObj.destroy();
  timelineObj = new vis.Timeline(tlEl, items, { height: '240px', showCurrentTime: true });

  // day-by-day breakdown with times
  const weddingDay = currentMeta.weddingDate;
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
  setStatus(`Timeline: ${dates.length} dates, ${currentReport.timeline.length} items.`);
}

// ---------- Status Update ----------
function showStatus() {
  if (!currentReport) { setStatus('Pick an event first.'); return; }
  $('timelineSection').hidden = true;
  $('statusSection').hidden = false;
  $('statusTitle').textContent = currentMeta.name;

  const now = new Date();
  const today = todayISO(now);
  const wDate = currentMeta.weddingDate;
  const dayDiff = wDate ? Math.round((new Date(wDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000) : null;
  let countdown;
  if (dayDiff == null) countdown = 'Wedding date unknown.';
  else if (dayDiff > 1) countdown = `⏳ ${dayDiff} days until the wedding (${fmtDate(wDate)}).`;
  else if (dayDiff === 1) countdown = `⏳ Wedding is TOMORROW (${fmtDate(wDate)}).`;
  else if (dayDiff === 0) countdown = `🎉 Wedding is TODAY (${fmtDate(wDate)}).`;
  else countdown = `✅ Wedding was ${Math.abs(dayDiff)} day(s) ago (${fmtDate(wDate)}). Reviewing close-out / balances.`;
  $('todayLine').textContent = `Today is ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. ${countdown}`;

  const b = currentReport.budget || {};
  const v = currentReport.vendors || {};
  const dueCats = (b.categories || []).filter(c => (c.due || 0) > 0.005).sort((x, y) => y.due - x.due);
  const cards = [];
  cards.push(`<div class="stat"><h4>Budget</h4><p>Planned <strong>${fmt$(b.budget_total)}</strong><br>Actual <strong>${fmt$(b.total_actual)}</strong><br>Paid <strong>${fmt$(b.total_paid)}</strong><br>Still due <strong class="${(b.total_due || 0) > 0 ? 'due' : 'ok'}">${fmt$(b.total_due)}</strong></p>${dueCats.length ? `<p>Unpaid: ${dueCats.map(c => `${esc(c.category)} (${fmt$(c.due)})`).join('; ')}</p>` : '<p class="ok">Nothing outstanding in budget sheet.</p>'}</div>`);
  cards.push(`<div class="stat"><h4>Vendors (${(v.booked || []).length})</h4><ul>${(v.booked || []).map(x => `<li><strong>${esc(x.vendor)}</strong> — ${esc(x.cost || 'cost n/a')}</li>`).join('') || '<li>No vendor list</li>'}</ul></div>`);
  cards.push(`<div class="stat"><h4>Files</h4><p>${currentReport.num_files} files, ${currentReport.num_text_parsed} parsed, ${currentReport.timeline.length} dated items.<br>Contracts on file: ${(v.contract_files || []).length}</p></div>`);
  $('statusCards').innerHTML = cards.join('');

  const upcoming = currentReport.timeline.filter(e => e.date_iso >= today).slice(0, 15);
  const past = currentReport.timeline.filter(e => e.date_iso < today).slice(-10).reverse();
  const li = e => `<li><strong>${e.date_iso}</strong>${e.time ? ` @ ${e.time}` : ''} (${esc(e.date_raw)}) — ${esc(e.snippet)} <em>[${esc(e.source)}]</em></li>`;
  $('nextUp').innerHTML = upcoming.length ? upcoming.map(li).join('') :
    `<li>Nothing dated after today. ${dayDiff != null && dayDiff < 0 ? 'Event is past — confirm all balances are $0 due and vendors are paid.' : 'All deadlines appear passed or undated.'}</li>`;
  $('overdue').innerHTML = past.length ? past.map(li).join('') : '<li>No past items.</li>';
  // prepend money-due as actionable items
  if (dueCats.length) {
    $('nextUp').innerHTML = dueCats.map(c => `<li>💰 <strong>${esc(c.category)}</strong> still due <strong>${fmt$(c.due)}</strong> (paid ${fmt$(c.paid)} of ${fmt$(c.actual)}).</li>`).join('') + $('nextUp').innerHTML;
  }
  setStatus(`Status as of ${today}: ${upcoming.length} upcoming, ${(b.total_due || 0) > 0 ? fmt$(b.total_due) + ' still due' : 'no balance due'}.`);
}

init();
