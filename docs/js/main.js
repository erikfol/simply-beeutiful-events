// SBE Event Manager entry point: load the event list and wire up the controls.
import { state } from './state.js';
import { $ } from './dom.js';
import { loadEventList, loadEvent } from './events.js';
import { showTimeline, renderCurated, onCuratedClick, onCuratedSubmit, saveTimeline, revertTimeline, exportTimeline } from './timeline.js';
import { openGenerator, openAddDay, openShift, closePanel, onPanelSubmit, onPanelClick, onPanelChange } from './panel.js';
import { buildPrintSheet, printTimeline } from './print.js';
import { showStatus, onStatusChange, saveStatus, revertStatus, exportStatus } from './status.js';
import { ROLES } from './roles.js';
import { esc } from './util.js';

async function init() {
  await loadEventList();
  const sel = $('eventSelect');
  sel.innerHTML = state.eventList.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (state.eventList.length) {
    sel.value = state.eventList[0].id;
    await loadEvent(sel.value);
  }
  sel.addEventListener('change', () => { closePanel(); loadEvent(sel.value); });

  const view = $('viewRole');
  view.innerHTML = `<option value="">Full timeline</option>` + ROLES.filter(([k]) => k !== 'planner').map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
  view.addEventListener('change', () => { state.viewRole = view.value; if (state.currentCurated) renderCurated(); });

  const on = (id, evt, fn) => $(id).addEventListener(evt, fn);
  on('btnTimeline', 'click', showTimeline);
  on('btnStatus', 'click', showStatus);
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
  on('curated', 'click', onCuratedClick);
  on('curated', 'submit', onCuratedSubmit);
  // Ctrl+P prints the same branded sheet as the button
  window.addEventListener('beforeprint', buildPrintSheet);
}

init();
