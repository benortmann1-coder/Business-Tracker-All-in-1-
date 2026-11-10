// Performance benchmark on a large synthetic dataset: node wealthtrack/tests/perf.js
const W = require('../web/core.js');
const { seed } = require('./fixtures/sample-data.js'); // made-up sample data (17 bills, 6 debts)
W.setToday('2036-11-06');
W.init(null, { put() { }, del() { } });
seed(W, { today: '2026-11-06' });
// 53 monthly bills (17 sample + 36 extra) over ~10 years, every past instance paid; 5000 expenses
for (let k = 0; k < 36; k++) W.addTemplate({ name: 'Extra ' + k, amountCents: 1000 + k, anchor: '2026-11-' + String(1 + (k % 28)).padStart(2, '0'), frequency: 'monthly', category: 'cat_other' });
let t0 = Date.now();
W.ensureGenerated('2036-12');
const tGen = Date.now() - t0;
let n = 0;
for (const i of Object.values(W.D.instances)) if (i.dueDate < '2036-11-01') { W.recordPayment(i.id, { amountCents: i.amountCents, date: i.dueDate }); n++; }
const cats = Object.keys(W.D.categories);
for (let k = 0; k < 5000; k++) { const d = W.addDays('2026-11-06', k % 3650); W.addExpense({ amountCents: 100 + (k % 5000), category: cats[k % cats.length], date: d, sourceId: k % 10 === 0 ? 'debt:debt_visa' : 'acc_checking' }); }
cats.forEach(c => W.setBudget(c, 50000, true));
Object.values(W.D.budgets).forEach(b => { b.startMonth = '2026-11'; });
const time = (label, f, reps) => { reps = reps || 1; const s = process.hrtime.bigint(); let r; for (let k = 0; k < reps; k++) r = f(); const ms = Number(process.hrtime.bigint() - s) / 1e6 / reps; console.log(label.padEnd(34), ms.toFixed(1).padStart(9), 'ms'); return r; };
console.log(`dataset: ${Object.keys(W.D.instances).length} instances, ${n} payments, ${Object.keys(W.D.expenses).length} expenses`);
console.log('ensureGenerated (initial)'.padEnd(34), String(tGen).padStart(9), 'ms');
time('ensureGenerated (idempotent)', () => W.ensureGenerated('2036-12'), 3);
time('billsSummary(month)', () => W.billsSummary('2036-11'), 5);
time('monthSummary(month)', () => W.monthSummary('2036-11'), 5);
time('budgetStatus (rollover, 12+ mo)', () => W.budgetStatus('2036-11'), 2);
time('paycheckPlan', () => W.paycheckPlan(W.currentPaycheck().key), 5);
time('overdue()', () => W.overdue(), 3);
time('totalDebt()', () => W.totalDebt(), 3);
time('transactions()', () => W.transactions(), 3);
time('projection(60)', () => W.projection(60), 3);
time('dashboard-like render set', () => { const mk = '2036-11'; W.monthSummary(mk); for (let k = 5; k >= 0; k--) W.monthSummary(W.addMonthKey(mk, -k)); W.paycheckPlan(W.currentPaycheck().key); W.overdue(); W.projection(60); W.totalDebt(); W.budgetStatus(mk); }, 2);
time('accrueInterest (10 yrs catch-up)', () => W.accrueInterest('2036-11-06'));
time('accrueInterest (again, idempotent)', () => W.accrueInterest('2036-11-06'));
