// WealthTrack Pro gates in a real browser, against a stand-in for the Android bridge
// (Play Billing itself only runs on a phone installed from Google Play).
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/pro-ui.js
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js'); // made-up test data
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const skipOnb = () => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } };

// enforced: the Google Play build. owned: what Play says.
const fakeBridge = ({ enforced, owned }) => {
  const send = d => setTimeout(() => window.dispatchEvent(new CustomEvent('wtpro', { detail: d })), 30);
  window.__pro = { enforced, owned, buys: 0, restores: 0, backups: 0 };
  window.AndroidBridge = {
    proEnforced: () => window.__pro.enforced, proOwned: () => window.__pro.owned, proPending: () => false,
    proAvailable: () => true, proPrice: () => '$4.99',
    proPurchase() { window.__pro.buys++; window.__pro.owned = true; send({ op: 'purchase', ok: true, owned: true, pending: false }); },
    proRestore() { window.__pro.restores++; send({ op: 'restore', ok: true, owned: window.__pro.owned, pending: false }); },
    googleDriveSupported: () => true, googleSignIn() { }, googleBackup() { window.__pro.backups++; }, googleRestore() { }, googleRestoreData: () => null,
    saveFile: () => 'ok:Downloads/x', shareFile: () => 'ok', setReminders() { }, requestNotificationPermission() { }, notificationsEnabled: () => true, appVersion: () => '1.6.0 (34)',
  };
};

async function open(browser, bridge) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(skipOnb); await ctx.addInitScript({ path: SAMPLE });
  if (bridge) await ctx.addInitScript(fakeBridge, bridge);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
  const go = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(150); };
  return { page, go, errors, ctx };
}

(async () => {
  const browser = await chromium.launch();

  // 1) browser version: everything unlocked
  {
    const { page, go, errors } = await open(browser, null);
    await go('#/reports'); ok(await page.locator('.pro-page').count() === 0 && /Reports/.test(await page.locator('#main h1').textContent()), 'browser: Reports opens');
    await go('#/smart'); ok(await page.locator('.pro-page').count() === 0, 'browser: Smart Budget opens');
    await go('#/debts'); ok(await page.locator('#pxtra').count() === 1, 'browser: debt payoff planner shows');
    await go('#/settings/pro'); ok(/unlocked/i.test(await page.locator('#main').textContent()), 'browser: Pro settings say everything is unlocked');
    ok(errors.length === 0, 'browser: no page errors ' + errors.join(' | '));
  }

  // 2) sideloaded APK (bridge present, not enforced): unlocked
  {
    const { page, go } = await open(browser, { enforced: false, owned: false });
    await go('#/reports'); ok(await page.locator('.pro-page').count() === 0, 'sideloaded APK: Reports opens without buying');
    await go('#/debts'); ok(await page.locator('#pxtra').count() === 1, 'sideloaded APK: payoff planner shows');
  }

  // 3) Google Play build, not bought
  {
    const { page, go, errors } = await open(browser, { enforced: true, owned: false });
    await go('#/reports'); ok(await page.locator('.pro-page').count() === 1 && await page.locator('#main .tbl').count() === 0, 'Play, free: Reports shows the Pro page, not the report');
    await go('#/smart'); ok(await page.locator('.pro-page').count() === 1, 'Play, free: Smart Budget shows the Pro page');
    await go('#/debts');
    ok(await page.locator('#pxtra').count() === 0 && await page.locator('.pro-lock [data-act=proUpgrade]').count() === 1, 'Play, free: payoff planner locked, debt accounts still listed');
    ok(await page.locator('.debt-row:not(.debt-head)').count() > 0, 'Play, free: debts themselves are still shown');
    await go('#/bills'); ok(await page.locator('.pro-page').count() === 0, 'Play, free: Bills is free');
    await go('#/history'); ok(await page.locator('.pro-page').count() === 0, 'Play, free: History list is free');
    // export -> upgrade dialog instead of a file
    await go('#/settings/data');
    await page.locator('[data-act=exportXlsx]').click(); await page.waitForTimeout(100);
    ok(await page.locator('.modal h2', { hasText: 'WealthTrack Pro' }).count() === 1, 'Play, free: Excel export opens the Pro dialog');
    ok(/\$4\.99/.test(await page.locator('.modal').textContent()) && await page.locator('.modal [data-act=proRestore]').count() === 1, 'Pro dialog shows the Play price and Restore purchase');
    await page.locator('.modal [data-close]').last().click(); await page.waitForTimeout(80);
    // JSON backup stays free
    ok(await page.locator('[data-act=backup]').count() === 1, 'Play, free: file backup button is there');
    await page.locator('[data-act=backup]').click(); await page.waitForTimeout(150);
    ok(await page.locator('.modal h2', { hasText: 'WealthTrack Pro' }).count() === 0, 'Play, free: file backup does not ask for Pro');
    await page.evaluate(() => { document.querySelectorAll('.overlay').forEach(o => o.remove()); });
    // Drive backup: signed in but not Pro -> no automatic backups, restore still offered
    await page.evaluate(() => { localStorage.removeItem('wt.restoreAfterReset'); WT.saveSettings({ gdrive: { on: true, email: 'alex@example.com' }, account: { email: 'alex@example.com' } }); WTApp.refresh(); });
    await go('#/settings/data');
    const row = page.locator('.set-row', { hasText: 'Google Drive backup' });
    ok(await row.locator('[data-act=gdRestore]').count() === 1 && await row.locator('[data-act=proUpgrade]').count() === 1, 'Play, free: Drive row offers Restore and Get Pro');
    await page.evaluate(() => { WT.markPaid(Object.values(WT.D.instances).find(i => i.status !== 'paid').id); });
    await page.waitForTimeout(400);
    const hide = () => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
    await hide(); await page.waitForTimeout(150); // leaving the app backs up right away when Drive backup runs
    ok(await page.evaluate(() => window.__pro.backups) === 0, 'Play, free: no automatic Drive backup');
    // buy
    await page.locator('[data-act=proUpgrade]').first().click(); await page.waitForTimeout(100);
    await page.locator('.modal button[type=submit]').click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__pro.buys) === 1, 'Upgrade starts the Play purchase');
    ok(await page.locator('.modal h2', { hasText: 'WealthTrack Pro' }).count() === 0, 'dialog closes once Play confirms');
    await page.evaluate(() => { WT.markPaid(Object.values(WT.D.instances).find(i => i.status !== 'paid').id); }); await page.waitForTimeout(400);
    await hide(); await page.waitForTimeout(150);
    ok(await page.evaluate(() => window.__pro.backups) >= 1, 'after buying: Drive backup runs');
    await go('#/reports'); ok(await page.locator('.pro-page').count() === 0, 'after buying: Reports opens');
    await go('#/debts'); ok(await page.locator('#pxtra').count() === 1, 'after buying: payoff planner shows');
    await go('#/settings/pro'); ok(/Pro is on/.test(await page.locator('#main').textContent()), 'after buying: Settings says Pro is on');
    ok(errors.length === 0, 'Play: no page errors ' + errors.join(' | '));
  }

  // 4) Google Play build, already bought on another phone: Restore purchase
  {
    const { page, go } = await open(browser, { enforced: true, owned: false });
    await go('#/settings/pro');
    ok(await page.locator('#main [data-act=proRestore]').count() === 1, 'Play: Settings has Restore purchase');
    await page.evaluate(() => { window.__pro.owned = true; });
    await page.locator('#main [data-act=proRestore]').click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__pro.restores) === 1 && /Pro is on/.test(await page.locator('#main').textContent()), 'Restore purchase turns Pro on');
  }

  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
