// SBE Event Manager - event dropdown + timeline + status
let eventList = [];
let currentMeta = null;
let currentReport = null;
let currentCurated = null;
let curatedFile = null;
let isDirty = false;
let editing = null; // {day, item} or {day, isNew:true}
let currentStatus = null;
let statusFile = null;
let statusDirty = false;

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
  $('btnGenerate').addEventListener('click', generateDraft);
  $('btnShift').addEventListener('click', shiftTimes);
  $('btnAddDay').addEventListener('click', addDay);
  $('btnSaveStatus').addEventListener('click', saveStatus);
  $('btnRevertStatus').addEventListener('click', revertStatus);
  $('btnExportStatus').addEventListener('click', exportStatus);
  $('statusSection').addEventListener('change', onStatusChange);
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
      if (local) currentCurated = local;
    }
    // contract + payment status overlay
    currentStatus = null;
    statusFile = currentMeta.status || null;
    statusDirty = false; updateStatusDirty();
    if (statusFile) {
      try {
        const rs = await fetch(`reports/${statusFile}`);
        if (rs.ok) currentStatus = await rs.json();
      } catch { /* overlay optional */ }
      const slocal = loadStatusLocal();
      if (slocal) currentStatus = slocal;
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

function persistLocal() { try { localStorage.setItem(lsKey(), JSON.stringify(currentCurated)); return true; } catch { return false; } }

function addDay() {
  if (!currentCurated) currentCurated = { template: 'custom', days: [] };
  if (!curatedFile) curatedFile = `${currentMeta.id}.timeline.json`;
  const d = prompt('Day date (YYYY-MM-DD):', currentMeta.weddingDate || todayISO());
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  currentCurated.days.push({ date: d, title: 'New day', items: [] });
  currentCurated.days.sort((a, b) => a.date.localeCompare(b.date));
  editing = { day: currentCurated.days.findIndex((x) => x.date === d), item: -1, isNew: true };
  isDirty = true; persistLocal(); updateDirty(); renderCurated();
}

function saveTimeline() {
  if (!currentCurated) { setStatus('Nothing to save.'); return; }
  if (!persistLocal()) { setStatus('Could not save in this browser (storage blocked) — use Export JSON.'); return; }
  isDirty = false; updateDirty();
  setStatus('Saved in this browser. Use Export JSON to share with others.');
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
  setStatus('Exported timeline JSON (put it in docs/reports/ to share).');
}

// ---------- Draft generator (Genius-style): ceremony time -> starter run sheet ----------
const DRAFT_TEMPLATE = [
  { off: -390, title: 'Venue access / vendor load-in begins', detail: 'Setup in ceremony + reception spaces.' },
  { off: -330, title: 'Hair and makeup team arrives', detail: 'Bride + party at prep location.' },
  { off: -300, title: 'Wedding-party transport pickup', detail: 'Shuttle to venue.' },
  { off: -210, title: 'Hair & makeup complete', detail: 'Buffer before photos.' },
  { off: -120, title: 'Photographer arrives / pre-ceremony coverage', detail: 'Details, getting ready, portraits.' },
  { off: -65, title: 'Guest transport pickup', detail: 'Buses from hotels.' },
  { off: -35, title: 'Guest transport arrives at venue', detail: 'Guests seated ahead of prelude.' },
  { off: -30, title: 'Ceremony prelude music begins', detail: '' },
  { off: 0, title: 'Ceremony begins', detail: '' },
  { off: 30, endOff: 90, title: 'Cocktail hour', detail: 'Family + wedding party portraits.' },
  { off: 90, endOff: 330, title: 'Reception', detail: 'Dinner, dances, speeches.' },
  { off: 100, title: 'Wedding party + couple entrance', detail: '' },
  { off: 145, title: 'First dance / welcome speech / dinner', detail: 'Confirm order with band.' },
  { off: 245, title: 'Speeches + parent dances', detail: '' },
  { off: 315, title: 'Cake / dessert + open dancing', detail: '' },
  { off: 330, title: 'Last dance / reception ends', detail: '' },
];

function shiftHHMM(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = (h * 60 + m + mins) % 1440;
  if (t < 0) t += 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function generateDraft() {
  const day = prompt('Wedding day date (YYYY-MM-DD):', currentMeta.weddingDate || todayISO());
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const cer = prompt('Ceremony time (HH:MM, 24h):', '16:30');
  if (!cer || !/^\d{1,2}:\d{2}$/.test(cer)) return;
  const [ch, cm] = cer.split(':').map(Number);
  const base = `${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`;
  const items = DRAFT_TEMPLATE.map(t => {
    const o = { time: shiftHHMM(base, t.off), title: t.title, detail: t.detail, source: 'Generated draft — confirm', confidence: 'estimated' };
    if (t.endOff != null) o.timeEnd = shiftHHMM(base, t.endOff);
    return o;
  });
  if (!currentCurated) currentCurated = { template: 'generated draft', days: [] };
  if (!curatedFile) curatedFile = `${currentMeta.id}.timeline.json`;
  const ix = currentCurated.days.findIndex(d => d.date === day);
  if (ix >= 0 && !confirm(`${day} already has ${currentCurated.days[ix].items.length} stops. Replace with generated draft?`)) return;
  const entry = { date: day, title: `Wedding Day — ${currentMeta.name}`, items };
  if (ix >= 0) currentCurated.days[ix] = entry;
  else currentCurated.days.push(entry);
  currentCurated.days.sort((a, b) => a.date.localeCompare(b.date));
  editing = null; isDirty = true; persistLocal(); updateDirty(); renderCurated();
  setStatus(`Generated ${items.length}-stop draft for ${day} from ${base} ceremony. Review, edit, then Save.`);
}

// ---------- Bulk time-shift: move every stop on a day by +/- minutes ----------
function shiftTimes() {
  if (!currentCurated || !currentCurated.days.length) { setStatus('No timeline to shift. Generate a draft first.'); return; }
  let day = currentMeta.weddingDate;
  if (currentCurated.days.length > 1) {
    day = prompt(`Which day? (${currentCurated.days.map(d => d.date).join(', ')})`, day || currentCurated.days[0].date);
    if (!day) return;
  }
  const d = currentCurated.days.find(x => x.date === day);
  if (!d) { setStatus(`No stops on ${day}.`); return; }
  const raw = prompt(`Shift all ${d.items.length} stops on ${day} by minutes (e.g. 15 or -15):`, '15');
  if (raw === null) return;
  const mins = parseInt(raw, 10);
  if (isNaN(mins) || mins === 0) { setStatus('No shift applied.'); return; }
  for (const it of d.items) {
    if (it.time) it.time = shiftHHMM(it.time, mins);
    if (it.timeEnd) it.timeEnd = shiftHHMM(it.timeEnd, mins);
  }
  sortDay(d);
  editing = null; isDirty = true; persistLocal(); updateDirty(); renderCurated();
  setStatus(`Shifted ${day} by ${mins > 0 ? '+' : ''}${mins} min. Save to keep.`);
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
  renderStatusDashboard(b, v, dueCats, today, dayDiff);

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

// ---------- Budget + contract status dashboard ----------
const CONTRACTS = ['Unknown', 'Draft', 'Sent', 'Signed', 'Expired', 'Needs Review'];
const PAYMENTS = ['Unknown', 'Not Due', 'Due', 'Partially Paid', 'Paid', 'Overdue'];

function stKey() { return `sbe-status-${currentMeta ? currentMeta.id : 'none'}`; }
function loadStatusLocal() {
  try { const raw = localStorage.getItem(stKey()); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function persistStatusLocal() { try { localStorage.setItem(stKey(), JSON.stringify(currentStatus)); return true; } catch { return false; } }
function updateStatusDirty() { const el = $('dirtyStatus'); if (el) el.textContent = statusDirty ? '● unsaved changes' : ''; }
function statusFor(key, name) {
  const found = (currentStatus && currentStatus.vendors || []).find(x => (x.name || '').toLowerCase() === (name || '').toLowerCase());
  if (found) return found;
  return { name, contract: 'Unknown', payment: 'Unknown', dueDate: '', notes: '' };
}
function pill(cls, txt) { return `<span class="pill ${cls}">${esc(txt)}</span>`; }
function budgetPill(c) {
  if ((c.due || 0) <= 0.005 && (c.actual || 0) > 0) return pill('st-paid', 'Paid');
  if ((c.paid || 0) > 0) return pill('st-partial', 'Partially paid');
  if ((c.due || 0) > 0.005) return pill('st-due', 'Due');
  return pill('st-na', '—');
}

// ---------- Timeline validation: conflicts, missing items, deadline alerts ----------
function renderValidation(b, v, today, dayDiff) {
  const issues = []; // {level: 'high'|'warn'|'info', msg}
  const wDate = currentMeta.weddingDate;
  const allText = [
    ...currentReport.timeline.map(e => `${e.snippet || ''} ${e.source || ''} ${e.label || ''}`),
    ...(currentCurated && currentCurated.days ? currentCurated.days.flatMap(d => d.items.map(it => `${it.title || ''} ${it.detail || ''} ${it.source || ''}`)) : [])
  ].join('\n');
  const has = (re) => re.test(allText);

  // 1) balances still due after the event
  if ((b.total_due || 0) > 0.005 && dayDiff != null && dayDiff < 0) {
    issues.push({ level: 'high', msg: `Event is over but <strong>${fmt$(b.total_due)}</strong> is still due — chase ${dueCatsFiltered(b).map(c => esc(c.category)).join(', ') || 'open balances'}.` });
  }
  // 2) conflicting key times across documents (wedding day)
  const conflicts = [
    { key: /ceremony/i, label: 'Ceremony start' },
    { key: /cocktail/i, label: 'Cocktail hour' },
    { key: /reception/i, label: 'Reception' },
  ];
  if (wDate) {
    for (const c of conflicts) {
      const seen = new Map(); // time -> source
      for (const e of currentReport.timeline.filter(e => e.date_iso === wDate && e.time)) {
        if (c.key.test(`${e.snippet || ''} ${e.label || ''}`)) {
          if (!seen.has(e.time)) seen.set(e.time, e.source);
        }
      }
      if (seen.size > 1) {
        issues.push({ level: 'warn', msg: `${c.label} has <strong>conflicting times</strong>: ${[...seen.entries()].map(([t, s]) => `${t} [${esc(s)}]`).join(' vs ')} — confirm which is current.` });
      }
    }
  }
  // 3) missing common planning items
  const checklist = [
    { key: /venue|load-in|load in|setup|set up/i, label: 'venue access / setup time' },
    { key: /ceremony/i, label: 'ceremony time' },
    { key: /cocktail/i, label: 'cocktail hour' },
    { key: /reception|dinner|first dance/i, label: 'reception / dinner plan' },
    { key: /photo/i, label: 'photography coverage' },
    { key: /band|dj|music|guitar/i, label: 'music / band / DJ' },
    { key: /cater|food|bar|beverage/i, label: 'catering / bar' },
    { key: /shuttle|bus|transport|pickup|pick up/i, label: 'transportation / shuttles' },
    { key: /floral|flower/i, label: 'floral delivery' },
    { key: /hair|makeup/i, label: 'hair & makeup' },
  ];
  const missing = checklist.filter(c => !c.key.test(allText));
  for (const m of missing) {
    issues.push({ level: 'info', msg: `No <strong>${m.label}</strong> found in documents — confirm it is planned.` });
  }
  // 4) vendor due dates vs today
  const sts = (currentStatus && currentStatus.vendors) || [];
  const soon = [];
  for (const s of sts) {
    if (s.payment === 'Paid') continue;
    if (s.dueDate && s.dueDate < today) {
      issues.push({ level: 'high', msg: `<strong>${esc(s.name)}</strong> payment was due <strong>${s.dueDate}</strong> and is marked "${esc(s.payment)}".` });
    } else if (s.dueDate && s.payment !== 'Paid') {
      const days = Math.round((new Date(s.dueDate + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
      if (days >= 0 && days <= 14) soon.push(`${esc(s.name)} (${s.dueDate})`);
    }
  }
  if (soon.length) {
    issues.push({ level: 'warn', msg: `Due within 14 days: <strong>${soon.join('; ')}</strong>.` });
  }
  // 5) document dates after the wedding that are not load-out/returns
  if (wDate) {
    const odd = currentReport.timeline.filter(e => e.date_iso > wDate && !/pickup|return|load-out|load out|checkout|check.out/i.test(`${e.snippet || ''} ${e.label || ''}`));
    if (odd.length) {
      issues.push({ level: 'info', msg: `${odd.length} dated item${odd.length === 1 ? '' : 's'} after the wedding — verify close-out tasks.` });
    }
  }

  const el = $('validation');
  if (!issues.length) { el.innerHTML = '<div class="alert ok">✅ Timeline looks consistent — no conflicts or missing items detected.</div>'; return; }
  const icon = { high: '🔴', warn: '🟡', info: '🔵' };
  el.innerHTML = `<h3>Needs attention (${issues.length})</h3>` +
    issues.map(i => `<div class="alert ${i.level === 'high' ? 'due' : i.level === 'warn' ? 'warn' : 'info'}">${icon[i.level]} ${i.msg}</div>`).join('');
}

function dueCatsFiltered(b) {
  return (b.categories || []).filter(c => (c.due || 0) > 0.005).sort((x, y) => y.due - x.due);
}

function renderStatusDashboard(b, v, dueCats, today, dayDiff) {
  renderValidation(b, v, today, dayDiff);
  // --- alerts ---
  const alerts = [];
  if ((b.budget_total || 0) > 0 && (b.total_actual || 0) > (b.budget_total || 0)) {
    alerts.push(`<div class="alert warn">⚠️ Over budget: actual <strong>${fmt$(b.total_actual)}</strong> vs planned <strong>${fmt$(b.budget_total)}</strong> (${fmt$((b.total_actual || 0) - (b.budget_total || 0))} over).</div>`);
  }
  if ((b.total_due || 0) > 0.005) {
    alerts.push(`<div class="alert due">💰 <strong>${fmt$(b.total_due)}</strong> still due across ${dueCats.length} categor${dueCats.length === 1 ? 'y' : 'ies'} (paid ${fmt$(b.total_paid)} of ${fmt$(b.total_actual)}).</div>`);
  } else {
    alerts.push(`<div class="alert ok">✅ No balance due in the budget sheet.</div>`);
  }
  const sts = (currentStatus && currentStatus.vendors) || [];
  const unsigned = sts.filter(s => s.contract !== 'Signed').length;
  const unknownPay = sts.filter(s => s.payment === 'Unknown').length;
  const overduePay = sts.filter(s => s.payment === 'Overdue' || (s.dueDate && s.dueDate < today && s.payment !== 'Paid')).length;
  if (unsigned) alerts.push(`<div class="alert warn">📝 ${unsigned} vendor${unsigned === 1 ? '' : 's'} without a signed contract.</div>`);
  if (overduePay) alerts.push(`<div class="alert due">⏰ ${overduePay} vendor payment${overduePay === 1 ? '' : 's'} overdue.</div>`);
  if (unknownPay) alerts.push(`<div class="alert info">❓ ${unknownPay} vendor payment status${unknownPay === 1 ? '' : 'es'} still unknown — set them below.</div>`);
  $('alerts').innerHTML = alerts.join('');

  // --- budget table ---
  const cats = (b.categories || []).filter(c => (c.actual || 0) > 0 || (c.due || 0) > 0);
  $('budgetTable').innerHTML = `<table class="grid"><tr><th>Category</th><th class="num">Actual</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th></tr>` +
    `<tr class="total"><td><strong>Total</strong> <small>(planned ${fmt$(b.budget_total)})</small></td><td class="num"><strong>${fmt$(b.total_actual)}</strong></td><td class="num">${fmt$(b.total_paid)}</td><td class="num"><strong>${fmt$(b.total_due)}</strong></td><td>${(b.total_due || 0) > 0.005 ? pill('st-due', 'Balance due') : pill('st-paid', 'Settled')}</td></tr>` +
    cats.map(c => `<tr><td>${esc(c.category)}</td><td class="num">${fmt$(c.actual)}</td><td class="num">${fmt$(c.paid)}</td><td class="num">${fmt$(c.due)}</td><td>${budgetPill(c)}</td></tr>`).join('') +
    `</table>`;

  // --- vendor / contract table (editable) ---
  const booked = v.booked || [];
  if (!currentStatus) currentStatus = { updated: todayISO(), vendors: [] };
  if (!Array.isArray(currentStatus.vendors)) currentStatus.vendors = [];
  // ensure every booked vendor has a row
  for (const x of booked) {
    if (!currentStatus.vendors.some(s => (s.name || '').toLowerCase() === (x.vendor || '').toLowerCase())) {
      currentStatus.vendors.push({ name: x.vendor, contract: 'Unknown', payment: 'Unknown', dueDate: '', notes: '' });
    }
  }
  const costOf = (n) => (booked.find(x => (x.vendor || '').toLowerCase() === (n || '').toLowerCase()) || {}).cost || '';
  $('vendorTable').innerHTML = `<table class="grid"><tr><th>Vendor</th><th>Cost</th><th>Contract</th><th>Payment</th><th>Due date</th><th>Notes</th></tr>` +
    currentStatus.vendors.map((s, i) => `<tr><td><strong>${esc(s.name)}</strong></td><td><small>${esc(costOf(s.name) || '—')}</small></td>` +
      `<td><select data-vrow="${i}" data-field="contract">${CONTRACTS.map(c => `<option${c === s.contract ? ' selected' : ''}>${c}</option>`).join('')}</select></td>` +
      `<td><select data-vrow="${i}" data-field="payment">${PAYMENTS.map(c => `<option${c === s.payment ? ' selected' : ''}>${c}</option>`).join('')}</select></td>` +
      `<td><input type="date" data-vrow="${i}" data-field="dueDate" value="${esc(s.dueDate || '')}" /></td>` +
      `<td><input type="text" data-vrow="${i}" data-field="notes" value="${esc(s.notes || '')}" placeholder="notes" /></td></tr>`).join('') +
    `</table><p class="legend">Contract: Draft / Sent / Signed / Expired / Needs Review · Payment: Not Due / Due / Partially Paid / Paid / Overdue</p>`;

  const cards = [];
  cards.push(`<div class="stat"><h4>Files</h4><p>${currentReport.num_files} files, ${currentReport.num_text_parsed} parsed, ${currentReport.timeline.length} dated items.<br>Contracts on file: ${(v.contract_files || []).length}</p></div>`);
  $('statusCards').innerHTML = cards.join('');
}

function onStatusChange(ev) {
  const t = ev.target.closest('[data-vrow]');
  if (!t || !currentStatus) return;
  const row = currentStatus.vendors[+t.dataset.vrow];
  if (!row) return;
  row[t.dataset.field] = t.value;
  currentStatus.updated = todayISO();
  statusDirty = true; persistStatusLocal(); updateStatusDirty();
}

function saveStatus() {
  if (!currentStatus) { setStatus('Nothing to save.'); return; }
  if (!persistStatusLocal()) { setStatus('Could not save in this browser (storage blocked) — use Export JSON.'); return; }
  statusDirty = false; updateStatusDirty();
  setStatus('Statuses saved in this browser. Use Export JSON to share with others.');
}

async function revertStatus() {
  if (!confirm('Discard status edits and reload from file?')) return;
  try { localStorage.removeItem(stKey()); } catch { /* ignore */ }
  statusDirty = false; updateStatusDirty();
  await loadEvent(currentMeta.id);
  showStatus();
}

function downloadStatus() {
  const blob = new Blob([JSON.stringify(currentStatus, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (statusFile || 'status.json').split('/').pop();
  a.click();
}
function exportStatus() {
  if (!currentStatus) return;
  downloadStatus();
  setStatus('Exported statuses JSON (put it in docs/reports/ to share).');
}

init();
