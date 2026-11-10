/* Demonstration budget for new users: exactly 6 fictional bills and 2 fictional debts.
 * It is loaded into memory only while the app shows the DEMO banner and is never saved,
 * never backed up and never mixed with real records. All names and amounts are made up.
 */
(function (root) {
  'use strict';
  function load(WT, opts) {
    opts = opts || {};
    const today = opts.today || WT.todayStr();
    const mk = today.slice(0, 7);
    const day = d => mk + '-' + String(d).padStart(2, '0');
    const S = root.WTSeed || (typeof require === 'function' ? require('./seed.js') : null);
    if (S) S.seed(WT, { blank: true, today });
    WT.save('accounts', Object.assign({}, WT.D.accounts.acc_checking, { openingCents: 125000 })); // fictional checking balance
    WT.save('accounts', { id: 'acc_demo_savings', name: 'Savings', type: 'savings', openingCents: 150000, openingDate: today, inAvailable: false, order: 2 });
    // Pay: $2,300 every two weeks, starting on the most recent Friday.
    const t = new Date(today + 'T12:00:00'); const back = (t.getDay() + 2) % 7; t.setDate(t.getDate() - back);
    const anchor = t.toISOString().slice(0, 10);
    WT.addIncome({ id: 'inc_demo', name: 'Demo paycheck', employer: '', kind: 'net', netCents: 230000, grossCents: null, schedule: 'biweekly', anchor, startDate: anchor, accountId: 'acc_checking' });
    WT.saveSettings({ setAsides: [{ id: 'sa_demo_food', name: 'Groceries & gas', amountCents: 30000 }] });
    // 2 debts
    WT.addDebt({ id: 'debt_demo_card', name: 'Demo Credit Card', type: 'credit_card', startBalanceCents: 380000, startDate: today, aprCenti: 2199, minCents: 11500, dueDay: 12, limitCents: 600000, autoInterest: true });
    WT.addDebt({ id: 'debt_demo_auto', name: 'Demo Auto Loan', type: 'auto', startBalanceCents: 1240000, startDate: today, aprCenti: 689, minCents: 34500, dueDay: 20, limitCents: null, autoInterest: true });
    // 6 bills (two of them pay the debts above)
    const bills = [
      ['bill_demo_home', 'Demo Rent', 115000, 'cat_housing', 1, null],
      ['bill_demo_power', 'Demo Electric', 11000, 'cat_utilities', 9, null],
      ['bill_demo_net', 'Demo Internet', 6000, 'cat_phone', 15, null],
      ['bill_demo_ins', 'Demo Car Insurance', 9500, 'cat_insurance', 24, null],
      ['bill_demo_card', 'Demo Credit Card Payment', 11500, 'cat_credit_cards', 12, 'debt_demo_card'],
      ['bill_demo_auto', 'Demo Auto Loan Payment', 34500, 'cat_loans', 20, 'debt_demo_auto'],
    ];
    bills.forEach(([id, name, cents, category, d, debtId]) => WT.addTemplate({ id, name, amountCents: cents, category, anchor: day(d), frequency: 'monthly', debtId, subscription: false, accountId: 'acc_checking', payFrom: 'auto' }));
    WT.saveSettings({ seeded: 'demo', seededAt: today, demo: true });
  }
  const api = { load, BILLS: 6, DEBTS: 2 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
