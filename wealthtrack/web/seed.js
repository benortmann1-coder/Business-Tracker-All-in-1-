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
    // home ownership (all essential): added to older installs by ensureBuiltins()
    ['cat_mortgage', 'Mortgage', '#4f46e5'], ['cat_property_tax', 'Property tax', '#64748b'], ['cat_home_insurance', 'Homeowners insurance', '#0d9488'],
    ['cat_pmi', 'Mortgage insurance (PMI)', '#7c3aed'], ['cat_hoa', 'HOA fees', '#0891b2'], ['cat_home_maintenance', 'Home maintenance & repairs', '#b45309'],
  ];

  // Always blank (opts kept for compatibility with older callers).
  function seed(WT, opts) {
    const today = (opts && opts.today) || WT.todayStr();
    CATS.forEach(([id, name, color]) => WT.save('categories', { id, name, color, builtin: true }));
    WT.save('accounts', { id: 'acc_checking', name: 'Checking', type: 'checking', openingCents: 0, openingDate: today, inAvailable: true, order: 1 });
    WT.saveSettings({ seeded: 'blank', seededAt: today });
  }
  // Older installs only got the categories that existed when they were first set up. Adds any built-in
  // category that is missing, without touching the user's own categories: skipped when a category with the
  // same id exists (even hidden) or the user already has one with the same name. Safe to run on every start.
  function ensureBuiltins(WT) {
    const have = (WT.D && WT.D.categories) || {};
    const names = new Set(Object.values(have).filter(Boolean).map(c => String(c.name || '').trim().toLowerCase()));
    const added = [];
    CATS.forEach(([id, name, color]) => {
      if (Object.prototype.hasOwnProperty.call(have, id) || names.has(name.toLowerCase())) return;
      WT.save('categories', { id, name, color, builtin: true }); names.add(name.toLowerCase()); added.push(id);
    });
    return added;
  }
  const api = { seed, ensureBuiltins, CATS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTSeed = api;
})(typeof window !== 'undefined' ? window : globalThis);
