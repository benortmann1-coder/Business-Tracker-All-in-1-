// Home-screen widget snapshot (web/widget.js). Run: node --test wealthtrack/tests/widget.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js'));
const { seed: sampleSeed } = require(path.join(__dirname, 'fixtures/sample-data.js'));
const WW = require(path.join(__dirname, '../web/widget.js'));

const TODAY = '2026-11-13';
function fresh(kind) {
  WT.setToday(TODAY);
  WT.init(null, { put() { }, del() { } });
  if (kind === 'sample') { sampleSeed(WT, { today: TODAY }); WT.runMaintenance(); } else blankSeed(WT, { today: TODAY });
}
const hasMoney = s => /\$\d/.test(JSON.stringify(s));

test('PIN lock: no amounts, names or dates of bills leave the page', () => {
  fresh('sample');
  const s = WW.snapshot(WT, { today: TODAY, pin: true, pro: true });
  assert.equal(s.state, 'pin');
  assert.equal(hasMoney(s), false);
  assert.equal(s.bills, undefined);
});

test('not Pro: locked snapshot with no amounts', () => {
  fresh('sample');
  const s = WW.snapshot(WT, { today: TODAY, pro: false });
  assert.equal(s.state, 'pro');
  assert.equal(hasMoney(s), false);
});

test('demo and blank installs show the empty state', () => {
  fresh('sample');
  assert.equal(WW.snapshot(WT, { today: TODAY, demo: true }).state, 'empty');
  fresh();
  assert.equal(WW.snapshot(WT, { today: TODAY }).state, 'empty');
});

test('sample data: up to 3 unpaid bills, overdue first, formatted amounts', () => {
  fresh('sample');
  const s = WW.snapshot(WT, { today: TODAY });
  assert.equal(s.state, 'ok');
  assert.ok(s.bills.length > 0 && s.bills.length <= 3);
  for (const b of s.bills) { assert.match(b.amount, /^-?\$[\d,]+\.\d\d$/); assert.ok(b.name.length > 0 && b.name.length <= 40); assert.match(b.dueDate, /^\d{4}-\d{2}-\d{2}$/); assert.equal(b.dueShort, WT.shortDate(b.dueDate)); assert.equal(b.overdue, b.dueDate < TODAY); }
  const firstUpcoming = s.bills.findIndex(b => !b.overdue);
  if (firstUpcoming >= 0) assert.ok(s.bills.slice(firstUpcoming).every(b => !b.overdue), 'overdue bills come first');
  assert.match(s.leftText, /^-?\$[\d,]+\.\d\d$/);
  assert.equal(s.leftNeg, s.leftText.startsWith('-'));
  assert.equal(s.overdueCount, WT.overdue(TODAY).length);
  assert.equal(s.asOf, TODAY);
});

test('a paid bill drops off and the next one takes its place', () => {
  fresh();
  WT.addTemplate({ name: 'Electric', amountCents: 9000, anchor: '2026-11-20', category: 'cat_utilities' });
  WT.addTemplate({ name: 'Phone', amountCents: 6000, anchor: '2026-11-25', category: 'cat_phone' });
  WT.runMaintenance();
  let s = WW.snapshot(WT, { today: TODAY });
  assert.equal(s.state, 'ok');
  assert.deepEqual(s.bills.slice(0, 2).map(b => b.name), ['Electric', 'Phone']);
  assert.equal(s.bills[0].amount, '$90.00');
  const inst = WT.instancesForMonth('2026-11').find(i => i.name === 'Electric');
  WT.markPaid(inst.id, TODAY);
  s = WW.snapshot(WT, { today: TODAY });
  assert.equal(s.bills[0].name, 'Phone');
});

test('long and control-character names are cleaned', () => {
  fresh();
  WT.addTemplate({ name: 'A'.repeat(80) + '\n\u0007', amountCents: 100, anchor: '2026-11-20', category: 'cat_utilities' });
  WT.runMaintenance();
  const b = WW.snapshot(WT, { today: TODAY }).bills[0];
  assert.equal(b.name.length, 40);
  assert.ok(!/[\u0000-\u001f]/.test(b.name));
});
