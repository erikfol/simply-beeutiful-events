// Status Update view: countdown, validation alerts, budget table, editable vendor/contract table.
import { state } from './state.js';
import { $, setStatus, updateStatusDirty, downloadJSON, showSection, needSignIn } from './dom.js';
import { persistStatusLocal, clearStatusLocal } from './storage.js';
import { loadEvent, isDriveEvent } from './events.js';
import { writeEventData } from './appdata.js';
import { dueCategories, findIssues } from './checks.js';
import { esc, fmtDate, fmt$, todayISO, daysBetween } from './util.js';

const CONTRACTS = ['Unknown', 'Draft', 'Sent', 'Signed', 'Expired', 'Needs Review'];
const PAYMENTS = ['Unknown', 'Not Due', 'Due', 'Partially Paid', 'Paid', 'Overdue'];

export function showStatus() {
  const report = state.currentReport;
  if (!report) { setStatus('Pick an event first.'); return; }
  showSection('statusSection');
  $('statusTitle').textContent = state.currentMeta.name;

  const now = new Date();
  const today = todayISO(now);
  const wDate = state.currentMeta.weddingDate;
  const dayDiff = wDate ? daysBetween(today, wDate) : null;
  let countdown;
  if (dayDiff == null) countdown = 'Wedding date unknown.';
  else if (dayDiff > 1) countdown = `⏳ ${dayDiff} days until the wedding (${fmtDate(wDate)}).`;
  else if (dayDiff === 1) countdown = `⏳ Wedding is TOMORROW (${fmtDate(wDate)}).`;
  else if (dayDiff === 0) countdown = `🎉 Wedding is TODAY (${fmtDate(wDate)}).`;
  else countdown = `✅ Wedding was ${Math.abs(dayDiff)} day(s) ago (${fmtDate(wDate)}). Reviewing close-out / balances.`;
  $('todayLine').textContent = `Today is ${now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. ${countdown}`;

  const b = report.budget || {};
  const v = report.vendors || {};
  const dueCats = dueCategories(b);
  renderStatusDashboard(b, v, dueCats, today);

  const upcoming = report.timeline.filter(e => e.date_iso >= today).slice(0, 15);
  const past = report.timeline.filter(e => e.date_iso < today).slice(-10).reverse();
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

function pill(cls, txt) { return `<span class="pill ${cls}">${esc(txt)}</span>`; }
function budgetPill(c) {
  if ((c.due || 0) <= 0.005 && (c.actual || 0) > 0) return pill('st-paid', 'Paid');
  if ((c.paid || 0) > 0) return pill('st-partial', 'Partially paid');
  if ((c.due || 0) > 0.005) return pill('st-due', 'Due');
  return pill('st-na', '—');
}

function renderValidation(b, today) {
  const issues = findIssues({
    timeline: state.currentReport.timeline,
    curated: state.currentCurated,
    vendors: (state.currentStatus && state.currentStatus.vendors) || [],
    budget: b,
    weddingDate: state.currentMeta.weddingDate,
    today,
    checkMissing: state.currentReport.source !== 'drive',
  });
  const el = $('validation');
  if (!issues.length) { el.innerHTML = '<div class="alert ok">✅ Timeline looks consistent — no conflicts or missing items detected.</div>'; return; }
  const icon = { high: '🔴', warn: '🟡', info: '🔵' };
  el.innerHTML = `<h3>Needs attention (${issues.length})</h3>` +
    issues.map(i => `<div class="alert ${i.level === 'high' ? 'due' : i.level === 'warn' ? 'warn' : 'info'}">${icon[i.level]} ${i.msg}</div>`).join('');
}

function renderStatusDashboard(b, v, dueCats, today) {
  const report = state.currentReport;
  renderValidation(b, today);
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
  const sts = (state.currentStatus && state.currentStatus.vendors) || [];
  const unsigned = sts.filter(s => s.contract !== 'Signed').length;
  const unknownPay = sts.filter(s => s.payment === 'Unknown').length;
  const overduePay = sts.filter(s => s.payment === 'Overdue' || (s.dueDate && s.dueDate < today && s.payment !== 'Paid')).length;
  if (unsigned) alerts.push(`<div class="alert warn">📝 ${unsigned} vendor${unsigned === 1 ? '' : 's'} without a signed contract.</div>`);
  if (overduePay) alerts.push(`<div class="alert due">⏰ ${overduePay} vendor payment${overduePay === 1 ? '' : 's'} overdue.</div>`);
  if (unknownPay) alerts.push(`<div class="alert info">❓ ${unknownPay} vendor payment status${unknownPay === 1 ? '' : 'es'} still unknown — set them below.</div>`);
  if (report.source === 'drive') {
    alerts.length = 0;
    alerts.push(`<div class="alert info">📄 Budget totals, the vendor list and due dates will be read from this event's documents in the next phase. For now, add vendors below and track their contract and payment status; it saves to Google Drive.</div>`);
    if (unsigned) alerts.push(`<div class="alert warn">📝 ${unsigned} vendor${unsigned === 1 ? '' : 's'} without a signed contract.</div>`);
    if (overduePay) alerts.push(`<div class="alert due">⏰ ${overduePay} vendor payment${overduePay === 1 ? '' : 's'} overdue.</div>`);
  }
  $('alerts').innerHTML = alerts.join('');

  // --- budget table ---
  const cats = (b.categories || []).filter(c => (c.actual || 0) > 0 || (c.due || 0) > 0);
  $('budgetTable').innerHTML = `<table class="grid"><tr><th>Category</th><th class="num">Actual</th><th class="num">Paid</th><th class="num">Due</th><th>Status</th></tr>` +
    `<tr class="total"><td><strong>Total</strong> <small>(planned ${fmt$(b.budget_total)})</small></td><td class="num"><strong>${fmt$(b.total_actual)}</strong></td><td class="num">${fmt$(b.total_paid)}</td><td class="num"><strong>${fmt$(b.total_due)}</strong></td><td>${(b.total_due || 0) > 0.005 ? pill('st-due', 'Balance due') : pill('st-paid', 'Settled')}</td></tr>` +
    cats.map(c => `<tr><td>${esc(c.category)}</td><td class="num">${fmt$(c.actual)}</td><td class="num">${fmt$(c.paid)}</td><td class="num">${fmt$(c.due)}</td><td>${budgetPill(c)}</td></tr>`).join('') +
    `</table>`;

  // --- vendor / contract table (editable) ---
  const booked = v.booked || [];
  if (!state.currentStatus) state.currentStatus = { updated: todayISO(), vendors: [] };
  const status = state.currentStatus;
  if (!Array.isArray(status.vendors)) status.vendors = [];
  // ensure every booked vendor has a row
  for (const x of booked) {
    if (!status.vendors.some(s => (s.name || '').toLowerCase() === (x.vendor || '').toLowerCase())) {
      status.vendors.push({ name: x.vendor, contract: 'Unknown', payment: 'Unknown', dueDate: '', notes: '' });
    }
  }
  const costOf = (n) => (booked.find(x => (x.vendor || '').toLowerCase() === (n || '').toLowerCase()) || {}).cost || '';
  $('vendorTable').innerHTML = `<table class="grid"><tr><th>Vendor</th><th>Cost</th><th>Contract</th><th>Payment</th><th>Due date</th><th>Notes</th></tr>` +
    status.vendors.map((s, i) => `<tr><td>${booked.some(x => (x.vendor || '').toLowerCase() === (s.name || '').toLowerCase()) ? `<strong>${esc(s.name)}</strong>` : `<input type="text" data-vrow="${i}" data-field="name" value="${esc(s.name || '')}" placeholder="Vendor name" aria-label="Vendor name" />`}</td><td><small>${esc(costOf(s.name) || '—')}</small></td>` +
      `<td><select data-vrow="${i}" data-field="contract">${CONTRACTS.map(c => `<option${c === s.contract ? ' selected' : ''}>${c}</option>`).join('')}</select></td>` +
      `<td><select data-vrow="${i}" data-field="payment">${PAYMENTS.map(c => `<option${c === s.payment ? ' selected' : ''}>${c}</option>`).join('')}</select></td>` +
      `<td><input type="date" data-vrow="${i}" data-field="dueDate" value="${esc(s.dueDate || '')}" /></td>` +
      `<td><input type="text" data-vrow="${i}" data-field="notes" value="${esc(s.notes || '')}" placeholder="notes" /></td></tr>`).join('') +
    `</table><button type="button" class="mini" data-act="addvendor">+ Add vendor</button><p class="legend">Contract: Draft / Sent / Signed / Expired / Needs Review · Payment: Not Due / Due / Partially Paid / Paid / Overdue</p>`;

  $('statusCards').innerHTML = `<div class="stat"><h4>Files</h4><p>${report.num_files} files, ${report.num_text_parsed} parsed, ${report.timeline.length} dated items.<br>Contracts on file: ${(v.contract_files || []).length}</p></div>`;
}

export function onStatusChange(ev) {
  const t = ev.target.closest('[data-vrow]');
  if (!t || !state.currentStatus) return;
  const row = state.currentStatus.vendors[+t.dataset.vrow];
  if (!row) return;
  row[t.dataset.field] = t.value;
  state.currentStatus.updated = todayISO();
  state.statusDirty = true; persistStatusLocal(); updateStatusDirty();
}

export function onStatusClick(ev) {
  if (!ev.target.closest('[data-act="addvendor"]')) return;
  if (!state.currentStatus) state.currentStatus = { updated: todayISO(), vendors: [] };
  state.currentStatus.vendors.push({ name: '', contract: 'Unknown', payment: 'Unknown', dueDate: '', notes: '' });
  state.statusDirty = true; persistStatusLocal(); updateStatusDirty();
  showStatus();
  const inputs = document.querySelectorAll('#vendorTable input[data-field="name"]');
  if (inputs.length) inputs[inputs.length - 1].focus();
}

export async function saveStatus() {
  if (!state.currentStatus) { setStatus('Nothing to save.'); return; }
  if (isDriveEvent()) {
    const meta = state.currentMeta;
    const data = state.currentStatus;
    setStatus('Saving statuses to Google Drive…');
    try {
      await writeEventData(meta.driveId, 'status', data);
      if (state.currentMeta !== meta) return;
      clearStatusLocal();
      state.statusDirty = false; updateStatusDirty();
      setStatus('Statuses saved to Google Drive (SBE App Data).');
    } catch (e) {
      if (state.currentMeta === meta) persistStatusLocal();
      setStatus(`Not saved to Google Drive: ${e.message} Your changes are kept in this browser; save again once that's fixed.`);
      if (e.name === 'NeedsSignIn') needSignIn();
    }
    return;
  }
  if (!persistStatusLocal()) { setStatus('Could not save in this browser (storage blocked) — use Export JSON.'); return; }
  state.statusDirty = false; updateStatusDirty();
  setStatus('Statuses saved in this browser. Use Export JSON to share with others.');
}

export async function revertStatus() {
  if (!confirm(isDriveEvent() ? 'Discard unsaved status edits and reload the version saved in Google Drive?' : 'Discard status edits and reload from file?')) return;
  clearStatusLocal();
  state.statusDirty = false; updateStatusDirty();
  await loadEvent(state.currentMeta.id);
  showStatus();
}

export function exportStatus() {
  if (!state.currentStatus) return;
  downloadJSON(state.currentStatus, state.statusFile || 'status.json');
  setStatus('Exported statuses JSON (put it in docs/reports/ to share).');
}
