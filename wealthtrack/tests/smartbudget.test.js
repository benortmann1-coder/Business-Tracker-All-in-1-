// Run: node --test wealthtrack/tests/smartbudget.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed } = require(path.join(__dirname, 'fixtures/sample-data.js')); // made-up sample data
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js')); // a real new install (blank)
const S = require(path.join(__dirname, '../web/smartbudget.js'));

const TODAY = '2026-11-06';
WT.setToday(TODAY);

function fresh(blank) {
  const store = {}; const writes = { n: 0 };
  const persist = { put(c, r) { writes.n++; (store[c] = store[c] || {})[r.id] = JSON.parse(JSON.stringify(r)); }, del(c, id) { writes.n++; if (store[c]) delete store[c][id]; } };
  WT.init(null, persist);
  if (blank) blankSeed(WT, { today: TODAY }); else seed(WT, { today: TODAY });
  return { store, writes };
}
const B = ['needs', 'debt', 'savings', 'wants'];
const sumPct = p => Math.round(B.reduce((a, b) => a + p[b], 0) * 10) / 10;
const sumC = o => B.reduce((a, b) => a + o[b], 0);
const oneDecimal = p => B.every(b => Math.round(p[b] * 10) / 10 === p[b] && p[b] >= 0);
function checkTotals(A, s) {
  assert.equal(sumPct(s.pct), 100, s.id + ' pct sums to 100');
  assert.ok(oneDecimal(s.pct), s.id + ' pct has 1 decimal');
  assert.equal(sumC(s.amounts), A.income, s.id + ' cents sum to income');
  B.forEach(b => assert.ok(Number.isInteger(s.amounts[b]), s.id + ' integer cents'));
  if (s.adjusted) { assert.equal(sumPct(s.adjusted.pct), 100); assert.equal(sumC(s.adjusted.amounts), A.income); }
}
// Sample data per month (TODAY 2026-11-06):
//   income      $1,600 biweekly * 26 / 12                                   = 346667
//   essentials  Apartment 1200 + Electric 95 + Water 40 + Internet 65 + Cell 55 + Auto Ins 110 = 156500
//   everyday    "Groceries & fuel" $250 per paycheck * 26 / 12               =  54167
//   living      essentials + everyday                                       = 210667
//   minimums    Car 380 + Student 175 + Visa 150 + Store 40 + Furniture 50 + Gas Card 30 = 82500
//   optional    Gym 35 + Music 10.99 + Video 15.49 + Cloud 2.99 (News App cancelled) = 6447
//   free        346667 - 210667 - 82500                                     =  53500 (covers everything, less than the $1,000 starter fund)
// SHORT_NET makes the same data short: $1,200 biweekly = 260000/mo, 293167 - 260000 = 33167 short.
const SHORT_NET = 120000;
function addExp(date, category, amountCents) { WT.addExpense({ date, category, amountCents, sourceId: 'acc_checking' }); }

test('analyze on sample data: income, essentials, minimums', () => {
  fresh();
  const A = S.analyze();
  assert.equal(A.month, '2026-11');
  assert.equal(A.income, 346667); // $1,600 biweekly * 26 / 12
  assert.equal(A.incomeDetail.perPaycheck, 160000);
  assert.equal(A.essentials, 120000 + 9500 + 4000 + 6500 + 5500 + 11000); // apartment, electric, water, internet, cell, auto ins
  assert.equal(A.optionalBills, 3500 + 1099 + 1549 + 299); // gym + subscriptions (News App cancelled)
  assert.equal(A.debtMinimums, 38000 + 17500 + 15000 + 4000 + 5000 + 3000);
  assert.equal(A.committed, A.essentials + A.debtMinimums);
  assert.equal(A.debtTotal, WT.totalDebt());
  assert.equal(A.spending.needs, 54167); // "Groceries & fuel" set-aside $250 per paycheck
  assert.equal(A.leftover, A.income - A.essentials - A.optionalBills - A.debtMinimums - A.spending.needs - A.spending.wants - A.savingsNow);
  assert.equal(typeof A.essentialCategory, 'function');
  assert.equal(A.essentialCategory('cat_housing', 'bill'), true);
  assert.equal(A.essentialCategory('cat_subscriptions', 'bill'), false);
  assert.ok(!('essentialCategory' in JSON.parse(JSON.stringify(A))));
  // v2: living costs, free money, shortfall, balances, starter fund
  assert.equal(A.everyday, 54167);
  assert.equal(A.living, A.essentials + 54167);
  assert.equal(A.required, A.living + A.debtMinimums);
  assert.equal(A.free, A.income - A.living - A.debtMinimums);
  assert.equal(A.free, 53500);
  assert.equal(A.shortfall, 0);
  assert.deepEqual(A.balances, { checking: 0, savings: 0, available: 0 });
  assert.deepEqual(A.starter, { target: 100000, saved: 0, gap: 100000 });
  assert.deepEqual(A.upcoming, []); assert.deepEqual(A.goals, []);
  assert.deepEqual(A.options, []); // not short: no shortfall options
  assert.equal(A.notes.length, 2); // Furniture Plan and Gas Card have no APR
  // the same data with a smaller paycheck is short and gets options
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const A2 = S.analyze();
  assert.equal(A2.income, 260000); assert.equal(A2.free, -33167); assert.equal(A2.shortfall, 33167);
  assert.ok(A2.options.length >= 3);
});

test('every strategy: pct sums to 100 and cents sum exactly to income', () => {
  fresh();
  const A = S.analyze();
  const list = S.strategies(A);
  assert.deepEqual(list.map(s => s.id), ['recommended', '50-30-20', '60-20-20', 'debt', 'savings', 'zero']);
  list.forEach(s => { checkTotals(A, s); assert.ok(s.why.length > 10); assert.ok(s.fitScore >= 0 && s.fitScore <= 100); });
  // odd incomes still sum exactly
  WT.updateIncome('inc_job', { netCents: 123457 });
  const A2 = S.analyze();
  S.strategies(A2).forEach(s => checkTotals(A2, s));
});

test('presets are infeasible and adjusted when essentials + minimums exceed them', () => {
  fresh();
  const A = S.analyze();
  const list = S.strategies(A);
  for (const id of ['50-30-20', '60-20-20']) {
    const s = list.find(x => x.id === id);
    assert.equal(s.feasible, false);
    assert.ok(s.warnings.length > 0);
    assert.match(s.warnings.join(' '), /isn't realistic|miss payments/);
    assert.ok(s.adjusted);
    assert.equal(s.realistic, false);
    // essentials are 45% and minimums 24% of pay: adjusted funds living costs and minimums, the $535 left goes to savings
    assert.deepEqual(s.adjusted.amounts, { needs: A.living, debt: A.debtMinimums, savings: A.free, wants: 0 });
    assert.equal(s.adjusted.realistic, true);
    assert.ok(s.adjusted.amounts.wants <= s.amounts.wants);
  }
  // income can't cover living costs + minimums: adjusted keeps home, bills, food and gas funded first
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const As = S.analyze();
  for (const s of S.strategies(As).filter(x => x.id === '50-30-20' || x.id === '60-20-20')) {
    assert.equal(s.feasible, false); assert.equal(s.realistic, false);
    assert.deepEqual(s.adjusted.amounts, { needs: As.living, debt: As.income - As.living, savings: 0, wants: 0 });
    assert.equal(s.adjusted.realistic, false);
  }
  // with enough income, adjusted presets cover living costs and minimums
  WT.updateIncome('inc_job', { netCents: 250000 });
  const A2 = S.analyze();
  const p2 = S.strategies(A2).find(x => x.id === '50-30-20');
  assert.ok(p2.adjusted && p2.adjusted.realistic);
  assert.ok(p2.adjusted.amounts.needs >= A2.living && p2.adjusted.amounts.debt >= A2.debtMinimums);
  assert.equal(sumC(p2.adjusted.amounts), A2.income);
  // a preset that fits is feasible with no adjustment
  WT.updateIncome('inc_job', { netCents: 1000000 });
  const big = S.strategies(S.analyze()).find(x => x.id === '50-30-20');
  assert.equal(big.feasible, true); assert.equal(big.realistic, true); assert.equal(big.adjusted, undefined);
});

test('recommended on sample data: everything funded, the rest starts the emergency fund', () => {
  fresh();
  const A = S.analyze();
  const list = S.strategies(A);
  const rec = list[0];
  assert.equal(rec.id, 'recommended');
  // $535 free: less than the $1,000 starter fund, so no extra debt; $64.47 spending covers the optional bills
  assert.deepEqual(rec.amounts, { needs: 210667, debt: 82500, savings: 47053, wants: 6447 });
  assert.deepEqual(rec.debtSplit, { minimum: 82500, extra: 0 });
  assert.equal(rec.amounts.savings + rec.amounts.wants, A.free);
  assert.equal(rec.feasible, true); assert.equal(rec.realistic, true);
  assert.deepEqual(rec.warnings, []);
  assert.match(rec.why, /\$3,467/);
  assert.equal(S.compare(A, list).bestId, 'recommended');
});

test('recommended when income is short: living costs are funded first and nothing is Best fit', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const A = S.analyze();
  const list = S.strategies(A);
  const rec = list[0];
  assert.equal(rec.id, 'recommended');
  assert.equal(rec.name, 'Recommended for you');
  assert.equal(rec.kind, 'Personalized');
  // $2,600.00 take-home vs $2,106.67 living costs + $825.00 minimums: $331.67 short
  assert.deepEqual(rec.amounts, { needs: 210667, debt: 49333, savings: 0, wants: 0 });
  assert.deepEqual(rec.debtSplit, { minimum: 49333, extra: 0 });
  assert.equal(rec.feasible, false); assert.equal(rec.realistic, false);
  assert.match(rec.warnings[0], /\$331\.67 short/);
  assert.ok(rec.options.some(o => /hardship plan|lower minimum/.test(o)));
  assert.ok(rec.options.some(o => o.includes('$331.67')));
  assert.match(rec.why, /\$2,600/); // uses the real take-home pay
  assert.match(rec.why, /\$331\.67 short/);
  assert.ok(list.every(s => s.realistic === false));
  const cmp = S.compare(A, list);
  assert.equal(cmp.bestId, null); // never "Best fit" when living expenses or minimums are unfunded
  assert.equal(cmp.rows.length, list.length);
  assert.ok(cmp.rows.every(r => r.realistic === false && Array.isArray(r.risks)));
});

test('recommended leaves real money for savings and spending when income allows', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 250000 }); // $5,416.67/mo
  const A = S.analyze();
  assert.equal(A.free, 248500); // 541667 - 210667 - 82500
  const list = S.strategies(A);
  const rec = list[0];
  // living costs + minimums, then the $1,000 starter fund, spending money, then extra on the 28.99% card
  assert.deepEqual(rec.amounts, { needs: 210667, debt: 156690, savings: 124730, wants: 49580 });
  assert.equal(sumC(rec.amounts), A.income);
  assert.deepEqual(rec.debtSplit, { minimum: A.debtMinimums, extra: 74190 });
  assert.match(rec.why, /Store Card \(28\.99% APR\)/);
  assert.ok(rec.amounts.savings >= A.starter.gap);
  assert.ok(rec.amounts.wants >= Math.round(A.free * 0.10));
  assert.equal(rec.realistic, true); assert.equal(rec.feasible, true);
  assert.deepEqual(rec.risks, []);
  assert.equal(rec.disposable, rec.amounts.wants - A.optionalBills);
  assert.equal(rec.annualSavings, rec.amounts.savings * 12);
  assert.ok(rec.lines.some(l => l.label === 'Starter emergency fund' && l.amount === 100000));
  assert.equal(rec.lines.reduce((a, l) => a + l.amount, 0), A.income);
  assert.ok(list.every(s => s.id === 'recommended' || s.fitScore <= rec.fitScore));
  const cmp = S.compare(A, list);
  assert.equal(cmp.bestId, 'recommended');
  // Best fit is always a realistic plan
  assert.ok(cmp.rows.find(r => r.id === cmp.bestId).realistic);
  // unrealistic presets keep their flag
  assert.equal(list.find(s => s.id === '50-30-20').realistic, false);
});

test('extra debt is never recommended when necessities are unfunded (low income)', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 60000 }); // $1,300/mo: below bills + groceries + gas
  const A = S.analyze();
  assert.equal(A.income, 130000);
  assert.ok(A.income < A.living);
  const list = S.strategies(A);
  for (const s of list) {
    const eff = s.adjusted || s;
    if (['recommended', 'debt', 'savings', 'zero'].includes(s.id)) assert.deepEqual(s.amounts, { needs: 130000, debt: 0, savings: 0, wants: 0 }, s.id);
    assert.equal(s.debtSplit.extra, 0, s.id);
    assert.equal(sumC(eff.amounts), A.income);
    assert.equal(s.realistic, false);
  }
  assert.equal(S.compare(A, list).bestId, null);
  const sug = S.suggestions(A, list[0]);
  assert.ok(!sug.some(x => x.kind === 'extra-debt' && x.affordable), 'no extra debt recommendation');
  const hold = sug.find(x => x.kind === 'extra-debt');
  assert.equal(hold.affordable, false); assert.match(hold.title, /Hold off/);
  assert.equal(sug[0].kind, 'shortfall');
  assert.equal(sug[0].amount, A.shortfall);
  // living funded but starter emergency fund not yet built: still no extra debt
  WT.updateIncome('inc_job', { netCents: 160000 }); // the sample's own pay: free $535
  const B2 = S.analyze();
  assert.ok(B2.free > 0 && B2.free < B2.starter.gap);
  const rec = S.strategies(B2)[0];
  assert.equal(rec.debtSplit.extra, 0);
  assert.ok(rec.amounts.wants > 0 && rec.amounts.savings > 0);
  assert.equal(rec.amounts.savings + rec.amounts.wants, B2.free);
  assert.equal(rec.realistic, true);
  // a chosen plan that pays extra anyway gets a "not yet" note, never a contradicting recommendation
  const debtPlan = S.strategies(B2).find(s => s.id === 'debt');
  assert.ok(debtPlan.debtSplit.extra > 0);
  const sug2 = S.suggestions(B2, debtPlan);
  assert.ok(!sug2.some(x => x.kind === 'extra-debt' && x.affordable));
  assert.match(sug2.find(x => x.kind === 'extra-debt').detail, /starter emergency fund/);
  assert.match(sug2.find(x => x.kind === 'extra-debt').detail, /Your chosen plan puts/);
});

test('shortfall: exact amount explained with realistic options', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 100000 }); // $2,166.67/mo
  const A = S.analyze();
  assert.equal(A.shortfall, A.required - A.income);
  assert.equal(A.feasible, false);
  const rec = S.strategies(A)[0];
  assert.equal(rec.feasible, false);
  assert.match(rec.warnings[0], new RegExp(WT.fmt(A.shortfall).replace(/[$.]/g, '\\$&') + ' short'));
  assert.ok(rec.options.length >= 4);
  const all = rec.options.join(' ');
  assert.match(all, /hardship plan/); assert.match(all, /Car Loan \(\$380\)/);
  assert.match(all, /Apartment \(\$1,200\)/); assert.match(all, /Extra income of/);
  assert.match(all, /If you paused optional bills/); assert.match(all, /Only if you want to/);
  rec.options.forEach(o => assert.ok(!/NaN|undefined/.test(o)));
  // enough income: no options
  WT.updateIncome('inc_job', { netCents: 250000 });
  assert.deepEqual(S.analyze().options, []);
  assert.equal(S.strategies(S.analyze())[0].options, undefined);
});

test('debt-focused pays off debt faster than 50/30/20', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 250000 }); // sample pay leaves nothing extra for debt yet (starter fund first)
  const A = S.analyze();
  const list = S.strategies(A);
  const d = list.find(s => s.id === 'debt'), p = list.find(s => s.id === '50-30-20');
  assert.ok(d.projection.debtFreeMonths < p.projection.debtFreeMonths);
  assert.ok(d.projection.debtPaid12 > p.projection.debtPaid12);
  assert.ok(d.projection.interestSaved > 0);
  // projection uses WT.simulatePayoff with extra = debt - minimums
  assert.equal(d.projection.savings12, d.amounts.savings * 12);
  assert.equal(d.projection.spendingMonthly, d.amounts.wants);
  assert.equal(d.projection.debtFreeEstimate, true); // Furniture Plan / Gas Card have no APR
  assert.ok(d.projection.interest > 0 && d.projection.interest < p.projection.interest);
  assert.deepEqual(d.debtSplit, { minimum: A.debtMinimums, extra: d.amounts.debt - A.debtMinimums });
  assert.ok(d.risks.some(r => /before your starter emergency fund/.test(r)));
});

test('allocate() normalizes arbitrary slider values', () => {
  fresh();
  const A = S.analyze();
  for (const p of [{ needs: 1, debt: 1, savings: 1, wants: 0 }, { needs: 33.33, debt: 33.33, savings: 33.33, wants: 0 }, { needs: 70, debt: 70, savings: 0, wants: 0 }, { needs: '12', debt: -5, savings: NaN, wants: 3 }, {}]) {
    const r = S.allocate(A, p);
    assert.equal(sumPct(r.pct), 100); assert.ok(oneDecimal(r.pct));
    assert.equal(sumC(r.amounts), A.income);
    assert.equal(typeof r.feasible, 'boolean'); assert.ok(Array.isArray(r.warnings));
  }
  const r = S.allocate(A, { needs: 1, debt: 1, savings: 1, wants: 0 });
  assert.deepEqual(r.pct, { needs: 33.4, debt: 33.3, savings: 33.3, wants: 0 });
  // essentials are 45.1% of pay, living costs 60.8%, minimums 23.8%
  const ok = S.allocate(A, { needs: 46, debt: 50, savings: 2, wants: 2 });
  assert.equal(ok.feasible, true); // essential bills + minimums covered (v1 meaning)
  assert.equal(ok.realistic, false); // ...but not groceries and gas
  assert.match(ok.warnings.join(' '), /groceries and gas/);
  const bad = S.allocate(A, { needs: 50, debt: 10, savings: 20, wants: 20 });
  assert.equal(bad.feasible, false); assert.match(bad.warnings.join(' '), /minimum debt payments are \$825/);
});

test('paycheckPlan: reserves sum to net and bills come from existing assignments', () => {
  fresh();
  const A = S.analyze();
  const rec = S.strategies(A)[0];
  const plan = S.paycheckPlan(rec);
  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map(p => p.date), ['2026-11-06', '2026-11-20', '2026-12-04']);
  for (const p of plan) {
    assert.equal(sumC(p.reserve), p.net);
    const expected = WT.billsForPaycheck(p.key).map(i => i.id);
    assert.deepEqual(p.bills.map(b => b.instId), expected);
    assert.equal(p.billsTotal, p.bills.reduce((a, b) => a + b.amountCents, 0));
    assert.equal(p.shortfall, Math.max(0, p.billsTotal - p.net));
    assert.equal(p.incomeName, 'Day job');
  }
  assert.ok(plan[0].bills.some(b => b.name === 'Car Loan Payment' && b.kind === 'debt'));
  assert.ok(plan[1].bills.some(b => b.name === 'Apartment' && b.essential)); // the Dec 1 apartment bill is on the Nov 20 check
  // moving a bill to another paycheck moves it in the plan
  const apt = WT.instancesForMonth('2026-12').find(i => i.templateId === 'bill_apartment');
  WT.assignInstance(apt.id, plan[0].key);
  const plan2 = S.paycheckPlan(rec, 2);
  assert.equal(plan2.length, 2);
  assert.ok(plan2[0].bills.some(b => b.instId === apt.id));
  assert.ok(!plan2[1].bills.some(b => b.instId === apt.id));
  assert.equal(sumC(plan2[0].reserve), plan2[0].net);
});

test('Smart Budget never creates or changes WT records', () => {
  const ctx = fresh();
  WT.saveSettings({ smartBudget: { strategyId: 'custom', custom: { needs: 30, debt: 60, savings: 5, wants: 5 }, essentialOverrides: { cat_utilities: false }, history: [] } });
  addExp('2026-10-03', 'cat_groceries', 12000); addExp('2026-11-02', 'cat_restaurants', 9000);
  WT.markPaid(WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_apartment').id, TODAY);
  const before = JSON.stringify(WT.D); const w0 = ctx.writes.n;
  const A = S.analyze();
  const list = S.strategies(A);
  for (const s of list) { S.suggestions(A, s); S.paycheckPlan(s, 4); S.vsActual(A, s); S.snapshot('2026-11', s); }
  S.compare(A, list); S.allocate(A, { needs: 1 }); S.analyze('2026-10'); S.analyze('2027-02');
  assert.equal(JSON.stringify(WT.D), before);
  assert.equal(ctx.writes.n, w0);
  assert.deepEqual(WT.integrity(), []);
});

test('blank data does not throw and still returns valid shapes', () => {
  fresh(true);
  const before = JSON.stringify(WT.D);
  const A = S.analyze();
  assert.equal(A.income, 0); assert.equal(A.essentials, 0); assert.equal(A.debtMinimums, 0);
  const list = S.strategies(A);
  assert.equal(list.length, 6);
  list.forEach(s => { assert.equal(sumPct(s.pct), 100); assert.equal(sumC(s.amounts), 0); assert.equal(s.feasible, false); assert.equal(s.realistic, false); });
  assert.equal(S.compare(A, list).bestId, null); // no income: nothing is a realistic "Best fit"
  assert.deepEqual(S.rollover().carryIn, { needs: 0, debt: 0, savings: 0, wants: 0 });
  assert.equal(S.fromDollars(A, { needs: 100 }).unallocated, -100);
  assert.ok(S.suggestions(A, list[0]).some(x => x.kind === 'warning'));
  assert.deepEqual(S.paycheckPlan(list[0]), []);
  const v = S.vsActual(A, list[0]); B.forEach(b => assert.equal(v[b].actual, 0));
  assert.equal(S.allocate(A, { needs: 50 }).feasible, false);
  assert.equal(JSON.stringify(WT.D), before);
});

test('income below obligations: recommended infeasible with a clear warning', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 100000 }); // ~$2,167/mo, essential bills + minimums $2,390
  const A = S.analyze();
  assert.ok(A.income < A.committed);
  const list = S.strategies(A);
  const rec = list[0];
  assert.equal(rec.feasible, false);
  assert.match(rec.warnings[0], /short of your essential bills, groceries and gas/);
  assert.equal(rec.amounts.needs, A.living); // bills, groceries and gas first
  assert.equal(rec.amounts.debt, A.income - A.living); // the rest toward minimums
  list.forEach(s => checkTotals(A, s));
  assert.ok(S.suggestions(A, rec).some(x => x.kind === 'shortfall' && x.urgency === 'now' && /short each month/.test(x.title)));
});

test('no bills / no debts / debts missing minimum or APR', () => {
  fresh(true);
  WT.addIncome({ id: 'inc_x', name: 'Job', kind: 'net', netCents: 200000, schedule: 'monthly', anchor: '2026-10-15', startDate: '2026-10-15', accountId: 'acc_checking' });
  let A = S.analyze();
  assert.equal(A.income, 200000);
  let list = S.strategies(A);
  list.forEach(s => { checkTotals(A, s); assert.equal(s.feasible, true); assert.equal(s.projection.debtFreeMonths, 0); });
  assert.equal(list.find(s => s.id === 'debt').amounts.debt, 0);
  assert.match(list.find(s => s.id === 'debt').warnings.join(' '), /no debts/);
  // a debt with no minimum and no APR
  WT.addDebt({ id: 'debt_x', name: 'Family loan', type: 'personal', startBalanceCents: 50000, aprCenti: 0, minCents: 0 });
  A = S.analyze();
  assert.equal(A.debtMinimums, 0);
  assert.equal(A.notes.length, 2);
  list = S.strategies(A);
  list.forEach(s => checkTotals(A, s));
  const sug = S.suggestions(A, list[0]);
  assert.ok(sug.some(x => /no minimum payment/.test(x.detail)));
  assert.ok(sug.some(x => x.kind === 'extra-debt' && x.affordable)); // no living costs, no starter fund needed
});

test('essentialOverrides are respected', () => {
  fresh();
  const A0 = S.analyze();
  WT.saveSettings({ smartBudget: { essentialOverrides: { cat_utilities: false, cat_subscriptions: true } } });
  const A = S.analyze();
  // utilities (Electric 95 + Water 40) become optional; subscriptions (Music 10.99 + Video 15.49 + Cloud 2.99) become essential
  assert.equal(A.essentials, A0.essentials - 13500 + 2947);
  assert.equal(A.optionalBills, A0.optionalBills - 2947 + 13500); // the gym (35) stays optional
  assert.equal(A.essentialCategory('cat_utilities', 'bill'), false);
  assert.equal(A.essentialCategory('cat_subscriptions', 'bill'), true);
  // expense categories too
  WT.saveSettings({ smartBudget: { essentialOverrides: { cat_restaurants: true } } });
  addExp('2026-11-03', 'cat_restaurants', 6000);
  const A2 = S.analyze();
  assert.ok(A2.spending.byCategory.cat_restaurants > 0);
  assert.equal(A2.spending.wants, 0);
});

test('custom strategy appears only when saved', () => {
  fresh();
  assert.ok(!S.strategies(S.analyze()).some(s => s.id === 'custom'));
  WT.saveSettings({ smartBudget: { strategyId: 'custom', custom: { needs: 46, debt: 50, savings: 2, wants: 2 } } });
  const A = S.analyze();
  const list = S.strategies(A);
  const c = list[list.length - 1];
  assert.equal(c.id, 'custom'); assert.equal(c.name, 'Custom');
  checkTotals(A, c);
  assert.equal(c.feasible, true);
});

test('vsActual math', () => {
  fresh();
  const A = S.analyze();
  const rec = S.strategies(A)[0];
  const nov = mk => WT.instancesForMonth('2026-11').find(i => i.templateId === mk);
  WT.markPaid(nov('bill_apartment').id, '2026-11-01');      // needs 1200
  WT.markPaid(nov('bill_carloan').id, TODAY);               // debt 380
  WT.recordPayment(nov('bill_video').id, { amountCents: 1549, date: TODAY }); // wants 15.49
  addExp('2026-11-04', 'cat_groceries', 8000);               // needs 80
  addExp('2026-11-05', 'cat_restaurants', 2500);             // wants 25
  addExp('2026-10-20', 'cat_groceries', 9999);               // other month: ignored
  WT.payDebtExtra('debt_store', 5000, TODAY, 'acc_checking'); // debt 50
  const g = WT.addGoal({ name: 'Emergency', type: 'emergency', targetCents: 100000 });
  WT.contributeGoal(g.id, 4000, TODAY);                      // savings 40
  const v = S.vsActual(A, rec, '2026-11');
  assert.equal(v.needs.actual, 120000 + 8000);
  assert.equal(v.debt.actual, 38000 + 5000);
  assert.equal(v.wants.actual, 1549 + 2500);
  assert.equal(v.savings.actual, 4000);
  for (const b of B) { assert.equal(v[b].planned, rec.amounts[b]); assert.equal(v[b].remaining, v[b].planned - v[b].actual); }
  // a different month only sees that month
  assert.equal(S.vsActual(A, rec, '2026-10').needs.actual, 9999);
});

test('suggestions flag a category that spikes, plus the other v2 kinds', () => {
  fresh();
  addExp('2026-08-10', 'cat_restaurants', 10000);
  addExp('2026-09-10', 'cat_restaurants', 10000);
  addExp('2026-10-10', 'cat_restaurants', 10000);
  addExp('2026-11-03', 'cat_restaurants', 20000);            // $200 vs $100 average
  addExp('2026-11-03', 'cat_groceries', 1000);               // new but tiny: not flagged
  WT.updateIncome('inc_job', { netCents: SHORT_NET });       // short, so the shortfall kind shows too
  const A = S.analyze();
  const list = S.strategies(A);
  const sug = S.suggestions(A, list[0]);
  const over = sug.filter(x => x.kind === 'reduce');
  assert.equal(over.length, 1);
  assert.equal(over[0].catId, 'cat_restaurants');
  assert.equal(over[0].amount, 10000);
  assert.match(over[0].detail, /\$200/); assert.match(over[0].detail, /\$100/);
  const kinds = new Set(sug.map(x => x.kind));
  ['shortfall', 'fund-first', 'paycheck-setaside', 'emergency', 'reduce', 'extra-debt', 'safe-to-spend', 'goal-eta', 'scenario'].forEach(k => assert.ok(kinds.has(k), 'has ' + k));
  const sc = sug.find(x => x.kind === 'scenario');
  assert.equal(sc.optional, true); assert.match(sc.title, /^Optional: pausing 3 subscriptions/);
  sug.forEach(x => { assert.ok(x.title && x.detail); assert.ok(['now', 'soon', 'later'].includes(x.urgency)); assert.ok(Number.isInteger(x.impact)); assert.ok(!/NaN|undefined|null/.test(x.title + x.detail)); });
  // old category budgets (the Budgets page was removed) no longer drive suggestions
  WT.setBudget('cat_groceries', 500, false);
  assert.ok(!S.suggestions(A, list[0]).some(x => x.kind === 'reduce' && x.catId === 'cat_groceries'));
});

test('snapshot is a plain copy for history', () => {
  fresh();
  const A = S.analyze();
  const rec = S.strategies(A)[0];
  const snap = S.snapshot('2026-11', rec);
  assert.deepEqual(Object.keys(snap).slice(0, 6), ['month', 'strategyId', 'pct', 'amounts', 'income', 'savedAt']);
  assert.equal(snap.month, '2026-11'); assert.equal(snap.strategyId, 'recommended');
  assert.equal(snap.income, A.income); assert.equal(snap.savedAt, TODAY);
  assert.deepEqual(snap.pct, rec.pct); assert.deepEqual(snap.amounts, rec.amounts);
  snap.amounts.needs = 1; assert.notEqual(rec.amounts.needs, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

test('strategies are deterministic and serializable', () => {
  fresh();
  const a = JSON.stringify(S.strategies(S.analyze()));
  const b = JSON.stringify(S.strategies(S.analyze()));
  assert.equal(a, b);
  assert.ok(!/NaN|undefined/.test(a));
});

test('adjusted amounts never exceed income, even when needs is above essential bills', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const A = S.analyze();
  for (const pct of [{ needs: 40, debt: 8, savings: 20, wants: 32 }, { needs: 70, debt: 0, savings: 30, wants: 0 }, { needs: 30, debt: 30, savings: 40, wants: 0 }]) {
    const r = S.allocate(A, pct);
    if (!r.adjusted) continue;
    const a = r.adjusted.amounts;
    assert.equal(a.needs + a.debt + a.savings + a.wants, A.income, JSON.stringify(pct));
    // income is short: living costs are kept whole, minimums get the rest
    assert.equal(a.needs, A.living, 'living floor kept');
    assert.equal(a.debt, A.income - A.living);
  }
  WT.updateIncome('inc_job', { netCents: 250000 });
  const A2 = S.analyze();
  for (const pct of [{ needs: 40, debt: 8, savings: 20, wants: 32 }, { needs: 70, debt: 0, savings: 30, wants: 0 }, { needs: 30, debt: 30, savings: 40, wants: 0 }]) {
    const r = S.allocate(A2, pct);
    if (!r.adjusted) continue;
    const a = r.adjusted.amounts;
    assert.equal(sumC(a), A2.income);
    assert.ok(a.needs >= A2.living && a.debt >= A2.debtMinimums, 'floors kept');
    assert.equal(r.adjusted.realistic, true);
  }
});

// ------------------------------------------------------------------ v2

test('zero-based: every cent assigned, 0 unallocated, at many incomes', () => {
  fresh();
  for (const net of [160000, 123457, 210000, 250001, 1000003]) {
    WT.updateIncome('inc_job', { netCents: net });
    const A = S.analyze();
    const z = S.strategies(A).find(s => s.id === 'zero');
    assert.equal(z.name, 'Zero-based');
    assert.equal(sumC(z.amounts), A.income, 'cents sum to income at ' + net);
    assert.equal(z.unallocated, 0);
    B.forEach(b => assert.ok(Number.isInteger(z.amounts[b]) && z.amounts[b] >= 0));
    assert.equal(z.lines.reduce((a, l) => a + l.amount, 0), A.income, 'every line adds up');
    if (A.free >= 0) { assert.ok(z.amounts.needs >= A.living && z.amounts.debt >= A.debtMinimums); assert.equal(z.realistic, true); }
    assert.ok(z.why.length > 10);
  }
});

test('fromDollars: under/over 100% allowed, pct not normalized, cents exact', () => {
  fresh();
  const A = S.analyze(); // income 346667
  const over = S.fromDollars(A, { needs: 210667, debt: 82500, savings: 100000, wants: 0 });
  assert.equal(over.total, 393167);
  assert.equal(over.unallocated, -46500);
  assert.equal(over.over, 46500);
  assert.deepEqual(over.pct, { needs: 60.8, debt: 23.8, savings: 28.8, wants: 0 }); // 113.4%: not forced to 100
  assert.match(over.warnings.join(' '), /\$465\.00 over your take-home pay/);
  assert.equal(over.realistic, false);
  assert.deepEqual(over.debtSplit, { minimum: 82500, extra: 0 });
  const under = S.fromDollars(A, { needs: 100000, debt: '1234.6', savings: -50, wants: NaN });
  assert.deepEqual(under.dollars, { needs: 100000, debt: 1235, savings: 0, wants: 0 });
  assert.equal(under.unallocated, 346667 - 101235);
  assert.equal(under.over, 0);
  assert.match(under.warnings.join(' '), /below your bills plus groceries and gas/);
  assert.match(under.warnings.join(' '), /below your required minimum payments/);
  const exact = S.fromDollars(A, { needs: 210667, debt: 82500, savings: 47053, wants: 6447 }); // the recommended plan
  assert.equal(exact.unallocated, 0);
});

test('fromPct: dollars per bucket rounded to the cent, not forced to sum', () => {
  fresh();
  const A = S.analyze();
  const r = S.fromPct(A, { needs: 33.3, debt: 33.3, savings: 33.3, wants: 0 });
  const one = Math.round(A.income * 0.333);
  assert.deepEqual(r.dollars, { needs: one, debt: one, savings: one, wants: 0 });
  assert.equal(r.total, one * 3);
  assert.equal(r.unallocated, A.income - one * 3);
  assert.deepEqual(r.pct, { needs: 33.3, debt: 33.3, savings: 33.3, wants: 0 });
  const o = S.fromPct(A, { needs: 60, debt: 70, savings: 0, wants: 0 });
  assert.equal(o.over, o.total - A.income); assert.ok(o.over > 0);
  assert.equal(o.dollars.needs, Math.round(A.income * 0.6));
  // half a cent rounds away from zero: $10.01 at 50% = 500.5 -> 501
  assert.equal(S.fromPct({ income: 1001, living: 0, debtMinimums: 0 }, { needs: 50 }).dollars.needs, 501);
});

test('distribute: locked buckets never change, cents exact, never below $0', () => {
  fresh();
  const A = S.analyze();
  const d0 = { needs: 150000, debt: 100000, savings: 10000, wants: 10000 };
  const locks = { needs: true };
  const spread = S.distribute(A, d0, locks);
  assert.equal(spread.needs, 150000);
  assert.equal(sumC(spread), A.income);
  ['debt', 'savings', 'wants'].forEach(b => assert.ok(spread[b] >= d0[b]));
  assert.ok(spread.debt - d0.debt > spread.savings - d0.savings); // proportional to current amounts
  const into = S.distribute(A, d0, locks, 'wants');
  assert.deepEqual(into, { needs: 150000, debt: 100000, savings: 10000, wants: 10000 + A.income - 270000 });
  assert.deepEqual(S.distribute(A, d0, locks, 'needs'), d0); // locked target: unchanged
  // over income: take it back from unlocked buckets only
  const big = { needs: 300000, debt: 100000, savings: 30000, wants: 10000 };
  const cut = S.distribute(A, big, { needs: true });
  assert.equal(cut.needs, 300000); assert.equal(sumC(cut), A.income);
  B.forEach(b => assert.ok(cut[b] >= 0));
  const cutInto = S.distribute(A, big, {}, 'wants'); // can't go below 0
  assert.equal(cutInto.wants, 0);
  // more over than the unlocked buckets hold: they go to 0, locked stays, still over
  const huge = S.distribute(A, { needs: 400000, debt: 1000, savings: 0, wants: 0 }, { needs: true });
  assert.deepEqual(huge, { needs: 400000, debt: 0, savings: 0, wants: 0 });
  // everything locked: unchanged; all zero: spread evenly
  assert.deepEqual(S.distribute(A, d0, { needs: true, debt: true, savings: true, wants: true }), d0);
  const even = S.distribute(A, {}, {});
  assert.equal(sumC(even), A.income); B.forEach(b => assert.ok(Math.abs(even[b] - A.income / 4) <= 1));
  // editor helpers never modify their inputs
  assert.deepEqual(d0, { needs: 150000, debt: 100000, savings: 10000, wants: 10000 });
});

test('custom plan from saved dollars keeps the exact amounts (under 100% allowed)', () => {
  fresh();
  WT.saveSettings({ smartBudget: { strategyId: 'custom', customDollars: { needs: 160000, debt: 60000, savings: 0, wants: 0 }, custom: { needs: 10, debt: 10, savings: 40, wants: 40 } } });
  const A = S.analyze();
  const c = S.strategies(A).find(s => s.id === 'custom');
  assert.equal(c.source, 'dollars'); // customDollars wins over the legacy %
  assert.deepEqual(c.amounts, { needs: 160000, debt: 60000, savings: 0, wants: 0 });
  assert.equal(c.unallocated, A.income - 220000);
  assert.equal(c.adjusted, undefined);
  assert.equal(c.realistic, false); // debt below minimums
  assert.deepEqual(c.debtSplit, { minimum: 60000, extra: 0 });
  assert.equal(S.vsActual(A, c).needs.planned, 160000);
});

test('vsActual: paid vs scheduled vs spent vs reserved, no double counting', () => {
  fresh();
  const A = S.analyze();
  const nov = id => WT.instancesForMonth('2026-11').find(i => i.templateId === id);
  WT.markPaid(nov('bill_apartment').id, '2026-11-01');            // needs, paid
  WT.markPaid(nov('bill_carloan').id, TODAY);                     // debt-linked bill, paid (lowers the loan too)
  WT.recordPayment(nov('bill_video').id, { amountCents: 1549, date: '2026-11-25' }); // future-dated: scheduled, not spent
  addExp('2026-11-04', 'cat_groceries', 8000);                     // needs, spent
  addExp('2026-11-20', 'cat_groceries', 5000);                     // future expense: scheduled, not spent
  const dollars = { needs: 200000, debt: 80000, savings: 10000, wants: 10000 };
  const v = S.vsActual(A, dollars, '2026-11');
  assert.equal(v.month, '2026-11');
  assert.equal(v.needs.paid, 120000);
  assert.equal(v.needs.spent, 8000);
  assert.equal(v.needs.actual, 128000);
  assert.equal(v.needs.scheduled, 9500 + 4000 + 6500 + 5500 + 11000 + 5000); // unpaid needs bills + the future expense
  assert.equal(v.debt.paid, 38000);
  assert.equal(v.debt.extra, 0);
  assert.equal(v.debt.actual, 38000); // linked bill payment counted once, not again via the debt
  assert.equal(v.debt.scheduled, 82500 - 38000); // every other debt-linked bill still due in Nov
  assert.equal(v.wants.paid, 0); assert.equal(v.wants.actual, 0);
  assert.equal(v.wants.scheduled, 3500 + 1099 + 1549 + 299); // Video Stream once (future payment), not twice
  for (const b of B) {
    const x = v[b];
    assert.equal(x.planned, dollars[b]);
    assert.equal(x.reserved, x.scheduled);
    assert.equal(x.remaining, x.planned - x.actual);
    assert.equal(x.freeAfterScheduled, x.remaining - x.scheduled);
    assert.ok(['under', 'near', 'over'].includes(x.status));
  }
  assert.equal(v.needs.pctUsed, Math.round(128000 * 100 / 200000));
  assert.equal(v.wants.status, 'under');
  assert.equal(v.totals.actual, B.reduce((a, b) => a + v[b].actual, 0));
  assert.equal(v.totals.scheduled, B.reduce((a, b) => a + v[b].scheduled, 0));
  // extra debt payment + goal contribution through a transfer: each counted once
  WT.payDebtExtra('debt_store', 5000, TODAY, 'acc_checking');
  const g = WT.addGoal({ name: 'Emergency', type: 'emergency', targetCents: 100000, accountId: 'acc_savings' });
  WT.contributeGoal(g.id, 4000, TODAY, 'acc_checking');              // creates a transfer too
  WT.addTransfer({ fromId: 'acc_checking', toId: 'acc_savings', amountCents: 1000, date: TODAY });
  const v2 = S.vsActual(A, dollars, '2026-11');
  assert.equal(v2.debt.extra, 5000); assert.equal(v2.debt.actual, 43000);
  assert.equal(v2.savings.saved, 5000); assert.equal(v2.savings.actual, 5000);
  assert.equal(v2.debt.status, 'near'); // 43000 + 44500 scheduled > 80000 planned
  // over plan
  const v3 = S.vsActual(A, { needs: 50000, debt: 0, savings: 0, wants: 0 }, '2026-11');
  assert.equal(v3.needs.status, 'over'); assert.equal(v3.needs.remaining, 50000 - 128000);
  // a strategy works too (v1 call shape)
  const rec = S.strategies(A)[0];
  assert.equal(S.vsActual(A, rec).needs.planned, rec.amounts.needs);
});

test('rollover: previous month leftovers follow each bucket rule; history untouched', () => {
  fresh();
  // October budget saved earlier (with $50 of wants carried into October from September)
  const oct = { month: '2026-10', strategyId: 'custom', pct: { needs: 50, debt: 25, savings: 10, wants: 15 }, amounts: { needs: 100000, debt: 50000, savings: 20000, wants: 30000 }, income: 200000, savedAt: '2026-10-01', dollars: { needs: 100000, debt: 50000, savings: 20000, wants: 30000 }, rollover: { needs: 0, debt: 0, savings: 0, wants: 5000 } };
  WT.saveSettings({ smartBudget: { history: [oct], rollover: { needs: 'carry', debt: 'reset', savings: 'carry', wants: 'savings' } } });
  addExp('2026-10-05', 'cat_groceries', 30000);   // needs actual 300
  addExp('2026-10-06', 'cat_restaurants', 10000); // wants actual 100
  addExp('2026-11-02', 'cat_restaurants', 99999); // this month: ignored
  const before = JSON.stringify(WT.D);
  const r = S.rollover('2026-11');
  assert.equal(JSON.stringify(WT.D), before, 'read-only');
  assert.equal(r.from, '2026-10');
  assert.deepEqual(r.carryIn, { needs: 70000, debt: 0, savings: 20000 + 25000, wants: 0 });
  assert.deepEqual(r.moved, { toSavings: 25000, toDebt: 0 });
  assert.equal(r.total, 115000);
  const det = Object.fromEntries(r.details.map(d => [d.bucket, d]));
  assert.deepEqual(det.wants, { bucket: 'wants', planned: 35000, actual: 10000, leftover: 25000, rule: 'savings', to: 'savings', amount: 25000 });
  assert.equal(det.debt.rule, 'reset'); assert.equal(det.debt.leftover, 50000); assert.equal(det.debt.amount, 0);
  // overspent bucket: leftover never negative
  addExp('2026-10-07', 'cat_groceries', 200000);
  assert.equal(S.rollover('2026-11').carryIn.needs, 0);
  // debt rule moves to extra debt
  WT.saveSettings({ smartBudget: Object.assign({}, WT.settings().smartBudget, { rollover: { wants: 'debt' } }) });
  const r2 = S.rollover('2026-11');
  assert.equal(r2.carryIn.debt, 25000); assert.equal(r2.moved.toDebt, 25000); assert.equal(r2.carryIn.savings, 0); // savings defaults to reset
  // no saved snapshot for the previous month
  const none = S.rollover('2027-03');
  assert.deepEqual(none.carryIn, { needs: 0, debt: 0, savings: 0, wants: 0 });
  assert.match(none.note, /No budget was saved for February 2027/);
  // snapshot records the carry-in it applied; past history is not rewritten
  const snap = S.snapshot('2026-11', S.strategies(S.analyze())[0]);
  assert.deepEqual(snap.rollover, S.rollover('2026-11').carryIn);
  assert.deepEqual(WT.settings().smartBudget.history[0], oct);
});

test('suggestions v2: sorted by urgency then impact, shortfall first, no contradictions', () => {
  fresh();
  addExp('2026-08-10', 'cat_restaurants', 10000);
  addExp('2026-11-03', 'cat_restaurants', 20000);
  for (const net of [160000, 60000, SHORT_NET, 250000]) {
    WT.updateIncome('inc_job', { netCents: net });
    const A = S.analyze();
    const list = S.strategies(A);
    for (const st of list) {
      const sug = S.suggestions(A, st);
      const rank = { now: 0, soon: 1, later: 2 };
      for (let i = 1; i < sug.length; i++) {
        const a = sug[i - 1], b = sug[i];
        assert.ok(rank[a.urgency] <= rank[b.urgency], 'urgency order');
        if (a.urgency === b.urgency && a.kind !== 'shortfall' && b.kind !== 'shortfall') assert.ok(a.impact >= b.impact, 'impact order ' + a.kind + '>' + b.kind);
      }
      if (A.shortfall > 0) assert.equal(sug[0].kind, 'shortfall');
      else assert.ok(!sug.some(x => x.kind === 'shortfall'));
      // one affordability calculation: extra debt is recommended iff the personalized plan has extra
      const recExtra = list[0].debtSplit.extra;
      const ed = sug.filter(x => x.kind === 'extra-debt');
      assert.equal(ed.length, 1);
      assert.equal(ed[0].affordable, recExtra > 0, 'net ' + net + ' ' + st.id);
      if (!ed[0].affordable) assert.equal(ed[0].urgency, 'later');
      sug.filter(x => x.kind === 'scenario').forEach(x => { assert.equal(x.optional, true); assert.match(x.title, /^Optional/); });
      sug.forEach(x => assert.ok(!/NaN|undefined|null/.test(x.title + x.detail)));
    }
  }
});

test('analyze: upcoming large bills, goals and balances', () => {
  fresh();
  WT.addTemplate({ id: 'bill_reg', name: 'Car registration', amountCents: 24000, category: 'cat_vehicle', anchor: '2026-12-15', frequency: 'once', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_small', name: 'Small fee', amountCents: 2000, category: 'cat_vehicle', anchor: '2026-12-10', frequency: 'once', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_later', name: 'Far away', amountCents: 50000, category: 'cat_other', anchor: '2027-03-01', frequency: 'once', accountId: 'acc_checking' });
  const g = WT.addGoal({ name: 'Vacation', type: 'custom', targetCents: 60000, targetDate: '2027-05-01' });
  WT.contributeGoal(g.id, 6000, TODAY);
  const A = S.analyze();
  assert.deepEqual(A.upcoming.map(u => [u.name, u.date, u.amount, u.oneTime]), [['Car registration', '2026-12-15', 24000, true]]);
  assert.equal(A.upcomingSetAside, 12000); // due next month: half now
  assert.deepEqual(A.goals.map(x => [x.name, x.target, x.saved, x.targetDate]), [['Vacation', 60000, 6000, '2027-05-01']]);
  assert.equal(A.goalsNeeded, Math.ceil(54000 / 6));
  assert.equal(A.balances.checking, WT.accountBalance('acc_checking'));
  assert.equal(A.balances.savings, 0); // a goal without an account isn't counted as account savings twice
  assert.equal(A.balances.available, WT.availableBalance());
});

test('snapshot v2 adds dollars and rollover; strategy shapes complete', () => {
  fresh();
  const A = S.analyze();
  const list = S.strategies(A);
  for (const s of list) {
    assert.equal(typeof s.realistic, 'boolean');
    assert.ok(Array.isArray(s.risks));
    assert.ok(Number.isInteger(s.disposable) && s.disposable >= 0);
    assert.ok(Number.isInteger(s.debtSplit.minimum) && Number.isInteger(s.debtSplit.extra));
    assert.ok('debtFreeEstimate' in s.projection && 'interest' in s.projection);
  }
  const p = list.find(s => s.id === '50-30-20');
  const snap = S.snapshot('2026-11', p);
  assert.deepEqual(snap.dollars, p.adjusted.amounts); // what's really planned
  assert.deepEqual(snap.rollover, { needs: 0, debt: 0, savings: 0, wants: 0 });
  assert.deepEqual(S.snapshot('2026-11', list[0], { rollover: { wants: 500 } }).rollover, { needs: 0, debt: 0, savings: 0, wants: 500 });
});

test('v2 functions never create or change WT records', () => {
  const ctx = fresh();
  WT.saveSettings({ smartBudget: { strategyId: 'custom', customDollars: { needs: 160000, debt: 230000, savings: 0, wants: 0 }, locks: { needs: true }, rollover: { needs: 'carry', debt: 'debt', savings: 'carry', wants: 'savings' }, history: [{ month: '2026-10', strategyId: 'recommended', pct: { needs: 50, debt: 50, savings: 0, wants: 0 }, amounts: { needs: 100000, debt: 100000, savings: 0, wants: 0 }, income: 200000, savedAt: '2026-10-01' }] } });
  addExp('2026-10-03', 'cat_groceries', 12000); addExp('2026-11-02', 'cat_restaurants', 9000);
  WT.markPaid(WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_apartment').id, TODAY);
  WT.addGoal({ name: 'Trip', targetCents: 50000, targetDate: '2027-06-01' });
  const before = JSON.stringify(WT.D); const w0 = ctx.writes.n;
  const A = S.analyze();
  const list = S.strategies(A);
  for (const s of list) { S.suggestions(A, s); S.vsActual(A, s); S.snapshot('2026-11', s); S.fromDollars(A, s.amounts); S.fromPct(A, s.pct); S.distribute(A, s.amounts, { needs: true }); S.distribute(A, s.amounts, {}, 'wants'); }
  S.compare(A, list); S.rollover('2026-11'); S.rollover(); S.paycheckPlan(list[0], 4); S.analyze('2026-10'); S.analyze('2027-02');
  assert.equal(JSON.stringify(WT.D), before);
  assert.equal(ctx.writes.n, w0);
  assert.deepEqual(WT.integrity(), []);
});

test('cashflow suggestions use WTPlan when it is ready', () => {
  fresh();
  const A = S.analyze();
  const calls = [];
  global.WTPlan = { ready: true, paycheckPlan(o) { calls.push(o); return { paychecks: [
    { key: 'k1', date: '2026-11-06', shortfall: 0, reserveIn: 0 },
    { key: 'k2', date: '2026-11-20', shortfall: 0, reserveIn: 12345 },
    { key: 'k3', date: '2026-12-04', shortfall: 5000, reserveIn: 0 },
  ] }; } };
  try {
    const sug = S.suggestions(A, S.strategies(A)[0]);
    assert.equal(calls.length, 1); assert.equal(calls[0].count, 4);
    const cf = sug.filter(x => x.kind === 'cashflow');
    assert.ok(cf.some(x => x.amount === 12345 && x.urgency === 'soon' && /Hold back \$123 for the Nov 20 paycheck/.test(x.title)));
    assert.ok(cf.some(x => x.amount === 5000 && x.urgency === 'now'));
    // a broken WTPlan falls back to the built-in paycheck check
    global.WTPlan = { ready: true, paycheckPlan() { throw new Error('boom'); } };
    assert.ok(Array.isArray(S.suggestions(A, S.strategies(A)[0])));
  } finally { delete global.WTPlan; }
});
