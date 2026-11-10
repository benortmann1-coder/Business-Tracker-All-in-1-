// Run: node --test wealthtrack/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed } = require(path.join(__dirname, 'fixtures/sample-data.js')); // made-up sample data
const { seed: blankSeed, CATS: blankSeedCats } = require(path.join(__dirname, '../web/seed.js')); // what a real new install gets

// fixed "today" so tests are deterministic
const TODAY = '2026-11-06';
WT.setToday(TODAY);

function fresh(blank) {
  const store = {}; // simulated persistent DB
  const persist = { put(c, r) { (store[c] = store[c] || {})[r.id] = JSON.parse(JSON.stringify(r)); }, del(c, id) { if (store[c]) delete store[c][id]; } };
  WT.init(null, persist);
  if (blank) blankSeed(WT, { today: TODAY }); else seed(WT, { today: TODAY });
  return { store, persist };
}
function reopen(ctx) { // simulates closing & reopening the app: reload everything from the "database"
  const data = JSON.parse(JSON.stringify(ctx.store));
  WT.init(data, ctx.persist);
  return WT.runMaintenance(TODAY);
}
const inst = (tpl, mk) => WT.instancesForMonth(mk).find(i => i.templateId === tpl);

test('money parsing is decimal-safe', () => {
  assert.equal(WT.parseMoney('0.1'), 10);
  assert.equal(WT.parseMoney('$1,600.00'), 160000);
  assert.equal(WT.parseMoney('10.99'), 1099);
  assert.equal(WT.parseMoney('10.555'), 1056);
  assert.equal(WT.parseMoney('-3.2'), -320);
  assert.equal(WT.parseMoney('abc'), null);
  assert.equal(WT.fmt(81049), '$810.49');
  assert.equal(WT.fmt(-5), '-$0.05');
  // 0.1+0.2 style errors cannot happen: sums are integers
  assert.equal([1099, 1549, 299].reduce((a, b) => a + b), 2947);
});

test('sample data totals', () => {
  fresh();
  const s = WT.billsSummary('2026-11');
  // 17 bills: 1200+95+40+65+55+110+380+175+150+40+50+30+35+10.99+15.49+2.99+7.99 = 2462.46,
  // minus the cancelled News App 7.99 = 2454.47
  assert.equal(s.total, 245447);
  assert.equal(inst('bill_news', '2026-11'), undefined);
  // debts: 9000 + 15000 + 5200 + 1200 + 600 + 250 = 31,250
  assert.equal(WT.totalDebt(), 3125000);
});

test('a real new install starts blank: categories and an empty Checking account only', () => {
  fresh(true);
  assert.equal(WT.list('categories').length, blankSeedCats.length);
  assert.deepEqual(WT.list('categories').map(c => c.id).sort(), blankSeedCats.map(c => c[0]).sort());
  assert.deepEqual(WT.list('accounts').map(a => [a.id, a.type, a.openingCents]), [['acc_checking', 'checking', 0]]);
  for (const c of ['templates', 'instances', 'payments', 'incomes', 'debts', 'debtTxns', 'expenses', 'budgets', 'goals']) assert.equal(WT.list(c).length, 0, c + ' is empty');
  assert.equal(WT.settings().seeded, 'blank');
  assert.ok(!(WT.settings().setAsides || []).length, 'no set-asides');
  WT.ensureGenerated('2027-06');
  assert.equal(WT.billsSummary('2026-11').total, 0);
  assert.equal(WT.totalDebt(), 0);
  assert.equal(WT.list('instances').length, 0);
});

test('Nov paid -> Dec stays unpaid', () => {
  const ctx = fresh();
  const nov = inst('bill_carloan', '2026-11');
  WT.markPaid(nov.id, TODAY);
  assert.equal(WT.instStatus(nov, TODAY).status, 'paid');
  WT.ensureGenerated('2026-12');
  const dec = inst('bill_carloan', '2026-12');
  assert.ok(dec);
  assert.equal(WT.instStatus(dec, TODAY).status, 'upcoming');
  assert.equal(WT.paidFor(dec.id), 0);
  reopen(ctx);
  assert.equal(WT.instStatus(inst('bill_carloan', '2026-11'), TODAY).status, 'paid');
});

test('change only December amount', () => {
  fresh();
  WT.ensureGenerated('2027-01');
  const dec = inst('bill_carloan', '2026-12');
  WT.updateTemplate('bill_carloan', { amountCents: 40000 }, { mode: 'this', instanceId: dec.id });
  assert.equal(inst('bill_carloan', '2026-12').amountCents, 40000);
  assert.equal(inst('bill_carloan', '2026-11').amountCents, 38000);
  assert.equal(inst('bill_carloan', '2027-01').amountCents, 38000);
});

test('edit all future without changing history', () => {
  fresh();
  WT.markPaid(inst('bill_apartment', '2026-11').id, TODAY);
  WT.ensureGenerated('2027-03');
  WT.updateTemplate('bill_apartment', { amountCents: 125000, anchor: '2027-01-03' }, { mode: 'future', fromMonth: '2027-01' });
  assert.equal(inst('bill_apartment', '2026-11').amountCents, 120000);
  assert.equal(inst('bill_apartment', '2026-12').amountCents, 120000);
  assert.equal(inst('bill_apartment', '2026-12').dueDate, '2026-12-01');
  const jan = WT.instancesForMonth('2027-01').filter(i => i.templateId === 'bill_apartment');
  assert.equal(jan.length, 1);
  assert.equal(jan[0].amountCents, 125000);
  assert.equal(jan[0].dueDate, '2027-01-03');
  assert.equal(inst('bill_apartment', '2027-03').amountCents, 125000);
  assert.equal(WT.instStatus(inst('bill_apartment', '2026-11'), TODAY).status, 'paid');
});

test('partial payment', () => {
  fresh();
  const i = inst('bill_student', '2026-11');
  WT.recordPayment(i.id, { amountCents: WT.parseMoney('100.10'), date: TODAY });
  const s = WT.instStatus(i, TODAY);
  assert.equal(s.status, 'partial');
  assert.equal(s.remaining, 7490); // 175.00 - 100.10 = 74.90
  WT.markPaid(i.id, TODAY);
  assert.equal(WT.instStatus(i, TODAY).status, 'paid');
});

test('paycheck plan: each bill counted once, moving recalculates', () => {
  fresh();
  WT.ensureGenerated('2026-12');
  const k1 = 'inc_job|2026-11-06', k2 = 'inc_job|2026-11-20';
  const p1 = WT.paycheckPlan(k1), p2 = WT.paycheckPlan(k2);
  // bills due Nov 6 – Nov 19 are on the Nov 6 check
  assert.deepEqual(p1.bills.map(b => b.i.name).sort(), ['Car Loan Payment', 'Electric', 'Internet', 'Store Card Payment', 'Student Loan Payment', 'Video Stream', 'Water'].sort());
  // 65 + 380 + 95 + 40 + 175 + 15.49 + 40 = 810.49 (News App on the 9th is cancelled)
  assert.equal(p1.billTotal, 81049);
  assert.equal(p1.remainingAfterSetAsides, 160000 - 81049 - 25000);
  // no instance is in two plans
  const all = WT.paychecksBetween('2026-10-01', '2027-01-31').flatMap(pc => WT.billsForPaycheck(pc.key).map(i => i.id));
  assert.equal(all.length, new Set(all).size);
  // move the Store Card payment to the Nov 20 check
  const bb = inst('bill_store', '2026-11');
  const before2 = p2.billTotal;
  WT.assignInstance(bb.id, k2);
  assert.equal(WT.paycheckPlan(k1).billTotal, 81049 - 4000);
  assert.equal(WT.paycheckPlan(k2).billTotal, before2 + 4000);
});

test('credit-card payments are not double counted as spending', () => {
  fresh();
  WT.addExpense({ amountCents: 5000, category: 'cat_groceries', sourceId: 'debt:debt_visa', date: TODAY });
  WT.markPaid(inst('bill_store', '2026-11').id, TODAY); // card payment
  WT.markPaid(inst('bill_internet', '2026-11').id, TODAY); // normal bill
  const sp = WT.spendingByCategory('2026-11');
  assert.equal(sp.cat_groceries, 5000);
  assert.equal(sp.cat_credit_cards, undefined);
  assert.equal(sp.cat_phone, 6500);
  // card balance went up by the purchase and down by nothing else
  assert.equal(WT.debtBalance('debt_visa'), 520000 + 5000);
  assert.equal(WT.debtBalance('debt_store'), 120000 - 4000);
  // goal contribution is a transfer, not spending
  const g = WT.addGoal({ name: 'Emergency fund', targetCents: 100000, accountId: 'acc_savings' });
  WT.contributeGoal(g.id, 2500, TODAY, 'acc_checking');
  assert.equal(WT.totalSpending('2026-11'), 5000 + 6500);
  assert.equal(WT.accountBalance('acc_savings', TODAY), 2500);
});

test('restart keeps everything and never duplicates', () => {
  const ctx = fresh();
  WT.ensureGenerated('2027-02');
  const n = Object.keys(WT.D.instances).length;
  WT.markPaid(inst('bill_apartment', '2026-11').id, TODAY);
  for (let k = 0; k < 3; k++) { const r = reopen(ctx); assert.equal(r.created, 0); }
  assert.equal(Object.keys(WT.D.instances).length, n);
  assert.equal(WT.instStatus(inst('bill_apartment', '2026-11'), TODAY).status, 'paid');
  assert.deepEqual(WT.integrity(), []);
});

test('skip keeps history; pause/cancel/delete keep payments', () => {
  fresh();
  WT.ensureGenerated('2027-01');
  const dec = inst('bill_music', '2026-12');
  WT.setSkipped(dec.id, true);
  assert.equal(WT.instStatus(dec, TODAY).status, 'skipped');
  WT.ensureGenerated('2027-03');
  assert.equal(inst('bill_music', '2026-12').skipped, true);
  assert.ok(inst('bill_music', '2027-01'));
  // pay Nov, then delete the bill: Nov payment stays
  const nov = inst('bill_video', '2026-11');
  WT.markPaid(nov.id, TODAY);
  WT.deleteTemplate('bill_video');
  WT.ensureGenerated('2027-06');
  assert.ok(WT.D.instances[nov.id]);
  assert.equal(WT.paidFor(nov.id), 1549);
  assert.equal(inst('bill_video', '2027-01'), undefined);
  // pause the gym from Dec; resume later doesn't backfill paused months
  WT.pauseTemplate('bill_gym', '2026-12-01');
  assert.equal(inst('bill_gym', '2026-12'), undefined);
});

test('deleting a bill removes it from this month on but keeps paid months', () => {
  fresh();
  WT.ensureGenerated('2027-01');
  // an unpaid bill already due earlier this month (overdue) disappears from the month when deleted
  const due = WT.instancesForMonth('2026-11').find(i => i.dueDate < TODAY && WT.paidFor(i.id) === 0 && !WT.isAutopay(i));
  assert.ok(due, 'seed has an unpaid bill due before today');
  const before = WT.billsSummary('2026-11');
  WT.deleteTemplate(due.templateId);
  assert.equal(WT.D.instances[due.id], undefined);
  assert.equal(inst(due.templateId, '2026-12'), undefined);
  const after = WT.billsSummary('2026-11');
  assert.equal(after.count, before.count - 1);
  assert.equal(after.total, before.total - due.amountCents);
  assert.ok(!WT.overdue().some(x => x.i.templateId === due.templateId));
  // regeneration never brings it back
  WT.ensureGenerated('2027-06');
  assert.equal(inst(due.templateId, '2027-03'), undefined);
  // a month that was paid survives the delete with its payment
  const other = WT.instancesForMonth('2026-11').find(i => i.templateId !== due.templateId && !WT.isAutopay(i));
  WT.markPaid(other.id, TODAY);
  WT.deleteTemplate(other.templateId);
  assert.ok(WT.D.instances[other.id]);
  assert.equal(WT.paidFor(other.id), other.amountCents);
});

test('due on the last day of each month', () => {
  fresh();
  WT.addTemplate({ id: 'bill_eom', name: 'Month-end bill', amountCents: 5000, anchor: '2026-11-30', frequency: 'monthly', eom: true });
  WT.ensureGenerated('2027-05');
  const due = mk => (WT.instancesForMonth(mk).find(i => i.templateId === 'bill_eom') || {}).dueDate;
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'].map(due),
    ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  // without the option, a bill anchored on the 30th stays on the 30th (Feb clamps to the 28th)
  WT.addTemplate({ id: 'bill_30', name: 'On the 30th', amountCents: 5000, anchor: '2026-11-30', frequency: 'monthly' });
  WT.ensureGenerated('2027-05');
  const d30 = mk => (WT.instancesForMonth(mk).find(i => i.templateId === 'bill_30') || {}).dueDate;
  assert.deepEqual(['2026-12', '2027-02', '2027-03'].map(d30), ['2026-12-30', '2027-02-28', '2027-03-30']);
  // turning it on for an existing bill from next month moves its future due dates to month-end
  WT.updateTemplate('bill_30', { eom: true, anchor: '2026-12-31' }, { mode: 'future', fromMonth: '2026-12' });
  assert.deepEqual(['2026-11', '2026-12', '2027-01', '2027-03'].map(d30), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-03-31']);
  // and back off again
  WT.updateTemplate('bill_eom', { eom: false }, { mode: 'future', fromMonth: '2027-01' });
  assert.equal(due('2027-03'), '2027-03-30');
  // quarterly works too
  WT.addTemplate({ id: 'bill_q', name: 'Quarterly', amountCents: 100, anchor: '2026-11-30', frequency: 'quarterly', eom: true });
  WT.ensureGenerated('2027-06');
  assert.equal(WT.list('instances').filter(i => i.templateId === 'bill_q').map(i => i.dueDate).sort().slice(0, 3).join(), '2026-11-30,2027-02-28,2027-05-31');
});

test('refresh due dates: a bill moved to the month before stays there and the month gets its bill back', () => {
  fresh();
  WT.ensureGenerated('2027-01');
  const t = WT.list('templates').find(x => !x.deleted && WT.currentRule(x).frequency === 'monthly' && !x.subscription && !WT.isAutopay({ templateId: x.id, dueDate: TODAY }));
  const nov = inst(t.id, '2026-11'); const novDue = nov.dueDate;
  WT.markPaid(nov.id, TODAY);
  WT.moveInstanceDue(nov.id, '2026-10-31');
  assert.equal(inst(t.id, '2026-11'), undefined, 'moved out of November');
  WT.ensureGenerated('2027-01');
  assert.equal(inst(t.id, '2026-11'), undefined, 'normal generation does not refill November (the bug)');
  const r = WT.refreshMonth('2026-11');
  assert.equal(r.moved, 1);
  const back = inst(t.id, '2026-11');
  assert.ok(back, 'November has the bill again'); assert.equal(back.dueDate, novDue, 'on its normal due date');
  assert.equal(WT.paidFor(back.id), 0, 'new November bill is unpaid');
  const oct = WT.instancesForMonth('2026-10').filter(i => i.templateId === t.id && i.dueDate === '2026-10-31');
  assert.equal(oct.length, 1, 'moved bill now belongs to October');
  assert.equal(WT.paidFor(oct[0].id), oct[0].amountCents, 'its payment moved with it');
  assert.equal(oct[0].periodMonth, '2026-10');
  // running it again changes nothing, and a later regenerate doesn't duplicate
  assert.deepEqual(WT.refreshMonth('2026-11'), { moved: 0, created: 0 });
  WT.ensureGenerated('2027-03');
  assert.equal(WT.instancesForMonth('2026-11').filter(i => i.templateId === t.id).length, 1);
  assert.equal(WT.instancesForMonth('2026-10').filter(i => i.templateId === t.id).length, oct.length + WT.instancesForMonth('2026-10').filter(i => i.templateId === t.id && i.dueDate !== '2026-10-31').length);
});

test('one-month due-date move does not affect other months', () => {
  fresh();
  WT.ensureGenerated('2027-01');
  const dec = inst('bill_autoins', '2026-12');
  WT.moveInstanceDue(dec.id, '2026-12-31');
  assert.equal(WT.D.instances[dec.id].dueDate, '2026-12-31');
  assert.equal(inst('bill_autoins', '2027-01').dueDate, '2027-01-25');
  // moving into next month doesn't make January lose its own bill
  WT.moveInstanceDue(dec.id, '2027-01-02');
  WT.ensureGenerated('2027-02');
  assert.equal(WT.instancesForMonth('2027-01').filter(i => i.templateId === 'bill_autoins').length, 2);
});

test('navigating years keeps data; weekly/biweekly/quarterly/yearly/custom recurrence', () => {
  fresh(true);
  const w = WT.addTemplate({ name: 'Gym', amountCents: 1000, anchor: '2026-11-02', frequency: 'weekly' });
  const q = WT.addTemplate({ name: 'Water', amountCents: 9000, anchor: '2026-11-15', frequency: 'quarterly' });
  const y = WT.addTemplate({ name: 'Registration', amountCents: 12000, anchor: '2027-03-31', frequency: 'yearly' });
  const c = WT.addTemplate({ name: 'Oil change', amountCents: 6000, anchor: '2026-11-10', frequency: 'custom', interval: 10, unit: 'week' });
  const b = WT.addTemplate({ name: 'Daycare', amountCents: 20000, anchor: '2026-11-06', frequency: 'biweekly' });
  WT.ensureGenerated('2029-12');
  const cnt = (t, from, to) => WT.instancesBetween(from, to).filter(i => i.templateId === t.id).length;
  assert.equal(cnt(w, '2026-11-01', '2026-11-30'), 5);
  assert.equal(cnt(q, '2026-11-01', '2027-11-30'), 5);
  assert.equal(cnt(y, '2027-01-01', '2029-12-31'), 3);
  assert.equal(cnt(c, '2026-11-01', '2027-11-30'), 6);
  assert.equal(cnt(b, '2026-11-01', '2026-12-31'), 4); // Nov 6, Nov 20, Dec 4, Dec 18
  const before = Object.keys(WT.D.instances).length;
  WT.ensureGenerated('2029-12');
  WT.ensureGenerated('2028-01');
  assert.equal(Object.keys(WT.D.instances).length, before);
  // leap-year / month-end clamp
  const m = WT.addTemplate({ name: 'End of month', amountCents: 100, anchor: '2027-01-31', frequency: 'monthly' });
  WT.ensureGenerated('2028-03');
  assert.equal(WT.instancesForMonth('2028-02').find(i => i.templateId === m.id).dueDate, '2028-02-29');
  assert.equal(WT.instancesForMonth('2028-03').find(i => i.templateId === m.id).dueDate, '2028-03-31');
});

test('month reset voids (never deletes) payments; other months unchanged', () => {
  fresh();
  WT.ensureGenerated('2026-12');
  WT.markPaid(inst('bill_apartment', '2026-11').id, TODAY);
  WT.markPaid(inst('bill_apartment', '2026-12').id, TODAY); // early payment for December
  const before = Object.keys(WT.D.payments).length;
  const n = WT.resetMonthStatuses('2026-11');
  assert.equal(n, 1);
  assert.equal(Object.keys(WT.D.payments).length, before);
  assert.equal(WT.instStatus(inst('bill_apartment', '2026-11'), TODAY).status, 'overdue');
  assert.equal(WT.instStatus(inst('bill_apartment', '2026-12'), TODAY).status, 'paid');
});

test('interest accrues once per month and payoff calculators run', () => {
  const ctx = fresh();
  WT.accrueInterest('2027-01-15');
  const n = Object.values(WT.D.debtTxns).filter(x => x.type === 'interest').length;
  WT.accrueInterest('2027-01-15');
  assert.equal(Object.values(WT.D.debtTxns).filter(x => x.type === 'interest').length, n);
  reopen(ctx);
  // Visa Card: 5200.00 * 24.99% / 12 = 108.29 (due day 3)
  const d = Object.values(WT.D.debtTxns).find(x => x.debtId === 'debt_visa' && x.date === '2026-12-03');
  assert.equal(d.amountCents, 10829);
  const inputs = WT.debtInputs();
  const min = WT.simulatePayoff(inputs, 0, 'minimum');
  const ava = WT.simulatePayoff(inputs, 20000, 'avalanche');
  const snow = WT.simulatePayoff(inputs, 20000, 'snowball');
  assert.ok(ava.totalInterest <= snow.totalInterest);
  assert.ok(ava.months < (min.months || 9999));
});

test('budgets with rollover', () => {
  fresh();
  WT.setBudget('cat_groceries', 40000, true);
  WT.D.budgets.cat_groceries.startMonth = '2026-11';
  WT.addExpense({ amountCents: 30000, category: 'cat_groceries', date: '2026-11-10' });
  const dec = WT.budgetStatus('2026-12').find(b => b.category === 'cat_groceries');
  assert.equal(dec.carry, 10000);
  assert.equal(dec.budget, 50000);
  const nov = WT.budgetStatus('2026-11').find(b => b.category === 'cat_groceries');
  assert.equal(nov.pct, 75);
});

// ---------------------------------------------------------------- audit regressions (CORE-xx ids match the audit report)
const ofT = (tid, a, b) => WT.instancesBetween(a, b).filter(i => i.templateId === tid).map(i => i.dueDate);

test('CORE-01/02/03/04 money parsing & formatting edge cases', () => {
  assert.equal(WT.parseMoney('99999999999999999999'), null); // beyond safe integer cents
  assert.equal(WT.parseMoney('9999999999999.99'), 999999999999999);
  assert.equal(WT.parseMoney('1,2,3'), null);
  assert.equal(WT.parseMoney('12,34'), null);
  assert.equal(WT.parseMoney('1,234,567.89'), 123456789);
  assert.equal(WT.parseMoney('(1,234)'), -123400);
  assert.ok(Object.is(WT.parseMoney('-0'), 0));
  assert.ok(Object.is(WT.parseMoney('-0.001'), 0));
  assert.equal(WT.parseMoney('1.'), 100);
  assert.equal(WT.parseMoney('00.5'), 50);
  assert.equal(WT.parseMoney('1e5'), null);
  assert.equal(WT.parseMoney('١٢٣'), null);
  assert.equal(WT.parseMoney(' $ 12 '), 1200);
  assert.equal(WT.parseMoney('$-5'), -500);
  assert.equal(WT.fmt(-0.4), '$0.00');
  assert.equal(WT.fmt(-0), '$0.00');
  assert.equal(WT.fmt(-49, { noCents: true }), '-$0');
  assert.equal(WT.fmt(NaN), '—');
});

test('dates: clamping, leap years, year boundaries, DST', () => {
  assert.equal(WT.addMonthKey('2026-01', -13), '2024-12');
  assert.equal(WT.addMonthKey('2026-12', 1), '2027-01');
  assert.deepEqual(WT.occurrences({ frequency: 'yearly', anchor: '2028-02-29' }, '2028-01-01', '2032-12-31'), ['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  assert.deepEqual(WT.occurrences({ frequency: 'monthly', anchor: '2027-01-31' }, '2027-02-01', '2027-04-30'), ['2027-02-28', '2027-03-31', '2027-04-30']);
  assert.deepEqual(WT.occurrences({ frequency: 'custom', interval: 2, unit: 'year', anchor: '2026-03-15' }, '2026-01-01', '2030-12-31'), ['2026-03-15', '2028-03-15', '2030-03-15']);
  assert.equal(WT.diffDays('2026-03-07', '2026-03-09'), 2); // across US DST change
  assert.equal(WT.addDays('2026-12-31', 1), '2027-01-01');
});

test('recurrence: monthly->weekly->monthly keeps history and never duplicates', () => {
  fresh(true);
  const t = WT.addTemplate({ name: 'A', amountCents: 1000, anchor: '2026-11-10', frequency: 'monthly' });
  WT.ensureGenerated('2027-03');
  WT.markPaid(inst(t.id, '2026-11').id, TODAY);
  WT.updateTemplate(t.id, { frequency: 'weekly', anchor: '2027-01-04' }, { mode: 'future', fromMonth: '2027-01' });
  assert.deepEqual(ofT(t.id, '2026-11-01', '2027-01-31'), ['2026-11-10', '2026-12-10', '2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
  WT.updateTemplate(t.id, { frequency: 'monthly', anchor: '2027-02-15' }, { mode: 'future', fromMonth: '2027-02' });
  WT.ensureGenerated('2027-04');
  assert.deepEqual(ofT(t.id, '2027-02-01', '2027-04-30'), ['2027-02-15', '2027-03-15', '2027-04-15']);
  assert.equal(WT.instStatus(inst(t.id, '2026-11'), TODAY).status, 'paid');
  assert.equal(WT.ensureGenerated('2027-04'), 0);
  assert.deepEqual(WT.integrity(), []);
});

test('CORE-07 reactivating a cancelled bill does not bring back the cancelled months', () => {
  fresh(true);
  const t = WT.addTemplate({ name: 'F', amountCents: 1000, anchor: '2026-11-10', frequency: 'monthly' });
  WT.ensureGenerated('2027-02');
  WT.cancelTemplate(t.id, '2026-12-01');
  WT.setToday('2027-01-20');
  try {
    WT.reactivateTemplate(t.id); WT.ensureGenerated('2027-03');
    assert.deepEqual(ofT(t.id, '2026-11-01', '2027-03-31'), ['2026-11-10', '2027-02-10', '2027-03-10']);
  } finally { WT.setToday(TODAY); }
});

test('CORE-08 pause and resume on the same day leaves no pause behind', () => {
  fresh(true);
  const t = WT.addTemplate({ name: 'P', amountCents: 1000, anchor: '2026-11-06', frequency: 'weekly' });
  WT.ensureGenerated('2026-12');
  WT.pauseTemplate(t.id, TODAY); WT.resumeTemplate(t.id);
  assert.deepEqual(WT.D.templates[t.id].pauses, []);
  assert.equal(ofT(t.id, TODAY, TODAY).length, 1, "today's occurrence is back");
  WT.pauseTemplate(t.id, '2026-11-10');
  WT.setToday('2026-12-01');
  try { WT.resumeTemplate(t.id); WT.ensureGenerated('2026-12'); assert.deepEqual(ofT(t.id, '2026-11-10', '2026-11-30'), []); }
  finally { WT.setToday(TODAY); }
});

test('CORE-05/06 payment validation', () => {
  fresh();
  const i = inst('bill_apartment', '2026-11');
  assert.throws(() => WT.recordPayment(i.id, { amountCents: 1.5 }));
  assert.throws(() => WT.recordPayment(i.id, { amountCents: 0 }));
  assert.throws(() => WT.recordPayment(i.id, { amountCents: NaN }));
  assert.throws(() => WT.addExpense({ amountCents: 0.5 }));
  assert.equal(WT.markPaid('no-such-bill'), null);
  WT.recordPayment(i.id, { amountCents: 150000, date: TODAY }); // overpays the $1,200 bill
  assert.equal(WT.billsSummary('2026-11').paid, 120000); // paid counts the bill amount, not the overpayment
  assert.equal(WT.markPaid(i.id), null);
});

test('CORE-09 a bill moved to a far-away paycheck still shows on that paycheck (never vanishes)', () => {
  fresh();
  WT.ensureGenerated('2027-07');
  const june = inst('bill_apartment', '2027-06');
  WT.assignInstance(june.id, 'inc_job|2026-11-06');
  assert.ok(WT.billsForPaycheck('inc_job|2026-11-06').some(i => i.id === june.id));
  const all = WT.paychecksBetween('2026-10-01', '2027-08-31').flatMap(pc => WT.billsForPaycheck(pc.key).map(i => i.id));
  assert.equal(all.length, new Set(all).size, 'no bill in two plans');
  assert.equal(all.filter(id => id === june.id).length, 1);
  WT.assignInstance(june.id, 'inc_gone|2026-11-06');
  assert.equal(WT.paycheckFor(WT.D.instances[june.id]).incomeId, 'inc_job');
});

test('CORE-10 projection ignores overdue bills charged to a credit card', () => {
  fresh(true);
  WT.addDebt({ id: 'card', name: 'Card', type: 'credit_card', startBalanceCents: 0 });
  WT.addTemplate({ name: 'Charged', amountCents: 5000, anchor: '2026-11-01', frequency: 'monthly', accountId: 'debt:card' });
  WT.addTemplate({ name: 'Cash', amountCents: 2000, anchor: '2026-11-02', frequency: 'monthly' });
  const pr = WT.projection(10, TODAY);
  assert.equal(pr.start - pr.end, 2000);
});

test('CORE-11 goal progress never negative', () => {
  fresh(true);
  const g = WT.addGoal({ name: 'G', targetCents: 10000 });
  WT.contributeGoal(g.id, -500, TODAY);
  const p = WT.goalProjection(g.id, TODAY);
  assert.equal(p.pct, 0); assert.equal(p.date, null);
});

test('CORE-12 budget rollover is consistent past 12 months', () => {
  fresh(true);
  WT.setBudget('cat_groceries', 10000, true);
  WT.D.budgets.cat_groceries.startMonth = '2026-01';
  const carry = mk => WT.budgetStatus(mk).find(b => b.category === 'cat_groceries').carry;
  assert.equal(carry('2027-03'), 14 * 10000);
  assert.equal(carry('2027-04'), carry('2027-03') + 10000);
});

test('CORE-13 transactions() tolerates records with missing fields/references', () => {
  fresh(true);
  WT.addExtraIncome({ amountCents: 100, type: '' });
  WT.save('payments', { id: 'orphan', instanceId: 'gone', amountCents: 5, date: TODAY });
  assert.doesNotThrow(() => WT.transactions());
  assert.doesNotThrow(() => WT.monthSummary('2026-11'));
});

test('CORE-15 future edit moves the due date of a month kept only because it was assigned to a paycheck', () => {
  fresh();
  WT.ensureGenerated('2027-02');
  const dec = inst('bill_autoins', '2026-12');
  WT.assignInstance(dec.id, 'inc_job|2026-12-18');
  WT.updateTemplate('bill_autoins', { anchor: '2026-12-20' }, { mode: 'future', fromMonth: '2026-12' });
  assert.equal(WT.instancesForMonth('2026-12').filter(i => i.templateId === 'bill_autoins').length, 1);
  assert.equal(WT.D.instances[dec.id].dueDate, '2026-12-20');
  assert.equal(WT.D.instances[dec.id].paycheckKey, 'inc_job|2026-12-18');
});

test('debts: interest idempotent across reopen; start on due day; compounding; voided txns ignored', () => {
  const ctx = fresh();
  WT.accrueInterest('2027-03-15'); reopen(ctx); WT.accrueInterest('2027-03-15');
  const keys = Object.values(WT.D.debtTxns).filter(x => x.type === 'interest').map(x => x.key);
  assert.equal(keys.length, new Set(keys).size);
  const d = WT.addDebt({ name: 'X', startBalanceCents: 10000, startDate: '2026-11-11', aprCenti: 1200, dueDay: 11 });
  WT.accrueInterest('2026-12-20');
  assert.deepEqual(Object.values(WT.D.debtTxns).filter(x => x.debtId === d.id).map(x => x.date + ':' + x.amountCents), ['2026-12-11:100']);
  const t = WT.addDebtTxn({ debtId: d.id, type: 'charge', amountCents: 500 }); t.voided = true; WT.save('debtTxns', t);
  assert.equal(WT.debtBalance(d.id), 10100);
  const e = WT.addDebt({ name: 'Y', startBalanceCents: 120000, startDate: '2026-10-31', aprCenti: 1200, dueDay: 1 });
  WT.accrueInterest('2027-01-02');
  assert.deepEqual(Object.values(WT.D.debtTxns).filter(x => x.debtId === e.id).map(x => x.amountCents), [1200, 1212, 1224]);
  assert.equal(WT.simulatePayoff([{ id: 'a', balanceCents: 10000, aprCenti: 1200, minCents: 0 }], 0, 'minimum').months, null);
  assert.equal(WT.simulatePayoff([{ id: 'a', balanceCents: 10000, aprCenti: 0, minCents: 1000 }], 0, 'minimum').months, 10);
});

test('caches stay correct after writes (payments, voids, moves, deposits, deletes)', () => {
  fresh();
  const i = inst('bill_apartment', '2026-11');
  assert.equal(WT.totalSpending('2026-11'), 0);
  const p = WT.markPaid(i.id, TODAY);
  assert.equal(WT.paidFor(i.id), 120000);
  assert.equal(WT.spendingByCategory('2026-11').cat_housing, 120000);
  WT.voidPayment(p.id);
  assert.equal(WT.paidFor(i.id), 0);
  assert.equal(WT.spendingByCategory('2026-11').cat_housing, undefined);
  WT.moveInstanceDue(i.id, '2026-12-02');
  assert.ok(!WT.instancesForMonth('2026-11').some(x => x.id === i.id));
  assert.ok(WT.instancesForMonth('2026-12').some(x => x.id === i.id));
  const k = WT.paycheck('inc_job|2026-11-06');
  WT.recordDeposit(k.key, { amountCents: 170000 });
  assert.equal(WT.paycheck(k.key).amountCents, 170000);
  assert.equal(WT.paychecksBetween('2026-11-06', '2026-11-06')[0].amountCents, 170000);
  const e = WT.addExpense({ amountCents: 999, category: 'cat_gas', sourceId: 'debt:debt_visa', date: TODAY });
  const before = WT.debtBalance('debt_visa');
  WT.deleteExpense(e.id);
  assert.equal(WT.debtBalance('debt_visa'), before - 999);
});

test('auto-pay: subscriptions upcoming until due date, then auto-paid once; excluded from reset & reminders', () => {
  const ctx = fresh();
  WT.ensureGenerated('2026-12');
  const musicNov = Object.values(WT.D.instances).find(i => i.templateId === 'bill_music' && i.periodMonth === '2026-11'); // due Nov 4 (past)
  const videoNov = Object.values(WT.D.instances).find(i => i.templateId === 'bill_video' && i.periodMonth === '2026-11'); // due Nov 14 (future)
  assert.equal(WT.isAutopay(musicNov), true);
  assert.equal(WT.isAutopay(Object.values(WT.D.instances).find(i => i.templateId === 'bill_apartment')), false);
  const n = WT.applyAutopay(TODAY);
  assert.ok(n >= 2); // Music Stream Nov 4, Cloud Storage Nov 4
  assert.equal(WT.instStatus(musicNov, TODAY).status, 'paid');
  assert.equal(WT.paymentsFor(musicNov.id)[0].date, '2026-11-04');
  assert.notEqual(WT.instStatus(videoNov, TODAY).status, 'paid');
  assert.equal(WT.applyAutopay(TODAY), 0); // idempotent
  reopen(ctx); assert.equal(WT.paymentsFor(musicNov.id).length, 1); // restart: still one payment
  // on the due date it flips to paid
  assert.equal(WT.applyAutopay('2026-11-14') >= 1, true);
  assert.equal(WT.instStatus(WT.D.instances[videoNov.id], '2026-11-14').status, 'paid');
  // reset month leaves auto-pay alone
  WT.resetMonthStatuses('2026-11');
  assert.equal(WT.instStatus(WT.D.instances[musicNov.id], TODAY).status, 'paid');
  // reminders skip auto-pay bills
  assert.ok(!WT.reminderList(TODAY, 60).some(r => r.id.includes('bill_video')));
  // any bill can be switched to auto-pay; turning it off stops it
  WT.updateTemplate('bill_apartment', { autopay: true }, { mode: 'future', fromMonth: '2026-12' });
  assert.equal(WT.isAutopay(Object.values(WT.D.instances).find(i => i.templateId === 'bill_apartment' && i.periodMonth === '2026-12')), true);
  // ...but months due before it was turned on are unchanged and still payable by hand
  const rentNov = Object.values(WT.D.instances).find(i => i.templateId === 'bill_apartment' && i.periodMonth === '2026-11');
  assert.equal(WT.isAutopay(rentNov), false);
  WT.applyAutopay(TODAY); assert.equal(WT.instStatus(rentNov, TODAY).status, 'overdue');
  // skipped auto-pay month is never charged
  const decMusic = Object.values(WT.D.instances).find(i => i.templateId === 'bill_music' && i.periodMonth === '2026-12');
  WT.setSkipped(decMusic.id, true); WT.applyAutopay('2026-12-31');
  assert.equal(WT.paymentsFor(decMusic.id).length, 0);
});

test('date formats: every date shows the year in the picked format; old md/dm values still work', () => {
  const want = { mdy: 'Nov 7, 2026', dmy: '7 Nov 2026', mdy_long: 'November 7, 2026', mdy_num: '11/07/2026', dmy_num: '07/11/2026', dmy_dot: '07.11.2026', ymd: '2026-11-07' };
  assert.deepEqual(WT.DATE_FORMATS, Object.keys(want));
  try {
    for (const [k, v] of Object.entries(want)) {
      assert.equal(WT.formatDate('2026-11-07', k), v);
      WT.setDisplay({ dateFormat: k });
      assert.equal(WT.shortDate('2026-11-07'), v, k);
      assert.equal(WT.dateLabel('2026-11-07'), 'Sat, ' + v, k);
      assert.equal(WT.dateLabel('2026-11-07', true), 'Sat, ' + v, k); // withYear still works
    }
    WT.setDisplay({ dateFormat: 'md' }); assert.equal(WT.shortDate('2026-11-07'), 'Nov 7, 2026'); assert.equal(WT.display().dateOrder, 'md');
    WT.setDisplay({ dateOrder: 'dm' }); assert.equal(WT.shortDate('2026-11-07'), '7 Nov 2026'); assert.equal(WT.display().dateOrder, 'dm');
    WT.setDisplay({ dateFormat: 'bogus' }); assert.equal(WT.display().dateFormat, 'dmy', 'unknown values are ignored');
    assert.equal(WT.normDateFormat('md'), 'mdy'); assert.equal(WT.normDateFormat('dm'), 'dmy'); assert.equal(WT.normDateFormat('xx'), 'mdy');
    // month-only labels stay month + year
    assert.equal(WT.monthLabel('2026-11'), 'November 2026');
    // chart ticks stay compact
    WT.setDisplay({ dateFormat: 'mdy' }); assert.equal(WT.axisDate('2026-11-07'), 'Nov 7');
    WT.setDisplay({ dateFormat: 'dmy_num' }); assert.equal(WT.axisDate('2026-11-07'), '7/11');
    assert.equal(WT.shortDate(''), ''); assert.equal(WT.dateLabel(null), '');
  } finally { WT.setDisplay({ dateFormat: 'mdy' }); }
});

test('zero-decimal currencies show whole amounts (still cents underneath)', () => {
  try {
    WT.setDisplay({ symbol: '¥', decimals: 0 });
    assert.equal(WT.fmt(123456), '¥1,235'); // 1,234.56 rounds half up
    assert.equal(WT.fmt(123449), '¥1,234');
    assert.equal(WT.fmt(-150000), '-¥1,500');
    assert.equal(WT.fmt(-20), '¥0');
    assert.equal(WT.fmt(123456, { noCents: true }), '¥1,235');
    WT.setDisplay({ symbol: 'kr ', decimals: 2 });
    assert.equal(WT.fmt(123456), 'kr 1,234.56');
  } finally { WT.setDisplay({ symbol: '$', decimals: 2 }); }
  assert.equal(WT.fmt(123456), '$1,234.56');
});

test('data check: duplicate bills and orphan payments are listed and cleaned up without losing money records', () => {
  const ctx = fresh();
  assert.deepEqual(WT.integrityIssues(), []);
  const nov = inst('bill_apartment', '2026-11'); const gym = inst('bill_gym', '2026-11'); const car = inst('bill_carloan', '2026-11');
  // 1) a plain extra copy (no payments) next to a paid original
  WT.markPaid(nov.id, '2026-11-01');
  const dupA = Object.assign({}, nov, { id: 'i_dupA', createdAt: '2026-11-05' }); WT.save('instances', dupA);
  // 2) the extra copy holds the only (partial) payment: it is kept, the original goes, and regeneration can't bring it back
  const dupG = Object.assign({}, gym, { id: 'i_dupG' }); WT.save('instances', dupG);
  const gp = WT.recordPayment('i_dupG', { amountCents: 100, date: '2026-11-02' });
  // 3) both copies paid in full: may have paid twice, never merged without asking
  const dupC = Object.assign({}, car, { id: 'i_dupC' }); WT.save('instances', dupC);
  WT.markPaid(car.id, '2026-11-03'); WT.markPaid('i_dupC', '2026-11-03');
  // 4) a payment whose bill is gone
  WT.save('payments', { id: 'pay_orphan', instanceId: 'i_missing', templateId: 'bill_gym', amountCents: 4200, date: '2026-10-02', voided: false });
  assert.equal(WT.integrity().length, 4, 'string version still works');
  const iss = WT.integrityIssues();
  const byTpl = t => iss.find(x => x.type === 'dupBill' && x.templateId === t);
  assert.equal(byTpl('bill_apartment').keepId, nov.id); assert.deepEqual(byTpl('bill_apartment').removeIds, ['i_dupA']); assert.equal(byTpl('bill_apartment').conflict, false);
  assert.equal(byTpl('bill_gym').keepId, 'i_dupG'); assert.equal(byTpl('bill_gym').conflict, false);
  assert.equal(byTpl('bill_carloan').conflict, true);
  const orphan = iss.find(x => x.type === 'orphanPayment');
  assert.equal(orphan.paymentId, 'pay_orphan'); assert.equal(orphan.amountCents, 4200); assert.match(orphan.text, /\$42\.00/);
  const paysBefore = Object.keys(WT.D.payments).length;
  // Clean up (safe ones only): the conflict and the orphan stay
  const r = WT.repairIntegrity(iss.filter(x => x.type === 'dupBill' && !x.conflict));
  assert.equal(r.fixed, 2);
  assert.ok(!WT.D.instances.i_dupA && WT.D.instances[nov.id]);
  assert.ok(WT.D.instances.i_dupG && !WT.D.instances[gym.id] && WT.D.templates.bill_gym.removedKeys.includes(gym.periodKey));
  assert.equal(WT.D.payments[gp.id].instanceId, 'i_dupG');
  assert.equal(Object.keys(WT.D.payments).length, paysBefore, 'no payment deleted');
  WT.ensureGenerated('2026-12'); assert.equal(WT.instancesForMonth('2026-11').filter(i => i.templateId === 'bill_gym').length, 1, 'the removed copy is not made again');
  assert.equal(WT.integrityIssues().filter(x => x.type === 'dupBill').length, 1);
  // a conflict is skipped unless merging was chosen; merging keeps both payments on one bill
  assert.equal(WT.repairIntegrity([byTpl('bill_carloan')]).fixed, 0);
  const m = WT.repairIntegrity([byTpl('bill_carloan')], { merge: true });
  assert.equal(m.fixed, 1);
  const kept = WT.D.instances[byTpl('bill_carloan').keepId];
  assert.equal(WT.paymentsFor(kept.id).filter(p => !p.voided).length, 2); assert.equal(WT.paidFor(kept.id), 2 * kept.amountCents);
  // undo puts every record back exactly
  WT.undoRepair(m.snapshot);
  assert.ok(WT.D.instances.i_dupC && WT.D.instances[car.id]);
  assert.equal(WT.paidFor('i_dupC'), car.amountCents); assert.equal(WT.paidFor(car.id), car.amountCents);
  // orphan payment: deleted only when passed in, undo brings it back; the persisted store follows
  const o = WT.repairIntegrity([orphan]); assert.equal(o.fixed, 1); assert.ok(!WT.D.payments.pay_orphan && !ctx.store.payments.pay_orphan);
  WT.undoRepair(o.snapshot); assert.equal(ctx.store.payments.pay_orphan.amountCents, 4200);
  // everything survives a restart
  reopen(ctx);
  assert.ok(!WT.D.instances.i_dupA && WT.D.instances.i_dupG && WT.D.payments.pay_orphan && WT.D.instances.i_dupC);
  assert.equal(WT.integrityIssues().length, 2);
});
