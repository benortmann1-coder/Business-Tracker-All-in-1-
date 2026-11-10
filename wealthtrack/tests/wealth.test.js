// Run: node --test wealthtrack/tests/wealth.test.js
// Net worth, monthly history, achievements (WTWealth) and Daily Wealth Tips (WTTips).
// Uses only made-up data (tests/fixtures/sample-data.js, web/demo.js and amounts built here).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const WTWealth = require(path.join(__dirname, '../web/wealth.js'));
const WTTips = require(path.join(__dirname, '../web/tips.js'));
const { seed } = require(path.join(__dirname, 'fixtures/sample-data.js'));
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js'));
const Demo = require(path.join(__dirname, '../web/demo.js'));

const TODAY = '2026-11-09';
WT.setToday(TODAY);
globalThis.WT = WT; // tips.js reads the app clock from the global WT, as in the browser

function fresh(kind) {
  WT.init(null, { put() { }, del() { } });
  if (kind === 'blank') blankSeed(WT, { today: TODAY });
  else if (kind === 'demo') Demo.load(WT, { today: TODAY });
  else seed(WT, { today: TODAY });
}
// what the app's "Set balance" dialog does
function setBalance(id, cents, date) {
  const a = WT.D.accounts[id]; a.openingCents = cents; a.openingDate = date || TODAY; delete a.needsBalance; WT.save('accounts', a);
}
function addAccount(id, type, cents, date) { WT.save('accounts', { id, name: id, type, openingCents: cents, openingDate: date || TODAY, inAvailable: type !== 'savings', order: 5 }); }
const ach = id => WTWealth.achievements().find(a => a.id === id);
const snapshot = () => JSON.parse(JSON.stringify(WT.D));
// records everything newly earned (as the app does); returns the new ids of one group (or all)
const GROUP = { debt: /^debt_/, networth: /^nw_/, savings: /^save_/ };
const record = g => { const ids = WTWealth.check(); if (ids.length) WT.saveSettings({ achievements: WTWealth.recordPatch(ids) }); return g ? ids.filter(id => GROUP[g].test(id)) : ids; };
const checkG = g => WTWealth.check().filter(id => GROUP[g].test(id));

// ------------------------------------------------------------------ net worth
test('net worth on the sample data: assets are account balances, liabilities are debt balances', () => {
  fresh();
  let n = WTWealth.netWorth();
  assert.equal(n.totalAssets, 0);
  assert.equal(n.totalLiabilities, 3125000); // 9000 + 15000 + 5200 + 1200 + 600 + 250
  assert.equal(n.netWorth, -3125000);
  assert.equal(n.estimate, true, 'checking balance not entered yet');
  assert.equal(n.verified, false);
  assert.equal(n.demo, false);
  assert.ok(n.notes.some(s => /Checking balance hasn't been entered/.test(s)));
  assert.deepEqual(n.assets.map(a => a.id).sort(), ['acc_cash', 'acc_checking', 'acc_savings']);

  setBalance('acc_checking', 240000); setBalance('acc_savings', 150000); setBalance('acc_cash', 6000);
  n = WTWealth.netWorth();
  assert.equal(n.totalAssets, 396000);
  assert.equal(n.totalAssets, WT.accounts().reduce((s, a) => s + WT.accountBalance(a.id), 0));
  assert.equal(n.netWorth, 396000 - 3125000);
  assert.equal(n.estimate, false);
  assert.equal(n.verified, true);
  for (const x of n.assets.concat(n.liabilities)) assert.ok(Number.isInteger(x.amount));
});

test('liabilities are open debt balances only (bills are not liabilities)', () => {
  fresh();
  setBalance('acc_checking', 500000);
  const n0 = WTWealth.netWorth();
  assert.deepEqual(n0.liabilities.map(l => l.id).sort(), WT.debts().map(d => d.id).sort());
  assert.equal(n0.totalLiabilities, WT.totalDebt());
  assert.ok(!n0.liabilities.some(l => /^bill_/.test(l.id)), 'no bill templates');
  // paying a bill doesn't create or change a liability; it lowers cash
  const electric = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_electric');
  WT.markPaid(electric.id, TODAY);
  const n1 = WTWealth.netWorth();
  assert.equal(n1.totalLiabilities, n0.totalLiabilities);
  assert.equal(n1.netWorth, n0.netWorth - 9500);
  // paying a debt from checking lowers both sides: net worth unchanged (no double counting)
  WT.payDebtExtra('debt_gascard', 25000, TODAY, 'acc_checking');
  const n2 = WTWealth.netWorth();
  assert.equal(n2.netWorth, n1.netWorth);
  assert.ok(!n2.liabilities.some(l => l.id === 'debt_gascard'), 'paid-off debt is no longer a liability');
  assert.equal(n2.totalLiabilities, n1.totalLiabilities - 25000);
  // a linked debt bill payment is counted once
  const visa = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_visa');
  WT.markPaid(visa.id, TODAY);
  const n3 = WTWealth.netWorth();
  assert.equal(n3.netWorth, n2.netWorth);
  assert.equal(n3.totalLiabilities, n2.totalLiabilities - 15000);
  // deleted debts are ignored
  WT.updateDebt('debt_furniture', { deleted: true });
  assert.equal(WTWealth.netWorth().totalLiabilities, n3.totalLiabilities - 60000);
});

test('savings goals are not counted twice', () => {
  fresh();
  setBalance('acc_checking', 300000); setBalance('acc_savings', 200000);
  const before = WTWealth.netWorth();
  const g = WT.addGoal({ name: 'Rainy day', type: 'emergency', targetCents: 300000, startCents: 150000, accountId: 'acc_savings' });
  WT.contributeGoal(g.id, 30000, TODAY, 'acc_checking'); // transfer checking -> savings
  const n = WTWealth.netWorth();
  assert.equal(n.totalAssets, before.totalAssets, 'a goal contribution is a transfer between own accounts');
  assert.equal(n.assets.find(a => a.id === 'acc_savings').amount, 230000);
  assert.ok(!n.assets.some(a => a.id === g.id), 'goals are not assets');
  assert.ok(n.notes.some(s => /not added again/.test(s)));
  // an unlinked goal is not counted either, and the user is told
  WT.addGoal({ name: 'Trip jar', targetCents: 50000, startCents: 20000 });
  assert.equal(WTWealth.netWorth().totalAssets, before.totalAssets);
  assert.ok(WTWealth.netWorth().notes.some(s => /Trip jar/.test(s)));
});

test('demo data is flagged and never counts as real', () => {
  fresh('demo');
  const n = WTWealth.netWorth();
  assert.equal(n.demo, true);
  assert.equal(n.verified, false);
  assert.equal(n.totalAssets, 125000 + 150000); // demo checking + demo savings
  assert.equal(n.totalLiabilities, 380000 + 1240000);
  assert.equal(n.netWorth, 275000 - 1620000);
  assert.ok(/Demo/.test(n.notes[0]));
  assert.ok(WTWealth.history(3).every(p => p.demo));
});

test('monthly history: oldest first, today last, estimates labeled', () => {
  fresh('blank');
  setBalance('acc_checking', 100000, '2026-08-15');
  addAccount('acc_sav', 'savings', 50000, '2026-08-15');
  WT.addDebt({ id: 'debt_x', name: 'Loan X', type: 'personal', startBalanceCents: 300000, startDate: '2026-08-15', aprCenti: 0, minCents: 10000, autoInterest: false });
  WT.addIncome({ id: 'inc_a', name: 'Job', netCents: 200000, schedule: 'monthly', anchor: '2026-09-01', startDate: '2026-09-01', accountId: 'acc_checking' });
  WT.recordDeposit('inc_a|2026-09-01', {}); WT.recordDeposit('inc_a|2026-10-01', {});
  WT.payDebtExtra('debt_x', 50000, '2026-10-05', 'acc_checking');
  const h = WTWealth.history(6);
  assert.equal(h.length, 6);
  assert.deepEqual(h.map(p => p.month), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  assert.equal(h[5].date, TODAY);
  assert.equal(h[5].netWorth, WTWealth.netWorth().netWorth);
  assert.equal(h[2].netWorth, 150000 - 300000); // Aug 31
  assert.equal(h[3].netWorth, 150000 + 200000 - 300000); // Sep 30
  assert.equal(h[4].netWorth, 150000 + 400000 - 300000); // Oct: payment from checking leaves net worth unchanged
  assert.equal(h[4].change, 200000);
  assert.equal(h[0].estimate, true, 'before balances were entered');
  assert.equal(h[3].estimate, false);
  assert.equal(h[0].change, null);
  const c = WTWealth.change();
  assert.equal(c.amount, h[5].netWorth - h[4].netWorth);
});

// ------------------------------------------------------------------ achievements: structure
test('achievements list every milestone in the request, once', () => {
  fresh('blank');
  const list = WTWealth.achievements();
  assert.deepEqual(list.map(a => a.id), [
    'debt_first_payment', 'debt_first_payoff', 'debt_25', 'debt_50', 'debt_75', 'debt_free',
    'nw_0', 'nw_1k', 'nw_5k', 'nw_10k', 'nw_25k', 'nw_50k', 'nw_100k', 'nw_250k', 'nw_500k', 'nw_1m',
    'save_500', 'save_ef_1000', 'save_1_month', 'save_3_months', 'save_6_months', 'save_goal_done']);
  assert.equal(new Set(list.map(a => a.id)).size, 22);
  for (const a of list) {
    assert.ok(['debt', 'networth', 'savings'].includes(a.group));
    assert.equal(typeof a.title, 'string'); assert.equal(typeof a.detail, 'string');
    assert.equal(a.earned, false); assert.equal(a.earnedOn, null);
    assert.ok(a.progress >= 0 && a.progress <= 1);
  }
  assert.deepEqual(WTWealth.check(), [], 'a blank install has earned nothing');
  assert.equal(list.filter(a => a.next).length, 3, 'one "next" milestone per group');
  assert.equal(WTWealth.notifyEnabled(), true);
  WT.saveSettings({ achievementsNotify: false });
  assert.equal(WTWealth.notifyEnabled(), false);
});

// ------------------------------------------------------------------ debt milestones
test('debt milestones: first payment, first payoff, 25/50/75% vs highest recorded debt, debt-free', () => {
  fresh('blank');
  setBalance('acc_checking', 5000000, '2026-01-01');
  WT.addDebt({ id: 'debt_a', name: 'Card A', type: 'credit_card', startBalanceCents: 1000000, startDate: '2026-01-01', aprCenti: 0, minCents: 5000, autoInterest: false });
  WT.addDebt({ id: 'debt_b', name: 'Loan B', type: 'personal', startBalanceCents: 100000, startDate: '2026-01-01', aprCenti: 0, minCents: 5000, autoInterest: false });
  // a new charge raises the highest recorded total to $12,000 (not the $11,000 starting total)
  WT.addExpense({ amountCents: 100000, date: '2026-02-01', category: 'cat_shopping', sourceId: 'debt:debt_a' });
  assert.equal(ach('debt_first_payment').earned, false);
  assert.equal(ach('debt_25').progress, 0);

  WT.payDebtExtra('debt_a', 200000, '2026-03-01', 'acc_checking'); // 10,000 left of 12,000 (16.7%)
  assert.deepEqual(record('debt'), ['debt_first_payment']);
  assert.equal(ach('debt_first_payment').earnedOn, '2026-03-01');
  assert.equal(ach('debt_25').earned, false);
  assert.ok(Math.abs(ach('debt_25').progress - (200000 / 1200000) / 0.25) < 1e-9);

  WT.payDebtExtra('debt_a', 99999, '2026-04-01', 'acc_checking'); // 9,000.01 left: just short of 25%
  assert.deepEqual(checkG('debt'), []);
  WT.payDebtExtra('debt_a', 1, '2026-04-02', 'acc_checking'); // exactly 9,000 = 75% of 12,000
  assert.deepEqual(record('debt'), ['debt_25']);
  assert.equal(ach('debt_25').earnedOn, '2026-04-02');

  WT.payDebtExtra('debt_b', 100000, '2026-05-01', 'acc_checking'); // Loan B paid off, 8,000 left
  assert.deepEqual(record('debt'), ['debt_first_payoff']);
  assert.equal(ach('debt_first_payoff').earnedOn, '2026-05-01');
  assert.ok(/Loan B/.test(ach('debt_first_payoff').detail));

  WT.payDebtExtra('debt_a', 200000, '2026-06-01', 'acc_checking'); // 6,000 left = 50%
  assert.deepEqual(record('debt'), ['debt_50']);
  WT.payDebtExtra('debt_a', 299999, '2026-07-01', 'acc_checking'); // 3,000.01 left
  assert.deepEqual(checkG('debt'), []);
  WT.payDebtExtra('debt_a', 1, '2026-07-02', 'acc_checking'); // 3,000 left = 75%
  assert.deepEqual(record('debt'), ['debt_75']);
  assert.equal(ach('debt_free').earned, false);
  assert.ok(Math.abs(ach('debt_free').progress - 0.75) < 1e-9);

  WT.payDebtExtra('debt_a', 300000, '2026-08-01', 'acc_checking');
  assert.deepEqual(record('debt'), ['debt_free']);
  assert.equal(ach('debt_free').earnedOn, '2026-08-01');
  const saved = WT.settings().achievements; for (const k of Object.keys(saved)) if (!k.startsWith('debt_')) delete saved[k];
  assert.deepEqual(saved, {
    debt_first_payment: '2026-03-01', debt_25: '2026-04-02', debt_first_payoff: '2026-05-01',
    debt_50: '2026-06-01', debt_75: '2026-07-02', debt_free: '2026-08-01',
  });
});

test('debt milestones count bill payments on linked debts, and need a recorded payment', () => {
  fresh();
  // lowering balances by "adjust" or deleting a debt is not a verified payoff
  WT.setDebtBalance('debt_gascard', 0, TODAY);
  WT.updateDebt('debt_student', { deleted: true });
  assert.deepEqual(WTWealth.check(), []);
  // a linked bill payment is a debt payment
  const gas = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_store');
  WT.markPaid(gas.id, TODAY);
  assert.deepEqual(WTWealth.check(), ['debt_first_payment']);
  // pay off the smallest open fixture debt (Furniture Plan, $600)
  WT.payDebtExtra('debt_furniture', 60000, TODAY);
  assert.deepEqual(WTWealth.check(), ['debt_first_payment', 'debt_first_payoff']);
});

// ------------------------------------------------------------------ net worth milestones
test('net worth milestones unlock at each threshold, only from verified balances', () => {
  fresh('blank');
  const list = [['nw_0', 0], ['nw_1k', 100000], ['nw_5k', 500000], ['nw_10k', 1000000], ['nw_25k', 2500000], ['nw_50k', 5000000],
    ['nw_100k', 10000000], ['nw_250k', 25000000], ['nw_500k', 50000000], ['nw_1m', 100000000]];
  // nothing recorded: $0 net worth is not an achievement
  assert.equal(ach('nw_0').earned, false);
  WT.addDebt({ id: 'debt_n', name: 'Loan N', type: 'personal', startBalanceCents: 100000, startDate: TODAY, autoInterest: false });
  setBalance('acc_checking', 99999);
  assert.equal(ach('nw_0').earned, false);
  assert.ok(Math.abs(ach('nw_0').progress - 99999 / 100000) < 1e-9);
  for (const [id, cents] of list) {
    setBalance('acc_checking', 100000 + cents - 1);
    assert.equal(ach(id).earned, false, id + ' one cent short');
    assert.ok(!WTWealth.check().includes(id));
    setBalance('acc_checking', 100000 + cents);
    assert.equal(ach(id).earned, true, id + ' at threshold');
    assert.equal(ach(id).earnedOn, TODAY);
    assert.deepEqual(record(), [id], id + ' recorded once');
  }
  assert.equal(Object.keys(WT.settings().achievements).length, 10);
  // the earned date stays even if net worth falls later
  setBalance('acc_checking', 0);
  assert.equal(ach('nw_1m').earned, true);
  assert.equal(ach('nw_1m').earnedOn, TODAY);
});

test('an unentered balance (estimate) never unlocks net worth milestones', () => {
  fresh();
  setBalance('acc_savings', 5000000);
  WT.D.debts && WT.debts().forEach(d => WT.updateDebt(d.id, { deleted: true }));
  const n = WTWealth.netWorth();
  assert.equal(n.netWorth, 5000000);
  assert.equal(n.estimate, true); // checking still needs a balance
  assert.ok(!WTWealth.check().some(id => id.startsWith('nw_')));
  assert.ok(ach('nw_0').progress < 1);
});

// ------------------------------------------------------------------ savings milestones
test('savings milestones: $500 saved, $1,000 emergency fund, months of essentials, first goal', () => {
  fresh('blank');
  setBalance('acc_checking', 2000000, '2026-01-01');
  addAccount('acc_sav', 'savings', 0, '2026-01-01');
  // essentials: rent $1,200 + utilities $100 + a $100 debt minimum = $1,400 a month; a streaming bill is optional
  WT.addTemplate({ id: 'bill_lease', name: 'Lease', amountCents: 120000, category: 'cat_housing', anchor: '2026-11-01', frequency: 'monthly', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_power', name: 'Power', amountCents: 10000, category: 'cat_utilities', anchor: '2026-11-05', frequency: 'monthly', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_tv', name: 'Stream', amountCents: 2000, category: 'cat_subscriptions', anchor: '2026-11-05', frequency: 'monthly', accountId: 'acc_checking' });
  WT.addDebt({ id: 'debt_s', name: 'Loan S', type: 'personal', startBalanceCents: 500000, startDate: '2026-01-01', minCents: 10000, autoInterest: false });
  assert.equal(WTWealth.essentialsMonthly().total, 140000);

  const tr = (cents, date) => WT.addTransfer({ fromId: 'acc_checking', toId: 'acc_sav', amountCents: cents, date });
  tr(49999, '2026-02-01');
  assert.deepEqual(checkG('savings'), []);
  tr(1, '2026-02-02');
  assert.deepEqual(record('savings'), ['save_500']);
  assert.equal(ach('save_500').earnedOn, '2026-02-02');

  tr(49999, '2026-03-01'); // 999.99
  assert.deepEqual(checkG('savings'), []);
  assert.ok(ach('save_ef_1000').progress > 0.99 && ach('save_ef_1000').progress < 1);
  // a paycheck deposited straight into savings also counts
  WT.addIncome({ id: 'inc_s', name: 'Side job', netCents: 40001, schedule: 'monthly', anchor: '2026-03-15', startDate: '2026-03-15', accountId: 'acc_sav' });
  WT.recordDeposit('inc_s|2026-03-15', {}); // 1,400.00 = 1 month of essentials
  assert.deepEqual(record('savings'), ['save_ef_1000', 'save_1_month']);
  assert.equal(ach('save_1_month').earnedOn, '2026-03-15');

  tr(279999, '2026-04-01'); // 4,199.99
  assert.deepEqual(checkG('savings'), []);
  tr(1, '2026-04-02'); // 4,200 = 3 months
  assert.deepEqual(record('savings'), ['save_3_months']);
  tr(420000, '2026-05-01'); // 8,400 = 6 months
  assert.deepEqual(record('savings'), ['save_6_months']);
  assert.equal(ach('save_6_months').earnedOn, '2026-05-01');

  // first goal completed: needs a recorded contribution that reaches the target
  WT.addGoal({ id: 'goal_pre', name: 'Already there', targetCents: 10000, startCents: 10000, accountId: 'acc_sav', createdAt: '2026-05-01' });
  assert.deepEqual(checkG('savings'), [], 'a goal created already full is not a completed goal');
  const g = WT.addGoal({ id: 'goal_bike', name: 'Bike', targetCents: 50000, startCents: 0, accountId: 'acc_sav', createdAt: '2026-06-01' });
  WT.contributeGoal(g.id, 30000, '2026-06-10', 'acc_checking');
  assert.equal(ach('save_goal_done').earned, false);
  assert.ok(ach('save_goal_done').progress <= 0.99, 'progress never shows 100% before it is verified');
  assert.deepEqual(checkG('savings'), []);
  WT.contributeGoal(g.id, 20000, '2026-07-10', 'acc_checking');
  assert.deepEqual(record('savings'), ['save_goal_done']);
  assert.equal(ach('save_goal_done').earnedOn, '2026-07-10');
  assert.ok(/Bike/.test(ach('save_goal_done').detail));
});

test('emergency goals count toward the emergency fund without double counting', () => {
  fresh('blank');
  setBalance('acc_checking', 300000, '2026-01-01');
  const g = WT.addGoal({ id: 'goal_ef', name: 'Emergency fund', type: 'emergency', targetCents: 500000, startCents: 0, createdAt: '2026-01-01' });
  WT.contributeGoal(g.id, 60000, '2026-02-01');
  WT.contributeGoal(g.id, 40000, '2026-03-01');
  assert.deepEqual(record('savings'), ['save_500', 'save_ef_1000']);
  assert.equal(ach('save_500').earnedOn, '2026-02-01');
  assert.equal(ach('save_ef_1000').earnedOn, '2026-03-01');
  // the same money also sitting in a savings account is not added on top
  addAccount('acc_sav', 'savings', 100000, '2026-03-01');
  assert.ok(/Add your essential bills/.test(ach('save_1_month').detail), 'no bills: missing input is named');
  WT.addTemplate({ id: 'bill_lease', name: 'Lease', amountCents: 150000, category: 'cat_housing', anchor: '2026-11-01', frequency: 'monthly', accountId: 'acc_checking' });
  // $1,000 in savings + the $1,000 emergency goal is $1,000 saved, not $2,000 (which would cover a $1,500 month)
  assert.equal(ach('save_1_month').earned, false);
  assert.ok(Math.abs(ach('save_1_month').progress - 100000 / 150000) < 1e-9);
});

// ------------------------------------------------------------------ persistence, duplicates, demo
test('repeated check() never duplicates and earned dates are kept', () => {
  fresh();
  WT.payDebtExtra('debt_gascard', 25000, TODAY);
  const a = WTWealth.check(), b = WTWealth.check();
  assert.deepEqual(a, b, 'check is read-only');
  assert.deepEqual(a, ['debt_first_payment', 'debt_first_payoff']);
  assert.equal(new Set(a).size, a.length);
  WT.saveSettings({ achievements: WTWealth.recordPatch(a.concat(a)) });
  assert.deepEqual(WT.settings().achievements, { debt_first_payment: TODAY, debt_first_payoff: TODAY });
  assert.deepEqual(WTWealth.check(), []);
  // later activity and later "today" never move a recorded date
  WT.setToday('2026-12-01');
  try {
    WT.payDebtExtra('debt_store', 120000, '2026-11-30');
    const patch = WTWealth.recordPatch(['debt_first_payoff', 'debt_first_payment']);
    assert.equal(patch.debt_first_payoff, TODAY);
    assert.equal(ach('debt_first_payment').earnedOn, TODAY);
    // ids that aren't milestones or aren't earned are ignored
    const p2 = WTWealth.recordPatch(['nope', 'nw_1m']);
    assert.ok(!('nope' in p2) && !('nw_1m' in p2));
  } finally { WT.setToday(TODAY); }
  // persisted earned stays earned even if a debt is added back
  WT.addDebt({ id: 'debt_new', name: 'New card', startBalanceCents: 100000, startDate: TODAY, autoInterest: false });
  assert.equal(ach('debt_first_payoff').earned, true);
});

test('demo mode never earns achievements', () => {
  fresh('demo');
  WT.payDebtExtra('debt_demo_card', 380000, TODAY, 'acc_checking');
  WT.save('accounts', Object.assign(WT.D.accounts.acc_demo_savings, { openingCents: 50000000 }));
  assert.deepEqual(WTWealth.check(), []);
  assert.deepEqual(WTWealth.recordPatch(['debt_first_payment']), {});
  const list = WTWealth.achievements();
  assert.ok(list.every(a => !a.earned && a.earnedOn === null && a.demo));
  assert.equal(WTWealth.summary().earned, 0);
  // the same records outside demo mode would qualify
  WT.saveSettings({ demo: false });
  assert.ok(WTWealth.check().includes('debt_first_payoff'));
});

test('wealth engine is read-only', () => {
  fresh();
  setBalance('acc_checking', 100000);
  WT.payDebtExtra('debt_gascard', 25000, TODAY);
  WT.addGoal({ name: 'Goal', targetCents: 1000, startCents: 0, accountId: 'acc_savings' });
  const before = snapshot();
  WTWealth.netWorth(); WTWealth.netWorth('2026-01-31'); WTWealth.history(24); WTWealth.change();
  WTWealth.achievements(); WTWealth.check(); WTWealth.recordPatch(['debt_first_payment']); WTWealth.summary(); WTWealth.essentialsMonthly();
  assert.deepEqual(snapshot(), before);
});

// ------------------------------------------------------------------ daily tips
test('tips: at least 366 unique, practical entries spread across every topic', () => {
  assert.ok(WTTips.all.length >= 366, 'count ' + WTTips.all.length);
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  assert.equal(new Set(WTTips.all.map(t => norm(t.text))).size, WTTips.all.length, 'no duplicate text');
  assert.equal(new Set(WTTips.all.map(t => t.id)).size, WTTips.all.length, 'unique ids');
  const topics = ['budgeting', 'saving', 'emergency', 'credit_cards', 'interest', 'debt', 'retirement', 'investing', 'compound', 'credit_scores', 'discipline', 'networth', 'bills', 'planning'];
  assert.deepEqual(Object.keys(WTTips.TOPICS).sort(), topics.slice().sort());
  for (const k of topics) assert.ok(WTTips.all.filter(t => t.topic === k).length >= 20, k);
  for (const t of WTTips.all) {
    assert.ok(t.text.length >= 40 && t.text.length <= 260, t.id + ' length');
    assert.ok(t.text.split(/(?<=[.!?])\s+(?=[A-Z"$])/).length <= 2, t.id + ' is 1-2 sentences');
    assert.ok(!/[“”]/.test(t.text) && !/—\s*[A-Z][a-z]+ [A-Z][a-z]+$/.test(t.text), t.id + ' is not a quote');
    if (t.more != null) assert.ok(typeof t.more === 'string' && t.more.length > 10);
  }
  // no near-duplicates: word overlap between any two tips stays low
  const stop = new Set('a an the and or of to in on for is it its your you be can by with at as that this if not but are from than more less so into each one'.split(' '));
  const words = s => new Set(norm(s).split(' ').filter(w => w && !stop.has(w)));
  const W = WTTips.all.map(t => words(t.text));
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
    let n = 0; for (const w of W[i]) if (W[j].has(w)) n++;
    assert.ok(n / (W[i].size + W[j].size - n) < 0.5, WTTips.all[i].id + ' vs ' + WTTips.all[j].id);
  }
});

test('tips: forDate is stable within a day and different on every day of 2026 and 2028 (leap)', () => {
  const a = WTTips.forDate('2026-11-09'), b = WTTips.forDate('2026-11-09');
  assert.deepEqual(a, b);
  assert.equal(a.text, WTTips.all[a.index].text);
  for (const [year, days] of [[2026, 365], [2027, 365], [2028, 366]]) {
    const seen = new Set(); let d = year + '-01-01';
    for (let k = 0; k < days; k++, d = WT.addDays(d, 1)) seen.add(WTTips.forDate(d).index);
    assert.equal(d, (year + 1) + '-01-01');
    assert.equal(seen.size, days, year + ' has no repeats');
  }
  assert.equal(WTTips.forDate('2028-02-29').dayOfYear, 60);
  assert.equal(WTTips.forDate('2028-12-31').dayOfYear, 366);
  assert.equal(WTTips.forDate('2026-12-31').dayOfYear, 365);
  assert.notEqual(WTTips.forDate('2028-02-29').index, WTTips.forDate('2028-03-01').index);
  // invalid input falls back to today
  assert.equal(WTTips.forDate('2026-02-30').date, TODAY);
  assert.equal(WTTips.forDate().date, TODAY);
  assert.equal(WTTips.get(a.id).text, a.text);
  assert.equal(WTTips.get(a.index).id, a.id);
  // different years start at different points
  assert.notEqual(WTTips.forDate('2026-01-01').index, WTTips.forDate('2027-01-01').index);
});

test('tips are read-only and contain no brand names or personal data', () => {
  fresh();
  const before = snapshot();
  for (let d = '2026-01-01'; d < '2027-01-01'; d = WT.addDays(d, 1)) WTTips.forDate(d);
  assert.deepEqual(snapshot(), before);
  assert.throws(() => { 'use strict'; WTTips.all.push({}); });
  const blob = WTTips.all.map(t => t.text + ' ' + (t.more || '')).join(' ');
  assert.ok(!/\b(FICO|VantageScore|Vanguard|Fidelity|Schwab|Visa|Mastercard|Amex|American Express|Chase|PayPal|Venmo|Bitcoin|Netflix|Spotify|Amazon)\b/.test(blob));
  assert.ok(!/https?:|www\./.test(blob));
});
