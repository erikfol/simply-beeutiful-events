// Landing page entry point: sign in with Google once, choose the SBE events folder, then open the
// Event Manager or the Inventory. The other pages reuse this sign-in (see google.js).
import { $ } from './dom.js';
import { isConfigured } from './google.js';
import { initDriveBar, driveStatus, APP_PAGES } from './drivebar.js';

// Where to go after signing in, when another page sent the visitor here (?next=events.html).
const next = new URLSearchParams(location.search).get('next');

function render() {
  const s = driveStatus();
  const ready = !isConfigured() || (s.signedIn && !!s.folder);
  for (const tile of document.querySelectorAll('.apptile[data-href]')) { // the public booking page never locks
    tile.classList.toggle('locked', !ready);
    if (ready) { tile.href = tile.dataset.href; tile.removeAttribute('aria-disabled'); }
    else { tile.removeAttribute('href'); tile.setAttribute('aria-disabled', 'true'); }
  }
  $('eventCount').textContent = ready && s.folder ? `${s.eventCount} event${s.eventCount === 1 ? '' : 's'} in “${s.folder.name}”` : '';
  $('tilesHint').hidden = ready;
  $('tilesHint').textContent = s.signedIn ? 'Choose the SBE events folder above to continue.' : 'Sign in above to open these.';
}

// The Google bar calls this after sign-in, choosing a folder, Refresh and sign-out.
function onDriveEvents() {
  render();
  const s = driveStatus();
  if (next && APP_PAGES.includes(next) && s.signedIn && s.folder) location.replace(next);
}

render();
initDriveBar(onDriveEvents, { home: true });
