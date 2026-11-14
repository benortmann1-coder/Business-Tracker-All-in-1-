// WealthTrack Pro entitlement (web/pro.js). Run: node --test wealthtrack/tests/pro.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WTPro = require(path.join(__dirname, '../web/pro.js'));

// a stand-in for window.AndroidBridge
function bridge(o) {
  const calls = [];
  return Object.assign({
    calls,
    proEnforced: () => !!o.enforced,
    proOwned: () => !!o.owned,
    proPending: () => !!o.pending,
    proAvailable: () => o.available !== false,
    proPrice: () => o.price == null ? '$4.99' : o.price,
    proPurchase: () => calls.push('buy'),
    proRestore: () => calls.push('restore'),
  }, o.extra || {});
}

test('browser (no bridge): everything unlocked', () => {
  const p = WTPro.create(null);
  assert.equal(p.enforced(), false);
  assert.equal(p.isPro(), true);
  assert.equal(p.status(), 'unlocked');
  assert.equal(p.routeLocked('reports'), false);
  assert.equal(p.canBuy(), false);
  p.buy(); p.restore(); // no bridge: must not throw
});

test('older Android app without Pro methods: unlocked', () => {
  const p = WTPro.create({ appVersion: () => '1.5.6 (33)' });
  assert.equal(p.isPro(), true);
  assert.equal(p.status(), 'unlocked');
});

test('sideloaded / Drive APK (not enforced): unlocked even without a purchase', () => {
  const p = WTPro.create(bridge({ enforced: false, owned: false }));
  assert.equal(p.isPro(), true);
  assert.equal(p.allows('drive'), true);
  assert.equal(p.routeLocked('smart'), false);
});

test('Play build, not bought: Pro features locked, data-out stays free', () => {
  const b = bridge({ enforced: true, owned: false });
  const p = WTPro.create(b);
  assert.equal(p.isPro(), false);
  assert.equal(p.status(), 'none');
  for (const f of ['drive', 'reports', 'export', 'payoff', 'smart']) assert.equal(p.allows(f), false, f);
  for (const f of ['backup', 'restore', 'driveRestore']) assert.equal(p.allows(f), true, f);
  assert.equal(p.routeLocked('reports'), true);
  assert.equal(p.routeLocked('smart'), true);
  for (const r of ['dashboard', 'bills', 'paychecks', 'calendar', 'expenses', 'debts', 'goals', 'progress', 'history', 'settings']) assert.equal(p.routeLocked(r), false, r);
  assert.equal(p.canBuy(), true);
  assert.equal(p.price(), '$4.99');
  p.buy(); p.restore();
  assert.deepEqual(b.calls, ['buy', 'restore']);
});

test('Play build, bought: unlocked', () => {
  const p = WTPro.create(bridge({ enforced: true, owned: true }));
  assert.equal(p.isPro(), true);
  assert.equal(p.status(), 'owned');
  assert.equal(p.routeLocked('reports'), false);
});

test('Play build, payment pending: still locked until Play confirms', () => {
  const p = WTPro.create(bridge({ enforced: true, owned: false, pending: true }));
  assert.equal(p.isPro(), false);
  assert.equal(p.status(), 'pending');
});

test('entitlement is read live from the bridge (refund turns Pro off)', () => {
  const state = { enforced: true, owned: true };
  const p = WTPro.create({ proEnforced: () => state.enforced, proOwned: () => state.owned });
  assert.equal(p.isPro(), true);
  state.owned = false;
  assert.equal(p.isPro(), false);
});

test('a bridge that throws or returns junk never unlocks the Play build', () => {
  const p = WTPro.create({ proEnforced: () => true, proOwned: () => { throw new Error('boom'); }, proPrice: () => 'x'.repeat(500) });
  assert.equal(p.isPro(), false);
  assert.equal(p.price(), '');
  const q = WTPro.create({ proEnforced: () => true, proOwned: () => 'true' }); // must be a real boolean
  assert.equal(q.isPro(), false);
});

test('a bridge whose proEnforced throws falls back to unlocked (not the Play build)', () => {
  const p = WTPro.create({ proEnforced: () => { throw new Error('x'); } });
  assert.equal(p.isPro(), true);
});

test('product ID and feature list', () => {
  assert.equal(WTPro.PRODUCT_ID, 'wealthtrack_pro');
  assert.deepEqual(WTPro.FEATURES.map(f => f[0]), ['drive', 'reports', 'export', 'payoff', 'smart']);
});
