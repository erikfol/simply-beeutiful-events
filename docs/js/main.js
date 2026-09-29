// SBE Event Manager entry point: load the event list and wire up the controls.
import { state } from './state.js';
import { $, setStatus } from './dom.js';
import { isConfigured, isSignedIn } from './google.js';
import { loadEvent, setDriveEvents, clearEvent } from './events.js';
import { showTimeline, renderCurated, onCuratedClick, onCuratedSubmit, saveTimeline, revertTimeline, exportTimeline } from './timeline.js';
import { openGenerator, openAddDay, openShift, closePanel, onPanelSubmit, onPanelClick, onPanelChange } from './panel.js';
import { buildPrintSheet, printTimeline } from './print.js';
import { showStatus, onStatusChange, onStatusClick, saveStatus, revertStatus, exportStatus } from './status.js';
import { showDocuments } from './docs.js';
import { showOverview, renderOverview, onOverviewClick, onOverviewSubmit } from './overview.js';
import { initDriveBar } from './drivebar.js';
import { ROLES } from './roles.js';
import { esc } from './util.js';

const EVENT_BUTTONS = ['btnOverview', 'btnTimeline', 'btnStatus', 'btnDocs'];

// Event dropdown: the events found in Google Drive. Empty (with a hint) until someone signs in.
function renderPicker(selectedId) {
  const sel = $('eventSelect');
  const hasEvents = state.eventList.length > 0;
  sel.innerHTML = hasEvents
    ? state.eventList.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')
    : `<option value="">${!isConfigured() ? 'No events' : isSignedIn() ? 'Choose the SBE events folder above' : 'Sign in with Google to see your events'}</option>`;
  sel.disabled = !hasEvents;
  for (const id of EVENT_BUTTONS) $(id).disabled = !hasEvents;
  if (selectedId && state.eventList.some(e => e.id === selectedId)) sel.value = selectedId;
  return hasEvents ? sel.value : '';
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
  if (!events.length) { closePanel(); clearEvent(); renderPicker(''); return; }
  let pick;
  if (openFirst || !events.some(e => e.id === current)) pick = events[0].id;
  else pick = current; // Refresh: stay on the open event and reload it so new files show up
  renderPicker(pick);
  openEvent(pick);
}

async function init() {
  renderPicker('');
  if (!isConfigured()) setStatus('Google sign-in is not set up for this copy of the app.');
  $('eventSelect').addEventListener('change', (e) => { if (e.target.value) openEvent(e.target.value); });

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
