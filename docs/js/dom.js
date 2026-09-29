// Small DOM helpers shared by every view.
import { state } from './state.js';

export const $ = (id) => document.getElementById(id);

export function setStatus(m) { $('status').textContent = m; }

export function updateDirty() { $('dirty').textContent = state.isDirty ? '● unsaved changes' : ''; }

export function updateStatusDirty() { const el = $('dirtyStatus'); if (el) el.textContent = state.statusDirty ? '● unsaved changes' : ''; }

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.split('/').pop();
  a.click();
}

const SECTIONS = ['overviewSection', 'timelineSection', 'statusSection', 'docsSection'];

// Show one view (or none) and hide the others.
export function showSection(id) {
  for (const s of SECTIONS) { const el = $(s); if (el) el.hidden = s !== id; }
}

// Ask the Google bar to offer "Sign in again" (e.g. the one-hour sign-in ran out mid-session).
export function needSignIn() { window.dispatchEvent(new CustomEvent('sbe:needs-signin')); }
