// Pure helpers: formatting, time math, parsing. No DOM access, so Node tests can import this file.

export function esc(s) { return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtDate(iso) {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}

export function fmt$(n) {
  return (n == null || isNaN(n)) ? '—' : '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// Add minutes to an HH:MM time, wrapping around midnight.
export function shiftHHMM(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let t = (h * 60 + m + mins) % 1440;
  if (t < 0) t += 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is in the past.
export function daysBetween(from, to) {
  return Math.round((new Date(to + 'T12:00:00') - new Date(from + 'T12:00:00')) / 86400000);
}

export function sortDay(day) { day.items.sort((a, b) => (a.time || '99').localeCompare(b.time || '99')); }

// ---------- Time extraction (fallback for old reports without times) ----------
export function to24(raw) {
  const m = raw.trim().toLowerCase().replace(/\./g, '').match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!m || !m[3]) return null;
  let h = parseInt(m[1], 10), mi = parseInt(m[2] || '0', 10);
  if (m[3] === 'pm' && h !== 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

export function extractTimes(text) {
  const out = new Set();
  for (const m of (text.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(AM|PM|am|pm)\b/g) || [])) {
    const r = m.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(AM|PM|am|pm)/i);
    if (r) for (const h of [r[1], r[2]]) { const t = to24(`${h}${r[3]}`); if (t) out.add(t); }
  }
  const res = [/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)\b/g, /(?<![\d:])\b\d{1,2}\s*(?:AM|PM|am|pm)\b/g];
  for (const re of res) {
    for (const m of (text.match(re) || [])) {
      const t = to24(m);
      if (t) out.add(t);
    }
  }
  return [...out].sort();
}

export function enrichEvent(e) {
  const times = (e.times && e.times.length ? e.times : extractTimes(`${e.snippet || ''} ${e.source || ''}`));
  const time = e.time || times[0] || null;
  return { ...e, times, time };
}
