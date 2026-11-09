// Run: node --test wealthtrack/tests/security.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const X = require(path.join(__dirname, '../web/xlsx.js'));
const WT = require(path.join(__dirname, '../web/core.js'));
const S = require(path.join(__dirname, '../web/store.js'));

test('CSV neutralizes formula injection in text cells', () => {
  const csv = X.buildCsv({ columns: [{ header: 'Name' }, { header: 'Amt', type: 'money' }], rows: [
    ['=HYPERLINK("http://evil","x")', 1234], ['+cmd|calc', -500], ['-2+3', 0], ['@SUM(A1)', 1], ['\tx', 2], ['\rx', 3], ['normal, text "q"', 4],
  ] });
  const lines = csv.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines[1], `"'=HYPERLINK(""http://evil"",""x"")",12.34`);
  assert.equal(lines[2], "'+cmd|calc,-5.00"); // negative money stays a number
  assert.ok(lines[3].startsWith("'-2+3"));
  assert.ok(lines[4].startsWith("'@SUM"));
  assert.ok(lines[5].startsWith("'\tx"));
  assert.ok(lines[6].startsWith(`"'\rx"`));
  assert.equal(lines[7], '"normal, text ""q""",0.04');
});

test('CSV/XLSX skip non-finite numbers', () => {
  const csv = X.buildCsv({ columns: [{ header: 'A', type: 'money' }, { header: 'B', type: 'number' }], rows: [[NaN, Infinity]] });
  assert.equal(csv.split('\r\n')[1], ',');
  const x = X.buildXlsx([{ name: 'S', columns: [{ header: 'A', type: 'money' }, { header: 'D', type: 'date' }], rows: [[NaN, '2026-13-45x']] }]);
  assert.ok(!Buffer.from(x).toString('latin1').includes('NaN'));
});

test('XLSX is valid, escapes XML and control characters (opened with openpyxl)', (t) => {
  const evil = '<x>&"\u0001\u0008 =1+1 \uD800 tail';
  const bytes = X.buildXlsx([{ name: 'Bills/<1>', columns: [{ header: 'Text' }, { header: 'Money', type: 'money' }, { header: 'Date', type: 'date' }], rows: [[evil, 12345, '2026-11-06'], ['=CMD()', -1, '']] }]);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wtx-')), 't.xlsx');
  fs.writeFileSync(f, bytes);
  let out;
  try {
    out = execFileSync('python3', ['-I', '-c', `
import openpyxl,sys,json
wb=openpyxl.load_workbook(sys.argv[1]); ws=wb.worksheets[0]
print(json.dumps({'title':ws.title,'a2':ws['A2'].value,'b2':str(ws['B2'].value),'c2':str(ws['C2'].value),'a3':ws['A3'].value,'t3':ws['A3'].data_type}))`, f]).toString();
  } catch (e) { t.skip('openpyxl not available: ' + e.message); return; }
  const r = JSON.parse(out);
  assert.equal(r.title, 'Bills <1>');
  assert.ok(r.a2.startsWith('<x>&"'));
  assert.ok(!/[\u0001\u0008]/.test(r.a2));
  assert.equal(r.b2, '123.45');
  assert.ok(r.c2.startsWith('2026-11-06'));
  assert.equal(r.a3, '=CMD()'); // stored as text (inline string), never a formula
  assert.equal(r.t3, 's');
});

test('backup sanitizer: prototype pollution, bad ids, bad types, bad colors, bad images', () => {
  const raw = JSON.parse(`{
    "templates": {
      "bill_ok": {"id":"bill_ok","name":"Rent","category":"cat_housing","versions":[{"from":"2026-11-01","anchor":"2026-11-01","amountCents":"70000","frequency":"monthly"}]},
      "bill_bad": {"id":"bill_bad","name":"Bad","versions":[{"from":"x","anchor":"2026-11-01","amountCents":1,"frequency":"monthly"}]},
      "__proto__": {"id":"__proto__","polluted":true,"name":"p","versions":[]}
    },
    "instances": {
      "i_bill_ok_2026-11-01": {"id":"i_bill_ok_2026-11-01","templateId":"bill_ok","periodKey":"2026-11-01","dueDate":"2026-11-01","amountCents":70000.4,"name":"Rent","custom":"zzz"},
      "x\\" onmouseover=\\"alert(1)": {"id":"x\\" onmouseover=\\"alert(1)","templateId":"bill_ok","periodKey":"2026-12-01","dueDate":"2026-12-01","amountCents":1,"name":"x"},
      "i_ghost_2026-11-02": {"id":"i_ghost_2026-11-02","templateId":"ghost","periodKey":"2026-11-02","dueDate":"2026-11-02","amountCents":500,"name":"Ghost"}
    },
    "payments": {
      "p1": {"id":"p1","instanceId":"i_bill_ok_2026-11-01","amountCents":70000,"date":"2026-11-02"},
      "p2": {"id":"p2","instanceId":"nope","amountCents":1,"date":"2026-11-02"},
      "p3": {"id":"p3","instanceId":"i_bill_ok_2026-11-01","amountCents":"abc","date":"2026-11-02"}
    },
    "categories": {"cat_x": {"id":"cat_x","name":"<img src=x onerror=alert(1)>","color":"red;}</style><script>alert(1)</script>"}},
    "receipts": {"r1": {"id":"r1","dataUrl":"javascript:alert(1)"}, "r2": {"id":"r2","dataUrl":"data:image/png;base64,iVBORw0KGgo="}},
    "expenses": {"e1": {"id":"e1","amountCents":100,"date":"2026-11-03","category":"cat_x","receiptId":"r1"}},
    "accounts": {"acc_checking": {"id":"acc_checking","name":"Checking","type":"<b>x</b>","openingCents":"1000"}},
    "meta": {"settings": {"id":"settings","theme":"<script>","dashboard":{"order":["summary","<img>"],"hidden":[]},"evil":"x","__proto__":{"polluted":true}}},
    "debts": {"d1": {"id":"d1","name":"Card","type":"credit_card","startBalanceCents":1e20,"startDate":"2026-11-01"}}
  }`);
  const { data, report } = S.sanitizeData(raw, WT.COLLS);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.getPrototypeOf(data.templates), Object.prototype);
  assert.ok(data.templates.bill_ok);
  assert.equal(data.templates.bill_ok.versions[0].amountCents, 70000);
  assert.equal(data.templates.bill_bad, undefined);
  assert.equal(data.instances['i_bill_ok_2026-11-01'].amountCents, 70000);
  assert.deepEqual(data.instances['i_bill_ok_2026-11-01'].custom, {});
  assert.equal(Object.keys(data.instances).some(k => k.includes('"')), false);
  assert.ok(data.templates.ghost && data.templates.ghost.deleted, 'orphan instance keeps its history via a recreated deleted bill');
  assert.ok(data.payments.p1);
  assert.equal(data.payments.p2, undefined);
  assert.equal(data.payments.p3, undefined);
  assert.equal(data.categories.cat_x.color, '#94a3b8');
  assert.equal(data.receipts.r1, undefined);
  assert.ok(data.receipts.r2);
  assert.equal(data.expenses.e1.receiptId, null);
  assert.equal(data.accounts.acc_checking.type, 'other');
  assert.equal(data.accounts.acc_checking.openingCents, 1000);
  assert.equal(data.meta.settings.theme, undefined);
  assert.equal(data.meta.settings.evil, undefined);
  assert.deepEqual(data.meta.settings.dashboard.order, ['summary']);
  assert.equal(data.debts.d1, undefined);
  assert.ok(report.dropped >= 6);
  // the cleaned data loads and runs through core logic without throwing
  WT.setToday('2026-11-06');
  WT.init(data, { put() { }, del() { } });
  WT.runMaintenance('2026-11-06');
  assert.deepEqual(WT.integrity(), []);
  assert.throws(() => S.sanitizeData(null, WT.COLLS));
  assert.throws(() => S.sanitizeData([], WT.COLLS));
});
