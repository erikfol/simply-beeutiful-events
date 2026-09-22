// SBE Doc Reader - local-only prototype
let docs = [];
let images = [];
let budgetData = null;
let vendorData = null;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(msg) { statusEl.textContent = msg; }

// ---------- File handling ----------
const dropzone = $('dropzone');
['dragover','dragenter'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', ev => handleFiles(ev.dataTransfer.files));
$('fileInput').addEventListener('change', ev => handleFiles(ev.target.files));
$('folderInput').addEventListener('change', ev => handleFiles(ev.target.files));
$('clearAll').addEventListener('click', () => { docs = []; images = []; budgetData = null; vendorData = null; renderAll(); setStatus('cleared'); });
$('loadSamples').addEventListener('click', loadSamples);
if ($('loadReport')) $('loadReport').addEventListener('click', loadReport);

async function handleFiles(fileList) {
  for (const f of fileList) {
    try {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (['png','jpg','jpeg','heic'].includes(ext)) {
        addImage(f);
        continue;
      }
      setStatus(`Reading ${f.name}...`);
      const text = await extractText(f);
      // webkitRelativePath preserves folder structure when folder picked
      addDoc(f.webkitRelativePath || f.name, text);
    } catch (err) {
      console.error(err);
      setStatus(`Failed: ${f.name} - ${err.message}`);
    }
  }
  renderAll();
}

async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt' || ext === 'md') return await file.text();
  if (ext === 'pdf') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      out += tc.items.map(it => it.str).join(' ') + '\n';
    }
    return out;
  }
  if (ext === 'docx') {
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value;
  }
  if (ext === 'xlsx') {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    let out = [];
    wb.SheetNames.forEach(sn => {
      out.push(`[sheet: ${sn}]`);
      const ws = wb.Sheets[sn];
      out.push(XLSX.utils.sheet_to_csv(ws).slice(0, 8000));
    });
    return out.join('\n');
  }
  if (['png','jpg','jpeg','heic'].includes(ext)) throw new Error('image - shown in gallery, not text-parsed');
  throw new Error('Unsupported type. Use .txt .md .pdf .docx .xlsx + images');
}

function addImage(file) {
  const url = ['png','jpg','jpeg'].includes((file.name.split('.').pop()||'').toLowerCase()) ? URL.createObjectURL(file) : null;
  images = images.filter(i => i.name !== (file.webkitRelativePath || file.name));
  images.push({ name: file.webkitRelativePath || file.name, url, ext: (file.name.split('.').pop()||'').toLowerCase() });
  setStatus(`Loaded ${docs.length} doc(s) + ${images.length} image(s)`);
}

function addDoc(name, text) {
  const clean = (text || '').trim();
  if (!clean) { setStatus(`${name} is empty`); return; }
  docs = docs.filter(d => d.name !== name);
  docs.push({ name, text: clean, parsed: parseDoc(clean, name) });
  setStatus(`Loaded ${docs.length} file(s)`);
}

async function loadSamples() {
  const files = ['sample_notes.txt', 'sample_meeting.md', 'sample_contract.txt'];
  setStatus('Loading samples...');
  for (const fn of files) {
    try {
      const r = await fetch(`sample_files/${fn}`);
      if (!r.ok) throw new Error(r.statusText);
      const t = await r.text();
      addDoc(fn, t);
    } catch (e) { console.warn(fn, e); }
  }
  renderAll();
}

async function loadReport() {
  setStatus('Loading Mistretta-Petran report...');
  try {
    const r = await fetch('reports/6-6-26-mistretta-petran-wedding.json');
    if (!r.ok) throw new Error(`HTTP ${r.status} - run via http.server, not file://`);
    const data = await r.json();
    docs = []; images = [];
    budgetData = data.budget || null;
    vendorData = data.vendors || null;
    data.files.forEach(f => {
      if (f.text_len > 0 && f.summary && !f.summary.startsWith('[parse error') && !f.summary.startsWith('[skipped')) {
        const mappedEvents = (f.events || []).map(e => ({
          dateRaw: e.dateRaw || e.date_raw,
          dateISO: e.dateISO || e.date_iso,
          snippet: e.snippet || '',
          source: e.source || f.file
        })).filter(e => e.dateISO);
        docs.push({
          name: f.file,
          text: f.summary,
          parsed: {
            wordCount: f.text_len,
            sentenceCount: f.summary.split(/[.!?]+/).length,
            keywords: f.keywords || [],
            dates: f.dates || [],
            amounts: f.amounts || [],
            summary: f.summary,
            events: mappedEvents
          }
        });
      } else if (/\.(png|jpg|jpeg|heic)$/i.test(f.file)) {
        images.push({ name: f.file, url: null, ext: (f.ext || '.?').replace('.','') });
      }
    });
    setStatus(`Loaded report: ${docs.length} docs + ${images.length} images, ${data.timeline.length} events`);
    if ($('viewMode')) $('viewMode').value = 'everything';
    renderAll();
  } catch (e) {
    console.error(e);
    setStatus(`Report load failed: ${e.message}`);
  }
}

// ---------- Parsing / summarization (local, no AI) ----------
const STOP = new Set('the,a,an,and,or,of,to,in,on,for,with,at,by,from,as,is,are,was,were,be,been,it,its,this,that,these,those,we,you,they,he,she,our,your,their,will,shall,per,via,etc,into,up,out,about,after,before,between,during'.split(','));

function parseDoc(text, name) {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.match(/[^.!?\n]+[.!?]+/g) || [text.slice(0, 300)];

  // keywords: freq minus stopwords
  const freq = {};
  words.forEach(w => {
    const k = w.toLowerCase().replace(/[^a-z0-9'-]/g, '');
    if (k.length > 2 && !STOP.has(k)) freq[k] = (freq[k] || 0) + 1;
  });
  const keywords = Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 8).map(e => e[0]);

  // dates: several common formats (incl. M.D.YY like 6.6.26)
  const datePatterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g,
  ];
  let dates = [];
  datePatterns.forEach(re => { const m = text.match(re); if (m) dates.push(...m); });
  dates = [...new Set(dates)];

  // amounts
  const amounts = [...new Set(text.match(/\$\s?[\d,]+(\.\d{2})?/g) || [])];

  // summary: first 3 substantive sentences
  const summary = sentences.filter(s => s.trim().length > 30).slice(0, 3).join(' ').trim().slice(0, 600);

  // events for timeline
  const events = dates.map(d => ({
    dateRaw: d,
    dateISO: toISO(d),
    snippet: snippetAround(text, d),
    source: name
  })).filter(e => e.dateISO).sort((a,b) => a.dateISO.localeCompare(b.dateISO));

  return { wordCount: words.length, sentenceCount: sentences.length, keywords, dates, amounts, summary, events };
}

function snippetAround(text, needle, radius = 90) {
  const i = text.indexOf(needle);
  if (i < 0) return needle;
  return '…' + text.slice(Math.max(0, i-radius), i + needle.length + radius).replace(/\s+/g,' ').trim() + '…';
}

function toISO(raw) {
  try {
    // MM/DD/YYYY
    let m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) { let y = m[3].length===2 ? '20'+m[3] : m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
    // M.D.YY like 6.6.26 -> 2026-06-06
    m = raw.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) { let y = m[3].length===2 ? '20'+m[3] : m[3]; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
    // YYYY-MM-DD
    m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return raw;
    // Month DD YYYY
    const d = new Date(raw);
    if (!isNaN(d)) return d.toISOString().slice(0,10);
  } catch {}
  return null;
}

// ---------- Rendering ----------
function renderAll() {
  renderSummaries();
  renderBudget();
  renderVendors();
  renderTimeline();
  renderCombined();
  applyView();
}

const fmt$ = n => (n == null ? '—' : '$' + Number(n).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}));

function renderBudget() {
  const el = $('budget');
  if (!el) return;
  if (!budgetData || !budgetData.budget_total) { el.innerHTML = '<p style="color:#888">No budget loaded yet — click “Load Mistretta-Petran report”.</p>'; return; }
  const cats = (budgetData.categories || []).filter(c => c.actual > 0).sort((a,b) => b.actual - a.actual).slice(0, 15);
  el.innerHTML = `<div class="card"><p><strong>Planned:</strong> ${fmt$(budgetData.budget_total)} ·
    <strong>Actual:</strong> ${fmt$(budgetData.total_actual)} ·
    <strong>Paid:</strong> ${fmt$(budgetData.total_paid)} ·
    <strong>Due:</strong> ${fmt$(budgetData.total_due)} ·
    <strong>Over budget:</strong> ${fmt$(Math.abs(budgetData.remaining_budget))}</p>
    <table style="width:100%;border-collapse:collapse;font-size:.9em"><tr><th align="left">Category</th><th align="right">Actual</th><th align="right">Paid</th><th align="right">Due</th></tr>
    ${cats.map(c => `<tr><td>${escapeHtml(c.category)}</td><td align="right">${fmt$(c.actual)}</td><td align="right">${fmt$(c.paid)}</td><td align="right">${fmt$(c.due)}</td></tr>`).join('')}
    </table><small>Source: ${escapeHtml(budgetData.file || '')}</small></div>`;
}

function renderVendors() {
  const el = $('vendors');
  if (!el) return;
  if (!vendorData || !vendorData.booked || !vendorData.booked.length) { el.innerHTML = '<p style="color:#888">No vendors loaded yet.</p>'; return; }
  el.innerHTML = `<div class="card"><ul>${vendorData.booked.map(v =>
    `<li><strong>${escapeHtml(v.vendor)}</strong> — ${escapeHtml(v.event || 'n/a')}, ${escapeHtml(v.location || '')}<br><small>${escapeHtml(v.cost || '')} · ${escapeHtml(v.contact || '')} ${escapeHtml(v.email || '')}</small></li>`
  ).join('')}</ul><small>Contracts in folder: ${(vendorData.contract_files || []).length} files</small></div>`;
}

function renderSummaries() {
  const el = $('summaries');
  if (!docs.length && !images.length) { el.innerHTML = '<p>No files yet. Load samples, load the wedding report, or drop files/folder above.</p>'; return; }
  const imgHtml = images.length ? `<div class="card"><h3>Images (${images.length})</h3><p>${images.map(i => i.url ? `<a href="${i.url}" target="_blank"><img src="${i.url}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;margin:2px" title="${escapeHtml(i.name)}" /></a>` : `<span class="badge">${escapeHtml(i.name)} (HEIC - no preview)</span>`).join('')}</p><small>HEIC = iPhone photos - listed but browsers can't preview. PNG/JPG preview below.</small></div>` : '';
  el.innerHTML = imgHtml + docs.map(d => {
    const p = d.parsed;
    return `<div class="card">
      <h3>${escapeHtml(d.name)}</h3>
      <small>${p.wordCount} words · ${p.sentenceCount} sentences</small>
      <p><strong>Summary:</strong> ${escapeHtml(p.summary || '(no summary)')}</p>
      <p><strong>Dates:</strong> ${p.dates.map(x=>`<span class="badge">${escapeHtml(x)}</span>`).join(' ') || '—'}</p>
      <p><strong>Amounts:</strong> ${p.amounts.map(x=>`<span class="badge">${escapeHtml(x)}</span>`).join(' ') || '—'}</p>
      <p><strong>Keywords:</strong> ${p.keywords.map(x=>`<span class="badge">${escapeHtml(x)}</span>`).join(' ')}</p>
    </div>`;
  }).join('');
}

let timelineObj = null;
function renderTimeline() {
  const allEvents = docs.flatMap(d => (d.parsed.events || [])).filter(e => e && e.dateISO);
  const listEl = $('timelineList');
  const tlEl = $('timeline');

  if (!allEvents.length) {
    tlEl.innerHTML = '<p style="padding:1rem;color:#888">No dates found yet.</p>';
    listEl.innerHTML = '<li>No dated events</li>';
    if (timelineObj) { timelineObj.destroy(); timelineObj = null; }
    return;
  }

  allEvents.sort((a,b) => (a.dateISO || '').localeCompare(b.dateISO || ''));
  listEl.innerHTML = allEvents.map(e =>
    `<li><strong>${escapeHtml(e.dateISO)}</strong> (${escapeHtml(e.dateRaw)}) — ${escapeHtml(e.snippet)} <em>[${escapeHtml(e.source)}]</em></li>`
  ).join('');

  const items = new vis.DataSet(allEvents.map((e,i) => ({
    id: i, content: `${e.dateRaw} — ${e.source}`, start: e.dateISO, title: e.snippet
  })));

  if (timelineObj) timelineObj.destroy();
  timelineObj = new vis.Timeline(tlEl, items, { height: '260px', showCurrentTime: false });
}

function renderCombined() {
  if (!docs.length && !budgetData) { $('combinedReport').textContent = '(empty)'; return; }
  let out = `SIMPLY BEEUTIFUL EVENTS - COMBINED REPORT\nGenerated: ${new Date().toLocaleString()}\nFiles: ${docs.length}\n`;
  if (budgetData && budgetData.budget_total) {
    out += `Budget planned: $${budgetData.budget_total} | actual: $${budgetData.total_actual} | paid: $${budgetData.total_paid} | due: $${budgetData.total_due}\n`;
  }
  if (vendorData && vendorData.booked) {
    out += `Vendors (${vendorData.booked.length}): ${vendorData.booked.map(v => v.vendor).join('; ')}\n`;
  }
  out += '\n';
  docs.forEach(d => {
    const p = d.parsed;
    out += `== ${d.name} ==\nWords: ${p.wordCount}\nSummary: ${p.summary}\nDates: ${p.dates.join(', ')||'—'}\nAmounts: ${p.amounts.join(', ')||'—'}\nKeywords: ${p.keywords.join(', ')}\n\n`;
  });
  const ev = docs.flatMap(d => (d.parsed.events || [])).filter(e => e && e.dateISO).sort((a,b)=>(a.dateISO||'').localeCompare(b.dateISO||''));
  out += `== TIMELINE (${ev.length} events) ==\n`;
  ev.forEach(e => { out += `${e.dateISO} | ${e.source} | ${e.snippet}\n`; });
  $('combinedReport').textContent = out;
}

function applyView() {
  const v = ($('viewMode') && $('viewMode').value) || 'everything';
  const showSumm = (v === 'everything' || v === 'summaries');
  const showTime = (v === 'everything' || v === 'timeline');
  $('summaries').style.display = showSumm ? '' : 'none';
  $('budgetSection').style.display = '';
  $('vendorsSection').style.display = '';
  $('timelineSection').style.display = showTime ? '' : 'none';
  $('combinedSection').style.display = '';
}
if ($('viewMode')) $('viewMode').addEventListener('change', applyView);

function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

renderAll();
