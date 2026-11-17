// "At a glance" on the home page: upcoming events, checklist tasks due across all events, payment dates and
// deadlines from the contracts, vendor insurance to renew and open to-dos. Each item links to its event.
import { $ } from './dom.js';
import { loadDashboard, AHEAD_DAYS, RECENT_DAYS } from './dashboard.js';
import { esc, fmt$, todayISO } from './util.js';

let seq = 0;
let last = null; // {status, events} the section was last drawn for
let events = [];

const shortDate = (d) => { try { return new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; } };
const eventName = (e) => esc(e.name.replace(/^\S+\s+/, '')); // "6.12.27 Harper-Bennett Wedding" -> "Harper-Bennett Wedding"
const eventUrl = (e, view = '') => `events.html?event=${encodeURIComponent(e.id)}${view ? `&view=${view}` : ''}`;
const daysText = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday' : d < 0 ? `${-d} days ago` : `in ${d} days`);
const lateText = (d) => (d === -1 ? '1 day late' : `${-d} days late`);

export function initDashboard() {
  $('dashCard').addEventListener('click', (ev) => {
    if (ev.target.closest('button[data-act="dashrefresh"]') && last) showDashboard(last.status, last.events);
  });
}

// Checklist tasks link to their event's Checklist; to-dos to the To Do page.
function taskList(rows, late) {
  return `<ul class="dash-list">${rows.map(({ event, task, days, todo }) => {
    const href = todo ? `todo.html#t-${encodeURIComponent(todo.id)}` : eventUrl(event, 'checklist');
    const where = [todo ? 'To Do' : '', event ? eventName(event) : ''].filter(Boolean).join(' · ');
    return `<li>
      <a href="${esc(href)}"><strong>${esc(task.title)}</strong></a>
      <span class="dash-sub">${where}${task.who ? ` · ${esc(task.who)}` : ''} · ${late ? `<span class="ck-late">${lateText(days)}</span>` : `${esc(shortDate(task.due))} (${daysText(days)})`}</span>
    </li>`;
  }).join('')}</ul>`;
}

function moneyList(rows, passed) {
  return `<ul class="dash-list">${rows.map(({ event, action: a, days }) => `<li>
      <a href="${esc(eventUrl(event))}"><strong>${esc(a.kind)}${a.amount != null ? ` ${esc(fmt$(a.amount))}` : ''}</strong> · ${esc(a.vendor || 'vendor')}</a>
      <span class="dash-sub">${eventName(event)} · ${esc(shortDate(a.date_iso))} (${passed ? `<span class="ck-late">${daysText(days)}</span>` : daysText(days)})${a.statusPayment && a.statusPayment !== 'Unknown' ? ` · ${esc(a.statusPayment)}` : ''}</span>
    </li>`).join('')}</ul>`;
}

function body(d) {
  const block = (title, count, inner, cls = '') => `<section class="dash-block ${cls}"><h3>${title}${count != null ? ` <small>${count}</small>` : ''}</h3>${inner}</section>`;
  const none = (text) => `<p class="hint">${text}</p>`;

  const coming = d.upcoming.length
    ? `<ul class="dash-list">${d.upcoming.slice(0, 8).map(({ event, days, open, overdue, pkg }) => `<li>
        <a href="${esc(eventUrl(event))}"><strong>${eventName(event)}</strong></a>
        <span class="dash-sub">${esc(shortDate(event.weddingDate))} · ${daysText(days)}${pkg ? ` · ${esc(pkg)}` : ` · <a href="${esc(eventUrl(event, 'checklist'))}">choose package</a>`}${open ? ` · ${open} open task${open === 1 ? '' : 's'}` : ''}${overdue ? ` · <span class="ck-late">${overdue} overdue</span>` : ''}</span>
      </li>`).join('')}</ul>${d.upcoming.length > 8 ? none(`And ${d.upcoming.length - 8} more in the Event Manager.`) : ''}`
    : none('No upcoming events in the events folder.');

  const t = d.tasks;
  const taskCount = t.overdue.length + t.soon.length + t.month.length;
  const tasks = taskCount
    ? [
      t.overdue.length ? `<h4 class="ck-late">Overdue</h4>${taskList(t.overdue, true)}` : '',
      t.soon.length ? `<h4>Due this week</h4>${taskList(t.soon, false)}` : '',
      t.month.length ? `<h4>Next ${AHEAD_DAYS} days</h4>${taskList(t.month, false)}` : '',
    ].join('')
    : none(`Nothing due in the next ${AHEAD_DAYS} days. Tasks come from each event's Checklist and from to-dos with a due date.`);

  const m = d.money;
  const moneyCount = m.passed.length + m.ahead.length;
  let money = moneyCount
    ? [
      m.passed.length ? `<h4 class="ck-late">Payment dates passed</h4>${moneyList(m.passed, true)}<p class="hint">Mark each one <em>Looks right</em> on the event's Overview once it's handled, or <em>Paid</em> on Status Update.</p>` : '',
      m.ahead.length ? `<h4>Next ${AHEAD_DAYS} days</h4>${moneyList(m.ahead, false)}` : '',
    ].join('')
    : none(`No payment dates or deadlines in the next ${AHEAD_DAYS} days.`);
  if (d.unread.length) {
    money += none(`Not read yet: ${d.unread.map(e => `<a href="${esc(eventUrl(e))}">${eventName(e)}</a>`).join(', ')}. Open each once in the Event Manager so its contract dates show here.`);
  }

  const also = [];
  if (d.insurance.length) {
    also.push(`<p class="db-warn">⚠️ Insurance to renew: ${d.insurance.map(x => `<a href="vendors.html#v-${esc(x.vendor.id)}">${esc(x.vendor.name)}</a> (${x.ins.days < 0 ? 'ended' : `ends ${daysText(x.ins.days)}`})`).join(', ')}.</p>`);
  }
  const td = d.todo;
  if (td.inProgress || td.notStarted) also.push(`<p class="hint"><a href="todo.html">To Do</a>: ${[td.inProgress && `${td.inProgress} in progress`, td.notStarted && `${td.notStarted} not started`].filter(Boolean).join(', ')}.</p>`);

  return `<div class="dash-grid">
      ${block('Coming up', d.upcoming.length || null, coming)}
      ${block('Tasks', taskCount || null, tasks)}
      ${block('From the contracts', moneyCount || null, money)}
    </div>
    ${also.join('')}
    <p class="dash-foot"><button type="button" class="mini" data-act="dashrefresh">Refresh</button>
      <span class="hint">Events from the last ${RECENT_DAYS} days and all upcoming ones. Payment dates come from what each event's documents said when it was last opened.</span></p>`;
}

// Draw the section for the signed-in person and the events in the chosen folder; hide it otherwise.
export async function showDashboard(status, evs = events) {
  events = evs || [];
  last = { status, events };
  const card = $('dashCard');
  if (!status || !status.signedIn || !status.folder || !status.access || status.access.state === 'waiting') { card.hidden = true; return; }
  card.hidden = false;
  const ticket = ++seq;
  if (!$('dashBody').innerHTML.trim()) $('dashBody').innerHTML = '<p class="hint">Gathering every event…</p>';
  try {
    const d = await loadDashboard(events, todayISO());
    if (ticket !== seq) return;
    $('dashBody').innerHTML = body(d);
  } catch (e) {
    if (ticket !== seq) return;
    $('dashBody').innerHTML = `<p class="db-warn">Couldn't gather the events: ${esc(e.message)}</p>`;
  }
}
