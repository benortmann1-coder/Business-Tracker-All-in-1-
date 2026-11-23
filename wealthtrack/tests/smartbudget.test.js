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
  assert.deepEqual(list.map(s => s.id), ['recommended', 'avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced']);
  list.forEach(s => { checkTotals(A, s); assert.ok(s.why.length > 10); assert.ok(s.fitScore >= 0 && s.fitScore <= 100); });
  // odd incomes still sum exactly
  WT.updateIncome('inc_job', { netCents: 123457 });
  const A2 = S.analyze();
  S.strategies(A2).forEach(s => checkTotals(A2, s));
});

test('50/30/20 adapts to the real needs and minimums (counted once) instead of forcing the example', () => {
  fresh();
  const A = S.analyze();
  const p = S.strategies(A).find(x => x.id === '50-30-20');
  checkTotals(A, p);
  assert.deepEqual(p.example, { needs: 40, debt: 20, savings: 10, wants: 30 });
  assert.equal(sumC(p.exampleAmounts), A.income);
  // needs + minimums are 84.6% of pay (not 50%): needs = real living costs, debt = minimums + extra, wants cut to a floor
  assert.equal(p.amounts.needs, A.living);
  assert.ok(p.amounts.debt >= A.debtMinimums);
  assert.equal(p.amounts.wants, A.optionalBills); // the spending floor still covers the subscriptions
  assert.equal(p.amounts.savings + p.amounts.wants + p.debtSplit.extra, A.free); // minimums are never counted twice
  assert.equal(p.debtSplit.extra, Math.floor((A.free - p.amounts.wants) / 2)); // the "20%" pot: half extra debt, half savings
  assert.equal(p.realistic, true); assert.equal(p.feasible, true); assert.equal(p.adjusted, undefined);
  assert.equal(p.modified, true);
  assert.match(p.modifications[0], /84\.6% of your pay, more than 50%/);
  assert.ok(p.modifications.some(m => /minimum payments alone are 23\.8%/.test(m)));
  // income can't cover living costs + minimums: every plan keeps home, bills, food and gas funded first
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const As = S.analyze();
  for (const s of S.strategies(As)) {
    assert.equal(s.realistic, false, s.id);
    assert.deepEqual(s.amounts, { needs: As.living, debt: As.income - As.living, savings: 0, wants: 0 }, s.id);
    assert.ok(s.modified || s.id === 'recommended' || s.id === 'zero');
  }
  // plenty of income: wants is exactly 30%, needs is NOT padded up to 50%, the rest is savings + extra debt
  WT.updateIncome('inc_job', { netCents: 1000000 });
  const Ab = S.analyze();
  const big = S.strategies(Ab).find(x => x.id === '50-30-20');
  checkTotals(Ab, big);
  assert.equal(big.amounts.wants, Math.round(Ab.income * 0.3));
  assert.equal(big.amounts.needs, Ab.living);
  assert.equal(big.amounts.savings + big.debtSplit.extra, Ab.income - Ab.required - big.amounts.wants);
  assert.match(big.modifications[0], /less than 50%/);
  assert.equal(big.realistic, true);
});

test('recommended on sample data: high-APR debt + low savings -> small reserve + Debt Avalanche', () => {
  fresh();
  const A = S.analyze();
  const list = S.strategies(A);
  const rec = list[0];
  assert.equal(rec.id, 'recommended');
  assert.equal(rec.basedOn, 'avalanche');
  // $535 free: $64.47 spending (covers optional bills), half of the rest to the starter fund, extra up to the 30% debt example, rest saved
  assert.deepEqual(rec.amounts, { needs: 210667, debt: 104000, savings: 25553, wants: 6447 });
  assert.deepEqual(rec.amounts, list.find(s => s.id === 'avalanche').amounts);
  assert.deepEqual(rec.debtSplit, { minimum: 82500, extra: 21500 });
  assert.equal(rec.amounts.savings + rec.amounts.wants + rec.debtSplit.extra, A.free);
  assert.ok(rec.lines.some(l => l.label === 'Starter emergency fund' && l.amount === 23527));
  assert.equal(rec.feasible, true); assert.equal(rec.realistic, true);
  assert.deepEqual(rec.warnings, []);
  assert.match(rec.why, /Debt Avalanche/); assert.match(rec.why, /Store Card at 28\.99% APR/); assert.match(rec.why, /\$3,466\.67/);
  assert.equal(rec.confidence, 'medium'); // two debts have no APR and the checking balance isn't entered
  assert.equal(rec.showBadge, true);
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
  // high-APR cards + no savings: Avalanche. Snowball costs only ~$76 more here, so it ties and the cheaper order wins
  assert.equal(rec.basedOn, 'avalanche');
  assert.equal(rec.recommendation.scores.avalanche, rec.recommendation.scores.snowball);
  assert.equal(rec.recommendation.confidence, 'medium');
  assert.ok(rec.recommendation.factors.some(f => f.label === 'Avalanche vs Snowball' && /\$75\.66/.test(f.value)));
  assert.deepEqual(rec.amounts, { needs: 210667, debt: 203917, savings: 100000, wants: 27083 });
  assert.equal(sumC(rec.amounts), A.income);
  assert.deepEqual(rec.debtSplit, { minimum: A.debtMinimums, extra: 121417 });
  assert.ok(rec.amounts.savings >= A.starter.gap); // the starter fund is fully funded this month
  assert.equal(rec.amounts.wants, Math.round(A.income * 0.05));
  assert.equal(rec.realistic, true); assert.equal(rec.feasible, true);
  assert.deepEqual(rec.risks, []);
  assert.equal(rec.disposable, rec.amounts.wants - A.optionalBills);
  assert.equal(rec.annualSavings, rec.amounts.savings * 12);
  assert.ok(rec.lines.some(l => l.label === 'Starter emergency fund' && l.amount === 100000));
  assert.equal(rec.lines.reduce((a, l) => a + l.amount, 0), A.income);
  assert.ok(list.every(s => s.id === 'recommended' || s.fitScore <= rec.fitScore));
  const cmp = S.compare(A, list);
  assert.equal(cmp.bestId, 'recommended');
  assert.ok(cmp.rows.find(r => r.id === cmp.bestId).realistic);
  // the 50/30/20 card is still realistic here, but modified: needs + minimums are 54.1%
  const p = list.find(s => s.id === '50-30-20');
  assert.equal(p.realistic, true); assert.equal(p.modified, true);
  assert.equal(p.amounts.wants, Math.round(A.income * 0.3) - (A.required - Math.round(A.income * 0.5)));
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
    assert.deepEqual(s.amounts, { needs: 130000, debt: 0, savings: 0, wants: 0 }, s.id);
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
  // living funded but starter emergency fund not yet built: the recommendation keeps a reserve going while it pays the
  // highest rate, and the suggestions agree with it (one affordability calculation)
  WT.updateIncome('inc_job', { netCents: 160000 }); // the sample's own pay: free $535
  const B2 = S.analyze();
  assert.ok(B2.free > 0 && B2.free < B2.starter.gap);
  const rec = S.strategies(B2)[0];
  assert.ok(rec.debtSplit.extra > 0 && rec.amounts.savings > 0 && rec.amounts.wants > 0);
  assert.ok(rec.lines.find(l => l.label === 'Starter emergency fund').amount > 0);
  assert.equal(rec.amounts.savings + rec.amounts.wants + rec.debtSplit.extra, B2.free);
  assert.equal(rec.realistic, true);
  const sug2 = S.suggestions(B2, rec);
  const ed = sug2.find(x => x.kind === 'extra-debt');
  assert.equal(ed.affordable, true); assert.match(ed.title, /Store Card/);
  // a plan with no extra (Pay Yourself First) gets the same "put extra toward Store Card" idea, never a contradiction
  const pf = S.strategies(B2).find(s => s.id === 'pay-first');
  assert.equal(pf.debtSplit.extra, 0);
  assert.ok(S.suggestions(B2, pf).filter(x => x.kind === 'extra-debt').every(x => x.affordable));
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

test('aggressive debt payoff pays off debt faster than 50/30/20', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: 250000 }); // sample pay leaves nothing extra for debt yet (starter fund first)
  const A = S.analyze();
  const list = S.strategies(A);
  const d = list.find(s => s.id === 'aggressive'), p = list.find(s => s.id === '50-30-20');
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
  assert.equal(list.length, 8);
  list.forEach(s => { assert.equal(sumPct(s.pct), 100); assert.equal(sumC(s.amounts), 0); assert.equal(s.feasible, false); assert.equal(s.realistic, false); });
  const r = S.recommend(A);
  assert.equal(r.confidence, 'low'); assert.equal(r.showBadge, false);
  assert.match(r.reason, /Not enough information/);
  assert.ok(r.missing.some(m => /job or paycheck/.test(m)));
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
  assert.equal(list.find(s => s.id === 'aggressive').amounts.debt, 0);
  assert.match(list.find(s => s.id === 'aggressive').warnings.join(' '), /no debts/);
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
    assert.equal(z.name, 'Zero-Based');
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
  // a percent split that doesn't fit is planned with its adjusted (realistic) amounts
  const p = Object.assign({ id: 'custom' }, S.allocate(A, { needs: 50, debt: 0, savings: 20, wants: 30 }));
  const snap = S.snapshot('2026-11', p);
  assert.deepEqual(snap.dollars, p.adjusted.amounts); // what's really planned
  assert.deepEqual(S.snapshot('2026-11', list[1]).dollars, list[1].amounts);
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
    // suggestions ask once without an analysis; the recommendation's cash-flow check passes its analysis
    assert.equal(calls.filter(c => !c.analysis).length, 1); assert.ok(calls.every(c => c.count === 4));
    const cf = sug.filter(x => x.kind === 'cashflow');
    assert.ok(cf.some(x => x.amount === 12345 && x.urgency === 'soon' && /Hold back \$123 for the Nov 20, 2026 paycheck/.test(x.title)));
    assert.ok(cf.some(x => x.amount === 5000 && x.urgency === 'now'));
    // a broken WTPlan falls back to the built-in paycheck check
    global.WTPlan = { ready: true, paycheckPlan() { throw new Error('boom'); } };
    assert.ok(Array.isArray(S.suggestions(A, S.strategies(A)[0])));
  } finally { delete global.WTPlan; }
});

// ------------------------------------------------------------------ v3: named strategies, recommendation, breakdown, forecast
const Demo = require(path.join(__dirname, '../web/demo.js')); // the in-app demo: 6 fictional bills, 2 fictional debts
const P = require(path.join(__dirname, '../web/smartplan.js'));
const NAMED = ['avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced'];
function freshDemo() {
  const store = {}; const writes = { n: 0 };
  WT.init(null, { put(c, r) { writes.n++; (store[c] = store[c] || {})[r.id] = 1; }, del() { writes.n++; } });
  Demo.load(WT, { today: TODAY });
  return { store, writes };
}
// a blank install with one job, rent and a groceries set-aside (no debt)
function plain(net, extra) {
  fresh(true);
  WT.addIncome(Object.assign({ id: 'inc_x', name: 'Job', kind: 'net', netCents: net, schedule: 'biweekly', anchor: '2026-10-30', startDate: '2026-01-02', accountId: 'acc_checking' }, extra || {}));
  WT.addTemplate({ id: 'b_rent', name: 'Rent', amountCents: 120000, category: 'cat_housing', anchor: '2026-11-01', frequency: 'monthly', accountId: 'acc_checking' });
  WT.saveSettings({ setAsides: [{ id: 'sa', name: 'Groceries', amountCents: 20000 }] });
}
function checkNamed(A, s) {
  checkTotals(A, s);
  assert.ok(typeof s.summary === 'string' && s.summary.length > 20, s.id + ' summary');
  assert.ok(s.benefits.length >= 2 && s.drawbacks.length >= 1, s.id + ' benefits/drawbacks');
  assert.equal(typeof s.fit, 'string'); assert.ok(s.fit.length > 10, s.id + ' fit');
  assert.equal(typeof s.modified, 'boolean'); assert.ok(Array.isArray(s.modifications)); assert.equal(s.modified, s.modifications.length > 0);
  assert.ok(s.debtOrder === null || s.debtOrder === 'avalanche' || s.debtOrder === 'snowball');
  const ex = s.example; if (ex) { assert.equal(sumPct(ex), 100); assert.equal(sumC(s.exampleAmounts), A.income); }
  B.forEach(b => assert.ok(s.amounts[b] >= 0, s.id + ' never negative'));
  assert.ok(Array.isArray(s.risks) && typeof s.realistic === 'boolean');
  if (A.income > 0 && A.free >= 0) {
    assert.equal(s.amounts.needs, A.living, s.id + ' needs = real living costs (never padded, never short)');
    assert.ok(s.amounts.debt >= A.debtMinimums, s.id + ' minimums covered');
    assert.equal(s.realistic, true, s.id);
    assert.equal(s.debtSplit.minimum, A.debtMinimums);
  }
  if (A.debts.length && A.income > 0) assert.ok(s.payoff && Array.isArray(s.payoff.order), s.id + ' payoff schedule');
}

test('v3 API shape, strategy ids and old-id aliases', () => {
  ['named', 'recommend', 'breakdown', 'forecast', 'compareAll', 'fillExactly', 'resolveId', 'findStrategy', 'customFrom', 'previewImpact'].forEach(f => assert.equal(typeof S[f], 'function', f));
  assert.deepEqual(S.STRATEGY_IDS, ['avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced', 'custom']);
  assert.deepEqual(S.HORIZONS, [6, 12, 36, 60]);
  assert.equal(S.resolveId('debt'), 'aggressive'); assert.equal(S.resolveId('savings'), 'pay-first'); assert.equal(S.resolveId('60-20-20'), 'balanced');
  assert.equal(S.resolveId('avalanche'), 'avalanche'); assert.equal(S.resolveId('recommended'), 'recommended');
  // the owner's illustrative table
  assert.deepEqual(S.EXAMPLES.avalanche, { needs: 50, debt: 30, savings: 15, wants: 5 });
  assert.deepEqual(S.EXAMPLES.snowball, { needs: 50, debt: 30, savings: 15, wants: 5 });
  assert.deepEqual(S.EXAMPLES['50-30-20'], { needs: 40, debt: 20, savings: 10, wants: 30 });
  assert.deepEqual(S.EXAMPLES.zero, { needs: 55, debt: 20, savings: 15, wants: 10 });
  assert.deepEqual(S.EXAMPLES['pay-first'], { needs: 50, debt: 10, savings: 30, wants: 10 });
  assert.deepEqual(S.EXAMPLES.aggressive, { needs: 50, debt: 35, savings: 10, wants: 5 });
  assert.deepEqual(S.EXAMPLES.balanced, { needs: 50, debt: 20, savings: 20, wants: 10 });
  assert.equal(S.EXAMPLES.custom, null);
  fresh();
  const list = S.strategies(S.analyze());
  assert.equal(S.findStrategy(list, 'debt').id, 'aggressive');
  assert.equal(S.findStrategy(list, 'savings').id, 'pay-first');
  assert.equal(S.findStrategy(list, '60-20-20').id, 'balanced');
  assert.equal(S.findStrategy(list, 'nope'), null);
  assert.deepEqual(list.find(s => s.id === 'aggressive').aliases, ['debt']);
  assert.equal(list.find(s => s.id === 'zero').noFixedPct, true);
  assert.equal(list.find(s => s.id === 'avalanche').name, 'Debt Avalanche');
  assert.equal(list.find(s => s.id === 'balanced').name, 'Balanced Wealth Building');
});

test('every named strategy is valid on the sample data, the demo and many incomes', () => {
  for (const net of [160000, 123457, 250000, 400001, 1000003]) {
    fresh(); WT.updateIncome('inc_job', { netCents: net });
    const A = S.analyze();
    const list = S.strategies(A);
    NAMED.forEach(id => checkNamed(A, list.find(s => s.id === id)));
    checkNamed(A, list[0]);
  }
  freshDemo();
  const A = S.analyze();
  assert.equal(A.debts.length, 2); assert.equal(A.essentialList.length, 4);
  const list = S.strategies(A);
  NAMED.forEach(id => checkNamed(A, list.find(s => s.id === id)));
  // named(): all 8 for the cards; Custom starts from the recommendation; one "Recommended for you" badge at most
  const cards = S.named(A);
  assert.deepEqual(cards.map(s => s.id), S.STRATEGY_IDS);
  const cust = cards.find(s => s.id === 'custom');
  assert.equal(cust.isDefault, true); assert.deepEqual(cust.amounts, list[0].amounts);
  assert.equal(cards.filter(s => s.recommended).length, 1);
  assert.equal(cards.find(s => s.recommended).id, list[0].basedOn);
});

test('demo data: amounts per strategy, Debt Avalanche recommended with high confidence', () => {
  freshDemo();
  const A = S.analyze();
  // $2,300 biweekly = $4,983.33; rent 1150 + electric 110 + internet 60 + insurance 95 = $1,415 + $650 groceries/gas
  assert.equal(A.income, 498333); assert.equal(A.essentials, 141500); assert.equal(A.living, 206500);
  assert.equal(A.debtMinimums, 46000); assert.equal(A.free, 245833);
  assert.equal(A.balances.savings, 150000); assert.equal(A.starter.gap, 0);
  const list = S.strategies(A);
  const get = id => list.find(s => s.id === id).amounts;
  assert.deepEqual(get('avalanche'), { needs: 206500, debt: 192166, savings: 74750, wants: 24917 });
  assert.deepEqual(get('snowball'), get('avalanche')); // same percentages, different payoff order
  assert.deepEqual(get('50-30-20'), { needs: 206500, debt: 95833, savings: 49833, wants: 146167 });
  assert.deepEqual(get('pay-first'), { needs: 206500, debt: 49833, savings: 192167, wants: 49833 });
  assert.deepEqual(get('aggressive'), { needs: 206500, debt: 217083, savings: 49833, wants: 24917 });
  assert.deepEqual(get('balanced'), { needs: 206500, debt: 121000, savings: 121000, wants: 49833 });
  const r = S.recommend(A);
  assert.equal(r.id, 'avalanche'); assert.equal(r.confidence, 'high'); assert.equal(r.showBadge, true);
  assert.deepEqual(r.missing, []);
  assert.equal(r.demo, true); // the UI labels it DEMO
  assert.match(r.reason, /Demo Credit Card at 21\.99% APR/);
  assert.ok(A.netWorth.demo);
  assert.ok(S.forecast(A, 'avalanche', 12).assumptions.some(x => /Demo data/.test(x)));
});

test('avalanche orders extra money by APR, snowball by balance (WTPlan.debtPlans schedules)', () => {
  fresh(true);
  WT.addIncome({ id: 'inc_x', name: 'Job', kind: 'net', netCents: 300000, schedule: 'monthly', anchor: '2026-11-01', startDate: '2026-01-01', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'b_rent', name: 'Rent', amountCents: 100000, category: 'cat_housing', anchor: '2026-11-01', frequency: 'monthly', accountId: 'acc_checking' });
  WT.addDebt({ id: 'd_big', name: 'Big Card', type: 'credit_card', startBalanceCents: 600000, aprCenti: 2699, minCents: 18000, dueDay: 5 });
  WT.addDebt({ id: 'd_mid', name: 'Mid Loan', type: 'personal', startBalanceCents: 300000, aprCenti: 1200, minCents: 9000, dueDay: 12 });
  WT.addDebt({ id: 'd_small', name: 'Small Loan', type: 'personal', startBalanceCents: 40000, aprCenti: 400, minCents: 4000, dueDay: 20 });
  const A = S.analyze();
  const list = S.strategies(A);
  const av = list.find(s => s.id === 'avalanche'), sn = list.find(s => s.id === 'snowball');
  assert.deepEqual(av.amounts, sn.amounts); assert.deepEqual(av.pct, sn.pct);
  assert.equal(av.debtOrder, 'avalanche'); assert.equal(sn.debtOrder, 'snowball');
  // where the extra goes this month
  assert.equal(S.breakdown(A, av).debt.items.find(i => i.kind === 'extra').debtId, 'd_big');
  assert.equal(S.breakdown(A, sn).debt.items.find(i => i.kind === 'extra').debtId, 'd_small');
  // schedules come from WTPlan.debtPlans with the plan's extra
  const ref = P.debtPlans({ extra: av.debtSplit.extra, method: 'avalanche' }).methods.avalanche;
  assert.equal(av.payoff.source, 'WTPlan'); assert.equal(av.payoff.months, ref.months); assert.equal(av.payoff.totalInterest, ref.totalInterest);
  const m = (st, id) => st.payoff.order.find(x => x.id === id).payoffMonth;
  assert.ok(m(sn, 'd_small') < m(av, 'd_small'), 'snowball clears the smallest balance sooner');
  assert.ok(m(av, 'd_big') < m(sn, 'd_big'), 'avalanche clears the highest rate sooner');
  assert.ok(av.payoff.totalInterest < sn.payoff.totalInterest);
  assert.equal(sn.interestVsAvalanche, sn.payoff.totalInterest - av.payoff.totalInterest);
  // the forecast uses the same order and agrees with debtPlans on the debt-free month
  for (const st of [av, sn]) {
    const f = S.forecast(A, st, 60);
    assert.equal(f.debtOrder, st.debtOrder);
    assert.equal(f.debtFreeMonths, st.payoff.months, st.id);
    assert.match(f.debtFreeDate, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.ok(S.forecast(A, av, 60).interest < S.forecast(A, sn, 60).interest);
});

test('credit cards revolve, loans are installment', () => {
  fresh();
  const A = S.analyze();
  const visa = A.debts.find(d => d.id === 'debt_visa'), car = A.debts.find(d => d.id === 'debt_car');
  assert.equal(visa.type, 'credit_card'); assert.equal(visa.revolving, true);
  assert.equal(car.type, 'auto'); assert.equal(car.revolving, false);
  assert.equal(car.billId, 'bill_carloan'); assert.equal(car.dueDay, 10);
  assert.equal(visa.interestMonthly, WT.monthlyInterest(520000, 2499));
  // installment: fixed payment; revolving: the minimum falls with the balance, so minimum-only takes longer
  const fixed = n => P.simulate([{ id: n.id, name: n.name, balance: n.balanceCents, apr: n.aprCenti, minimum: n.minCents }], 0, 'minimum').months;
  assert.equal(car.termMonths, fixed(car));
  assert.ok(visa.termMonths > fixed(visa), 'card minimum-only payoff is slower than a fixed payment');
  assert.equal(A.debts.find(d => d.id === 'debt_gascard').revolving, true);
});

test('breakdown: items sum to committed, each bill appears once, debt-linked bills under Debt, due dates', () => {
  fresh();
  const A = S.analyze();
  for (const st of S.strategies(A)) {
    const bd = S.breakdown(A, st);
    assert.deepEqual(bd.order, B);
    assert.equal(bd.total, sumC(st.amounts)); assert.equal(bd.unallocated, A.income - bd.total);
    const ids = [];
    B.forEach(b => {
      const x = bd[b];
      assert.equal(x.planned, st.amounts[b]);
      assert.equal(x.committed, x.items.reduce((t, i) => t + i.amount, 0), st.id + ' ' + b);
      assert.equal(x.remaining, x.planned - x.committed);
      assert.equal(x.recommendedPct, S.strategies(A)[0].pct[b]);
      x.items.forEach(i => { assert.ok(['bill', 'setaside', 'minimum', 'extra', 'goal', 'emergency', 'spending'].includes(i.kind)); assert.ok(i.amount > 0 || i.kind === 'minimum'); if (i.templateId) ids.push(i.templateId); });
    });
    assert.equal(new Set(ids).size, ids.length, 'no bill twice');
    assert.equal(bd.needs.committed, A.living); assert.equal(bd.needs.remaining, 0);
    assert.equal(bd.debt.committed, st.amounts.debt); // minimums + extra (to a named debt)
    if (bd.wants.committed > st.amounts.wants) assert.ok(st.risks.some(r => /subscriptions and optional bills/.test(r)), st.id);
  }
  const bd = S.breakdown(A, 'recommended');
  assert.ok(!bd.needs.items.some(i => /Payment/.test(i.name)), 'debt-linked bills are not in Essentials');
  const car = bd.debt.items.find(i => i.debtId === 'debt_car' && i.kind === 'minimum');
  assert.deepEqual([car.amount, car.templateId, car.dueDate], [38000, 'bill_carloan', '2026-11-10']);
  assert.equal(bd.debt.items.filter(i => i.kind === 'minimum').length, 6);
  assert.equal(bd.needs.items.find(i => i.name === 'Apartment').dueDate, '2026-11-01');
  assert.deepEqual(bd.needs.items.map(i => i.dueDate).filter(Boolean), bd.needs.items.map(i => i.dueDate).filter(Boolean).sort()); // by due date
  assert.equal(bd.needs.items[bd.needs.items.length - 1].kind, 'spending');
  assert.equal(bd.savings.items.find(i => i.kind === 'emergency').amount, bd.savings.planned); // all of it goes to the starter fund
  assert.deepEqual(bd.wants.items.map(i => i.name).sort(), ['Cloud Storage', 'Gym', 'Music Stream', 'Video Stream']);
  // plain dollars (the editor) work too, and a short Debt bucket shows what is missing
  const d = S.breakdown(A, { needs: A.living, debt: 50000, savings: 0, wants: 0 });
  assert.equal(d.debt.short, A.debtMinimums - 50000); assert.equal(d.debt.remaining, 50000 - A.debtMinimums);
  assert.ok(!d.debt.items.some(i => i.kind === 'extra'));
  assert.equal(S.breakdown(A, 'debt').debt.planned, S.strategies(A).find(s => s.id === 'aggressive').amounts.debt); // old id
});

test('partially paid and paid bills: shown with what is left, never counted twice', () => {
  fresh();
  const A0 = S.analyze();
  const elec = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_electric');
  const apt = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_apartment');
  const car = WT.instancesForMonth('2026-11').find(i => i.templateId === 'bill_carloan');
  WT.recordPayment(elec.id, { amountCents: 5000, date: TODAY, sourceId: 'acc_checking' });
  WT.markPaid(apt.id, TODAY);
  WT.recordPayment(car.id, { amountCents: 10000, date: TODAY, sourceId: 'acc_checking' });
  const A = S.analyze();
  assert.equal(A.essentials, A0.essentials); assert.equal(A.debtMinimums, A0.debtMinimums);
  assert.deepEqual(S.strategies(A).map(s => s.amounts), S.strategies(A0).map(s => s.amounts));
  const bd = S.breakdown(A, 'recommended');
  const e = bd.needs.items.find(i => i.templateId === 'bill_electric');
  assert.deepEqual([e.amount, e.paid, e.left, e.status], [9500, 5000, 4500, 'partial']);
  const a = bd.needs.items.find(i => i.templateId === 'bill_apartment');
  assert.deepEqual([a.paid, a.left, a.status], [120000, 0, 'paid']);
  const c = bd.debt.items.find(i => i.templateId === 'bill_carloan');
  assert.deepEqual([c.amount, c.paid, c.left], [38000, 10000, 28000]);
  assert.equal(bd.needs.committed, A.living);
});

test('annual and irregular bills get a monthly set-aside', () => {
  fresh();
  const A0 = S.analyze();
  WT.addTemplate({ id: 'bill_reg', name: 'Car registration', amountCents: 60000, category: 'cat_vehicle', anchor: '2027-03-15', frequency: 'yearly', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_quarter', name: 'Water heater service', amountCents: 9000, category: 'cat_utilities', anchor: '2026-12-05', frequency: 'quarterly', accountId: 'acc_checking' });
  const A = S.analyze();
  assert.equal(A.essentials, A0.essentials + 5000 + 3000); // $600/12 and $90/3
  assert.equal(A.annualSetAside, 8000);
  const reg = A.essentialList.find(b => b.id === 'bill_reg');
  assert.deepEqual([reg.irregular, reg.frequency, reg.amountEach, reg.nextDue, reg.dueDate], [true, 'yearly', 60000, '2027-03-15', null]);
  const bd = S.breakdown(A, 'recommended');
  const it = bd.needs.items.find(i => i.templateId === 'bill_reg');
  assert.deepEqual([it.kind, it.amount, it.fullAmount, it.nextDue], ['setaside', 5000, 60000, '2027-03-15']);
  assert.ok(S.recommend(A).factors.some(f => f.label === 'Bills that are not monthly' && f.value.includes('$80.00')));
  assert.ok(S.recommend(A).howCalculated.some(x => /\$80\.00 set aside each month/.test(x)));
  S.strategies(A).forEach(s => assert.equal(s.amounts.needs, A.living));
});

test('irregular income: plans on what really arrived, flags it, lists it in assumptions', () => {
  plain(200000);
  const A0 = S.analyze();
  assert.equal(A0.incomeDetail.irregular, false); assert.equal(A0.income, 433333);
  const amts = [200000, 110000, 230000, 90000, 210000, 100000, 180000];
  WT.paychecksBetween('2026-05-10', TODAY).slice(-7).forEach((p, i) => WT.recordDeposit(p.key, { amountCents: amts[i] }));
  const A = S.analyze();
  const v = A.incomeDetail.variability.bySource.inc_x;
  assert.deepEqual([v.count, v.average, v.low, v.high, v.irregular], [7, 160000, 90000, 230000, true]);
  assert.equal(A.incomeDetail.irregular, true);
  assert.equal(A.incomeDetail.sources[0].basis, 'recorded-average');
  assert.equal(A.income, Math.round(160000 * 26 / 12)); // the lower, recorded average
  NAMED.forEach(id => checkNamed(A, S.strategies(A).find(s => s.id === id)));
  const r = S.recommend(A);
  assert.ok(r.factors.some(f => f.label === 'Income changes month to month'));
  assert.ok(['pay-first', 'zero'].includes(r.id));
  assert.ok(r.improve.some(x => /typical low month/.test(x)));
  assert.ok(r.howCalculated[0].includes('planned on what actually arrived'));
  assert.ok(S.forecast(A, 'recommended', 12).assumptions.some(x => /income varies/.test(x)));
  // side income that comes and goes (no job): also irregular, never counted until it arrives
  plain(200000);
  WT.addExtraIncome({ amountCents: 80000, date: '2026-08-10', accountId: 'acc_checking' });
  WT.addExtraIncome({ amountCents: 5000, date: '2026-10-10', accountId: 'acc_checking' });
  const A2 = S.analyze();
  assert.equal(A2.incomeDetail.variability.extraMonths, 2); assert.equal(A2.incomeDetail.irregular, true);
  assert.equal(A2.income, 433333); // extra income isn't part of the plan
  // expected changes: a job that ends soon
  WT.updateIncome('inc_x', { endDate: '2027-02-26' });
  const ch = S.analyze().incomeDetail.changes;
  assert.deepEqual(ch.map(c => [c.type, c.date]), [['ends', '2027-02-26']]);
  assert.ok(S.recommend().improve.some(x => /Job ends/.test(x)));
});

test('expenses more than income: shortfall flagged, no plan called best, nothing invented', () => {
  fresh();
  WT.updateIncome('inc_job', { netCents: SHORT_NET });
  const A = S.analyze();
  const r = S.recommend(A);
  assert.equal(r.realistic, false); assert.equal(r.showBadge, false); assert.equal(r.id, 'zero');
  assert.equal(r.shortfall, 33167);
  assert.match(r.reason, /\$331\.67 short/); assert.match(r.reason, /No plan can be called best/);
  assert.ok(r.improve.some(x => /hardship plan/.test(x)));
  for (const s of S.strategies(A)) {
    checkTotals(A, s);
    assert.equal(s.realistic, false);
    if (s.id !== 'recommended' && s.id !== 'zero') assert.ok(s.modifications.some(m => /\$331\.67 short/.test(m)), s.id);
    assert.match(s.fit, /Not workable yet/);
  }
  for (const m of S.HORIZONS) {
    const c = S.compareAll(A, m);
    assert.equal(c.bestId, null);
    assert.ok(c.rows.every(x => !x.recommended && x.realistic === false));
    const f = S.forecast(A, 'recommended', m);
    assert.equal(f.debtFreeEstimate, true); // minimums aren't fully covered
  }
  assert.equal(S.named(A).filter(s => s.recommended).length, 0);
});

test('no debt: savings-first plans, debt strategies say so, forecast has no payoff date', () => {
  plain(200000);
  const A = S.analyze();
  assert.equal(A.debts.length, 0); assert.equal(A.debtMinimums, 0);
  const list = S.strategies(A);
  NAMED.forEach(id => checkNamed(A, list.find(s => s.id === id)));
  for (const id of ['avalanche', 'snowball', 'aggressive']) {
    const s = list.find(x => x.id === id);
    assert.equal(s.amounts.debt, 0, id); assert.match(s.warnings.join(' '), /no debts/);
    assert.ok(s.modifications.some(m => /no debt/.test(m)));
    assert.equal(s.payoff, null);
  }
  const r = S.recommend(A);
  assert.equal(r.id, 'pay-first'); assert.equal(r.confidence, 'high'); assert.equal(r.showBadge, true);
  assert.ok(r.factors.some(f => f.label === 'Debt' && f.value === 'No open debts'));
  const f = S.forecast(A, 'recommended', 12);
  assert.equal(f.debtFree, true); assert.equal(f.debtFreeDate, null); assert.equal(f.interest, 0); assert.equal(f.debtPaid, 0);
  assert.equal(f.savingsEnd, f.savingsStart + 12 * f.savingsMonthly); // 0% growth: contributions only
  assert.equal(S.compareAll(A, 12).bestId, 'pay-first');
});

test('recommendation rules follow the situation, not a favorite', () => {
  // high-APR debt + low savings: small reserve + Avalanche (the sample data)
  fresh();
  let r = S.recommend();
  assert.equal(r.id, 'avalanche');
  assert.ok(r.factors.some(f => f.label === 'Highest interest rate' && /Store Card: 28\.99% APR/.test(f.value)));
  assert.ok(r.factors.some(f => f.label === 'Emergency savings' && /\$0\.00 saved/.test(f.value)));
  assert.ok(r.factors.every(f => typeof f.label === 'string' && typeof f.value === 'string' && typeof f.effect === 'string'));
  assert.ok(r.howCalculated.length >= 4 && r.howCalculated.some(x => x.includes('$535.00')));
  assert.ok(r.benefits.length >= 2 && r.drawbacks.length >= 1 && r.improve.length >= 1);
  assert.ok(r.missing.some(m => /Furniture Plan has no interest rate/.test(m)));
  assert.equal(r.confidence, 'medium');
  // the same debts with a solid emergency fund: aggressive payoff
  fresh();
  WT.updateIncome('inc_job', { netCents: 250000 });
  WT.save('accounts', Object.assign({}, WT.D.accounts.acc_savings, { openingCents: 1000000 }));
  r = S.recommend();
  assert.equal(r.id, 'aggressive');
  // only low-interest debt: balanced
  plain(200000);
  WT.addDebt({ id: 'd_car', name: 'Car', type: 'auto', startBalanceCents: 800000, aprCenti: 450, minCents: 25000, dueDay: 5 });
  r = S.recommend();
  assert.equal(r.id, 'balanced');
  assert.match(r.reason, /Balanced Wealth Building/);
  // very high fixed costs: stability first
  plain(84000);
  r = S.recommend();
  const A = S.analyze();
  assert.ok(A.obligationsPct >= 75 && A.free >= 0);
  assert.equal(r.id, 'zero');
  assert.ok(r.factors.some(f => /stability first/.test(f.effect)));
});

test('insufficient information: low confidence, missing inputs listed, no best plan', () => {
  fresh(true);
  WT.addIncome({ id: 'inc_x', name: 'Job', kind: 'net', netCents: 200000, schedule: 'monthly', anchor: '2026-10-15', startDate: '2026-10-15', accountId: 'acc_checking' });
  const A = S.analyze();
  const r = S.recommend(A);
  assert.equal(r.confidence, 'low'); assert.equal(r.showBadge, false);
  assert.match(r.reason, /^Starting point only/);
  assert.ok(!/best/i.test(r.reason.replace(/no plan is called best/i, '')));
  assert.deepEqual(r.missingInputs.filter(m => m.critical).map(m => m.key), ['bills']);
  assert.ok(r.missing.some(m => /rent or mortgage/.test(m)));
  assert.ok(r.missing.some(m => /Groceries|groceries/.test(m)));
  assert.equal(S.compare(A).bestId, null);
  assert.equal(S.compareAll(A, 12).bestId, null);
  assert.equal(S.named(A).filter(s => s.recommended).length, 0);
  assert.ok(S.forecast(A, 'recommended', 12).missing.length >= 2);
});

test('fillExactly: exactly 100% to the cent, locks never touched, never negative', () => {
  fresh();
  const A = S.analyze();
  let r = S.fillExactly(A, { needs: 210667, debt: 82500, savings: 10000, wants: 5000 }, { needs: true, debt: true });
  assert.equal(r.exact, true); assert.equal(r.total, A.income); assert.equal(r.unallocated, 0);
  assert.equal(r.dollars.needs, 210667); assert.equal(r.dollars.debt, 82500);
  assert.equal(r.dollars.savings + r.dollars.wants, A.free);
  assert.equal(sumPct(r.pct), 100); assert.deepEqual(r.locked, ['needs', 'debt']);
  // over income: unlocked buckets shrink in proportion, locked stay
  r = S.fillExactly(A, { needs: 300000, debt: 82500, savings: 50000, wants: 50000 }, { debt: true });
  assert.equal(r.exact, true); assert.equal(r.dollars.debt, 82500); assert.equal(sumC(r.dollars), A.income);
  // locked amounts alone are more than income: impossible, say so, change nothing locked
  r = S.fillExactly(A, { needs: 300000, debt: 100000, savings: 5, wants: 7 }, { needs: true, debt: true });
  assert.equal(r.exact, false); assert.deepEqual([r.dollars.needs, r.dollars.debt, r.dollars.savings, r.dollars.wants], [300000, 100000, 0, 0]);
  assert.ok(r.warnings.some(w => /Locked categories/.test(w)));
  r = S.fillExactly(A, { needs: 1, debt: 2, savings: 3, wants: 4 }, { needs: true, debt: true, savings: true, wants: true });
  assert.equal(r.exact, false); assert.ok(r.warnings.some(w => /Every category is locked/.test(w)));
  // all zeros: spread evenly; random property check
  r = S.fillExactly(A, {}, {}); assert.equal(sumC(r.dollars), A.income);
  let seedN = 7; const rnd = n => { seedN = (seedN * 1103515245 + 12345) % 2147483648; return seedN % n; };
  for (let k = 0; k < 300; k++) {
    const d = {}, lk = {}; B.forEach(b => { d[b] = rnd(250000); lk[b] = rnd(3) === 0; });
    const out = S.fillExactly(A, d, lk);
    B.forEach(b => { if (lk[b]) assert.equal(out.dollars[b], d[b]); assert.ok(Number.isInteger(out.dollars[b]) && out.dollars[b] >= 0); });
    const lockedSum = B.filter(b => lk[b]).reduce((t, b) => t + d[b], 0);
    const canFit = B.some(b => !lk[b]) && lockedSum <= A.income;
    assert.equal(out.exact, canFit, JSON.stringify([d, lk]));
    if (canFit) { assert.equal(sumC(out.dollars), A.income); assert.equal(sumPct(out.pct), 100); }
  }
  // distribute + fromDollars still behave as before (no forced 100%)
  assert.equal(S.fromDollars(A, { needs: 100 }).unallocated, A.income - 100);
});

test('manual customization: custom plans with locks, saved custom strategies, preview impact', () => {
  fresh();
  const A = S.analyze();
  const rec = S.strategies(A)[0];
  // the user locks needs + debt and moves money from savings to spending
  const draft = { needs: rec.amounts.needs, debt: rec.amounts.debt, savings: rec.amounts.savings - 10000, wants: rec.amounts.wants };
  const filled = S.fillExactly(A, draft, { needs: true, debt: true, savings: true });
  assert.equal(filled.dollars.wants, rec.amounts.wants + 10000);
  const c = S.customFrom(A, filled.dollars, { id: 'cs_1', name: 'My plan' });
  assert.equal(c.id, 'cs_1'); assert.equal(c.name, 'My plan'); assert.deepEqual(c.amounts, filled.dollars);
  assert.equal(c.realistic, true); assert.ok(c.projection && Array.isArray(c.risks)); assert.equal(c.unallocated, 0);
  const pv = S.previewImpact(A, c, rec, 12);
  assert.equal(pv.delta.savingsEnd, pv.next.savingsEnd - pv.current.savingsEnd);
  assert.equal(pv.delta.savingsEnd, -120000);
  assert.equal(pv.delta.spending, 120000);
  assert.match(pv.summary, /\$1,200 less in savings/);
  // a saved custom plan in settings shows up as Custom with exactly its dollars
  WT.saveSettings({ smartBudget: { strategyId: 'custom', customDollars: filled.dollars, locks: { needs: true } } });
  const cust = S.strategies(S.analyze()).find(s => s.id === 'custom');
  assert.deepEqual(cust.amounts, filled.dollars); assert.equal(cust.modified, false);
  assert.equal(S.named().find(s => s.id === 'custom').isDefault, undefined);
});

test('forecast and compareAll for 6, 12, 36 and 60 months', () => {
  fresh();
  const A = S.analyze();
  let prev = null;
  for (const m of S.HORIZONS) {
    const f = S.forecast(A, 'recommended', m);
    assert.equal(f.months, m); assert.equal(f.monthly.length, m);
    assert.equal(f.estimate, true);
    assert.equal(f.assumptions[0], 'This is an estimate, not a guarantee.');
    assert.ok(f.assumptions.some(x => /Savings earn 0%/.test(x)));
    assert.equal(f.savingsRateCenti, 0);
    assert.equal(f.netWorthEnd, f.netWorthStart + f.savingsAdded + (f.debtStart - f.debtEnd));
    assert.equal(f.netWorthChange, f.netWorthEnd - f.netWorthStart);
    assert.equal(f.netWorthStart, A.netWorth.netWorth);
    assert.equal(f.debtStart, WT.totalDebt());
    assert.ok(f.debtPaid >= 0 && f.debtPaid <= f.debtStart);
    assert.equal(f.spending, f.spendingMonthly * m);
    f.monthly.forEach(x => B.forEach(() => assert.ok(Number.isInteger(x.debt) && Number.isInteger(x.savings))));
    if (prev) { assert.ok(f.debtPaid >= prev.debtPaid); assert.ok(f.savingsEnd >= prev.savingsEnd); assert.ok(f.interest >= prev.interest); }
    prev = f;
    const c = S.compareAll(A, m);
    assert.equal(c.rows.length, 8);
    assert.deepEqual(c.rows.map(x => x.id), ['recommended'].concat(NAMED));
    assert.equal(c.bestId, 'avalanche'); assert.equal(c.recommendedId, 'avalanche');
    assert.equal(c.rows.filter(x => x.recommended).length, 1);
    c.rows.forEach(x => { ['debtPaid', 'interest', 'savingsEnd', 'netWorthEnd', 'spendingMonthly', 'monthlyDebt', 'savingsMonthly'].forEach(k => assert.ok(Number.isInteger(x[k]), x.id + ' ' + k)); assert.equal(x.debtFreeEstimate, true); });
    assert.ok(c.missing.length > 0 && c.assumptions.length > 0);
  }
  // debt-free date: the recommended plan pays everything off in the 60-month window
  const f60 = S.forecast(A, 'recommended', 60);
  assert.equal(f60.debtFreeWithin, true); assert.match(f60.debtFreeDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(f60.monthly[f60.monthly.length - 1].debt === 0);
  // aggressive pays more debt and less interest than 50/30/20 over 3 years
  const ag = S.forecast(A, 'aggressive', 36), p = S.forecast(A, '50-30-20', 36);
  assert.ok(ag.interest < p.interest);
  // a savings rate only when the user enters one
  WT.saveSettings({ smartBudget: { savingsAprCenti: 400 } });
  const A2 = S.analyze();
  const g = S.forecast(A2, 'pay-first', 12), g0 = S.forecast(A, 'pay-first', 12);
  assert.ok(g.savingsEnd > g0.savingsEnd); assert.ok(g.assumptions.some(x => /4% a year, the rate you entered/.test(x)));
  // plain dollars and old ids are accepted
  assert.equal(S.forecast(A, { needs: A.living, debt: A.debtMinimums, savings: A.free, wants: 0 }, 6).savingsMonthly, A.free);
  assert.equal(S.forecast(A, 'savings', 6).strategyId, 'pay-first');
});

test('v3 functions are read-only on the sample data and the demo (deep compare of WT.D)', () => {
  for (const setup of [() => fresh(), () => freshDemo()]) {
    const ctx = setup();
    const before = JSON.parse(JSON.stringify(WT.D)); const w0 = ctx.writes.n;
    const A = S.analyze();
    S.recommend(A); S.named(A); S.strategies(A);
    for (const id of S.STRATEGY_IDS.concat(['recommended', 'debt', '60-20-20'])) { S.breakdown(A, id); S.forecast(A, id, 60); }
    S.HORIZONS.forEach(m => S.compareAll(A, m));
    S.fillExactly(A, { needs: 1 }, { needs: true }); S.customFrom(A, { needs: 1000 }); S.previewImpact(A, 'aggressive', 'zero', 36);
    S.suggestions(A); S.compare(A);
    assert.deepEqual(JSON.parse(JSON.stringify(WT.D)), before);
    assert.equal(ctx.writes.n, w0);
  }
});

test('v3 strategies are deterministic and serializable (no NaN / undefined)', () => {
  fresh();
  const a = JSON.stringify([S.strategies(S.analyze()), S.compareAll(S.analyze(), 36), S.breakdown(S.analyze()), S.recommend()]);
  const b = JSON.stringify([S.strategies(S.analyze()), S.compareAll(S.analyze(), 36), S.breakdown(S.analyze()), S.recommend()]);
  assert.equal(a, b);
  assert.ok(!/NaN|undefined|Infinity/.test(a));
});

// ---------------------------------------------------------------- mortgage (housing that is still a debt)
// Made-up home owner, created here (the shared fixture has no mortgage):
//   pay        $3,000 biweekly                     -> 650000/mo
//   mortgage   $250,000 at 6.50%, payment $2,000 incl. $450 escrow -> P&I 155000, linked monthly bill $2,000
//   property tax $3,600 a year (Apr)              -> 30000/mo set aside
//   HOA        $150 a quarter                       -> 5000/mo set aside
//   car loan   $12,000 at `carApr`, minimum $345 (linked bill); optional card at 22.99%
const { ensureBuiltins } = require(path.join(__dirname, '../web/seed.js'));
function mortgageHome(o) {
  o = o || {};
  fresh(true);
  WT.addIncome({ id: 'inc_home', name: 'Job', kind: 'net', netCents: 300000, schedule: 'biweekly', anchor: '2026-11-06', startDate: '2026-10-01', accountId: 'acc_checking' });
  WT.addDebt({ id: 'debt_home', name: 'Home Mortgage', type: 'mortgage', startBalanceCents: 25000000, startDate: TODAY, aprCenti: 650, minCents: 200000, escrowCents: 45000, dueDay: 1, autoInterest: false });
  if (o.bill !== false) WT.addTemplate({ id: 'bill_home', name: 'Mortgage Payment', amountCents: 200000, category: 'cat_mortgage', anchor: '2026-12-01', frequency: 'monthly', debtId: 'debt_home', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_ptax', name: 'Property Tax', amountCents: 360000, category: 'cat_property_tax', anchor: '2027-04-01', frequency: 'yearly', accountId: 'acc_checking' });
  WT.addTemplate({ id: 'bill_hoa', name: 'HOA Dues', amountCents: 15000, category: 'cat_hoa', anchor: '2026-12-15', frequency: 'quarterly', accountId: 'acc_checking' });
  if (o.car !== false) {
    WT.addDebt({ id: 'debt_car2', name: 'Car Loan', type: 'auto', startBalanceCents: 1200000, startDate: TODAY, aprCenti: o.carApr != null ? o.carApr : 400, minCents: 34500, dueDay: 20, autoInterest: false });
    WT.addTemplate({ id: 'bill_car2', name: 'Car Payment', amountCents: 34500, category: 'cat_loans', anchor: '2026-11-20', frequency: 'monthly', debtId: 'debt_car2', accountId: 'acc_checking' });
  }
  if (o.card) {
    WT.addDebt({ id: 'debt_card2', name: 'Rewards Card', type: 'credit_card', startBalanceCents: 300000, startDate: TODAY, aprCenti: 2299, minCents: 9000, dueDay: 5, limitCents: 500000, autoInterest: false });
    WT.addTemplate({ id: 'bill_card2', name: 'Card Payment', amountCents: 9000, category: 'cat_credit_cards', anchor: '2026-12-05', frequency: 'monthly', debtId: 'debt_card2', accountId: 'acc_checking' });
  }
  WT.ensureGenerated('2027-12');
}
const allItems = bd => B.flatMap(b => bd[b].items.map(it => Object.assign({ bucket: b }, it)));

test('mortgage: the full payment is in Essentials once, never in the Debt minimums', () => {
  mortgageHome();
  const A = S.analyze();
  assert.equal(A.income, 650000);
  const home = A.essentialList.filter(b => b.debtId === 'debt_home');
  assert.equal(home.length, 1, 'one mortgage line in Essentials');
  assert.equal(home[0].monthly, 200000, 'the full payment (escrow included)');
  assert.equal(A.essentials, 200000 + 30000 + 5000, 'mortgage + property tax set-aside + HOA set-aside');
  assert.equal(A.debtMinimums, 34500, 'only the car loan is a Debt minimum');
  assert.equal(A.required, A.living + A.debtMinimums);
  assert.equal(A.annualSetAside, 35000, 'yearly property tax and quarterly HOA get the monthly sinking-fund treatment');
  // the mortgage stays a debt: P&I minimum, housing flag, escrow kept
  const m = A.debts.find(d => d.id === 'debt_home');
  assert.ok(m && m.housing, 'mortgage is still in the debt list');
  assert.equal(m.minCents, 155000, 'payoff math uses principal + interest only');
  assert.equal(m.escrowCents, 45000);
  assert.equal(A.housing.payment, 200000); assert.equal(A.housing.escrow, 45000); assert.equal(A.housing.principalInterest, 155000);
  assert.equal(A.housing.otherCosts, 35000); assert.equal(A.housing.total, 235000);
  assert.equal(A.housing.pct, Math.round(235000 * 1000 / 650000) / 10);
  // every new home category is essential
  ['cat_mortgage', 'cat_property_tax', 'cat_home_insurance', 'cat_pmi', 'cat_hoa', 'cat_home_maintenance'].forEach(c => assert.equal(A.essentialCategory(c, 'bill'), true, c));
  assert.equal(A.essentialCategory('cat_home_maintenance', 'expense'), true, 'repairs count as needs spending too');
});

test('mortgage: breakdown lists the payment once under Essentials, no double counting, debt totals exclude it', () => {
  mortgageHome();
  const A = S.analyze();
  S.STRATEGY_IDS.filter(id => id !== 'custom').forEach(id => {
    const bd = S.breakdown(A, id);
    const items = allItems(bd);
    const home = items.filter(it => it.debtId === 'debt_home' && it.kind !== 'extra');
    assert.equal(home.length, 1, id + ': mortgage listed once');
    assert.equal(home[0].bucket, 'needs'); assert.equal(home[0].amount, 200000); assert.equal(home[0].mortgage, true); assert.equal(home[0].escrowCents, 45000);
    assert.ok(!bd.debt.items.some(it => it.kind === 'minimum' && it.debtId === 'debt_home'), id + ': no mortgage minimum under Debt');
    const tids = items.filter(it => it.templateId && it.kind !== 'extra').map(it => it.templateId);
    assert.equal(new Set(tids).size, tids.length, id + ': each bill once');
    assert.equal(bd.needs.items.filter(it => it.kind !== 'spending').reduce((t, it) => t + it.amount, 0), A.essentials, id + ': Essentials items = essentials');
    assert.equal(bd.debt.items.filter(it => it.kind !== 'extra').reduce((t, it) => t + it.amount, 0), A.debtMinimums, id + ': Debt minimum items = debt minimums');
    const s = S.strategies(A).find(x => x.id === id);
    assert.ok(s.amounts.needs >= A.living, id + ': essentials funded'); assert.equal(sumC(s.amounts), A.income, id + ': sums to income');
    assert.equal(s.debtSplit.minimum, A.debtMinimums, id + ': minimum split excludes the mortgage');
  });
  const bd = S.breakdown(A, 'avalanche');
  const tax = bd.needs.items.find(it => it.templateId === 'bill_ptax'); const hoa = bd.needs.items.find(it => it.templateId === 'bill_hoa');
  assert.equal(tax.kind, 'setaside'); assert.equal(tax.amount, 30000); assert.equal(tax.fullAmount, 360000); assert.equal(tax.frequency, 'yearly');
  assert.equal(hoa.kind, 'setaside'); assert.equal(hoa.amount, 5000);
});

test('mortgage: no linked bill -> the set payment is still counted once in Essentials', () => {
  mortgageHome({ bill: false });
  const A = S.analyze();
  const home = A.essentialList.filter(b => b.debtId === 'debt_home');
  assert.equal(home.length, 1); assert.equal(home[0].monthly, 200000); assert.equal(home[0].id, null);
  assert.equal(A.debtMinimums, 34500);
  const bd = S.breakdown(A, 'balanced');
  assert.equal(bd.needs.items.filter(it => it.debtId === 'debt_home').length, 1);
});

test('mortgage: amortization and forecasts use principal + interest only', () => {
  mortgageHome({ car: false });
  const A = S.analyze();
  const piSim = WT.simulatePayoff([{ id: 'h', name: 'h', balanceCents: 25000000, aprCenti: 650, minCents: 155000 }], 0, 'minimum');
  const fullSim = WT.simulatePayoff([{ id: 'h', name: 'h', balanceCents: 25000000, aprCenti: 650, minCents: 200000 }], 0, 'minimum');
  assert.ok(piSim.months > fullSim.months, 'escrow would wrongly shorten the loan');
  // core inputs, the engine's debt model and WTPlan all amortize on P&I
  const inp = WT.debtInputs().find(d => d.id === 'debt_home');
  assert.equal(inp.minCents, 155000); assert.equal(inp.paymentCents, 200000); assert.equal(inp.escrowCents, 45000);
  const P = require(path.join(__dirname, '../web/smartplan.js'));
  const dp = P.debtPlans({ extra: 0, method: 'avalanche' });
  assert.equal(dp.methods.minimum.months, piSim.months, 'WTPlan payoff months match a P&I amortization');
  assert.equal(dp.housingMinimums, 155000); assert.equal(dp.debtMinimums, 0);
  // forecast: a plan with no Debt-bucket money still pays the mortgage's P&I from Essentials
  const dollars = { needs: A.living, debt: 0, savings: A.income - A.living, wants: 0 };
  const f = S.forecast(A, dollars, 12);
  assert.equal(f.debtPaid, piSim.timeline[0] - piSim.timeline[12], '12-month principal paid = P&I amortization');
  assert.equal(f.debtFreeWithin, false);
  const p = S.strategies(A).find(s => s.id === 'pay-first').projection;
  assert.ok(p.debtPaid12 > 0, 'strategy projections include mortgage principal');
});

test('mortgage: extra payments can go to it, but avalanche still pays higher-APR debt first', () => {
  // all low rates: mortgage 6.50% beats the car at 4.00%, so avalanche extra goes to the mortgage
  mortgageHome({ carApr: 400 });
  let A = S.analyze();
  let av = S.strategies(A).find(s => s.id === 'avalanche');
  assert.ok(av.debtSplit.extra > 0);
  let ex = S.breakdown(A, 'avalanche').debt.items.find(it => it.kind === 'extra');
  assert.equal(ex.debtId, 'debt_home', 'extra goes to the highest APR: the mortgage');
  const P = require(path.join(__dirname, '../web/smartplan.js'));
  assert.ok(P.debtPlans({ extra: 10000, method: 'avalanche' }).methods.avalanche.notes.some(n => /Home Mortgage/.test(n)));
  // snowball ranks by balance: the car first
  assert.equal(S.breakdown(A, 'snowball').debt.items.find(it => it.kind === 'extra').debtId, 'debt_car2');
  // with a 22.99% card the card gets the extra first, the mortgage last
  mortgageHome({ carApr: 400, card: true });
  A = S.analyze();
  ex = S.breakdown(A, 'avalanche').debt.items.find(it => it.kind === 'extra');
  assert.equal(ex.debtId, 'debt_card2');
  const order = P.debtPlans({ extra: 20000, method: 'avalanche' }).methods.avalanche.order.map(x => x.id);
  assert.equal(order[0], 'debt_card2');
  assert.equal(A.debtMinimums, 34500 + 9000);
});

test('mortgage only + small savings: emergency fund before extra mortgage payments; text explains housing', () => {
  mortgageHome({ car: false });
  const A = S.analyze();
  assert.equal(A.debtMinimums, 0);
  const rec = S.recommend(A);
  assert.notEqual(rec.id, 'aggressive');
  const f = rec.factors.find(x => x.label === 'Housing (mortgage)');
  assert.ok(f, 'housing factor shown');
  assert.match(f.value, /36\.2% of take-home pay/);
  assert.match(f.effect, /Essentials/); assert.match(f.effect, /emergency fund/);
  assert.ok(rec.howCalculated.some(l => /Mortgage: the \$2,000\.00 monthly payment is housing/.test(l) && /\$450\.00 of it is escrow/.test(l)));
  const zero = S.strategies(A).find(s => s.id === 'zero');
  const iEf = zero.lines.findIndex(l => l.label === 'Emergency fund (3 months)'), iEx = zero.lines.findIndex(l => l.label === 'Extra debt payment');
  assert.ok(iEf >= 0 && (iEx < 0 || iEf < iEx), 'zero-based funds the 3-month emergency fund before any extra mortgage payment');
  ['avalanche', 'balanced', 'snowball'].forEach(id => { const s = S.strategies(A).find(x => x.id === id); assert.ok(s.lines.find(l => l.label === 'Starter emergency fund').amount === A.starter.gap, id + ': full starter fund first'); });
});

test('mortgage: paying the bill counts in Essentials (planned vs actual), extra payments in Debt', () => {
  mortgageHome();
  WT.setToday('2026-12-02');
  try {
    WT.recordPayment('i_bill_home_2026-12-01', { amountCents: 200000, date: '2026-12-01' });
    WT.payDebtExtra('debt_home', 10000, '2026-12-01', 'acc_checking');
    const A = S.analyze('2026-12');
    const va = S.vsActual(A, 'avalanche', '2026-12');
    assert.equal(va.needs.paid, 200000, 'mortgage bill payment is housing');
    assert.equal(va.debt.paid, 0);
    assert.equal(va.debt.extra, 10000, 'extra mortgage payment comes from the Debt bucket');
  } finally { WT.setToday(TODAY); }
});

test('mortgage: net worth counts the balance as a liability', () => {
  mortgageHome();
  const NW = require(path.join(__dirname, '../web/wealth.js'));
  const n = NW.netWorth();
  const l = n.liabilities.find(x => x.id === 'debt_home');
  assert.equal(l.amount, 25000000);
  assert.equal(n.totalLiabilities, 25000000 + 1200000);
});

test('mortgage escrow: only payment minus escrow lowers the balance; other debts unchanged', () => {
  mortgageHome();
  const bal0 = WT.debtBalance('debt_home');
  WT.recordPayment('i_bill_home_2026-12-01', { amountCents: 200000, date: '2026-12-01' });
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000, 'escrow ($450) is not principal');
  assert.ok(WT.debtCharges('debt_home').some(x => x.type === 'payment' && x.amountCents === -155000 && x.escrowCents === 45000 && /\$450\.00 to escrow/.test(x.label)));
  // two partial payments: the escrow comes out once, from the first
  WT.recordPayment('i_bill_home_2027-01-01', { amountCents: 30000, date: '2027-01-01' });
  WT.recordPayment('i_bill_home_2027-01-01', { amountCents: 170000, date: '2027-01-02' });
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000 * 2);
  // extra payments are all principal
  WT.payDebtExtra('debt_home', 10000, '2027-01-03', 'acc_checking');
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000 * 2 + 10000);
  // a non-mortgage debt still drops by the full payment
  const car0 = WT.debtBalance('debt_car2');
  WT.recordPayment('i_bill_car2_2026-11-20', { amountCents: 34500, date: '2026-11-20' });
  assert.equal(car0 - WT.debtBalance('debt_car2'), 34500);
  // a mortgage without escrow drops by the full payment (unchanged behavior)
  WT.updateDebt('debt_home', { escrowCents: 0 });
  assert.equal(bal0 - WT.debtBalance('debt_home'), 200000 * 2 + 10000);
  assert.equal(WT.debtEscrow('debt_car2'), 0);
  WT.updateDebt('debt_car2', { escrowCents: 5000 }); // escrow only applies to mortgages
  assert.equal(WT.debtEscrow('debt_car2'), 0); assert.equal(car0 - WT.debtBalance('debt_car2'), 34500);
});

test('mortgage escrow changes apply going forward: earlier bills keep the escrow they had', () => {
  mortgageHome();
  const bal0 = WT.debtBalance('debt_home');
  WT.recordPayment('i_bill_home_2026-12-01', { amountCents: 200000, date: '2026-12-01' }); // escrow $450 -> 155000 principal
  // the lender raises escrow to $500 starting Jan 1 (payment rises to $2,050)
  WT.updateDebt('debt_home', { escrowCents: 50000, minCents: 205000, escrowFrom: '2027-01-01' });
  assert.equal(WT.D.debts.debt_home.escrowFrom, undefined, 'the start date is not stored on the debt itself');
  assert.deepEqual(WT.D.debts.debt_home.escrowHistory, [{ from: '0000-01-01', cents: 45000 }, { from: '2027-01-01', cents: 50000 }]);
  assert.equal(WT.debtEscrow('debt_home', '2026-12-01'), 45000); assert.equal(WT.debtEscrow('debt_home', '2027-01-01'), 50000);
  assert.equal(WT.debtEscrow('debt_home'), 50000, 'no date: the current escrow');
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000, 'the December payment still counts $450 escrow');
  WT.recordPayment('i_bill_home_2027-01-01', { amountCents: 205000, date: '2027-01-01' });
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000 + 155000, 'January: $2,050 minus the new $500 escrow');
  // changing it again on the same start date replaces that step, never the past
  WT.updateDebt('debt_home', { escrowCents: 48000, escrowFrom: '2027-01-01' });
  assert.deepEqual(WT.D.debts.debt_home.escrowHistory, [{ from: '0000-01-01', cents: 45000 }, { from: '2027-01-01', cents: 48000 }]);
  assert.equal(bal0 - WT.debtBalance('debt_home'), 155000 + 157000);
  // saving the same escrow adds no history
  WT.updateDebt('debt_home', { escrowCents: 48000, name: 'Home Mortgage' });
  assert.equal(WT.D.debts.debt_home.escrowHistory.length, 2);
});

test('built-in category migration adds the home categories once and never touches user categories', () => {
  // an older install: the 16 original categories (the fixture's list), one hidden, plus a user's own "HOA Fees"
  WT.init(null, { put() { }, del() { } });
  seed(WT, { today: TODAY, blank: true });
  WT.D.categories.cat_other.archived = true; WT.save('categories', WT.D.categories.cat_other);
  WT.save('categories', { id: 'cat_my_hoa', name: 'HOA Fees', color: '#123456' });
  const before = JSON.parse(JSON.stringify(WT.D.categories));
  const added = ensureBuiltins(WT);
  assert.deepEqual(added.sort(), ['cat_home_insurance', 'cat_home_maintenance', 'cat_mortgage', 'cat_pmi', 'cat_property_tax']);
  assert.ok(!WT.D.categories.cat_hoa, 'user already has an HOA category (same name)');
  Object.keys(before).forEach(id => assert.deepEqual(WT.D.categories[id], before[id], id + ' unchanged'));
  assert.deepEqual(ensureBuiltins(WT), [], 'second run adds nothing');
  assert.equal(Object.keys(WT.D.categories).length, Object.keys(before).length + 5);
  // a new install already has them all
  fresh(true);
  assert.deepEqual(ensureBuiltins(WT), []);
  assert.ok(WT.D.categories.cat_mortgage && WT.D.categories.cat_hoa);
});
