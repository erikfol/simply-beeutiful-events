// Overview (the event hub): at a glance, payments and deadlines with corrections, budget, vendors and
// contacts, and what the app couldn't read. Every fact links to the document it came from.
import { state } from './state.js';
import { $, setStatus, showSection, needSignIn } from './dom.js';
import { deriveActions } from './scan.js';
import { saveCorrections, saveDetails } from './corrections.js';
import { eventDetails, vendorRows } from './details.js';
import { rebuildReport, isDriveEvent } from './events.js';
import { esc, fmtDate, fmt$, fmt12, todayISO, daysBetween } from './util.js';

let fixing = null; // id of the fact whose Fix form is open
let editingDetails = false;
let shownFor = null; // the event the open forms belong to

// Event details: couple, venue, date, guests, getting ready, hotel, other days, notes.
function detailsHtml(meta, report) {
  const d = eventDetails({ meta, report, curated: state.currentCurated, saved: state.details || {} });
  if (editingDetails) {
    return `<form class="detailsform" data-details>
      ${d.fields.map(f => f.key === 'notes'
        ? `<label class="wide" for="det-${f.key}">${esc(f.label)}<textarea id="det-${f.key}" name="${f.key}" rows="2">${esc(f.value)}</textarea></label>`
        : `<label for="det-${f.key}">${esc(f.label)}<input id="det-${f.key}" name="${f.key}" value="${esc(f.value)}" /></label>`).join('')}
      <p class="hint wide">Pre-filled with what the app found. What you save here is shown instead, even after documents are read again. Clear a box to go back to the app's guess.</p>
      <div class="wide"><button type="submit" class="primary">Save details</button> <button type="button" class="mini" data-act="canceldetails">Cancel</button></div>
    </form>`;
  }
  const src = (f) => {
    if (f.edited) return '<span class="pill st-paid">entered by you</span>';
    if (!f.source) return '';
    const name = esc(f.source.split('/').pop());
    return `<small>from ${f.link && /^https:\/\//.test(f.link) ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">${name}</a>` : name}</small>`;
  };
  const rows = [
    ...d.fields.filter(f => f.key !== 'notes').slice(0, 2),
    { key: 'date', label: 'Wedding date', value: meta.weddingDate ? fmtDate(meta.weddingDate) : '' },
    ...d.fields.filter(f => !['couple', 'venue', 'notes'].includes(f.key)),
  ];
  if (d.otherDays.length) rows.push({ key: 'days', label: 'Other days', value: d.otherDays.map(x => `${fmtDate(x.date)}: ${x.title}`).join(' · ') });
  const notes = d.fields.find(f => f.key === 'notes');
  if (notes.value) rows.push(notes);
  return `<dl class="details">${rows.map(f => `<div><dt>${esc(f.label)}</dt><dd>${f.value ? `${esc(f.value)} ${src(f)}` : '<span class="muted">Not found yet</span>'}</dd></div>`).join('')}</dl>
    <p class="details-actions"><button class="mini" data-act="editdetails">Edit details</button></p>`;
}

const docLink = (source) => {
  const f = (state.currentReport.files || []).find(d => d.file === source || d.name === source);
  return f && /^https:\/\//.test(f.webViewLink || '') ? f.webViewLink : '';
};
const sourceHtml = (source) => {
  const link = docLink(source);
  const name = esc(source.split('/').pop());
  return link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${name}</a>` : name;
};

function when(dateIso, today) {
  const d = daysBetween(today, dateIso);
  if (d < 0) return { cls: 'st-due', text: `${-d} day${d === -1 ? '' : 's'} ago`, past: true };
  if (d === 0) return { cls: 'st-due', text: 'Today' };
  if (d <= 30) return { cls: 'st-partial', text: `In ${d} day${d === 1 ? '' : 's'}` };
  return { cls: 'st-na', text: `In ${d} days` };
}

// Payments and deadlines from the documents, plus due dates the planner entered on Status Update.
// A due date entered on Status Update for the same vendor and day as a document payment is one payment, not two.
function allActions() {
  const fromDocs = deriveActions(state.currentReport.timeline);
  const sameVendor = (a, b) => a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase());
  const fromStatus = [];
  for (const v of ((state.currentStatus && state.currentStatus.vendors) || []).filter(v => v.dueDate && v.name)) {
    const match = fromDocs.find(a => a.type === 'payment' && a.date_iso === v.dueDate && sameVendor(a.vendor, v.name));
    if (match) { match.statusPayment = v.payment; continue; }
    if (v.payment === 'Paid') continue;
    fromStatus.push({ id: `status|${v.name}`, type: 'payment', kind: `Payment (${v.payment})`, date_iso: v.dueDate, vendor: v.name, amount: null, source: '', fromStatus: true, snippet: v.notes || '' });
  }
  return [...fromDocs, ...fromStatus].sort((a, b) => a.date_iso.localeCompare(b.date_iso));
}

function actionRow(a, today) {
  const w = when(a.date_iso, today);
  const paid = a.statusPayment === 'Paid';
  const status = [
    a.confirmed ? '<span class="pill st-paid">✓ checked</span>' : '',
    a.statusPayment && a.statusPayment !== 'Unknown' ? `<span class="pill ${paid ? 'st-paid' : 'st-na'}">${esc(a.statusPayment)}</span>` : '',
  ].join(' ');
  const tag = a.corrected ? ' <span class="pill st-partial">corrected</span>' : '';
  const from = a.fromStatus ? '<em>Status Update</em>' : sourceHtml(a.source);
  const actions = a.fromStatus ? '' : `<button class="mini" data-act="ok" data-id="${esc(a.id)}">Looks right</button><button class="mini" data-act="fix" data-id="${esc(a.id)}">Fix</button><button class="mini" data-act="ignore" data-id="${esc(a.id)}">Ignore</button>`;
  let html = `<tr class="${w.past ? 'past' : ''}"><td class="num" data-label="Date">${esc(fmtDate(a.date_iso))}${a.time ? `<br><small>${esc(fmt12(a.time))}</small>` : ''}</td>
    <td data-label="What"><strong>${esc(a.kind)}</strong> · ${esc(a.vendor)}${tag}<br><small>${esc(a.snippet.slice(0, 140))}${a.note ? ` <em>Note: ${esc(a.note)}</em>` : ''}</small></td>
    <td class="num" data-label="Amount">${a.amount != null ? fmt$(a.amount) : '—'}</td>
    <td data-label="When"><span class="pill ${w.cls}">${w.text}</span> ${status}</td>
    <td data-label="From"><small>${from}</small></td><td class="acts">${actions}</td></tr>`;
  if (fixing === a.id) {
    html += `<tr class="fixrow"><td colspan="6"><form data-fix="${esc(a.id)}" class="fixform">
      <label>Date <input type="date" name="date_iso" value="${esc(a.date_iso)}" required /></label>
      <label>Time <input type="time" name="time" value="${esc(a.time || '')}" /></label>
      ${a.type === 'payment' ? `<label>Amount <input type="number" name="amount" step="0.01" min="0" value="${a.amount ?? ''}" /></label>` : ''}
      <label class="wide">Note <input name="note" value="${esc(a.note || '')}" placeholder="e.g. venue moved the due date" /></label>
      <button type="submit" class="primary">Save correction</button><button type="button" class="mini" data-act="cancelfix">Cancel</button>
    </form></td></tr>`;
  }
  return html;
}

export function showOverview() {
  const report = state.currentReport;
  if (!report) { setStatus('Pick an event first.'); return; }
  showSection('overviewSection');
  $('overviewTitle').textContent = state.currentMeta.name;
  if (shownFor !== state.currentMeta) { editingDetails = false; fixing = null; shownFor = state.currentMeta; }
  renderOverview();
}

export function renderOverview() {
  const report = state.currentReport;
  const meta = state.currentMeta;
  if (!report || $('overviewSection').hidden) return;
  const today = todayISO();
  const b = report.budget || {};
  const actions = allActions();
  const upcoming = actions.filter(a => a.date_iso >= today);
  const overdue = actions.filter(a => a.type === 'payment' && a.date_iso < today && !a.confirmed && a.statusPayment !== 'Paid' && daysBetween(a.date_iso, today) <= 60);
  const next = upcoming[0];
  const dayDiff = meta.weddingDate ? daysBetween(today, meta.weddingDate) : null;
  const drive = isDriveEvent();
  const docs = report.files || [];
  const readCount = drive ? (report.num_read || 0) : docs.filter(d => (d.text_len || 0) > 0).length;
  const needsLook = report.needsLook || [];

  // --- at a glance ---
  const tiles = [
    ['Wedding', dayDiff == null ? 'Date unknown' : dayDiff > 0 ? `In ${dayDiff} days` : dayDiff === 0 ? 'Today' : `${-dayDiff} days ago`, meta.weddingDate ? fmtDate(meta.weddingDate) : ''],
    ['Still owed', b.total_due != null ? fmt$(b.total_due) : '—', b.budget_total ? `of ${fmt$(b.total_actual)} (budget ${fmt$(b.budget_total)})` : 'no budget sheet read'],
    ['Next up', next ? `${fmtDate(next.date_iso)}` : 'Nothing dated', next ? `${next.kind} · ${next.vendor}` : ''],
    ['Documents', `${readCount} of ${docs.length} read`, needsLook.length ? `${needsLook.length} need a look` : 'nothing to check'],
  ];
  let html = detailsHtml(meta, report);
  html += `<div class="tiles">${tiles.map(([k, v, s]) => `<div class="tile"><div class="tk">${esc(k)}</div><div class="tv">${esc(v)}</div><div class="ts">${esc(s)}</div></div>`).join('')}</div>`;

  if (state.reading) {
    const pct = Math.round((state.reading.done / state.reading.total) * 100);
    html += `<div class="readbar" role="status">Reading documents: ${state.reading.done} of ${state.reading.total}<div class="bar"><span style="width:${pct}%"></span></div></div>`;
  }
  if (overdue.length) {
    html += `<div class="alert due">⏰ ${overdue.length} payment date${overdue.length === 1 ? '' : 's'} passed in the last 60 days: ${overdue.map(a => `<strong>${esc(a.vendor)}</strong> ${a.amount != null ? fmt$(a.amount) : ''} (${esc(fmtDate(a.date_iso))})`).join('; ')}. Mark each <em>Looks right</em> once it's handled.</div>`;
  }

  // --- payments and deadlines ---
  const past = actions.filter(a => a.date_iso < today);
  html += `<h3>Payments and deadlines</h3>`;
  if (!actions.length) {
    html += `<p class="empty">${state.reading || (drive && report.num_pending) ? 'Still reading the documents…' : 'No payment dates or deadlines were found in the documents.'}</p>`;
  } else {
    const head = `<tr class="head"><th>Date</th><th>What</th><th class="num">Amount</th><th>When</th><th>From</th><th></th></tr>`;
    html += upcoming.length ? `<div class="tablewrap"><table class="grid actions cards">${head}${upcoming.map(a => actionRow(a, today)).join('')}</table></div>` : '<p class="empty">Nothing coming up.</p>';
    if (past.length) html += `<details class="pastlist"${fixing && past.some(a => a.id === fixing) ? ' open' : ''}><summary>Earlier (${past.length})</summary><div class="tablewrap"><table class="grid actions cards">${head}${past.reverse().map(a => actionRow(a, today)).join('')}</table></div></details>`;
  }

  // --- budget ---
  html += `<h3>Budget</h3>`;
  if (b.budget_total || b.total_actual != null) {
    const over = (b.total_actual || 0) - (b.budget_total || 0);
    html += `<p>Planned <strong>${fmt$(b.budget_total)}</strong> · Actual <strong>${fmt$(b.total_actual)}</strong> · Paid <strong>${fmt$(b.total_paid)}</strong> · Still owed <strong>${fmt$(b.total_due)}</strong>${b.budget_total && over > 0 ? ` <span class="pill st-due">${fmt$(over)} over budget</span>` : ''}${b.link || b.file ? ` <small>from ${b.link ? `<a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.file)}</a>` : esc(b.file)}</small>` : ''}</p>`;
    const owed = (b.categories || []).filter(c => (c.due || 0) > 0.005).sort((x, y) => y.due - x.due);
    if (owed.length) html += `<div class="tablewrap"><table class="grid"><tr><th>Still owed by category</th><th class="num">Due</th><th class="num">Paid</th><th class="num">Actual</th></tr>${owed.map(c => `<tr><td>${esc(c.category)}</td><td class="num">${fmt$(c.due)}</td><td class="num">${fmt$(c.paid)}</td><td class="num">${fmt$(c.actual)}</td></tr>`).join('')}</table></div>`;
  } else {
    html += `<p class="empty">${state.reading ? 'Still reading…' : 'No budget read yet. The app looks for a spreadsheet with "Budget" in its name (tab "Budget Calculator").'}</p>`;
  }

  // --- vendors and contacts ---
  const vrows = vendorRows(report);
  html += `<h3>Vendors and contacts</h3>`;
  if (vrows.length) {
    const lines = (list, fmt) => list.map(fmt).join('<br>');
    const sourceLinks = (sources) => sources.map(s => {
      const name = esc((s.file || '').split('/').pop());
      return s.link && /^https:\/\//.test(s.link) ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">${name}</a>` : name;
    }).join('<br>');
    html += `<div class="tablewrap"><table class="grid vendors cards"><tr class="head"><th>Vendor</th><th>For</th><th>Contact</th><th>Email</th><th>Phone</th><th>Cost</th><th>Source</th></tr>${vrows.map(v => `<tr>
      <td data-label="Vendor"><strong>${esc(v.vendor)}</strong>${v.location ? `<br><small>${esc(v.location)}</small>` : ''}</td>
      <td data-label="For">${esc(v.role) || '—'}</td>
      <td data-label="Contact">${esc(v.contact) || '—'}</td>
      <td data-label="Email">${v.emails.length ? lines(v.emails, e => `<a href="mailto:${esc(e)}">${esc(e)}</a>`) : '—'}</td>
      <td data-label="Phone" class="nowrap">${v.phones.length ? lines(v.phones, p => `<a href="tel:${esc(p.replace(/[^\d+]/g, ''))}">${esc(p)}</a>`) : '—'}</td>
      <td data-label="Cost"><small>${esc(v.cost) || '—'}</small></td>
      <td data-label="Source"><small>${sourceLinks(v.sources) || '—'}</small></td></tr>`).join('')}</table></div>`;
    html += `<p class="hint">Vendors from the vendor sheet (tab "Booked") come first, with phones and emails from their contracts added; the rest were found in the event's documents.</p>`;
  } else {
    html += `<p class="empty">${state.reading ? 'Still reading…' : 'No vendor list or contacts found yet.'}</p>`;
  }

  // --- needs a look ---
  if (needsLook.length) {
    html += `<h3>Needs a look</h3><ul class="needslook">${needsLook.map(n => `<li>${n.file ? `${n.link ? `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.file)}</a>` : esc(n.file)}: ` : ''}${esc(n.problem)}</li>`).join('')}</ul>`;
  }
  $('overviewBody').innerHTML = html;
}

async function saveCorrection(id, value) {
  const meta = state.currentMeta;
  const next = { ...state.corrections };
  if (value) next[id] = { ...value, at: new Date().toISOString() }; else delete next[id];
  try {
    await saveCorrections(meta, next);
    if (state.currentMeta !== meta) return;
    state.corrections = next;
    fixing = null;
    rebuildReport();
    setStatus(value && value.status === 'ignored' ? 'Hidden. It stays hidden when the documents are read again.' : 'Correction saved. It sticks when the documents are read again.');
  } catch (e) {
    setStatus(`Correction not saved: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
  }
}

export function onOverviewClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b) return;
  const id = b.dataset.id;
  if (b.dataset.act === 'ok') saveCorrection(id, { status: 'ok' });
  else if (b.dataset.act === 'ignore') saveCorrection(id, { status: 'ignored' });
  else if (b.dataset.act === 'editdetails') { editingDetails = true; renderOverview(); }
  else if (b.dataset.act === 'canceldetails') { editingDetails = false; renderOverview(); }
  else if (b.dataset.act === 'fix') { fixing = id; renderOverview(); }
  else if (b.dataset.act === 'cancelfix') { fixing = null; renderOverview(); }
}

// Save only what differs from the app's own guess, so later document reading can still fill the rest.
async function submitDetails(form) {
  const meta = state.currentMeta;
  const guesses = eventDetails({ meta, report: state.currentReport, curated: state.currentCurated, saved: {} });
  const f = new FormData(form);
  const next = {};
  for (const g of guesses.fields) {
    const v = String(f.get(g.key) || '').trim();
    if (v && v !== g.value) next[g.key] = v;
  }
  try {
    await saveDetails(meta, next);
    if (state.currentMeta !== meta) return;
    state.details = next;
    editingDetails = false;
    renderOverview();
    setStatus('Event details saved.');
  } catch (e) {
    setStatus(`Details not saved: ${e.message}`);
    if (e.name === 'NeedsSignIn') needSignIn();
  }
}

export function onOverviewSubmit(ev) {
  if (ev.target.closest('form[data-details]')) { ev.preventDefault(); submitDetails(ev.target); return; }
  const form = ev.target.closest('form[data-fix]');
  if (!form) return;
  ev.preventDefault();
  const f = new FormData(form);
  const value = { status: 'edited', date_iso: f.get('date_iso'), time: f.get('time') || '', note: (f.get('note') || '').trim() };
  if (f.has('amount') && f.get('amount') !== '') value.amount = Number(f.get('amount'));
  saveCorrection(form.dataset.fix, value);
}
