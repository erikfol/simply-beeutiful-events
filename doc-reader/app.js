// SBE Doc Reader - local-only prototype
let docs = [];

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function setStatus(msg) { statusEl.textContent = msg; }

// ---------- File handling ----------
const dropzone = $('dropzone');
['dragover','dragenter'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave','drop'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', ev => handleFiles(ev.dataTransfer.files));
$('fileInput').addEventListener('change', ev => handleFiles(ev.target.files));
$('clearAll').addEventListener('click', () => { docs = []; renderAll(); setStatus('cleared'); });
$('loadSamples').addEventListener('click', loadSamples);

async function handleFiles(fileList) {
  for (const f of fileList) {
    try {
      setStatus(`Reading ${f.name}...`);
      const text = await extractText(f);
      addDoc(f.name, text);
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
  throw new Error('Unsupported type. Use .txt .md .pdf .docx');
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

  // dates: several common formats
  const datePatterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
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
  renderTimeline();
  renderCombined();
  applyView();
}

function renderSummaries() {
  const el = $('summaries');
  if (!docs.length) { el.innerHTML = '<p>No files yet. Load samples or drop files above.</p>'; return; }
  el.innerHTML = docs.map(d => {
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
  const allEvents = docs.flatMap(d => d.parsed.events);
  const listEl = $('timelineList');
  const tlEl = $('timeline');

  if (!allEvents.length) {
    tlEl.innerHTML = '<p style="padding:1rem;color:#888">No dates found yet.</p>';
    listEl.innerHTML = '<li>No dated events</li>';
    if (timelineObj) { timelineObj.destroy(); timelineObj = null; }
    return;
  }

  allEvents.sort((a,b) => a.dateISO.localeCompare(b.dateISO));
  listEl.innerHTML = allEvents.map(e =>
    `<li><strong>${e.dateISO}</strong> (${escapeHtml(e.dateRaw)}) — ${escapeHtml(e.snippet)} <em>[${escapeHtml(e.source)}]</em></li>`
  ).join('');

  const items = new vis.DataSet(allEvents.map((e,i) => ({
    id: i, content: `${e.dateRaw} — ${e.source}`, start: e.dateISO, title: e.snippet
  })));

  if (timelineObj) timelineObj.destroy();
  timelineObj = new vis.Timeline(tlEl, items, { height: '260px', showCurrentTime: false });
}

function renderCombined() {
  if (!docs.length) { $('combinedReport').textContent = '(empty)'; return; }
  let out = `SIMPLY BEEUTIFUL EVENTS - COMBINED REPORT\nGenerated: ${new Date().toLocaleString()}\nFiles: ${docs.length}\n\n`;
  docs.forEach(d => {
    const p = d.parsed;
    out += `== ${d.name} ==\nWords: ${p.wordCount}\nSummary: ${p.summary}\nDates: ${p.dates.join(', ')||'—'}\nAmounts: ${p.amounts.join(', ')||'—'}\nKeywords: ${p.keywords.join(', ')}\n\n`;
  });
  const ev = docs.flatMap(d => d.parsed.events).sort((a,b)=>a.dateISO.localeCompare(b.dateISO));
  out += `== TIMELINE (${ev.length} events) ==\n`;
  ev.forEach(e => { out += `${e.dateISO} | ${e.source} | ${e.snippet}\n`; });
  $('combinedReport').textContent = out;
}

function applyView() {
  const v = $('viewMode').value;
  $('summaries').style.display = (v==='summaries'||v==='combined') ? '' : 'none';
  $('timelineSection').style.display = (v==='timeline'||v==='combined') ? '' : 'none';
  $('combinedSection').style.display = (v==='combined') ? '' : 'none';
  if (v==='summaries') { $('summaries').style.display=''; $('timelineSection').style.display='none'; $('combinedSection').style.display='none'; }
  if (v==='timeline') { $('summaries').style.display='none'; }
}
$('viewMode').addEventListener('change', applyView);

$('exportMd').addEventListener('click', () => download('sbe-report.md', $('combinedReport').textContent, 'text/markdown'));
$('exportJson').addEventListener('click', () => download('sbe-report.json', JSON.stringify(docs.map(d=>({file:d.name,...d.parsed,events:d.parsed.events})), null, 2), 'application/json'));

function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], {type}));
  a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
}

function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

renderAll();
