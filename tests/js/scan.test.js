// The browser reader must find what the Python scanner (tools/scan_event.py) found in the demo event.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import {
  toISO, scanText, sheetsToText, workbookToSheets, parseBudget, parseVendors, buildReport,
  deriveActions, applyCorrections, factId, sentenceWith,
} from '../../docs/js/scan.js';

const DEMO = new URL('../demo_event/6.12.27 Harper-Bennett Wedding (Demo)/', import.meta.url);
const python = JSON.parse(readFileSync(new URL('../../docs/reports/6-12-27-harper-bennett-wedding-demo.json', import.meta.url), 'utf8'));

// The same SheetJS build the site uses, run the way a browser runs it.
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../../docs/vendor/sheetjs-0.20.3/xlsx.full.min.js', import.meta.url), 'utf8'), ctx);
const XLSX = ctx.XLSX;
const readSheets = (name) => workbookToSheets(XLSX, XLSX.read(new Uint8Array(readFileSync(new URL(name, DEMO))), { type: 'array', cellDates: true }));

// Read every demo file the way the browser reader does.
function readDemo() {
  return readdirSync(DEMO).map(name => {
    let result;
    if (name.endsWith('.xlsx')) {
      const sheets = readSheets(name);
      result = scanText(sheetsToText(sheets), name);
      if (/budget/i.test(name)) result.budget = parseBudget(sheets, name);
      if (/vendor options/i.test(name)) result.vendors = parseVendors(sheets);
    } else {
      result = scanText(readFileSync(new URL(name, DEMO), 'utf8'), name);
    }
    return { id: name, name, path: '', mimeType: '', modifiedTime: '', webViewLink: '', result };
  });
}

const pick = (e) => ({ date_raw: e.date_raw, date_iso: e.date_iso, snippet: e.snippet, source: e.source, times: e.times, time: e.time, label: e.label });

test('dates read like the Python scanner, and impossible dates are rejected', () => {
  assert.equal(toISO('6.6.26'), '2026-06-06');
  assert.equal(toISO('6/12/2027'), '2027-06-12');
  assert.equal(toISO('June 6, 2026'), '2026-06-06');
  assert.equal(toISO('june 6 2026'), '2026-06-06');
  assert.equal(toISO('2026-06-06'), '2026-06-06');
  assert.equal(toISO('13/45/2026'), null);
  assert.equal(toISO('2/30/2027'), null);
  assert.equal(toISO('February 29, 2028'), '2028-02-29');
});

test('a date running straight into the next word is still found (Word text)', () => {
  assert.deepEqual(scanText('Event Date: June 6, 2026Venue: the barn', 'x.docx').events.map(e => e.date_iso), ['2026-06-06']);
  assert.deepEqual(scanText('ref 12/12/20261 is not a date', 'x.txt').events, []);
});

test('every demo document yields the same dated mentions as the Python scanner', () => {
  const files = readDemo();
  for (const pf of python.files.filter(f => f.text_len > 0)) {
    const mine = files.find(f => f.name === pf.file);
    assert.ok(mine, `read ${pf.file}`);
    assert.deepEqual(mine.result.events.map(pick), pf.events.map(pick), `events in ${pf.file}`);
    assert.deepEqual(mine.result.amounts, pf.amounts, `amounts in ${pf.file}`);
  }
});

test('budget and vendor sheets match the Python scanner', () => {
  const report = buildReport(readDemo());
  for (const k of ['budget_total', 'total_actual', 'total_paid', 'total_due', 'remaining_budget', 'categories']) {
    assert.deepEqual(report.budget[k], python.budget[k], `budget ${k}`);
  }
  assert.equal(report.budget.recognized, true);
  assert.deepEqual(report.vendors.booked, python.vendors.booked);
  assert.deepEqual(report.vendors.contract_files, python.vendors.contract_files.map(f => f));
});

test('the whole-event timeline matches the Python scanner, order included', () => {
  const report = buildReport(readDemo());
  assert.deepEqual(report.timeline.map(pick), python.timeline.map(pick));
  assert.equal(report.num_files, python.num_files);
  assert.equal(report.num_text_parsed, python.num_text_parsed);
  assert.deepEqual(report.all_amounts, python.all_amounts);
  assert.deepEqual(report.needsLook, [], 'nothing unreadable in the demo');
});

test('payments and deadlines come from the sentence with the date', () => {
  const actions = deriveActions(buildReport(readDemo()).timeline);
  const pay = (d) => actions.find(a => a.type === 'payment' && a.date_iso === d);
  assert.deepEqual([pay('2026-09-15').amount, pay('2026-09-15').kind, pay('2026-09-15').vendor], [400, 'Deposit', 'Summit Coach Lines']);
  assert.equal(pay('2026-10-01').amount, 1000);
  assert.equal(pay('2027-04-13').amount, 4750);
  assert.equal(pay('2027-04-13').kind, 'Balance');
  assert.equal(pay('2027-06-01').amount, 3400);
  assert.ok(!actions.some(a => a.type === 'payment' && a.date_iso === '2027-06-12'), 'the wedding date is not a payment');
  const deadlines = actions.filter(a => a.type === 'deadline').map(a => `${a.date_iso} ${a.vendor}`);
  assert.ok(deadlines.includes('2027-05-12 Hearth & Table Catering'), 'final guest count');
  assert.ok(deadlines.includes('2027-03-12 Planner Notes'), 'invitations must be mailed by a date');
  assert.ok(!deadlines.includes('2027-06-14 Ridgeline Tent & Rental'), 'a pickup where rentals "must be cleared" is not a deadline');
  assert.equal(sentenceWith('…First part. Balance of $900.00 due May 11, 2027. Contact: Marcus…', 'May 11, 2027'), 'Balance of $900.00 due May 11, 2027.');
});

test('planner corrections survive re-reading: ignore, confirm, edit', () => {
  const report = buildReport(readDemo());
  const deposit = report.timeline.find(e => e.date_iso === '2026-09-15');
  const balance = report.timeline.find(e => e.date_iso === '2027-04-13');
  const band = report.timeline.find(e => e.date_iso === '2027-06-01');
  const corrections = {
    [factId(deposit)]: { status: 'ignored' },
    [factId(balance)]: { status: 'edited', date_iso: '2027-04-20', amount: 5000, note: 'venue agreed to move it' },
    [factId(band)]: { status: 'ok' },
  };
  const again = buildReport(readDemo(), corrections); // e.g. after the documents were read again
  assert.ok(!again.timeline.some(e => factId(e) === factId(deposit)), 'ignored mention is gone');
  const edited = again.timeline.find(e => factId(e) === factId(balance));
  assert.deepEqual([edited.date_iso, edited.corrected, edited.note], ['2027-04-20', true, 'venue agreed to move it']);
  const actions = deriveActions(again.timeline);
  assert.equal(actions.find(a => a.id === factId(balance)).amount, 5000);
  assert.equal(actions.find(a => a.id === factId(band)).confirmed, true);
  assert.equal(applyCorrections([deposit], {}).length, 1);
});

test('contacts are collected per vendor document', () => {
  const contacts = buildReport(readDemo()).contacts;
  const glow = contacts.find(c => c.vendor === 'Glow Studio');
  assert.deepEqual(glow.emails, ['book@glowstudio.example.com']);
  assert.deepEqual(glow.phones, ['(603) 555-0106']);
});

test('unreadable files and unfamiliar budget layouts land on the "needs a look" list', () => {
  const files = [
    { id: 'a', name: 'Scan.pdf', path: '', mimeType: 'application/pdf', result: { problem: 'No readable text (probably a scan or a photo of a page).' } },
    { id: 'b', name: 'Budget.xlsx', path: '', mimeType: '', result: { ...scanText('', 'Budget.xlsx'), budget: parseBudget({ Sheet1: [['a', 'b']] }, 'Budget.xlsx') } },
    { id: 'c', name: 'Notes.txt', path: '', mimeType: 'text/plain', result: scanText('Paid on 13/45/2026.', 'Notes.txt') },
  ];
  const report = buildReport(files);
  assert.deepEqual(report.needsLook.map(n => n.file), ['Notes.txt', 'Scan.pdf', 'Budget.xlsx']); // files alphabetically, then event-level notes
  assert.match(report.needsLook[2].problem, /Total Cost/);
  assert.equal(report.files.find(f => f.name === 'Scan.pdf').read, 'problem');
  assert.match(buildReport([]).needsLook[0].problem, /No budget spreadsheet/);
});
