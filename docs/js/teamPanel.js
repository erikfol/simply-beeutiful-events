// Team section on the landing page: who can open the events folder, who can save in "SBE App Data",
// when each person last signed in, what's missing for each, and how to add someone.
import { $ } from './dom.js';
import { loadTeam } from './team.js';
import { esc, fmtDate, todayISO } from './util.js';
import { APP_DATA_FOLDER } from './config.js';

// Google Cloud page where the app's test users (the people allowed to sign in) are listed.
const AUDIENCE_PAGE = 'https://console.cloud.google.com/auth/audience';

const EVENTS_TEXT = { owner: 'Owner', edit: 'Can edit', view: 'Can view' };
const SAVING_TEXT = { yes: 'Yes', view: 'View only' };
const LEVEL_TEXT = { owner: 'owner', edit: 'can edit', view: 'can view' };

let seq = 0;
let last = null; // the Drive status the section was last drawn for

export function initTeam() {
  $('teamCard').addEventListener('click', (ev) => {
    if (ev.target.closest('button[data-act="teamcheck"]') && last) showTeam(last);
  });
}

const linkTo = (f, text) => (f && /^https:\/\//.test(f.link || '') ? `<a href="${esc(f.link)}" target="_blank" rel="noopener">${text}</a>` : text);

function nextStep(r, eventsName) {
  if (r.status === 'ready') return '✅ All set';
  if (r.status === 'no-events') return `⚠️ Can't see the events: share “${eventsName}” with them.`;
  if (r.status === 'cant-save') return `⚠️ Can't save yet: share “${esc(APP_DATA_FOLDER)}” with them as <strong>Editor</strong>.`;
  return '⏳ Hasn\'t signed in yet. If Google blocks them, add them as a test user (step 2 below).';
}

function table(team, s) {
  const eventsName = esc(s.folder.name);
  const rows = team.rows.map(r => `<tr>
      <td><strong>${esc(r.name || r.email)}</strong>${r.name ? `<small class="team-email">${esc(r.email)}</small>` : ''}</td>
      <td>${r.events === undefined ? '<span class="hint">Not shown</span>' : r.events ? EVENTS_TEXT[r.events] : 'No access'}</td>
      <td>${r.saving ? SAVING_TEXT[r.saving] : 'No'}</td>
      <td>${r.lastSeen ? esc(fmtDate(r.lastSeen)) : '—'}</td>
      <td>${nextStep(r, eventsName)}</td>
    </tr>`).join('');
  return `<div class="tablewrap"><table class="grid team-table">
      <thead><tr><th scope="col">Person</th><th scope="col">${eventsName}</th><th scope="col">Can save</th><th scope="col">Last sign-in</th><th scope="col">What's next</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
}

function body(team, s) {
  const eventsName = esc(s.folder.name);
  const where = (w) => (w === 'events' ? eventsName : esc(APP_DATA_FOLDER));
  const shares = team.shares.map(x => x.open
    ? `<p class="db-warn">⚠️ “${where(x.where)}” is shared with <strong>${esc(x.who)}</strong> (${LEVEL_TEXT[x.level]}), so people not on this list can open client documents. To close it, open the folder in Google Drive → <strong>Share</strong> → <em>General access</em> → <strong>Restricted</strong>.</p>`
    : `<p class="hint">“${where(x.where)}” is also shared with the group <strong>${esc(x.who)}</strong> (${LEVEL_TEXT[x.level]}).</p>`).join('');
  if (!team.rows.length) {
    return `${shares}<p class="hint">Only the owner of “${eventsName}”, or someone who can edit it, can see who has access.</p>`;
  }
  const partial = team.eventsKnown ? ''
    : `<p class="hint">Who can open “${eventsName}” is only visible to its owner or editors, so that column is blank. Everyone listed can see the shared “${esc(APP_DATA_FOLDER)}” folder inside it.</p>`;
  return `${shares}${table(team, s)}${partial}
    <p class="team-actions"><button type="button" class="mini" data-act="teamcheck">Check again</button>
    <span class="hint">Sign-ins are noted from November 2026 on; anyone who hasn't signed in since shows “—”.</span></p>`;
}

function steps(s) {
  const eventsLink = linkTo(s.folder, `“${esc(s.folder.name)}”`);
  const appLink = linkTo(s.access && s.access.folder, `“${esc(APP_DATA_FOLDER)}”`);
  return `<details class="team-steps"><summary>Add a team member</summary>
    <ol>
      <li><strong>They need a Google account.</strong> A Gmail address works, or a Google account made with their own email address.</li>
      <li><strong>Let them sign in</strong> (whoever manages the app): in <a href="${AUDIENCE_PAGE}" target="_blank" rel="noopener">Google Cloud → Google Auth Platform → Audience</a>, under <em>Test users</em>, click <em>Add users</em> and add their email. Only people on that list can sign in.</li>
      <li><strong>Share the folders</strong> (the owner of the events folder): in Google Drive, share ${eventsLink} with them (<em>Viewer</em> is enough for the app, <em>Editor</em> if they also change documents in Drive), and share ${appLink} inside it as <em>Editor</em> so they can save.</li>
      <li><strong>They sign in once</strong> on this page. Google first says it hasn't verified the app: click <em>Continue</em>, tick the Google Drive box, then choose ${eventsLink}.</li>
      <li>Click <strong>Check again</strong> above. They should show ✅ All set.</li>
    </ol>
  </details>`;
}

// Draw the section for the current Drive status (signed in, folder chosen); hide it otherwise.
export async function showTeam(s) {
  last = s;
  const card = $('teamCard');
  if (!s || !s.signedIn || !s.folder) { card.hidden = true; return; }
  card.hidden = false;
  const ticket = ++seq;
  $('teamBody').innerHTML = `<p class="hint">Checking who has access…</p>${steps(s)}`;
  try {
    const team = await loadTeam({
      eventsFolderId: s.folder.id,
      appFolderId: s.access && s.access.folder ? s.access.folder.id : null,
      me: s.user, today: todayISO(),
    });
    if (ticket !== seq) return;
    $('teamBody').innerHTML = body(team, s) + steps(s);
  } catch (e) {
    if (ticket !== seq) return;
    $('teamBody').innerHTML = `<p class="db-warn">Couldn't check who has access: ${esc(e.message)}</p>${steps(s)}`;
  }
}
