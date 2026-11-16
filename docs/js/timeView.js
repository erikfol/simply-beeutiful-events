// Time view of an event: log time by hand or with a timer, see every entry, and the totals by person and type.
// Each change saves at once to the shared "SBE App Data" folder (see timelog.js).
import { state } from './state.js';
import { $, setStatus, showSection, needSignIn } from './dom.js';
import { isDriveEvent } from './events.js';
import { driveStatus } from './drivebar.js';
import {
  TIME_TYPES, parseDuration, toHM, checkEntry, addEntry, removeEntry, sortEntries, totals, timerMinutes,
  emptyLog, loadLog, changeLog,
} from './timelog.js';
import { fmtLength } from './draft.js';
import { esc, fmtDate, fmt12, todayISO } from './util.js';

// One timer per browser, kept across page reloads: {eventId, eventName, start, stop?}.
const TIMER_KEY = 'sbe-time-timer';
const readTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'); } catch { return null; } };
const writeTimer = (t) => { try { if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t)); else localStorage.removeItem(TIMER_KEY); } catch { /* storage blocked */ } };

let log = emptyLog();
let shownFor = null;   // the event the view belongs to
let loading = false;
let saving = false;
let draft = null;      // form values kept across redraws
let problems = [];     // why the last Add didn't save

const lengthText = (mins) => fmtLength(mins) || '0 min';
const timeOfDay = (isoString) => {
  const d = new Date(isoString);
  return fmt12(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
};
const me = () => { const u = driveStatus().user || {}; return u.displayName || u.emailAddress || ''; };

export async function showTime() {
  const meta = state.currentMeta;
  if (!meta) { setStatus('Pick an event first.'); return; }
  showSection('timeSection');
  startTicker();
  $('timeTitle').textContent = meta.name;
  if (!isDriveEvent(meta)) { $('timeBody').innerHTML = '<p class="empty">Time can be logged for events from Google Drive.</p>'; return; }
  const fresh = shownFor !== meta;
  if (fresh) { shownFor = meta; log = emptyLog(); draft = null; problems = []; }
  loading = true;
  render({ reset: fresh });
  try {
    const saved = await loadLog(meta.driveId);
    if (state.currentMeta !== meta) return;
    log = saved;
  } catch (e) {
    if (state.currentMeta !== meta) return;
    setStatus(`Couldn't load the time log: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
  } finally {
    if (state.currentMeta === meta) { loading = false; render(); }
  }
}

function readForm() {
  const f = $('timeForm');
  if (!f) return null;
  const v = (name) => (f.elements[name] ? f.elements[name].value : '');
  return { date: v('date'), hours: v('hours'), who: v('who'), type: v('type'), what: v('what') };
}

function summaryHtml() {
  const t = totals(log.entries);
  if (!t.count) return `<p class="time-total"><strong>${loading ? 'Loading the time log…' : 'No time logged yet'}</strong>${loading ? '' : ' on this event.'}</p>`;
  const list = (pairs, blank) => pairs.map(([k, m]) => `${esc(k || blank)} <strong>${lengthText(m)}</strong>`).join(' · ');
  return `<p class="time-total"><strong>${lengthText(t.minutes)}</strong> logged on this event, in ${t.count} entr${t.count === 1 ? 'y' : 'ies'}.</p>
    <p class="hint">By person: ${list(t.byWho, 'Someone')}</p>
    ${t.byType.some(([k]) => k) ? `<p class="hint">By type: ${list(t.byType, 'No type')}</p>` : ''}`;
}

function timerHtml(meta) {
  const timer = readTimer();
  if (timer && timer.eventId !== meta.id) {
    return `<p class="timer">⏱ A timer is running for <strong>${esc(timer.eventName || 'another event')}</strong>, started at ${esc(timeOfDay(timer.start))}. Open that event to stop it.</p>`;
  }
  if (timer && timer.stop) {
    return `<p class="timer">⏱ Timer stopped at <strong>${lengthText(timerMinutes(timer.start, Date.parse(timer.stop)))}</strong>. Add what it was for below, then click <strong>Add</strong>.
      <button type="button" class="mini" data-act="timerdiscard">Discard</button></p>`;
  }
  if (timer) {
    const soFar = Math.floor((Date.now() - Date.parse(timer.start)) / 60000);
    return `<p class="timer">⏱ Timer started at ${esc(timeOfDay(timer.start))}. So far: <strong id="timerElapsed">${soFar < 1 ? 'under a minute' : lengthText(soFar)}</strong>.
      <button type="button" class="primary" data-act="timerstop">Stop and log</button>
      <button type="button" class="mini" data-act="timerdiscard">Cancel timer</button></p>`;
  }
  return `<p class="timer"><button type="button" data-act="timerstart">Start timer</button>
    <span class="hint">Or type the time below. The timer keeps running if you close this page.</span></p>`;
}

function formHtml(v) {
  const names = [...new Set([me(), ...log.entries.map(e => e.who)].filter(Boolean))];
  return `<form id="timeForm" class="detailsform timeform">
      <label for="time-date">Date<input id="time-date" name="date" type="date" value="${esc(v.date)}" required /></label>
      <label for="time-hours">How long<input id="time-hours" name="hours" value="${esc(v.hours)}" placeholder="1:30, 1.5 or 45 min" autocomplete="off" required /></label>
      <label for="time-who">Who<input id="time-who" name="who" value="${esc(v.who)}" list="time-names" autocomplete="off" />
        <datalist id="time-names">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist></label>
      <label for="time-type">Type<select id="time-type" name="type"><option value="">(none)</option>${TIME_TYPES.map(t => `<option${t === v.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label class="wide" for="time-what">What it was for<input id="time-what" name="what" value="${esc(v.what)}" placeholder="e.g. Venue walkthrough with the couple" autocomplete="off" /></label>
      ${problems.length ? `<p class="db-warn wide">${problems.map(esc).join(' ')}</p>` : ''}
      <div class="wide"><button type="submit" class="primary"${saving ? ' disabled' : ''}>${saving ? 'Saving…' : 'Add'}</button></div>
    </form>`;
}

function entriesHtml(canSave) {
  if (!log.entries.length) return '';
  const rows = sortEntries(log.entries).map(e => `<tr>
      <td>${esc(fmtDate(e.date))}</td>
      <td>${esc(e.who || '—')}</td>
      <td class="num">${lengthText(e.minutes)}</td>
      <td>${esc(e.type || '')}</td>
      <td>${esc(e.what || '')}</td>
      ${canSave ? `<td><button type="button" class="mini danger" data-act="remove" data-id="${esc(e.id)}"${saving ? ' disabled' : ''}>Remove</button></td>` : ''}
    </tr>`).join('');
  return `<div class="tablewrap"><table class="grid time-table">
      <thead><tr><th scope="col">Date</th><th scope="col">Who</th><th scope="col" class="num">Time</th><th scope="col">Type</th><th scope="col">What</th>${canSave ? '<th scope="col"><span class="sr-only">Remove</span></th>' : ''}</tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

// Draw the view. reset: start the form fresh (another event was opened); otherwise keep what's typed.
function render({ reset = false } = {}) {
  if (!shownFor || $('timeSection').hidden) return;
  if (!reset) { const typed = readForm(); if (typed) draft = typed; }
  const meta = shownFor;
  const canSave = driveStatus().canSave;
  const timer = readTimer();
  let v = draft || { date: todayISO(), hours: '', who: me(), type: '', what: '' };
  // A stopped timer for this event fills in the date and the time (once).
  if (timer && timer.stop && timer.eventId === meta.id && !v.hours) {
    v = { ...v, date: todayISO(new Date(timer.start)), hours: toHM(timerMinutes(timer.start, Date.parse(timer.stop))) };
  }
  $('timeBody').innerHTML = `${summaryHtml()}
    ${canSave ? `${timerHtml(meta)}${formHtml(v)}` : '<p class="db-warn">View only: logging time needs <strong>Editor</strong> access to the shared “SBE App Data” folder (see the Google bar above).</p>'}
    ${entriesHtml(canSave)}`;
}

// onSaved: runs after a successful save and sets the form for what comes next (instead of what was typed).
async function save(change, onSaved) {
  const meta = shownFor;
  let fresh = false;
  saving = true; render();
  setStatus('Saving the time log…');
  try {
    const next = await changeLog(meta.driveId, change);
    if (shownFor !== meta) return;
    log = next;
    if (onSaved) { onSaved(); problems = []; fresh = true; }
    setStatus('Time log saved to Google Drive.');
  } catch (e) {
    setStatus(`Not saved: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
  } finally {
    saving = false;
    if (shownFor === meta) render({ reset: fresh });
  }
}

export function onTimeClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b || !shownFor) return;
  const meta = shownFor;
  const act = b.dataset.act;
  if (act === 'timerstart') {
    writeTimer({ eventId: meta.id, eventName: meta.name, start: new Date().toISOString() });
    setStatus('Timer started.');
    render();
  } else if (act === 'timerstop') {
    const timer = readTimer();
    if (!timer) return;
    writeTimer({ ...timer, stop: new Date().toISOString() });
    const typed = readForm();
    draft = typed ? { ...typed, hours: '' } : null; // the stopped timer fills in the time
    render({ reset: true });
    setStatus('Timer stopped. Add what it was for, then click Add.');
    const what = $('time-what');
    if (what) what.focus();
  } else if (act === 'timerdiscard') {
    const timer = readTimer();
    writeTimer(null);
    if (timer && timer.stop) { const typed = readForm(); draft = typed ? { ...typed, hours: '' } : null; render({ reset: true }); }
    else render();
    setStatus('Timer cleared.');
  } else if (act === 'remove') {
    const e = log.entries.find(x => x.id === b.dataset.id);
    if (!e) return;
    if (!confirm(`Remove ${lengthText(e.minutes)} on ${fmtDate(e.date)}${e.what ? ` (${e.what})` : ''}?`)) return;
    save(list => removeEntry(list, e.id));
  }
}

export function onTimeSubmit(ev) {
  ev.preventDefault();
  if (!shownFor || saving) return;
  const v = readForm();
  const minutes = parseDuration(v.hours);
  problems = checkEntry({ date: v.date, minutes });
  draft = v;
  if (problems.length) { render(); return; }
  const meta = shownFor;
  const by = (driveStatus().user || {}).emailAddress || '';
  save(list => addEntry(list, { date: v.date, minutes, who: v.who, type: v.type, what: v.what, by }), () => {
    const timer = readTimer();
    if (timer && timer.stop && timer.eventId === meta.id) writeTimer(null);
    draft = { date: v.date, hours: '', who: v.who, type: '', what: '' }; // ready for the next entry
  });
}

// Keep a running timer's "so far" up to date without redrawing the form (started the first time the view opens).
let ticker = null;
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const el = $('timerElapsed');
    const timer = readTimer();
    if (!el || !timer || timer.stop) return;
    const soFar = Math.floor((Date.now() - Date.parse(timer.start)) / 60000);
    el.textContent = soFar < 1 ? 'under a minute' : lengthText(soFar);
  }, 20000);
}
