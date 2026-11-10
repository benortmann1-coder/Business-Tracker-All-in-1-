/* Made-up example data for the automated tests ONLY. It is never part of the app:
 * a real install always starts blank. Every name and amount here is fictional.
 *
 * Node tests:    const { seed } = require('./fixtures/sample-data.js'); seed(WT);
 * Browser tests: await ctx.addInitScript({ path: <this file> }) before opening the app;
 *                the app then loads this sample instead of starting blank (test hook only).
 */
(function (root) {
  'use strict';
  const CATS = [
    ['cat_housing', 'Housing', '#6366f1'], ['cat_utilities', 'Utilities', '#0ea5e9'], ['cat_vehicle', 'Vehicle', '#f97316'],
    ['cat_gas', 'Gas', '#eab308'], ['cat_groceries', 'Groceries', '#22c55e'], ['cat_restaurants', 'Restaurants', '#ef4444'],
    ['cat_shopping', 'Shopping', '#ec4899'], ['cat_insurance', 'Insurance', '#14b8a6'], ['cat_credit_cards', 'Credit cards', '#a855f7'],
    ['cat_loans', 'Loans', '#f43f5e'], ['cat_subscriptions', 'Subscriptions', '#8b5cf6'], ['cat_entertainment', 'Entertainment', '#06b6d4'],
    ['cat_healthcare', 'Healthcare', '#10b981'], ['cat_savings', 'Savings', '#84cc16'], ['cat_other', 'Other', '#94a3b8'],
    ['cat_phone', 'Phone & Internet', '#3b82f6'],
  ];

  function seed(WT, opts) {
    opts = opts || {};
    const today = opts.today || WT.todayStr();
    CATS.forEach(([id, name, color]) => WT.save('categories', { id, name, color, builtin: true }));
    if (opts.blank) { WT.save('accounts', { id: 'acc_checking', name: 'Checking', type: 'checking', openingCents: 0, openingDate: today, inAvailable: true, order: 1 }); WT.saveSettings({ seeded: 'blank', seededAt: today }); return; }

    WT.save('accounts', { id: 'acc_checking', name: 'Checking', type: 'checking', openingCents: 0, openingDate: today, inAvailable: true, order: 1, needsBalance: true });
    WT.save('accounts', { id: 'acc_savings', name: 'Savings', type: 'savings', openingCents: 0, openingDate: today, inAvailable: false, order: 2 });
    WT.save('accounts', { id: 'acc_cash', name: 'Cash', type: 'cash', openingCents: 0, openingDate: today, inAvailable: true, order: 3 });

    // Paycheck: $1,600 take-home every 2 weeks (Fridays), paid Nov 6 2026.
    WT.addIncome({ id: 'inc_job', name: 'Day job', employer: '', kind: 'net', netCents: 160000, grossCents: null, schedule: 'biweekly', anchor: '2026-11-06', startDate: '2026-10-23', accountId: 'acc_checking' });
    // $250 set aside from each paycheck for groceries and fuel.
    WT.saveSettings({ setAsides: [{ id: 'sa_food', name: 'Groceries & fuel', amountCents: 25000 }] });

    // Debts: id, name, type, balance, APR (x100), minimum, due day, limit. Two have no APR on purpose (missing-data tests).
    const debts = [
      ['debt_car', 'Car Loan', 'auto', 900000, 649, 38000, 10, null],
      ['debt_student', 'Student Loan', 'personal', 1500000, 499, 17500, 15, null],
      ['debt_visa', 'Visa Card', 'credit_card', 520000, 2499, 15000, 3, 800000],
      ['debt_store', 'Store Card', 'credit_card', 120000, 2899, 4000, 17, 300000],
      ['debt_furniture', 'Furniture Plan', 'other', 60000, 0, 5000, 20, null],
      ['debt_gascard', 'Gas Card', 'credit_card', 25000, 0, 3000, 2, 100000],
    ];
    debts.forEach(([id, name, type, bal, apr, min, dueDay, limit]) => WT.addDebt({ id, name, type, startBalanceCents: bal, startDate: today, aprCenti: apr, minCents: min, dueDay, limitCents: limit, autoInterest: apr > 0 }));

    // Monthly bills: id, name, cents, category, due day (Nov 2026), debtId, subscription
    const nov = d => '2026-11-' + String(d).padStart(2, '0');
    const bills = [
      ['bill_apartment', 'Apartment', 120000, 'cat_housing', 1, null],
      ['bill_electric', 'Electric', 9500, 'cat_utilities', 12, null],
      ['bill_water', 'Water', 4000, 'cat_utilities', 18, null],
      ['bill_internet', 'Internet', 6500, 'cat_phone', 8, null],
      ['bill_cell', 'Cell Phone', 5500, 'cat_phone', 22, null],
      ['bill_autoins', 'Auto Insurance', 11000, 'cat_insurance', 25, null],
      ['bill_carloan', 'Car Loan Payment', 38000, 'cat_loans', 10, 'debt_car'],
      ['bill_student', 'Student Loan Payment', 17500, 'cat_loans', 15, 'debt_student'],
      ['bill_visa', 'Visa Payment', 15000, 'cat_credit_cards', 3, 'debt_visa'],
      ['bill_store', 'Store Card Payment', 4000, 'cat_credit_cards', 17, 'debt_store'],
      ['bill_furniture', 'Furniture Plan Payment', 5000, 'cat_credit_cards', 20, 'debt_furniture'],
      ['bill_gascard', 'Gas Card Payment', 3000, 'cat_credit_cards', 2, 'debt_gascard'],
      ['bill_gym', 'Gym', 3500, 'cat_entertainment', 1, null],
      ['bill_music', 'Music Stream', 1099, 'cat_subscriptions', 4, null, true],
      ['bill_video', 'Video Stream', 1549, 'cat_subscriptions', 14, null, true],
      ['bill_cloud', 'Cloud Storage', 299, 'cat_subscriptions', 4, null, true],
      ['bill_news', 'News App', 799, 'cat_subscriptions', 9, null, true],
    ];
    bills.forEach(([id, name, cents, category, day, debtId, sub]) => WT.addTemplate({ id, name, amountCents: cents, category, anchor: nov(day), frequency: 'monthly', debtId, subscription: !!sub, accountId: 'acc_checking', payFrom: 'auto' }));
    WT.cancelTemplate('bill_news', '2026-11-01'); // one cancelled subscription
    WT.saveSettings({ seeded: 'sample', seededAt: today });
  }
  const api = { seed, CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTSampleSeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
