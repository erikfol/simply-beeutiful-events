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
