// Calendar page entry point: a month grid of every event, open checklist task and contract date, with a
// day-by-day list for the month underneath (the only view on a phone). Needs Google sign-in; reads only.
import { $, setStatus, needSignIn } from './dom.js';
import { isConfigured } from './google.js';
import { initDriveBar, driveStatus } from './drivebar.js';
import { loadEventData } from './dashboard.js';
import { loadTodos } from './todo.js';
import { calendarEvents, calendarItems, byDate, monthGrid, shiftMonth, parseMonth, monthKey, eventTitle } from './calendar.js';
import { esc, todayISO } from './util.js';

const TODAY = todayISO();
let events = [];
let items = [];
let loaded = false;
let seq = 0;
let ym = parseMonth(location.hash) || { y: +TODAY.slice(0, 4), m: +TODAY.slice(5, 7) };
const show = { event: true, task: true, money: true };
const MAX_CHIPS = 3;

const KIND = { event: 'Event', task: 'Task', payment: 'Payment', deadline: 'Deadline' };
const visible = (it) => (it.kind === 'event' ? show.event : it.kind === 'task' ? show.task : show.money);
const eventUrl = (e, view = '') => `events.html?event=${encodeURIComponent(e.id)}${view ? `&view=${view}` : ''}`;
const itemUrl = (it) => (it.todo ? `todo.html#t-${encodeURIComponent(it.todo.id)}` : eventUrl(it.event, it.kind === 'task' ? 'checklist' : ''));
const monthName = (y, m) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const weekdayNames = () => Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2027, 0, 3 + i)).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }));

function message() {
  const s = driveStatus();
  if (!isConfigured()) return 'Google sign-in is not set up for this copy of the app.';
  if (!s.signedIn) return 'Sign in with Google to see the calendar.';
  if (!s.folder) return 'Choose the SBE events folder above.';
  if (s.access && s.access.state === 'waiting') return 'The shared "SBE App Data" folder isn\'t set up yet (see the note above).';
  if (!loaded) return 'Gathering every event…';
  return '';
}

// What a chip or list line says, and the extra detail for its tooltip.
function describe(it) {
  if (it.kind === 'event') return { text: it.title, more: it.pkg || '' };
  const ev = it.event ? eventTitle(it.event) : '';
  if (it.kind === 'task') return { text: it.title, more: [it.todo ? 'To Do' : '', ev, it.who].filter(Boolean).join(' · ') };
  return { text: `${it.title}${it.vendor ? ` · ${it.vendor}` : ''}`, more: [ev, it.paid ? 'Paid' : it.late ? 'Date passed, not marked paid' : ''].filter(Boolean).join(' · ') };
}

const cls = (it) => `k-${it.kind}${it.late ? ' late' : ''}${it.paid ? ' paid' : ''}`;

function chip(it) {
  const { text, more } = describe(it);
  return `<a class="cal-chip ${cls(it)}" href="${esc(itemUrl(it))}" title="${esc(`${KIND[it.kind]}: ${text}${more ? ` (${more})` : ''}`)}">${esc(text)}</a>`;
}

function gridHtml(days) {
  const head = weekdayNames().map(n => `<div class="cal-wd">${esc(n)}</div>`).join('');
  const cells = monthGrid(ym.y, ym.m).flat().map(({ date, inMonth }) => {
    const list = (days.get(date) || []).filter(visible);
    const more = list.length - MAX_CHIPS;
    return `<div class="cal-day${inMonth ? '' : ' out'}${date === TODAY ? ' today' : ''}">
        <button type="button" class="cal-num" data-day="${date}" aria-label="${esc(dayLabel(date))}${list.length ? `, ${list.length} item${list.length === 1 ? '' : 's'}` : ''}">${+date.slice(8)}</button>
        ${list.slice(0, MAX_CHIPS).map(chip).join('')}
        ${more > 0 ? `<button type="button" class="cal-more" data-day="${date}">+${more} more</button>` : ''}
      </div>`;
  }).join('');
  return `${head}${cells}`;
}

function agendaHtml(days) {
  const key = monthKey(ym.y, ym.m);
  const dates = [...days.keys()].filter(d => d.startsWith(key)).sort();
  const sections = dates.map(d => {
    const list = days.get(d).filter(visible);
    if (!list.length) return '';
    return `<section class="cal-agday${d === TODAY ? ' today' : ''}" id="d-${d}">
        <h3>${esc(dayLabel(d))}${d === TODAY ? ' <small>Today</small>' : ''}</h3>
        <ul class="dash-list">${list.map(it => { const { text, more } = describe(it); return `<li class="${cls(it)}">
          <a href="${esc(itemUrl(it))}"><span class="cal-key ${cls(it)}"></span><strong>${esc(text)}</strong></a>
          <span class="dash-sub">${esc(KIND[it.kind])}${more ? ` · ${esc(more)}` : ''}</span></li>`; }).join('')}</ul>
      </section>`;
  }).join('');
  return sections || `<p class="empty">Nothing in ${esc(monthName(ym.y, ym.m))}${show.event && show.task && show.money ? '' : ' with these filters'}.</p>`;
}

function render() {
  const msg = message();
  $('calMsg').textContent = msg;
  $('calMsg').hidden = !msg;
  $('calCard').hidden = !!msg;
  if (msg) return;
  $('calTitle').textContent = monthName(ym.y, ym.m);
  const days = byDate(items);
  $('calGrid').innerHTML = gridHtml(days);
  $('calAgenda').innerHTML = agendaHtml(days);
}

function goTo(next) {
  ym = next;
  try { history.replaceState(null, '', `#${monthKey(ym.y, ym.m)}`); } catch { /* not important */ }
  render();
}

async function reload() {
  const s = driveStatus();
  if (!s.signedIn || !s.folder || !s.access || s.access.state === 'waiting') { loaded = false; items = []; render(); return; }
  const ticket = ++seq;
  loaded = false; render();
  try {
    const recent = calendarEvents(events, TODAY);
    const [perEvent, todos] = await Promise.all([loadEventData(recent), loadTodos().catch(() => null)]);
    if (ticket !== seq) return;
    items = calendarItems({ events, perEvent, today: TODAY, todos });
    loaded = true;
    const unread = recent.filter(e => (perEvent.get(e.driveId) || {}).actions == null).length;
    setStatus(unread ? `Contract dates show for events opened at least once in the Event Manager (${unread} not opened yet).` : '');
  } catch (e) {
    if (ticket !== seq) return;
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Couldn't gather the events: ${e.message}`);
    loaded = true; items = [];
  }
  render();
}

function init() {
  render();
  $('calPrev').addEventListener('click', () => goTo(shiftMonth(ym.y, ym.m, -1)));
  $('calNext').addEventListener('click', () => goTo(shiftMonth(ym.y, ym.m, 1)));
  $('calToday').addEventListener('click', () => goTo({ y: +TODAY.slice(0, 4), m: +TODAY.slice(5, 7) }));
  for (const [id, key] of [['calShowEvent', 'event'], ['calShowTask', 'task'], ['calShowMoney', 'money']]) {
    $(id).addEventListener('change', (e) => { show[key] = e.target.checked; render(); });
  }
  // A day number or "+N more" scrolls to that day in the list below.
  $('calGrid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-day]');
    if (!b) return;
    const el = document.getElementById(`d-${b.dataset.day}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  window.addEventListener('hashchange', () => { const p = parseMonth(location.hash); if (p) { ym = p; render(); } });
  // The Google bar calls this with the folder's events after sign-in, choosing a folder, Refresh and sign-out.
  initDriveBar((evs) => { events = evs || []; reload(); });
}

init();
