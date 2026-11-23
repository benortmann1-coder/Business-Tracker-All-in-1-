// First-run setup wizard logic (web/setup-wizard.js). Run: node --test wealthtrack/tests/setup-wizard.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js'));
const { seed: sampleSeed } = require(path.join(__dirname, 'fixtures/sample-data.js'));
const SW = require(path.join(__dirname, '../web/setup-wizard.js'));

const TODAY = '2026-11-13';
function fresh(kind) {
  WT.setToday(TODAY);
  WT.init(null, { put() { }, del() { } });
  if (kind === 'sample') sampleSeed(WT, { today: TODAY }); else blankSeed(WT, { today: TODAY });
}

test('offered only on a blank install, never for existing data, the demo, or once done/dismissed', () => {
  fresh();
  assert.equal(SW.isBlank(WT), true);
  assert.equal(SW.shouldOffer(WT), true);
  SW.markDone(WT, 'dismissed');
  assert.equal(SW.shouldOffer(WT), false);
  fresh(); SW.markDone(WT, 'done'); assert.equal(WT.settings().setupWizard, 'done'); assert.equal(SW.shouldOffer(WT), false);
  fresh('sample'); assert.equal(SW.isBlank(WT), false); assert.equal(SW.shouldOffer(WT), false);
  fresh(); WT.saveSettings({ demo: true }); assert.equal(SW.shouldOffer(WT), false);
  fresh(); WT.save('expenses', { id: 'e1', date: TODAY, amountCents: 500 }); assert.equal(SW.isBlank(WT), false);
});

test('checking balance: sets the default account, blank input changes nothing', () => {
  fresh();
  assert.equal(SW.setBalance(WT, ''), null);
  assert.equal(WT.accountBalance('acc_checking'), 0);
  SW.setBalance(WT, '1,234.56');
  assert.equal(WT.accountBalance('acc_checking'), 123456);
  SW.setBalance(WT, '-20');
  assert.equal(WT.accountBalance('acc_checking'), -2000);
  assert.throws(() => SW.setBalance(WT, 'abc'), SW.SetupError);
});

test('paychecks use WT.addIncome with every schedule', () => {
  fresh();
  const a = SW.addPaycheck(WT, { name: 'Day job', schedule: 'biweekly', date: '2026-11-14', amount: '1,800' });
  assert.equal(a.netCents, 180000); assert.equal(a.kind, 'net'); assert.equal(a.anchor, '2026-11-14'); assert.equal(a.accountId, 'acc_checking');
  assert.deepEqual(WT.incomeDates(a, '2026-11-01', '2026-12-31'), ['2026-11-14', '2026-11-28', '2026-12-12', '2026-12-26']);
  const m = SW.addPaycheck(WT, { schedule: 'monthly', date: '2026-11-30', amount: '500' });
  assert.equal(m.name, 'Paycheck 2'); assert.equal(m.day1, 30);
  const s = SW.addPaycheck(WT, { schedule: 'semimonthly', date: TODAY, amount: '900', day1: '20', day2: '5' });
  assert.equal(s.day1, 5); assert.equal(s.day2, 20);
  assert.throws(() => SW.addPaycheck(WT, { schedule: 'semimonthly', date: TODAY, amount: '900', day1: '5', day2: '5' }), /different/);
  assert.throws(() => SW.addPaycheck(WT, { schedule: 'weekly', date: TODAY, amount: '' }), /take-home/);
  assert.throws(() => SW.addPaycheck(WT, { schedule: 'weekly', date: '2026-02-30', amount: '10' }), /payday/);
  assert.throws(() => SW.addPaycheck(WT, { schedule: 'weekly', date: TODAY, amount: '0' }), /above 0/);
  assert.equal(SW.isBlank(WT), false);
});

test('bills: presets pick categories, due day becomes the next due date', () => {
  fresh();
  const rent = SW.addBill(WT, { name: 'Rent', preset: 'rent', amount: '1150', frequency: 'monthly', day: '1' });
  assert.equal(rent.category, 'cat_housing'); assert.equal(rent.versions[0].anchor, '2026-12-01'); assert.equal(rent.versions[0].amountCents, 115000);
  const tv = SW.addBill(WT, { name: 'Streaming', preset: 'streaming', amount: '15.99', frequency: 'monthly', day: '20' });
  assert.equal(tv.category, 'cat_subscriptions'); assert.equal(tv.subscription, true); assert.equal(tv.versions[0].anchor, '2026-11-20');
  const mort = SW.addBill(WT, { name: 'Mortgage', preset: 'mortgage', amount: '1500', day: '13' });
  assert.equal(mort.category, 'cat_mortgage'); assert.equal(mort.versions[0].anchor, TODAY); // due today counts
  const last = SW.addBill(WT, { name: 'Gym', amount: '30', day: '31' });
  assert.equal(last.versions[0].eom, true); assert.equal(last.versions[0].anchor, '2026-11-30');
  const own = SW.addBill(WT, { name: 'Water', amount: '40', frequency: 'quarterly', day: '5' });
  assert.equal(own.category, 'cat_other'); assert.equal(own.versions[0].frequency, 'quarterly');
  const wk = SW.addBill(WT, { name: 'Daycare', amount: '200', frequency: 'weekly', date: '2026-11-16' });
  assert.equal(wk.versions[0].anchor, '2026-11-16');
  // instances get generated so the bills show up in this/next month
  assert.ok(WT.instancesForMonth('2026-11').some(i => i.templateId === tv.id));
  assert.ok(WT.instancesForMonth('2026-12').some(i => i.templateId === rent.id));
  assert.throws(() => SW.addBill(WT, { name: '', amount: '5', day: '1' }), /bill name/);
  assert.throws(() => SW.addBill(WT, { name: 'X', amount: '5', day: '32' }), /due day/);
  assert.throws(() => SW.addBill(WT, { name: 'X', amount: '1,2,3', day: '1' }), SW.SetupError);
});

test('a due day the month lacks moves to the next month that has it', () => {
  WT.setToday('2027-02-10');
  assert.equal(SW.nextDueOnDay(WT, '2027-02-10', 30), '2027-03-30');
  assert.equal(SW.nextDueOnDay(WT, '2027-02-10', 15), '2027-02-15');
  assert.equal(SW.nextDueOnDay(WT, '2027-02-10', 5), '2027-03-05');
  WT.setToday(TODAY);
});

test('debts use WT.addDebt and, like the Add debt form, a linked minimum-payment bill', () => {
  fresh();
  const { debt, bill } = SW.addDebt(WT, { name: 'Visa', type: 'credit_card', balance: '2,400', apr: '24.99%', min: '75', day: '20', mkBill: true });
  assert.equal(WT.debtBalance(debt.id), 240000); assert.equal(debt.aprCenti, 2499); assert.equal(debt.minCents, 7500); assert.equal(debt.dueDay, 20);
  assert.equal(bill.debtId, debt.id); assert.equal(bill.category, 'cat_credit_cards'); assert.equal(bill.versions[0].anchor, '2026-11-20');
  const car = SW.addDebt(WT, { name: 'Car', type: 'auto', balance: '9000', apr: '', min: '300', day: '2', mkBill: false });
  assert.equal(car.bill, null); assert.equal(car.debt.aprCenti, 0);
  const early = SW.addDebt(WT, { name: 'Student', type: 'student', balance: '5000', apr: '5', min: '60', day: '2', mkBill: true });
  assert.equal(early.bill.versions[0].anchor, '2026-12-02'); assert.equal(early.bill.category, 'cat_loans');
  assert.throws(() => SW.addDebt(WT, { name: 'X', balance: '', day: '1' }), /balance/);
  assert.throws(() => SW.addDebt(WT, { name: 'X', balance: '10', apr: 'lots', day: '1' }), /APR/);
});

test('summary shows the next paycheck plan with its bills', () => {
  fresh();
  SW.setBalance(WT, '500');
  SW.addPaycheck(WT, { name: 'Job', schedule: 'biweekly', date: '2026-11-14', amount: '2000' });
  SW.addBill(WT, { name: 'Rent', preset: 'rent', amount: '1150', day: '25' });
  SW.addBill(WT, { name: 'Phone', preset: 'phone', amount: '60', day: '18' });
  const s = SW.summary(WT);
  assert.equal(s.balanceCents, 50000); assert.equal(s.incomes.length, 1); assert.equal(s.bills.length, 2);
  assert.equal(s.plan.pc.date, '2026-11-14');
  assert.equal(s.plan.billTotal, 121000);
  assert.equal(s.plan.remaining, 200000 - 121000);
});
