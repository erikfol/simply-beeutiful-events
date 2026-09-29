// Documents view: every file in the event's folder, grouped by kind, with links back to Google Drive.
import { state } from './state.js';
import { $, setStatus, showSection } from './dom.js';
import { classifyFile, KIND_LABELS } from './driveEvents.js';
import { esc, fmtDate, daysBetween, todayISO } from './util.js';

const KIND_ORDER = ['budget', 'vendors', 'contract', 'document', 'photo'];
const READ_LABELS = {
  read: '<span class="pill st-paid">read</span>',
  pending: '<span class="pill st-na">reading…</span>',
  problem: '<span class="pill st-due">needs a look</span>',
  skipped: '<span class="pill st-na">not read</span>',
};

// Drive events carry Drive metadata; demo/local reports only have file names.
function normalize(f) {
  const name = f.name || (f.file || '').split('/').pop();
  const path = f.path ?? (f.file || '').split('/').slice(0, -1).map(p => `${p}/`).join('');
  const { kind, type } = f.kind ? f : classifyFile(name, f.mimeType || '');
  const read = f.read || ((f.text_len || 0) > 0 ? 'read' : 'skipped');
  return { name, path, kind, type, read, via: f.via || '', modified: (f.modifiedTime || '').slice(0, 10), link: /^https:\/\//.test(f.webViewLink || '') ? f.webViewLink : '' };
}

export function showDocuments() {
  const report = state.currentReport;
  if (!report) { setStatus('Pick an event first.'); return; }
  showSection('docsSection');
  $('docsTitle').textContent = state.currentMeta.name;

  const today = todayISO();
  const docs = (report.files || []).map(normalize);
  const counts = KIND_ORDER.map(k => [k, docs.filter(d => d.kind === k).length]).filter(([, n]) => n);
  const missing = ['budget', 'vendors'].filter(k => !docs.some(d => d.kind === k));

  let html = `<p class="doc-summary">${docs.length} document${docs.length === 1 ? '' : 's'}: ${counts.map(([k, n]) => `<span class="pill st-na">${n} ${esc(KIND_LABELS[k].toLowerCase())}</span>`).join(' ')}</p>`;
  if (missing.length) {
    html += `<div class="alert info">No ${missing.map(k => (k === 'budget' ? 'budget spreadsheet (name containing "Budget")' : 'vendor spreadsheet (name containing "Vendor Options")')).join(' or ')} found in this folder.</div>`;
  }
  if (report.source !== 'drive') html += `<p class="hint">Demo and local events list the files the scanner read. Google Drive events link straight to each file.</p>`;

  for (const kind of KIND_ORDER) {
    const group = docs.filter(d => d.kind === kind).sort((a, b) => (a.path + a.name).localeCompare(b.path + b.name));
    if (!group.length) continue;
    html += `<h3>${esc(KIND_LABELS[kind])}</h3><div class="tablewrap"><table class="grid docs"><tr><th>Name</th><th>Type</th><th>Folder</th><th>Last changed</th><th>Read</th></tr>` +
      group.map(d => {
        const recent = d.modified && daysBetween(d.modified, today) <= 7;
        const name = d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : esc(d.name);
        return `<tr><td>${name}${recent ? ' <span class="pill st-partial">new</span>' : ''}</td><td>${esc(d.type)}</td><td>${esc(d.path || '—')}</td><td>${d.modified ? esc(fmtDate(d.modified)) : '—'}</td><td>${READ_LABELS[d.read] || ''}${d.via === 'google' ? ' <small title="Converted by Google Drive (old Word file or scan)">via Google</small>' : ''}</td></tr>`;
      }).join('') + `</table></div>`;
  }
  $('docsList').innerHTML = html;
  setStatus(`${docs.length} documents for ${state.currentMeta.name}.`);
}
