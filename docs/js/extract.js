// Turn one Drive file into text (and spreadsheet rows), in the browser. Libraries load only when needed,
// from docs/vendor/ on this site. Nothing is sent anywhere except the Drive requests themselves; scanned
// PDFs and old .doc files are converted by Google Drive itself (see readViaGoogle).
import { fileBytes, fileText, exportFile, uploadAsGoogleDoc, deleteFile } from './drive.js';
import { appFolderId } from './appdata.js';
import { workbookToSheets, sheetsToText } from './scan.js';

const VENDOR = new URL('../vendor/', import.meta.url);
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_BYTES = 25 * 1024 * 1024;

const libs = {};
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src.split('/').pop()}`));
    document.head.append(s);
  });
}
async function pdfjs() {
  if (!libs.pdf) {
    libs.pdf = import(new URL('pdfjs-6.3.289/pdf.min.mjs', VENDOR).href).then(m => {
      m.GlobalWorkerOptions.workerSrc = new URL('pdfjs-6.3.289/pdf.worker.min.mjs', VENDOR).href;
      return m;
    });
  }
  return libs.pdf;
}
async function mammoth() {
  libs.mammoth = libs.mammoth || loadScript(new URL('mammoth-1.13.0/mammoth.browser.min.js', VENDOR).href).then(() => window.mammoth);
  return libs.mammoth;
}
async function xlsx() {
  libs.xlsx = libs.xlsx || loadScript(new URL('sheetjs-0.20.3/xlsx.full.min.js', VENDOR).href).then(() => window.XLSX);
  return libs.xlsx;
}

async function pdfText(buf) {
  const lib = await pdfjs();
  const task = lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false });
  try {
    const doc = await task.promise;
    const pages = [];
    for (let n = 1; n <= Math.min(doc.numPages, 10); n++) { // first 10 pages, like the Python scanner
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join(''));
    }
    return pages.join('\n');
  } finally {
    await task.destroy(); // frees the PDF worker's memory
  }
}

// Let Google Drive turn a scanned PDF or an old .doc into a Google Doc, read its text, then delete the copy.
// The copy lives briefly in "SBE App Data"; the original file is never touched.
const hasText = (t) => (t || '').replace(/\s/g, '').length >= 30;
async function readViaGoogle(f, bytes, contentType) {
  const copy = await uploadAsGoogleDoc(`SBE reading copy - ${f.name}`, await appFolderId(), bytes, contentType);
  try {
    return await (await exportFile(copy.id, 'text/plain')).text();
  } finally {
    await deleteFile(copy.id).catch(() => {}); // a leftover copy in SBE App Data is harmless
  }
}

async function sheets(buf) {
  const XLSX = await xlsx();
  return workbookToSheets(XLSX, XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true }));
}

/**
 * @returns {Promise<{text: string, sheets?: object} | {skip: string} | {problem: string}>}
 */
export async function extractFile(f) {
  const mime = f.mimeType || '';
  const name = f.name || '';
  if (f.size && Number(f.size) > MAX_BYTES) return { problem: `Too large to read in the browser (${Math.round(f.size / 1048576)} MB).` };
  if (mime.startsWith('image/') || /\.(png|jpe?g|heic|gif|webp)$/i.test(name)) return { skip: 'photo' };
  if (mime === 'application/vnd.google-apps.document') {
    return { text: await (await exportFile(f.id, 'text/plain')).text() };
  }
  if (mime === 'application/vnd.google-apps.spreadsheet') {
    const s = await sheets(await (await exportFile(f.id, XLSX_MIME)).arrayBuffer());
    return { text: sheetsToText(s), sheets: s };
  }
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    const bytes = await fileBytes(f.id);
    let text = '';
    try { text = await pdfText(bytes.slice(0)); } catch { /* damaged or unusual PDF: let Google try below */ }
    if (hasText(text)) return { text };
    // A scan or a picture of a page: Google Drive's text recognition (OCR)
    const ocr = await readViaGoogle(f, bytes, 'application/pdf');
    if (!hasText(ocr)) return { problem: 'No readable text, even with Google\'s text recognition (handwriting or a blurry scan?). Open it to check dates and amounts by hand.' };
    return { text: ocr, via: 'google' };
  }
  if (/wordprocessingml/.test(mime) || /\.docx$/i.test(name)) {
    const lib = await mammoth();
    return { text: (await lib.extractRawText({ arrayBuffer: await fileBytes(f.id) })).value };
  }
  if (/spreadsheetml|ms-excel/.test(mime) || /\.xlsx?$/i.test(name)) {
    const s = await sheets(await fileBytes(f.id));
    return { text: sheetsToText(s), sheets: s };
  }
  if (mime.startsWith('text/') || /\.(txt|md|csv)$/i.test(name)) return { text: await fileText(f.id) };
  if (mime.startsWith('application/vnd.google-apps.')) return { skip: 'google-other' }; // Slides, Forms, shortcuts
  if (/\.doc$/i.test(name) || mime === 'application/msword') {
    // Old Word format: Google Drive converts it
    return { text: await readViaGoogle(f, await fileBytes(f.id), 'application/msword'), via: 'google' };
  }
  return { skip: 'type' };
}
