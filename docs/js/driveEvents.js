// Pure rules for turning Google Drive folders and files into events and documents. No DOM, no network.

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

// "6.12.27 Harper-Bennett Wedding" -> 2027-06-12 (M.D.YY, as SBE names folders); "2027-06-12 ..." also works.
export function parseEventFolderName(name) {
  const clean = (name || '').trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\s+(.+)$/.exec(clean);
  if (m) {
    const [, mo, d, y, rest] = m;
    const year = y.length === 2 ? `20${y}` : y;
    if (+mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31) {
      return { date: `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`, title: rest.trim() };
    }
  }
  m = /^(\d{4})-(\d{2})-(\d{2})\s+(.+)$/.exec(clean);
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, title: m[4].trim() };
  return { date: null, title: clean };
}

// A subfolder of the SBE events folder becomes an event; folders without a date in the name are skipped.
export function folderToEvent(folder) {
  const { date } = parseEventFolderName(folder.name);
  if (!date) return null;
  return {
    id: `drive-${folder.id}`,
    driveId: folder.id,
    name: folder.name,
    weddingDate: date,
    venue: '',
    source: 'drive',
    webViewLink: folder.webViewLink || '',
  };
}

// Upcoming events soonest first, then past events most recent first.
export function sortEvents(events, today) {
  const upcoming = events.filter(e => e.weddingDate >= today).sort((a, b) => a.weddingDate.localeCompare(b.weddingDate));
  const past = events.filter(e => e.weddingDate < today).sort((a, b) => b.weddingDate.localeCompare(a.weddingDate));
  return [...upcoming, ...past];
}

// Accepts a pasted Drive folder link or a bare folder ID.
export function parseFolderId(input) {
  const s = (input || '').trim();
  const m = /\/folders\/([\w-]{10,})/.exec(s) || /[?&]id=([\w-]{10,})/.exec(s);
  if (m) return m[1];
  return /^[\w-]{10,}$/.test(s) ? s : null;
}

const MIME_LABELS = {
  'application/vnd.google-apps.document': 'Google Doc',
  'application/vnd.google-apps.spreadsheet': 'Google Sheet',
  'application/vnd.google-apps.presentation': 'Google Slides',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'text/plain': 'Text',
  'text/markdown': 'Text',
};

// Same naming rules the scanner uses (see README "Google Drive event folders").
export function classifyFile(name, mimeType = '') {
  const n = name || '';
  const isSheet = /spreadsheet|excel|sheet/.test(mimeType) || /\.xlsx?$/i.test(n);
  const type = MIME_LABELS[mimeType] || (mimeType.startsWith('image/') ? 'Image' : (/\.(\w{2,5})$/.exec(n) || [, 'File'])[1].toUpperCase());
  let kind = 'document';
  if (/budget/i.test(n) && isSheet) kind = 'budget';
  else if (/vendor options/i.test(n) && isSheet) kind = 'vendors';
  else if (/contract|agreement|quote|estimate|invoice|receipt/i.test(n)) kind = 'contract';
  else if (mimeType.startsWith('image/') || /\.(png|jpe?g|heic|gif|webp)$/i.test(n)) kind = 'photo';
  return { kind, type };
}

export const KIND_LABELS = { budget: 'Budget', vendors: 'Vendor list', contract: 'Contract / quote', photo: 'Photo', document: 'Document' };

// App data file names in the "SBE App Data" folder, one per event and kind.
export const appDataName = (driveId, kind) => `event-${driveId}.${kind}.json`;
