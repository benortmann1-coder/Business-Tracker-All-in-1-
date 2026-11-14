/* WealthTrack Pro: who gets the paid features.
 *
 * Pro is a one-time Google Play purchase (product ID "wealthtrack_pro").
 * The Android app is the only source of truth: its Play Billing code (ProBilling.java)
 * checks Google Play and keeps the result, and the page asks it through AndroidBridge.
 * Nothing about Pro is stored in WealthTrack's own data, so a backup file can't unlock it.
 *
 * Pro is only enforced in the Google Play build (BuildConfig.PRO_ENFORCED). The browser
 * version and sideloaded APKs have every feature unlocked, because Play Billing only works
 * for apps installed from Google Play.
 */
(function (root) {
  'use strict';
  const PRODUCT_ID = 'wealthtrack_pro';

  // What Pro unlocks. Keys are used by the gates in app.js.
  const FEATURES = [
    ['drive', 'Automatic Google Drive backup', 'Your data is copied to your own Google Drive as you go, so a lost phone never costs you your records.'],
    ['reports', 'Reports and trends', 'Month-to-month comparison, 12-month trends, debt trend and the yearly table.'],
    ['export', 'Excel and CSV export', 'Every bill, payment, purchase and paycheck in a spreadsheet.'],
    ['payoff', 'Debt payoff planner', 'Snowball vs. avalanche, your debt-free date and the interest you save.'],
    ['smart', 'Smart Budget', 'A paycheck-by-paycheck plan for needs, debt, savings and fun money.'],
  ];
  const ROUTES = ['reports', 'smart']; // whole pages that need Pro
  const FREE_ALWAYS = ['backup', 'restore', 'driveRestore']; // getting your data out is never locked

  function call(bridge, name) {
    try { return bridge && typeof bridge[name] === 'function' ? bridge[name]() : undefined; } catch (e) { return undefined; }
  }

  /** bridge: window.AndroidBridge (or a stand-in in tests), or null in a browser. */
  function create(bridge) {
    const api = {
      PRODUCT_ID, FEATURES, ROUTES, FREE_ALWAYS,
      /** True only in the Google Play build. */
      enforced: () => call(bridge, 'proEnforced') === true,
      /** True when Google Play says this account bought Pro. */
      owned: () => call(bridge, 'proOwned') === true,
      /** The single answer every gate uses. */
      isPro: () => !api.enforced() || api.owned(),
      /** Can this install buy Pro right now? (Play build, billing connected) */
      canBuy: () => api.enforced() && call(bridge, 'proAvailable') === true,
      /** Play's localized price, e.g. "$4.99", or '' until it's loaded. */
      price: () => { const p = call(bridge, 'proPrice'); return typeof p === 'string' && p.length <= 32 ? p : ''; },
      /** 'owned' | 'pending' | 'none' | 'unlocked' (not enforced) */
      status: () => {
        if (!api.enforced()) return 'unlocked';
        if (api.owned()) return 'owned';
        return call(bridge, 'proPending') === true ? 'pending' : 'none';
      },
      allows: feature => FREE_ALWAYS.includes(feature) || api.isPro(),
      routeLocked: route => ROUTES.includes(route) && !api.isPro(),
      buy: () => { if (bridge && typeof bridge.proPurchase === 'function') bridge.proPurchase(); },
      restore: () => { if (bridge && typeof bridge.proRestore === 'function') bridge.proRestore(); },
    };
    return api;
  }

  const WTPro = { create, PRODUCT_ID, FEATURES, ROUTES, FREE_ALWAYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = WTPro;
  else root.WTPro = WTPro;
})(typeof window !== 'undefined' ? window : this);
