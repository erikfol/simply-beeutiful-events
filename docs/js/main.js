// SBE Event Manager entry point: load the event list and wire up the controls.
import { state } from './state.js';
import { $ } from './dom.js';
import { loadEventList, loadEvent, setDriveEvents, isDriveEvent } from './events.js';
import { showTimeline, renderCurated, onCuratedClick, onCuratedSubmit, saveTimeline, revertTimeline, exportTimeline } from './timeline.js';
import { openGenerator, openAddDay, openShift, closePanel, onPanelSubmit, onPanelClick, onPanelChange } from './panel.js';
import { buildPrintSheet, printTimeline } from './print.js';
import { showStatus, onStatusChange, onStatusClick, saveStatus, revertStatus, exportStatus } from './status.js';
import { showDocuments } from './docs.js';
import { showOverview, renderOverview, onOverviewClick, onOverviewSubmit } from './overview.js';
import { initDriveBar } from './drivebar.js';
import { ROLES } from './roles.js';
import { esc } from './util.js';

// Event dropdown: Google Drive events (when signed in) above the demo and local events.
function renderPicker(selectedId) {
  const sel = $('eventSelect');
  const opt = e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`;
  const drive = state.eventList.filter(e => isDriveEvent(e));
  const other = state.eventList.filter(e => !isDriveEvent(e));
  sel.innerHTML = drive.length
    ? `<optgroup label="Google Drive">${drive.map(opt).join('')}</optgroup><optgroup label="Demo and local">${other.map(opt).join('')}</optgroup>`
    : other.map(opt).join('');
  if (selectedId && state.eventList.some(e => e.id === selectedId)) sel.value = selectedId;
  return sel.value;
}

// Opening an event shows its Overview (the event hub).
async function openEvent(id) {
  closePanel();
  $('eventSelect').value = id;
  if (await loadEvent(id)) showOverview();
}

// Documents finished reading or a correction was saved: redraw whichever view is open.
function refreshVisible() {
  if (!$('overviewSection').hidden) renderOverview();
  else if (!$('timelineSection').hidden) showTimeline();
  else if (!$('statusSection').hidden) showStatus();
  else if (!$('docsSection').hidden) showDocuments();
}

// Called by the Google bar with the events found in Drive ([] after sign-out).
// openFirst: right after sign-in or choosing a folder, open the soonest upcoming event.
function onDriveEvents(events, openFirst) {
  const current = state.currentMeta && state.currentMeta.id;
  setDriveEvents(events);
  let pick;
  if (openFirst && events.length) pick = events[0].id;
  else if (state.eventList.some(e => e.id === current)) pick = current;
  else pick = state.eventList[0] && state.eventList[0].id;
  renderPicker(pick);
  // switch events, or reload the open Drive event so new files show up
  if (pick && (pick !== current || isDriveEvent())) openEvent(pick);
}

async function init() {
  await loadEventList();
  const first = renderPicker(state.eventList[0] && state.eventList[0].id);
  if (first) await openEvent(first);
  $('eventSelect').addEventListener('change', (e) => openEvent(e.target.value));

  const view = $('viewRole');
  view.innerHTML = `<option value="">Full timeline</option>` + ROLES.filter(([k]) => k !== 'planner').map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  view.addEventListener('change', () => { state.viewRole = view.value; if (state.currentCurated) renderCurated(); });

  const on = (id, evt, fn) => $(id).addEventListener(evt, fn);
  on('btnOverview', 'click', showOverview);
  on('btnTimeline', 'click', showTimeline);
  on('btnStatus', 'click', showStatus);
  on('btnDocs', 'click', showDocuments);
  on('btnSave', 'click', saveTimeline);
  on('btnRevert', 'click', revertTimeline);
  on('btnExport', 'click', exportTimeline);
  on('btnGenerate', 'click', openGenerator);
  on('btnAddDay', 'click', openAddDay);
  on('btnShift', 'click', () => openShift());
  on('btnPrint', 'click', printTimeline);
  on('panel', 'submit', onPanelSubmit);
  on('panel', 'click', onPanelClick);
  on('panel', 'change', onPanelChange);
  on('btnSaveStatus', 'click', saveStatus);
  on('btnRevertStatus', 'click', revertStatus);
  on('btnExportStatus', 'click', exportStatus);
  on('statusSection', 'change', onStatusChange);
  on('statusSection', 'click', onStatusClick);
  on('curated', 'click', onCuratedClick);
  on('curated', 'submit', onCuratedSubmit);
  on('overviewSection', 'click', onOverviewClick);
  on('overviewSection', 'submit', onOverviewSubmit);
  window.addEventListener('sbe:report-updated', refreshVisible);
  window.addEventListener('sbe:reading', () => { if (!$('overviewSection').hidden) renderOverview(); else if (!$('docsSection').hidden) showDocuments(); });
  // Ctrl+P prints the same branded sheet as the button
  window.addEventListener('beforeprint', buildPrintSheet);

  initDriveBar(onDriveEvents);
}

init();
