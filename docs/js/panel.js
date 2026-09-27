// Inline forms above the run sheet: generate a wedding day, add a day, shift times, save a template.
import { state } from './state.js';
import { $, setStatus } from './dom.js';
import { commitEdit, ensureCurated } from './timeline.js';
import { loadTemplates, saveTemplates } from './storage.js';
import {
  STYLES, EXTRAS, WEDDING_DEFAULTS, DAY_TEMPLATES, generateWeddingDay, applyTemplate, templateFromDay,
  normalizeHHMM, shiftDay, shiftFrom,
} from './draft.js';
import { docSuggestions } from './suggestions.js';
import { esc, fmt12, sortDay, todayISO } from './util.js';

const days = () => (state.currentCurated ? state.currentCurated.days : []);
const venueName = () => ((state.currentMeta && state.currentMeta.venue) || '').split(',')[0].trim();

function open(title, formName, body, submitLabel) {
  const panel = $('panel');
  panel.innerHTML = `<form data-form="${formName}" novalidate>
    <div class="panel-head"><h3>${title}</h3><button type="button" class="mini" data-act="close-panel">Close</button></div>
    ${body}
    <p class="panel-error" role="alert" hidden></p>
    <div class="panel-actions"><button type="submit" class="primary">${submitLabel}</button><button type="button" class="mini" data-act="close-panel">Cancel</button></div>
  </form>`;
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const first = panel.querySelector('input, select');
  if (first) first.focus();
}

export function closePanel() {
  const panel = $('panel');
  panel.hidden = true;
  panel.innerHTML = '';
}

function fail(form, msg) {
  const el = form.querySelector('.panel-error');
  el.textContent = msg;
  el.hidden = false;
}

const field = (id, label, input) => `<label class="f" for="${id}">${label}${input}</label>`;
const num = (id, name, value, min, max, step = 1) => `<input id="${id}" name="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" />`;

// ---------- Generate a wedding day from a short questionnaire ----------
export function openGenerator() {
  const d = WEDDING_DEFAULTS;
  const existing = days().find(x => x.date === state.currentMeta.weddingDate);
  const ceremonyNow = existing && (existing.items.find(i => /^ceremony\b(?!.*(prelude|rehearsal))/i.test(i.title)) || {}).time;
  open('Generate a wedding-day draft', 'generate', `
    <div class="fgrid">
      ${field('g-date', 'Wedding date', `<input id="g-date" name="date" type="date" value="${esc(state.currentMeta.weddingDate || todayISO())}" required />`)}
      ${field('g-ceremony', 'Ceremony starts', `<input id="g-ceremony" name="ceremony" type="time" value="${esc(ceremonyNow || d.ceremony)}" required />`)}
      ${field('g-length', 'Ceremony length (min)', num('g-length', 'ceremonyLength', d.ceremonyLength, 10, 120, 5))}
      ${field('g-style', 'Style', `<select id="g-style" name="style">${STYLES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`)}
      ${field('g-venue', 'Venue', `<input id="g-venue" name="venue" value="${esc(venueName())}" />`)}
      ${field('g-ready', 'Getting ready at', `<input id="g-ready" name="readyLocation" placeholder="e.g. Birchwood Inn, Suite 4" />`)}
      ${field('g-hmuPeople', 'Hair & makeup: people', num('g-hmuPeople', 'hmuPeople', d.hmuPeople, 1, 30))}
      ${field('g-hmuArtists', 'Hair & makeup: artists', num('g-hmuArtists', 'hmuArtists', d.hmuArtists, 1, 10))}
      ${field('g-hmuMinutes', 'Minutes per person', num('g-hmuMinutes', 'hmuMinutes', d.hmuMinutes, 15, 120, 5))}
      ${field('g-cocktail', 'Cocktail hour (min)', num('g-cocktail', 'cocktailMinutes', d.cocktailMinutes, 0, 180, 15))}
      ${field('g-reception', 'Reception length (hours)', num('g-reception', 'receptionHours', d.receptionHours, 1, 8, 0.5))}
      ${field('g-sunset', 'Sunset (optional)', `<input id="g-sunset" name="sunset" type="time" />`)}
    </div>
    <fieldset class="checks"><legend>Transportation</legend>
      <label><input type="checkbox" name="partyShuttle" id="g-partyShuttle" /> Wedding-party shuttle</label>
      <label><input type="checkbox" name="guestShuttle" id="g-guestShuttle" /> Guest shuttles</label>
    </fieldset>
    <fieldset class="checks"><legend>Include</legend>
      ${EXTRAS.map(([k, l, on]) => `<label><input type="checkbox" name="x-${k}" id="g-x-${k}"${on ? ' checked' : ''} /> ${l}</label>`).join('')}
    </fieldset>
    <p class="hint"><strong>Traditional</strong> puts portraits after the ceremony; <strong>First look</strong> moves them before it. Every generated stop is marked <em>estimated</em>. Times already in the contracts appear under the day as suggestions.</p>`,
  'Generate draft');
}

function submitGenerate(form) {
  const f = new FormData(form);
  const date = f.get('date');
  const ceremony = normalizeHHMM(f.get('ceremony'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return fail(form, 'Pick the wedding date.');
  if (!ceremony) return fail(form, 'Enter the ceremony start time.');
  const answers = {
    date, ceremony, style: f.get('style'), venue: f.get('venue').trim(), readyLocation: f.get('readyLocation').trim(),
    ceremonyLength: +f.get('ceremonyLength') || 30, hmuPeople: +f.get('hmuPeople') || 1, hmuArtists: +f.get('hmuArtists') || 1,
    hmuMinutes: +f.get('hmuMinutes') || 45, cocktailMinutes: +f.get('cocktailMinutes') || 0, receptionHours: +f.get('receptionHours') || 4,
    sunset: f.get('sunset') || '', partyShuttle: f.has('partyShuttle'), guestShuttle: f.has('guestShuttle'),
    extras: Object.fromEntries(EXTRAS.map(([k]) => [k, f.has(`x-${k}`)])),
  };
  const day = generateWeddingDay(answers);
  ensureCurated('generated draft');
  const list = state.currentCurated.days;
  const ix = list.findIndex(d => d.date === date);
  if (ix >= 0 && list[ix].items.length && !confirm(`${date} already has ${list[ix].items.length} stops. Replace them with the generated draft?`)) return;
  if (ix >= 0) list[ix] = day; else list.push(day);
  list.sort((a, b) => a.date.localeCompare(b.date));
  closePanel();
  commitEdit();
  const fromDocs = docSuggestions(state.currentReport.timeline, day).length;
  setStatus(`Generated ${day.items.length} stops for ${date} from a ${fmt12(ceremony)} ceremony.${fromDocs ? ` ${fromDocs} times from the documents are listed under the day.` : ''} Review, then Save.`);
}

// ---------- Add a day (blank, built-in template, or saved template) ----------
export function openAddDay() {
  const saved = loadTemplates();
  open('Add a day', 'addday', `
    <div class="fgrid">
      ${field('a-date', 'Date', `<input id="a-date" name="date" type="date" value="${esc(state.currentMeta.weddingDate || todayISO())}" required />`)}
      ${field('a-type', 'Start from', `<select id="a-type" name="type">
        <option value="blank">Blank day</option>
        ${Object.entries(DAY_TEMPLATES).map(([k, t]) => `<option value="${k}">${esc(t.name)}</option>`).join('')}
        ${saved.length ? `<optgroup label="Saved templates">${saved.map((t, i) => `<option value="saved:${i}">${esc(t.name)}</option>`).join('')}</optgroup>` : ''}
      </select>`)}
      ${field('a-start', 'Starts at', `<input id="a-start" name="start" type="time" value="18:00" />`)}
      ${field('a-title', 'Day title (optional)', `<input id="a-title" name="title" placeholder="e.g. Welcome Party — Copper Kettle" />`)}
      ${field('a-where', 'Location (optional)', `<input id="a-where" name="where" placeholder="Added to each stop's details" />`)}
    </div>
    <p class="hint">Adding a template to a date that already has stops merges them in.</p>`,
  'Add day');
}

function submitAddDay(form) {
  const f = new FormData(form);
  const date = f.get('date');
  const type = f.get('type');
  const start = normalizeHHMM(f.get('start'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return fail(form, 'Pick a date.');
  let template = null;
  if (type.startsWith('saved:')) template = loadTemplates()[+type.slice(6)];
  else if (type !== 'blank') template = DAY_TEMPLATES[type];
  if (template && !start) return fail(form, 'Enter a start time for the template.');
  ensureCurated('custom');
  const list = state.currentCurated.days;
  let day = list.find(d => d.date === date);
  if (!day) {
    day = { date, title: f.get('title').trim() || (template && template.title) || 'New day', items: [] };
    list.push(day);
    list.sort((a, b) => a.date.localeCompare(b.date));
  } else if (!template) {
    return fail(form, `${date} is already on the timeline. Add stops to it directly.`);
  }
  if (template) {
    day.items.push(...applyTemplate(template, start, f.get('where').trim()));
    sortDay(day);
  }
  closePanel();
  if (!template) state.editing = { day: list.indexOf(day), item: -1, isNew: true };
  commitEdit(!template);
  setStatus(template ? `Added "${template.name}" to ${date}.` : `Added ${date}. Add its first stop below.`);
}

// ---------- Shift times: a whole day, or one stop and everything after it ----------
export function openShift(dayIndex = null, fromIndex = 0) {
  const list = days();
  if (!list.length) { setStatus('No timeline to shift yet. Generate a draft or add a day first.'); return; }
  const di = dayIndex ?? Math.max(0, list.findIndex(d => d.date === state.currentMeta.weddingDate));
  open('Shift times', 'shift', `
    <div class="fgrid">
      ${field('s-day', 'Day', `<select id="s-day" name="day">${list.map((d, i) => `<option value="${i}"${i === di ? ' selected' : ''}>${esc(d.date)} — ${esc(d.title)}</option>`).join('')}</select>`)}
      ${field('s-from', 'Which stops', `<select id="s-from" name="from">${fromOptions(list[di], fromIndex)}</select>`)}
      ${field('s-mins', 'Move by (minutes)', `<input id="s-mins" name="mins" type="number" value="15" step="5" />`)}
    </div>
    <p class="hint">Use a negative number to move earlier, e.g. −30.</p>`,
  'Shift');
}

function fromOptions(day, fromIndex) {
  return `<option value="0">All stops that day</option>` + day.items.map((it, i) =>
    `<option value="${i}"${i === fromIndex && fromIndex > 0 ? ' selected' : ''}>From ${esc(fmt12(it.time))} ${esc(it.title)} onward</option>`).join('');
}

function submitShift(form) {
  const f = new FormData(form);
  const day = days()[+f.get('day')];
  const from = +f.get('from');
  const mins = parseInt(f.get('mins'), 10);
  if (!day) return fail(form, 'Pick a day.');
  if (!mins) return fail(form, 'Enter how many minutes to move, e.g. 15 or -15.');
  const count = day.items.length - from;
  if (from > 0) shiftFrom(day, from, mins); else shiftDay(day, mins);
  closePanel();
  commitEdit();
  setStatus(`Moved ${count} stop${count === 1 ? '' : 's'} on ${day.date} ${mins > 0 ? 'later' : 'earlier'} by ${Math.abs(mins)} min. Save to keep.`);
}

// ---------- Save a day as a reusable template ----------
export function openSaveTemplate(dayIndex) {
  const day = days()[dayIndex];
  if (!day || !day.items.length) { setStatus('That day has no stops to save.'); return; }
  open(`Save ${esc(day.date)} as a template`, 'savetpl', `
    <input type="hidden" name="day" value="${dayIndex}" />
    <div class="fgrid">${field('t-name', 'Template name', `<input id="t-name" name="name" value="${esc(day.title)}" required />`)}</div>
    <p class="hint">Saved in this browser. Use it from <em>Add day</em> on any event; times are kept relative to the first stop.</p>`,
  'Save template');
}

function submitSaveTemplate(form) {
  const f = new FormData(form);
  const name = f.get('name').trim();
  if (!name) return fail(form, 'Give the template a name.');
  const tpl = templateFromDay(days()[+f.get('day')], name);
  const list = loadTemplates().filter(t => t.name !== name);
  list.push(tpl);
  if (!saveTemplates(list)) return fail(form, 'This browser is blocking storage, so the template could not be saved.');
  closePanel();
  setStatus(`Saved template "${name}" (${tpl.items.length} stops).`);
}

const SUBMIT = { generate: submitGenerate, addday: submitAddDay, shift: submitShift, savetpl: submitSaveTemplate };

export function onPanelSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const handler = SUBMIT[form.dataset.form];
  if (handler) handler(form);
}

export function onPanelClick(ev) {
  if (ev.target.closest('[data-act="close-panel"]')) closePanel();
}

export function onPanelChange(ev) {
  // keep the "which stops" list in sync with the chosen day
  if (ev.target.id === 's-day') $('s-from').innerHTML = fromOptions(days()[+ev.target.value], 0);
}
