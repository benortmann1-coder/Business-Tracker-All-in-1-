// Run: node --test wealthtrack/tests/smartplan.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed } = require(path.join(__dirname, 'fixtures/sample-data.js')); // made-up sample data
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js')); // a real new install (blank)
const P = require(path.join(__dirname, '../web/smartplan.js'));

const TODAY = '2026-11-06';
WT.setToday(TODAY);

function fresh(blank) {
  const writes = { n: 0 };
  WT.init(null, { put() { writes.n++; }, del() { writes.n++; } });
  if (blank) blankSeed(WT, { today: TODAY }); else seed(WT, { today: TODAY });
  return writes;
}
// a strategy with no allocations, so only bills move money (monthly income only matters for pro-rating)
const NONE = { id: 'none', amounts: { needs: 0, debt: 0, savings: 0, wants: 0 }, base: { income: 400000, essentials: 0, debtMinimums: 0 } };
const K = d => 'inc_a|' + d;
function income(netCents, extra) { return WT.addIncome(Object.assign({ id: 'inc_a', name: 'Job A', kind: 'net', netCents, schedule: 'biweekly', anchor: '2026-11-06', startDate: '2026-10-01', accountId: 'acc_checking' }, extra)); }
function bill(id, name, cents, anchor, category, debtId) { return WT.addTemplate({ id, name, amountCents: cents, category: category || 'cat_housing', anchor, frequency: 'monthly', debtId: debtId || null, accountId: 'acc_checking' }); }
const inst = (tid, d) => WT.D.instances['i_' + tid + '_' + d];
const snap = () => JSON.stringify(WT.D);

test('API shape and ready flag', () => {
  assert.equal(P.ready, true);
  ['paycheckPlan', 'moveTargets', 'debtPlans'].forEach(f => assert.equal(typeof P[f], 'function'));
});

test('carry-forward and reserve from earlier paychecks, to the cent', () => {
  fresh(true);
  const NET = 100037, APT = 123456, NET_BILL = 4567;
  income(NET);
  bill('b_apt', 'Apartment', APT, '2026-11-25');   // funded by Nov 20 / Dec 18 (short paychecks)
  bill('b_net', 'Internet', NET_BILL, '2026-11-10'); // funded by Nov 6 / Dec 4
  const p = P.paycheckPlan({ strategy: NONE });
  const [a, b, c, d] = p.paychecks;
  assert.deepEqual(p.paychecks.map(x => x.date), ['2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18']);
  assert.equal(a.billsDue, NET_BILL); assert.equal(b.billsDue, APT);
  const short = APT - NET; // 23419
  // Nov 20 can't cover the apartment: reserve the exact gap from Nov 6
  assert.equal(b.reserveIn, short); assert.equal(a.reserveOut, short);
  assert.deepEqual(b.reserveFrom, [{ key: a.key, date: a.date, amount: short }]);
  assert.equal(b.shortfall, 0); assert.equal(b.overallocated, false);
  assert.equal(a.remaining, NET - NET_BILL - short);
  assert.equal(b.carryIn, a.remaining);
  assert.equal(b.remaining, a.remaining);
  // Dec 18 takes its reserve from the closest earlier paycheck (Dec 4), not Nov 6
  assert.equal(d.reserveIn, short); assert.equal(c.reserveOut, short); assert.equal(d.reserveFrom[0].key, c.key);
  assert.equal(c.carryIn, b.remaining);
  assert.equal(c.remaining, c.carryIn + NET - NET_BILL - short);
  assert.equal(d.remaining, c.remaining);
  assert.ok(b.warnings.some(w => w.includes('Set aside $234.19 from the Nov 6 paycheck')), b.warnings.join('|'));
  assert.ok(a.warnings.some(w => w.includes('Keep $234.19 of this paycheck for the Nov 20 paycheck')));
  assert.ok(p.warnings.some(w => w.includes('$234.19')));
  // money is conserved: everything in = bills + allocations + what's left at the end
  assert.equal(p.totals.net - p.totals.billsDue - p.totals.allocTotal, p.totals.remaining);
  assert.equal(p.totals.reserve, 2 * short);
});

test('a paycheck that still can\'t be covered reports the exact shortfall and is overallocated', () => {
  fresh(true);
  income(100000);
  bill('b_apt', 'Apartment', 250000, '2026-11-25');
  const p = P.paycheckPlan({ strategy: NONE, count: 3 });
  const [a, b, c] = p.paychecks;
  assert.equal(a.reserveOut, 100000); assert.equal(b.reserveIn, 100000);
  assert.equal(b.shortfall, 50000); assert.equal(b.overallocated, true); assert.equal(b.remaining, -50000);
  assert.equal(c.carryIn, 0);
  assert.ok(b.warnings.some(w => w.includes('$500.00 short even after setting money aside')), b.warnings.join('|'));
  assert.ok(p.warnings.some(w => w.includes('Nov 20') && w.includes('$500.00 short')));
});

test('sample data: every bill appears in exactly one paycheck and matches WT.paycheckFor', () => {
  fresh();
  const p = P.paycheckPlan({ count: 4 });
  assert.equal(p.paychecks.length, 4);
  const ids = p.paychecks.flatMap(x => x.bills.map(b => b.instId));
  assert.equal(new Set(ids).size, ids.length, 'no bill twice');
  for (const pc of p.paychecks) {
    for (const b of pc.bills) assert.equal(WT.paycheckFor(WT.D.instances[b.instId]).key, pc.key);
    assert.deepEqual(pc.bills.map(b => b.instId).sort(), WT.billsForPaycheck(pc.key).map(i => i.id).sort());
    assert.equal(pc.billsDue, pc.bills.reduce((t, b) => t + b.remaining, 0));
    Object.values(pc.alloc).forEach(v => assert.ok(Number.isInteger(v) && v >= 0));
    assert.equal(pc.remaining, pc.net + pc.carryIn + pc.reserveIn - pc.billsDue - pc.allocTotal - pc.reserveOut);
    // debt-linked bills are bills here (minimums), never also counted as extra debt
    assert.ok(pc.bills.filter(b => b.debtId).every(b => b.kind === 'debt'));
  }
});

test('paid and partly paid bills: shown, but only the unpaid part counts', () => {
  fresh();
  const key = 'inc_job|2026-11-06';
  const before = P.paycheckPlan({ count: 1 }).paychecks[0];
  const car = inst('bill_carloan', '2026-11-10');
  const stu = inst('bill_student', '2026-11-15');
  WT.markPaid(car.id, TODAY);
  WT.recordPayment(stu.id, { amountCents: 10000, date: TODAY });
  const pc = P.paycheckPlan({ count: 1 }).paychecks[0];
  assert.equal(pc.key, key);
  const t = pc.bills.find(b => b.instId === car.id), w = pc.bills.find(b => b.instId === stu.id);
  assert.equal(t.paid, true); assert.equal(t.remaining, 0);
  assert.equal(w.paid, false); assert.equal(w.remaining, 7500); // 175 - 100
  assert.equal(pc.billsDue, before.billsDue - 38000 - 10000);
  assert.equal(pc.billsPaid, before.billsPaid + 38000 + 10000);
});

test('moves preview: funding moves without changing due dates or saved data', () => {
  fresh();
  const aptDec = inst('bill_apartment', '2026-12-01');
  const nov6 = 'inc_job|2026-11-06', nov20 = 'inc_job|2026-11-20';
  const base = P.paycheckPlan();
  assert.ok(base.paychecks[1].bills.some(b => b.instId === aptDec.id));
  const targets = P.moveTargets(aptDec.id);
  assert.deepEqual(targets.map(t => t.key), [nov6, nov20]);
  assert.equal(targets.find(t => t.current).key, nov20);
  const s = snap();
  const p = P.paycheckPlan({ moves: { [aptDec.id]: nov6 } });
  assert.equal(snap(), s, 'preview writes nothing');
  const a = p.paychecks[0], b = p.paychecks[1];
  const moved = a.bills.find(x => x.instId === aptDec.id);
  assert.ok(moved && moved.moved); assert.equal(moved.dueDate, '2026-12-01');
  assert.ok(!b.bills.some(x => x.instId === aptDec.id));
  assert.equal(a.billsDue, base.paychecks[0].billsDue + 120000);
  assert.equal(b.billsDue, base.paychecks[1].billsDue - 120000);
  assert.equal(WT.D.instances[aptDec.id].paycheckKey, null);
  assert.equal(P.moveTargets(aptDec.id, { moves: { [aptDec.id]: nov6 } }).find(t => t.current).key, nov6);
  // a saved assignment; a draft move of null previews going back to automatic
  WT.assignInstance(aptDec.id, nov6);
  assert.ok(P.paycheckPlan().paychecks[0].bills.some(x => x.instId === aptDec.id));
  assert.ok(P.paycheckPlan({ moves: { [aptDec.id]: null } }).paychecks[1].bills.some(x => x.instId === aptDec.id));
});

test('income override: draft, saved and cleared', () => {
  fresh(true);
  income(160000);
  const k = K('2026-11-20');
  let pc = P.paycheckPlan({ strategy: NONE, income: { [k]: 150000 } }).paychecks[1];
  assert.equal(pc.net, 150000); assert.equal(pc.expected, 160000); assert.equal(pc.incomeOverridden, true);
  assert.ok(pc.warnings.some(w => w.includes('$1,500.00') && w.includes('$1,600.00')));
  WT.saveSettings({ smartBudget: { paycheckIncome: { [k]: 120000 } } });
  pc = P.paycheckPlan({ strategy: NONE }).paychecks[1];
  assert.equal(pc.net, 120000);
  pc = P.paycheckPlan({ strategy: NONE, income: { [k]: null } }).paychecks[1];
  assert.equal(pc.net, 160000); assert.equal(pc.incomeOverridden, false);
});

test('allocation override: the $1,600 example leaves $100', () => {
  fresh(true);
  income(160000);
  bill('b_apt', 'Apartment', 70000, '2026-11-12');
  bill('b_power', 'Electric', 30000, '2026-11-15', 'cat_utilities');
  const k = K('2026-11-06');
  const p = P.paycheckPlan({ strategy: NONE, alloc: { [k]: { everyday: 25000, savings: 10000, extraDebt: 15000, wants: 0 } } });
  const pc = p.paychecks[0];
  assert.equal(pc.billsDue, 100000);
  assert.deepEqual(pc.alloc, { everyday: 25000, savings: 10000, extraDebt: 15000, wants: 0 });
  assert.equal(pc.allocTotal, 50000);
  assert.equal(pc.remaining, 10000); // 1600 - 1000 bills - 500 allocated
  assert.equal(p.paychecks[1].carryIn, 10000);
  assert.equal(pc.allocOverridden.everyday, true);
  // saved per-paycheck allocations are used when there's no draft; a partial draft merges over them
  WT.saveSettings({ smartBudget: { paycheckAlloc: { [k]: { everyday: 30000, savings: 0, extraDebt: 0, wants: 0 } } } });
  assert.equal(P.paycheckPlan({ strategy: NONE }).paychecks[0].alloc.everyday, 30000);
  const m = P.paycheckPlan({ strategy: NONE, alloc: { [k]: { savings: 5000 } } }).paychecks[0];
  assert.equal(m.alloc.everyday, 30000); assert.equal(m.alloc.savings, 5000); assert.equal(m.remaining, 160000 - 100000 - 35000);
});

test('default allocations are the strategy\'s monthly amounts pro-rated per paycheck (bills taken out)', () => {
  fresh(true);
  income(200000);
  const strat = { id: 'x', amounts: { needs: 150000, debt: 60000, savings: 40000, wants: 50000 }, base: { income: 400000, essentials: 100000, debtMinimums: 50000 } };
  const pc = P.paycheckPlan({ strategy: strat }).paychecks[0];
  // monthly: everyday 50,000, extra debt 10,000, savings 40,000, wants 50,000; this paycheck is half the month
  assert.deepEqual(pc.alloc, { everyday: 25000, savings: 20000, extraDebt: 5000, wants: 25000 });
  assert.equal(pc.remaining, 200000 - 75000);
});

test('two income sources with different pay frequencies, in date order', () => {
  fresh(true);
  income(160000);
  WT.addIncome({ id: 'inc_b', name: 'Side job', kind: 'net', netCents: 15000, schedule: 'weekly', anchor: '2026-11-09', startDate: '2026-11-09', accountId: 'acc_checking' });
  bill('b_apt', 'Apartment', 80000, '2026-11-12');
  const p = P.paycheckPlan({ strategy: NONE, count: 6 });
  assert.deepEqual(p.paychecks.map(x => x.date), ['2026-11-06', '2026-11-09', '2026-11-16', '2026-11-20', '2026-11-23', '2026-11-30']);
  assert.deepEqual(p.paychecks.map(x => x.incomeName), ['Job A', 'Side job', 'Side job', 'Job A', 'Side job', 'Side job']);
  assert.deepEqual(p.paychecks.map(x => x.net), [160000, 15000, 15000, 160000, 15000, 15000]);
  // the apartment due Nov 12 is funded by the latest paycheck before it (the Nov 9 side job), once
  const aptIn = p.paychecks.filter(x => x.bills.some(b => b.name === 'Apartment'));
  assert.equal(aptIn.length, 1); assert.equal(aptIn[0].date, '2026-11-09');
  assert.equal(aptIn[0].reserveIn, 65000); assert.equal(p.paychecks[0].reserveOut, 65000);
  // allocations scale with each check's size
  const strat = { id: 'x', amounts: { needs: 40000, debt: 0, savings: 0, wants: 0 }, base: { income: 400000, essentials: 0, debtMinimums: 0 } };
  const q = P.paycheckPlan({ strategy: strat, count: 2 });
  assert.equal(q.paychecks[0].alloc.everyday, 16000); // 400.00 * 1600 / 4000 assert.equal(q.paychecks[1].alloc.everyday, 1500);
});

test('warnings before a paycheck is overallocated', () => {
  fresh(true);
  income(160000);
  bill('b_apt', 'Apartment', 110000, '2026-11-12');
  const k = K('2026-11-06');
  // over by $50 with no earlier paycheck to borrow from
  const pc = P.paycheckPlan({ strategy: NONE, alloc: { [k]: { everyday: 30000, savings: 20000, extraDebt: 5000, wants: 0 } } }).paychecks[0]; // 1600 - 1100 - 550
  assert.equal(pc.overallocated, true); assert.equal(pc.shortfall, 5000); assert.equal(pc.remaining, -5000);
  assert.ok(pc.warnings.some(w => w.includes('$50.00 short')), pc.warnings.join('|'));
  assert.ok(pc.warnings.some(w => w.includes('Savings, Extra debt or Spending')));
  // exactly covered but tight: warns before going over
  const t = P.paycheckPlan({ strategy: NONE, alloc: { [k]: { everyday: 30000, savings: 15000, extraDebt: 3500, wants: 0 } } }).paychecks[0]; // 1600 - 1100 - 485
  assert.equal(t.overallocated, false); assert.equal(t.remaining, 1500);
  assert.ok(t.warnings.some(w => w.includes('Only $15.00 is left')));
  // default savings/extra/spending are trimmed so they never make a paycheck short by themselves
  const strat = { id: 'x', amounts: { needs: 0, debt: 0, savings: 400000, wants: 0 }, base: { income: 400000, essentials: 0, debtMinimums: 0 } };
  const d = P.paycheckPlan({ strategy: strat }).paychecks[0];
  assert.equal(d.alloc.savings, 160000 - 110000); assert.equal(d.allocTrimmed, true); assert.equal(d.overallocated, false);
});

// ---------------------------------------------------------------- debt payoff
function debts() {
  fresh(true);
  WT.addDebt({ id: 'd_a', name: 'Card A', startBalanceCents: 100000, aprCenti: 2000, minCents: 5000, dueDay: 10 });
  WT.addDebt({ id: 'd_b', name: 'Loan B', startBalanceCents: 300000, aprCenti: 1000, minCents: 10000, dueDay: 15 });
  WT.addDebt({ id: 'd_c', name: 'Card C', startBalanceCents: 50000, aprCenti: 1500, minCents: 2500, dueDay: 20 });
}

test('avalanche vs snowball vs custom: ordering, interest and dates', () => {
  debts();
  bill('b_apt', 'Apartment', 90000, '2026-11-12'); // a normal bill is never a debt
  const r = P.debtPlans({ extra: 10000, order: ['d_b'] });
  assert.equal(r.count, 3); assert.equal(r.minimums, 17500); assert.equal(r.extra, 10000);
  assert.equal(r.estimate, false); assert.deepEqual(r.missing, []);
  const { avalanche: av, snowball: sn, custom: cu, minimum: mi } = r.methods;
  const by = (m, id) => m.order.find(x => x.id === id);
  // matches core's simulator
  const ref = WT.simulatePayoff(WT.debtInputs(), 10000, 'avalanche');
  assert.equal(av.months, ref.months); assert.equal(av.totalInterest, ref.totalInterest);
  const refS = WT.simulatePayoff(WT.debtInputs(), 10000, 'snowball');
  assert.equal(sn.months, refS.months); assert.equal(sn.totalInterest, refS.totalInterest);
  assert.equal(mi.totalInterest, WT.simulatePayoff(WT.debtInputs(), 0, 'minimum').totalInterest);
  // targets
  assert.ok(av.notes[0].includes('Card A')); assert.ok(sn.notes[0].includes('Card C')); assert.ok(cu.notes[0].includes('Loan B'));
  assert.ok(by(av, 'd_a').payoffMonth < by(sn, 'd_a').payoffMonth);
  assert.ok(by(sn, 'd_c').payoffMonth <= by(av, 'd_c').payoffMonth);
  assert.ok(by(cu, 'd_b').payoffMonth < by(av, 'd_b').payoffMonth);
  // interest
  assert.ok(av.totalInterest <= sn.totalInterest); assert.ok(av.totalInterest <= cu.totalInterest);
  assert.equal(av.interestSaved, mi.totalInterest - av.totalInterest);
  assert.ok(av.interestSaved > 0);
  assert.equal(r.best, 'avalanche');
  // precise dates when everything is known
  assert.match(av.payoffDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(av.payoffDate, av.order.map(x => x.payoffDate).sort().pop());
  assert.equal(by(av, 'd_a').payoffDate.slice(8), '10');
  assert.equal(r.method, 'avalanche'); assert.equal(r.selected, av);
});

test('saved settings drive method, extra and order', () => {
  debts();
  WT.saveSettings({ smartBudget: { debt: { method: 'custom', extra: 2500, order: ['d_c', 'd_b'] } } });
  const r = P.debtPlans();
  assert.equal(r.method, 'custom'); assert.equal(r.extra, 2500); assert.deepEqual(r.order, ['d_c', 'd_b']);
  assert.equal(r.selected.id, 'custom');
});

test('missing APR / minimum: estimate, missing list, no precise dates', () => {
  debts();
  WT.addDebt({ id: 'd_x', name: 'Store Card', startBalanceCents: 40000, aprCenti: 0, minCents: 0 });
  WT.addDebt({ id: 'd_y', name: 'Laptop Plan', startBalanceCents: 60000, aprCenti: 0, minCents: 0 });
  bill('b_y', 'Laptop Plan', 5000, '2026-11-20', 'cat_phone', 'd_y'); // the linked bill gives a minimum
  WT.addDebt({ id: 'd_paid', name: 'Paid Off', startBalanceCents: 0, aprCenti: 1000, minCents: 1000 });
  WT.addDebt({ id: 'd_closed', name: 'Closed', startBalanceCents: 50000, aprCenti: 1000, minCents: 1000, closed: true });
  const r = P.debtPlans({ extra: 10000 });
  assert.equal(r.count, 5);
  assert.equal(r.estimate, true);
  assert.deepEqual(r.missing, [{ id: 'd_y', name: 'Laptop Plan', fields: ['apr'] }, { id: 'd_x', name: 'Store Card', fields: ['apr', 'minimum'] }]);
  for (const m of Object.values(r.methods)) {
    assert.equal(m.estimate, true); assert.equal(m.payoffDate, null);
    m.order.forEach(x => assert.equal(x.payoffDate, null));
  }
  const av = r.methods.avalanche;
  assert.ok(av.months > 0, 'months still given as an estimate');
  assert.ok(av.notes.some(n => n.includes('estimates')));
  assert.ok(av.notes.some(n => n.includes('Store Card') && n.includes('interest rate (APR)') && n.includes('minimum payment')));
  assert.equal(av.order.find(x => x.id === 'd_y').minimum, 5000);
  assert.ok(!av.order.some(x => x.id === 'd_paid' || x.id === 'd_closed'));
});

test('a plan that never pays off', () => {
  fresh(true);
  WT.addDebt({ id: 'd_big', name: 'Big Card', startBalanceCents: 1000000, aprCenti: 3000, minCents: 5000 }); // interest $250/mo > $50 minimum
  const r = P.debtPlans({ extra: 0 });
  for (const id of ['avalanche', 'snowball', 'custom', 'minimum']) {
    const m = r.methods[id];
    assert.equal(m.neverPaysOff, true); assert.equal(m.months, null); assert.equal(m.payoffDate, null);
    assert.ok(m.notes.some(n => n.includes('never pays off') && n.includes('$50.00')), m.notes.join('|'));
  }
  assert.equal(r.best, null);
  // enough extra fixes it, and the saving vs minimum-only is a floor
  const ok = P.debtPlans({ extra: 50000 });
  assert.ok(ok.methods.avalanche.months > 0); assert.equal(ok.methods.avalanche.interestSavedAtLeast, true);
  assert.ok(ok.methods.avalanche.interestSaved > 0);
});

test('sample data debts: only real debts, minimums from debts and linked bills', () => {
  fresh();
  const r = P.debtPlans({ extra: 20000 });
  assert.equal(r.count, 6);
  assert.equal(r.minimums, WT.debtInputs().reduce((t, d) => t + Math.max(d.minCents, 0), 0));
  assert.deepEqual(r.missing.map(m => m.id).sort(), ['debt_furniture', 'debt_gascard']);
  assert.ok(!r.methods.avalanche.order.some(x => /Apartment|Video Stream/.test(x.name)));
});

test('read-only: nothing in WT.D changes and nothing is persisted', () => {
  const writes = fresh();
  WT.ensureGenerated('2027-03');
  const before = snap(); const n = writes.n;
  const apt = inst('bill_apartment', '2026-12-01');
  P.paycheckPlan(); P.paycheckPlan({ count: 8, moves: { [apt.id]: 'inc_job|2026-11-06' }, income: { 'inc_job|2026-11-20': 1000 }, alloc: { 'inc_job|2026-11-20': { savings: 99999 } } });
  P.moveTargets(apt.id); P.debtPlans(); P.debtPlans({ extra: 50000, method: 'custom', order: ['debt_car'] });
  assert.equal(snap(), before);
  assert.equal(writes.n, n);
});
