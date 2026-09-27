// Browser-saved edits (localStorage), keyed per event. Every access is guarded: storage can be blocked.
import { state } from './state.js';

const eventId = () => (state.currentMeta ? state.currentMeta.id : 'none');
const timelineKey = () => `sbe-timeline-${eventId()}`;
const statusKey = () => `sbe-status-${eventId()}`;

function load(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function save(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
}
function clear(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const loadLocal = () => load(timelineKey());
export const persistLocal = () => save(timelineKey(), state.currentCurated);
export const clearLocal = () => clear(timelineKey());

export const loadStatusLocal = () => load(statusKey());
export const persistStatusLocal = () => save(statusKey(), state.currentStatus);
export const clearStatusLocal = () => clear(statusKey());

// Saved day templates are shared by all events in this browser.
const TEMPLATES_KEY = 'sbe-templates';
export const loadTemplates = () => load(TEMPLATES_KEY) || [];
export const saveTemplates = (list) => save(TEMPLATES_KEY, list);
