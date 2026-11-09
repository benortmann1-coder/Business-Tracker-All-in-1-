/* Starting data for a new install: the built-in categories and an empty Checking account.
 * WealthTrack never ships with anyone's bills, debts or paychecks: every install starts blank.
 * (The automated tests use made-up data from tests/fixtures/sample-data.js, which is not part of the app.)
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

  // Always blank (opts kept for compatibility with older callers).
  function seed(WT, opts) {
    const today = (opts && opts.today) || WT.todayStr();
    CATS.forEach(([id, name, color]) => WT.save('categories', { id, name, color, builtin: true }));
    WT.save('accounts', { id: 'acc_checking', name: 'Checking', type: 'checking', openingCents: 0, openingDate: today, inAvailable: true, order: 1 });
    WT.saveSettings({ seeded: 'blank', seededAt: today });
  }
  const api = { seed, CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTSeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
