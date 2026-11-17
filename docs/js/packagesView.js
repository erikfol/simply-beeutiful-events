// Top of the Checklist view: the event's package (and services and traditions), applying it to the checklist
// from SBE's templates, and the shared checklist templates themselves (list, save this checklist as one, edit,
// delete). The checklist view passes in its tasks and its save queue, so task changes save like any other.
import { $, setStatus, needSignIn } from './dom.js';
import { isDriveEvent } from './events.js';
import { driveStatus } from './drivebar.js';
import {
  PACKAGES, SERVICES, TRADITIONS, emptySetup, setupText, loadSetup, saveSetup, emptyTemplates, loadTemplates,
  changeTemplates, upsertTemplate, removeTemplate, templateFromChecklist, planSync, applySync, applies, forText,
  FOR_CHOICES, forValue, forFromValue, parseWhen, formatWhen, newTemplateId, newItemId,
} from './packages.js';
import { esc } from './util.js';

let meta = null;
let hooks = { tasks: () => [], save: () => {} };
let setup = emptySetup();
let templates = emptyTemplates();
let editing = false;      // the package form is open
let draft = null;         // the package form's choices
let plan = null;          // {setup, p, groups}: what applying would change
let tplOpen = false;      // the templates panel is open
let tplEdit = null;       // template being edited: {id, isNew, name, forV, rows: [{id, title, when, who, notes}]}
let saveAs = null;        // "save this checklist as a template" form: {name, forV}
let problems = [];
let confirmTpl = null;    // template waiting for "Delete?" confirmation
let busy = false;

const me = () => { const u = driveStatus().user || {}; return u.displayName || u.emailAddress || ''; };
const now = () => new Date().toISOString();

/**
 * Show the package box for an event. h.tasks(): the checklist's tasks now; h.save(change, done): the
 * checklist's save queue (change: list -> new list).
 */
export async function showSetup(m, h) {
  hooks = h;
  if (meta !== m) {
    meta = m; setup = emptySetup(); editing = false; draft = null; plan = null; tplEdit = null; saveAs = null; problems = []; confirmTpl = null;
    render();
    if (!meta || !isDriveEvent(meta)) return;
    try {
      const [s, t] = await Promise.all([loadSetup(meta.driveId), loadTemplates()]);
      if (meta !== m) return;
      setup = s; templates = t;
    } catch (e) {
      if (e.name === 'NeedsSignIn') needSignIn();
      setStatus(`Couldn't load the package: ${e.message}`);
    }
  }
  render();
}

// ---------- rendering ----------

const checks = (name, list, chosen) => list.map(([k, l]) => `<label class="ck-opt"><input type="checkbox" name="${name}" value="${esc(k)}"${chosen.includes(k) ? ' checked' : ''} /> ${esc(l)}</label>`).join('');

function readSetupForm() {
  const f = $('setupForm');
  if (!f) return draft;
  const all = (name) => [...f.querySelectorAll(`input[name="${name}"]:checked`)].map(i => i.value);
  return { package: (f.querySelector('input[name="package"]:checked') || {}).value || '', services: all('services'), traditions: all('traditions') };
}

function planHtml() {
  const { p, groups, setup: s } = plan;
  const n = p.add.length, r = p.remove.length, mv = p.move.length;
  const any = n + r + mv;
  const parts = [n && `adds ${n} task${n === 1 ? '' : 's'}`, r && `removes ${r}`, mv && `moves ${mv} due date${mv === 1 ? '' : 's'}`].filter(Boolean);
  const from = groups.length ? `<ul class="ck-plan-list">${groups.map(g => `<li>${esc(g.name)} <small>(${esc(forText(g.for))})</small>: ${g.count} task${g.count === 1 ? '' : 's'}</li>`).join('')}</ul>` : '';
  const gone = r ? `<p class="hint">Removed: ${p.remove.slice(0, 6).map(t => esc(t.title)).join(', ')}${r > 6 ? '…' : ''}. Tasks that are done or were changed by hand always stay.</p>` : '';
  const none = !templates.templates.some(t => applies(t.for, s))
    ? '<p class="hint">There are no templates for this package yet, so the checklist stays as it is. Make one under <strong>Templates</strong>.</p>' : '';
  return `<div class="ck-plan">
      <p><strong>${any ? `This ${parts.join(', ')}.` : 'The checklist is already up to date with the templates.'}</strong></p>
      ${n ? `<p class="hint">New tasks come from:</p>${from}` : ''}${gone}${none}
      <div class="todo-acts"><button type="button" class="primary" data-act="setupapply"${busy ? ' disabled' : ''}>${any ? 'Apply' : 'Save package'}</button>
        <button type="button" class="mini" data-act="setupback">Back</button></div>
    </div>`;
}

function setupFormHtml() {
  const d = draft;
  return `<form id="setupForm" class="ck-setupform">
      <fieldset><legend>Package</legend>${PACKAGES.map(([k, l, sub]) => `<label class="ck-opt"><input type="radio" name="package" value="${k}"${d.package === k ? ' checked' : ''} /> <strong>${esc(l)}</strong> <small>${esc(sub)}</small></label>`).join('')}</fieldset>
      ${d.package === 'blossom-bee' ? `<fieldset><legend>Queen Bee services they chose</legend>${checks('services', SERVICES, d.services)}</fieldset>` : ''}
      ${d.package === 'queen-bee' ? '<p class="hint">The Queen Bee includes every service, and the Bee Blissful and Blossom &amp; Bee tasks.</p>' : ''}
      ${d.package === 'blossom-bee' ? '<p class="hint">Blossom &amp; Bee includes the Bee Blissful tasks.</p>' : ''}
      ${d.package && d.package !== 'other' ? `<fieldset><legend>Ceremony traditions</legend>${checks('traditions', TRADITIONS, d.traditions)}</fieldset>` : ''}
      ${plan ? planHtml() : `<div class="todo-acts"><button type="button" class="primary" data-act="setuppreview"${!d.package || busy ? ' disabled' : ''}>${busy ? 'Checking…' : 'Show what changes'}</button>
        <button type="button" class="mini" data-act="setupcancel">Cancel</button></div>`}
    </form>`;
}

function editorHtml() {
  const e = tplEdit;
  const rows = e.rows.map((r, i) => `<tr>
      <td><input data-row="${i}" data-field="title" value="${esc(r.title)}" aria-label="Task ${i + 1}" placeholder="What needs to be done" /></td>
      <td><input data-row="${i}" data-field="when" value="${esc(r.when)}" aria-label="When, task ${i + 1}" placeholder="6 weeks before" /></td>
      <td><input data-row="${i}" data-field="who" value="${esc(r.who)}" aria-label="Who, task ${i + 1}" placeholder="SBE" /></td>
      <td><button type="button" class="mini" data-act="tplrowdel" data-row="${i}" aria-label="Remove task ${i + 1}">Remove</button></td>
    </tr>`).join('');
  return `<div class="ck-tpledit">
      <div class="ck-tplhead">
        <label>Name <input id="tplName" value="${esc(e.name)}" placeholder="e.g. Bee Blissful basics" /></label>
        <label>For <select id="tplFor">${FOR_CHOICES.map(([v, l]) => `<option value="${esc(v)}"${v === e.forV ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      </div>
      <div class="tablewrap"><table class="grid ck-tpltable"><thead><tr><th scope="col">Task</th><th scope="col">When</th><th scope="col">Who</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="hint">When: "6 weeks before", "3 months", "10 days", "day of", "2 days after". Leave it empty for no due date.</p>
      ${problems.length ? `<p class="db-warn">${problems.map(esc).join(' ')}</p>` : ''}
      <div class="todo-acts"><button type="button" class="mini" data-act="tplrowadd">+ Add task</button>
        <button type="button" class="primary" data-act="tplsave"${busy ? ' disabled' : ''}>Save template</button>
        <button type="button" class="mini" data-act="tplcancel">Cancel</button></div>
    </div>`;
}

function templatesHtml(canSave) {
  const list = templates.templates;
  const rows = list.map(t => {
    const acts = !canSave ? '' : confirmTpl === t.id
      ? `<span class="todo-confirm">Delete this template? Its tasks stay on checklists that already have them.</span><button type="button" class="mini danger" data-act="tpldelete" data-id="${esc(t.id)}">Delete</button><button type="button" class="mini" data-act="tplkeep">Keep</button>`
      : `<button type="button" class="mini" data-act="tpledit" data-id="${esc(t.id)}">Edit</button><button type="button" class="mini" data-act="tplask" data-id="${esc(t.id)}">Delete</button>`;
    return tplEdit && tplEdit.id === t.id ? `<li>${editorHtml()}</li>` : `<li class="ck-tplrow"><div><strong>${esc(t.name)}</strong> <small>${esc(forText(t.for))} · ${t.items.length} task${t.items.length === 1 ? '' : 's'}${applies(t.for, setup) ? ' · applies to this event' : ''}</small></div><div class="todo-acts">${acts}</div></li>`;
  }).join('');
  const saveAsHtml = saveAs ? `<div class="ck-saveas">
      <label>Name <input id="saveAsName" value="${esc(saveAs.name)}" placeholder="e.g. Bee Blissful basics" /></label>
      <label>For <select id="saveAsFor">${FOR_CHOICES.map(([v, l]) => `<option value="${esc(v)}"${v === saveAs.forV ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <button type="button" class="primary" data-act="saveasgo"${busy ? ' disabled' : ''}>Save template</button>
      <button type="button" class="mini" data-act="saveascancel">Cancel</button>
      <p class="hint">Each task's due date becomes "so many days before" this event, so the template fits any event date.</p>
    </div>` : '';
  return `<div class="ck-templates">
      <div class="share-head"><h3>Checklist templates</h3><button type="button" class="mini" data-act="tplclose">Close</button></div>
      <p class="hint">Shared by everyone. A template is for a package, a service, a ceremony tradition or every event; choosing an event's package adds the tasks of every template that fits.</p>
      ${list.length ? `<ul class="ck-tpllist">${rows}</ul>` : '<p class="hint">No templates yet.</p>'}
      ${tplEdit && tplEdit.isNew ? editorHtml() : ''}
      ${saveAsHtml}
      ${canSave && !tplEdit && !saveAs ? `<div class="todo-acts"><button type="button" class="mini" data-act="saveasopen"${hooks.tasks().length ? '' : ' disabled'}>Save this checklist as a template</button><button type="button" class="mini" data-act="tplnew">New template</button></div>` : ''}
    </div>`;
}

function keepTyping() {
  if (editing && $('setupForm')) draft = readSetupForm();
  if (tplEdit) {
    const n = $('tplName'), f = $('tplFor');
    if (n) tplEdit.name = n.value;
    if (f) tplEdit.forV = f.value;
    document.querySelectorAll('#checklistSetup input[data-row]').forEach(inp => { const r = tplEdit.rows[+inp.dataset.row]; if (r) r[inp.dataset.field] = inp.value; });
  }
  if (saveAs) { const n = $('saveAsName'), f = $('saveAsFor'); if (n) saveAs.name = n.value; if (f) saveAs.forV = f.value; }
}

function render() {
  const box = $('checklistSetup');
  if (!box) return;
  if (!meta || !isDriveEvent(meta)) { box.innerHTML = ''; return; }
  keepTyping();
  const canSave = driveStatus().canSave;
  const text = setupText(setup);
  let html = `<div class="ck-setup-line">${text ? `<span><strong>Package:</strong> ${esc(text)}</span>` : '<span><strong>No package chosen yet.</strong> Choose one to build this checklist from SBE\'s templates.</span>'}
      ${canSave && !editing ? `<button type="button" class="mini" data-act="setupedit">${text ? 'Change' : 'Choose package'}</button>${text ? '<button type="button" class="mini" data-act="setupupdate">Update from templates</button>' : ''}` : ''}
      <button type="button" class="mini" data-act="tplopen" aria-expanded="${tplOpen}">Templates</button></div>`;
  if (editing) html += setupFormHtml();
  else if (plan) html += planHtml();
  if (tplOpen) html += templatesHtml(canSave);
  box.innerHTML = html;
}

// ---------- actions ----------

function groupAdds(add) {
  const byTpl = new Map();
  for (const t of add) byTpl.set(t.from.tpl, (byTpl.get(t.from.tpl) || 0) + 1);
  return templates.templates.filter(t => byTpl.has(t.id)).map(t => ({ name: t.name, for: t.for, count: byTpl.get(t.id) }));
}

async function preview(s) {
  busy = true; render();
  try {
    templates = await loadTemplates();
    const p = planSync(hooks.tasks(), templates.templates, s, meta.weddingDate, now(), me());
    plan = { setup: s, p, groups: groupAdds(p.add) };
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Couldn't read the templates: ${e.message}`);
  } finally { busy = false; render(); }
}

async function apply() {
  if (!plan) return;
  const m = meta;
  const s = plan.setup, tpls = templates.templates, date = meta.weddingDate, at = now(), by = me();
  const { add, remove, move } = plan.p;
  busy = true; render();
  try {
    setup = await saveSetup(m.driveId, s, at);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Not saved. ${e.message}`);
    busy = false; render();
    return;
  }
  if (meta !== m) return;
  editing = false; plan = null; busy = false;
  const parts = [add.length && `added ${add.length} task${add.length === 1 ? '' : 's'}`, remove.length && `removed ${remove.length}`, move.length && `moved ${move.length} due date${move.length === 1 ? '' : 's'}`].filter(Boolean);
  const done = `Package saved${parts.length ? `; ${parts.join(', ')}` : ''}.`;
  if (parts.length) hooks.save(l => applySync(l, planSync(l.tasks, tpls, s, date, at, by), at), done);
  else setStatus(done);
  render();
}

async function saveTemplate(t, done) {
  busy = true; render();
  try {
    templates = await changeTemplates(b => upsertTemplate(b, t, now(), me()));
    tplEdit = null; saveAs = null; problems = [];
    setStatus(done);
  } catch (e) {
    if (e.name === 'NeedsSignIn') needSignIn();
    setStatus(`Not saved. ${e.message}`);
  } finally { busy = false; render(); }
}

export async function onSetupClick(ev) {
  const b = ev.target.closest('button[data-act]');
  if (!b || !meta) return;
  keepTyping();
  const { act, id } = b.dataset;
  if (act === 'setupedit') { editing = true; plan = null; draft = { ...setup }; render(); }
  else if (act === 'setupcancel') { editing = false; plan = null; render(); }
  else if (act === 'setuppreview') { if (draft.package) preview(draft); }
  else if (act === 'setupupdate') { editing = false; preview(setup); }
  else if (act === 'setupback') { plan = null; render(); }
  else if (act === 'setupapply') apply();
  else if (act === 'tplopen') { tplOpen = !tplOpen; render(); }
  else if (act === 'tplclose') { tplOpen = false; tplEdit = null; saveAs = null; render(); }
  else if (act === 'saveasopen') { saveAs = { name: '', forV: setup.package ? `package:${setup.package}` : 'all' }; render(); const n = $('saveAsName'); if (n) n.focus(); }
  else if (act === 'saveascancel') { saveAs = null; render(); }
  else if (act === 'saveasgo') {
    if (!saveAs.name.trim()) { setStatus('Give the template a name.'); return; }
    const t = templateFromChecklist(hooks.tasks(), meta.weddingDate, { name: saveAs.name, for: forFromValue(saveAs.forV) });
    saveTemplate(t, `Saved "${t.name}" with ${t.items.length} task${t.items.length === 1 ? '' : 's'}.`);
  } else if (act === 'tplnew') {
    tplEdit = { id: newTemplateId(), isNew: true, name: '', forV: 'all', rows: [{ id: newItemId(), title: '', when: '', who: 'SBE' }] };
    problems = []; render();
  } else if (act === 'tpledit') {
    const t = templates.templates.find(x => x.id === id);
    if (t) tplEdit = { id: t.id, isNew: false, name: t.name, forV: forValue(t.for), rows: t.items.map(it => ({ id: it.id, title: it.title, when: formatWhen(it.before), who: it.who, notes: it.notes })) };
    problems = []; saveAs = null; render();
  } else if (act === 'tplcancel') { tplEdit = null; problems = []; render(); }
  else if (act === 'tplrowadd') { tplEdit.rows.push({ id: newItemId(), title: '', when: '', who: 'SBE' }); render(); }
  else if (act === 'tplrowdel') { tplEdit.rows.splice(+b.dataset.row, 1); render(); }
  else if (act === 'tplsave') {
    const rows = tplEdit.rows.filter(r => r.title.trim());
    problems = [];
    if (!tplEdit.name.trim()) problems.push('Give the template a name.');
    const items = rows.map((r, i) => {
      const before = parseWhen(r.when);
      if (before === null) problems.push(`Task ${i + 1} ("${r.title.trim()}"): write when, like "6 weeks before" or "day of".`);
      return { id: r.id, title: r.title, before: before === null ? '' : before, who: r.who, notes: r.notes || '' };
    });
    if (problems.length) { render(); return; }
    saveTemplate({ id: tplEdit.id, name: tplEdit.name, for: forFromValue(tplEdit.forV), items }, `Saved "${tplEdit.name.trim()}".`);
  } else if (act === 'tplask') { confirmTpl = id; render(); }
  else if (act === 'tplkeep') { confirmTpl = null; render(); }
  else if (act === 'tpldelete') {
    busy = true; render();
    try { templates = await changeTemplates(bk => removeTemplate(bk, id, now())); setStatus('Template deleted.'); }
    catch (e) { if (e.name === 'NeedsSignIn') needSignIn(); setStatus(`Not deleted. ${e.message}`); }
    finally { busy = false; confirmTpl = null; render(); }
  }
}

// The package choice changed: redraw so the services and traditions that go with it show.
export function onSetupChange(ev) {
  if (ev.target.name === 'package') { draft = readSetupForm(); plan = null; render(); }
}
