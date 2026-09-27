// SBE Event Manager entry point: load the event list and wire up the controls.
import { state } from './state.js';
import { $ } from './dom.js';
import { loadEventList, loadEvent } from './events.js';
import { showTimeline, onCuratedClick, onCuratedSubmit, addDay, saveTimeline, revertTimeline, exportTimeline } from './timeline.js';
import { generateDraft, shiftTimes } from './generator.js';
import { showStatus, onStatusChange, saveStatus, revertStatus, exportStatus } from './status.js';
import { esc } from './util.js';

async function init() {
  await loadEventList();
  const sel = $('eventSelect');
  sel.innerHTML = state.eventList.map(e => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (state.eventList.length) {
    sel.value = state.eventList[0].id;
    await loadEvent(sel.value);
  }
  sel.addEventListener('change', () => loadEvent(sel.value));

  const on = (id, evt, fn) => $(id).addEventListener(evt, fn);
  on('btnTimeline', 'click', showTimeline);
  on('btnStatus', 'click', showStatus);
  on('btnSave', 'click', saveTimeline);
  on('btnRevert', 'click', revertTimeline);
  on('btnExport', 'click', exportTimeline);
  on('btnGenerate', 'click', generateDraft);
  on('btnShift', 'click', shiftTimes);
  on('btnAddDay', 'click', addDay);
  on('btnSaveStatus', 'click', saveStatus);
  on('btnRevertStatus', 'click', revertStatus);
  on('btnExportStatus', 'click', exportStatus);
  on('statusSection', 'change', onStatusChange);
  on('curated', 'click', onCuratedClick);
  on('curated', 'submit', onCuratedSubmit);
}

init();
