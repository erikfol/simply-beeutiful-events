// Public page for an online timeline link (timeline.html#<id>): one person's or vendor's part of an event's
// timeline, read from Google Drive with the public API key. No sign-in; nothing here can change anything.
import { PUBLIC_API_KEY } from './config.js';
import { fetchSnapshot, linkId, LinkError } from './sharedTimeline.js';
import { fmtLength, stopLength, spanText } from './draft.js';
import { esc, fmtDate, fmt12 } from './util.js';

const $ = (id) => document.getElementById(id);

const updatedText = (isoString) => {
  const d = new Date(isoString || '');
  return isNaN(d) ? '' : d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

function stop(it) {
  const len = fmtLength(stopLength(it));
  return `<li class="st-stop">
      <div class="st-time">${esc(fmt12(it.time))}${it.timeEnd ? `<span>to ${esc(fmt12(it.timeEnd))}</span>` : ''}${len ? `<span>${esc(len)}</span>` : ''}</div>
      <div class="st-what"><strong>${esc(it.title)}</strong>${it.estimate ? ' <em class="st-tbc">to be confirmed</em>' : ''}${it.detail ? `<p>${esc(it.detail)}</p>` : ''}</div>
    </li>`;
}

function render(snap) {
  const e = snap.event;
  const who = snap.label || snap.audience;
  const whole = snap.audience === 'Whole timeline';
  document.title = `${e.name || 'Timeline'}${who ? ` · ${who}` : ''} · Simply Beeutiful Events`;
  const meta = [e.date ? fmtDate(e.date) : '', e.venue].filter(Boolean).map(esc).join(' · ');
  const days = snap.days.map(d => {
    const span = spanText(d.items);
    return `<section class="st-day">
        <h3>${esc(fmtDate(d.date))}${d.title ? ` <span>${esc(d.title)}</span>` : ''}</h3>
        ${span ? `<p class="dayspan">${whole ? 'Day runs' : 'Your times'} ${esc(span)}</p>` : ''}
        <ol class="st-stops">${d.items.map(stop).join('')}</ol>
      </section>`;
  }).join('');
  $('stBody').innerHTML = `
    <div class="st-head">
      ${who ? `<p class="st-for">${esc(who)}${snap.label && !whole ? ` <small>(${esc(snap.audience)})</small>` : ''}</p>` : ''}
      <h2>${esc(e.name || 'Event timeline')}</h2>
      ${meta ? `<p class="st-meta">${meta}</p>` : ''}
    </div>
    ${days || '<p class="empty">Nothing on this timeline yet. Check back later.</p>'}
    <div class="st-foot">
      <p class="hint">${snap.updated ? `Last updated ${esc(updatedText(snap.updated))}. ` : ''}Times marked <em>to be confirmed</em> may still change; this page always shows the latest version.</p>
      <button type="button" class="mini" id="stPrint">Print or save as PDF</button>
    </div>`;
  $('stPrint').addEventListener('click', () => window.print());
}

async function load() {
  $('stBody').innerHTML = '<p class="empty">Loading the timeline…</p>';
  try {
    render(await fetchSnapshot(linkId(location.hash), PUBLIC_API_KEY));
  } catch (e) {
    $('stBody').innerHTML = `<p class="${e instanceof LinkError ? 'empty' : 'db-warn'}">${esc(e.message)}</p>`;
  }
}

window.addEventListener('hashchange', load);
load();
