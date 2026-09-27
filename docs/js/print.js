// Branded, printer-friendly run sheet for the current view (full timeline or one vendor/role).
// The browser's print dialog saves it as a PDF.
import { state } from './state.js';
import { $, setStatus } from './dom.js';
import { itemInView, roleLabel } from './roles.js';
import { esc, fmtDate, fmt12, todayISO } from './util.js';

export function buildPrintSheet() {
  const meta = state.currentMeta;
  const curated = state.currentCurated;
  const role = state.viewRole;
  const sheet = $('printSheet');
  if (!meta || !curated) { sheet.innerHTML = ''; return 0; }

  let count = 0;
  const daysHtml = curated.days.map(day => {
    const items = day.items.filter(it => itemInView(it, role));
    if (!items.length) return '';
    count += items.length;
    return `<section class="ps-day">
      <h2>${esc(fmtDate(day.date))} <span>${esc(day.title)}</span></h2>
      <table>${items.map(it => `<tr>
        <td class="ps-time">${esc(fmt12(it.time))}${it.timeEnd ? `<br><span>to ${esc(fmt12(it.timeEnd))}</span>` : ''}</td>
        <td><strong>${esc(it.title)}</strong>${it.confidence === 'confirmed' ? '' : ' <em class="ps-est">estimate</em>'}${it.detail ? `<div>${esc(it.detail)}</div>` : ''}</td>
      </tr>`).join('')}</table>
    </section>`;
  }).join('');

  const audience = role ? `${roleLabel(role)} timeline` : 'Full timeline';
  sheet.innerHTML = `
    <div class="ps-head">
      <img src="sbe-logo.png" alt="" />
      <div>
        <div class="ps-brand">Simply Beeutiful Events</div>
        <h1>${esc(meta.name)}</h1>
        <div class="ps-meta">${esc(meta.venue || '')}${meta.weddingDate ? ` · ${esc(fmtDate(meta.weddingDate))}` : ''}</div>
      </div>
      <div class="ps-audience">${esc(audience)}</div>
    </div>
    ${daysHtml || '<p>No stops in this view.</p>'}
    <div class="ps-foot">Prepared by Simply Beeutiful Events on ${esc(fmtDate(todayISO()))}. Times marked <em>estimate</em> are still being confirmed.</div>`;
  return count;
}

export function printTimeline() {
  if (!state.currentCurated) { setStatus('Nothing to print yet. Generate a draft or add a day first.'); return; }
  const count = buildPrintSheet();
  setStatus(`Printing ${count} stops. Choose "Save as PDF" as the printer to get a PDF.`);
  window.print();
}
