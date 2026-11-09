// Google Drive backup (Sign in with Google) — tested against a stand-in for the Android bridge,
// since Google sign-in itself only runs on a real phone.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/gdrive.js
const { chromium } = require('playwright');
const __skipOnb = async c => { await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) {} }); return c; };
const path = require('path');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js'); // made-up test data (the app itself starts blank)
let pass = 0, fail = 0;
// saving to IndexedDB runs in real time even with a fake clock: let it finish
const settle = async page => { await page.clock.runFor(100); await page.waitForTimeout(250); await page.clock.runFor(50); await page.waitForTimeout(100); };
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

const fakeBridge = () => {
  const send = d => setTimeout(() => window.dispatchEvent(new CustomEvent('googledrive', { detail: d })), 30);
  window.__gd = { backups: [], mode: 'ok', drive: null };
  window.AndroidBridge = {
    googleDriveSupported: () => true,
    googleSignIn() { send({ op: 'signin', ok: true, email: 'alex@example.com' }); },
    googleBackup(json) {
      if (window.__gd.mode === 'signin-required') return send({ op: 'backup', ok: false, error: 'signin-required' });
      window.__gd.backups.push(json); window.__gd.drive = json; send({ op: 'backup', ok: true, time: Date.now() });
    },
    googleRestore() { send(window.__gd.drive ? { op: 'restore', ok: true } : { op: 'restore', ok: false, error: 'No WealthTrack backup was found in this Google Drive yet' }); },
    googleRestoreData() { return window.__gd.drive; },
    saveFile: () => 'ok:Downloads/x', shareFile: () => 'ok', setReminders() { }, requestNotificationPermission() { }, notificationsEnabled: () => true, appVersion: () => '1.2.1 (13)',
  };
};

(async () => {
  const browser = await chromium.launch();
  // 1) Browser version (no Android bridge): shows "Android app only"
  {
    const p = await (await __skipOnb(await browser.newContext())).newPage();
    await p.goto(FILE); await p.waitForFunction(() => window.__wtReady);
    await p.evaluate(() => { location.hash = '#/settings/data'; }); await p.waitForTimeout(150);
    ok((await p.locator('.set-row', { hasText: 'Google Drive backup' }).textContent()).includes('Android app only'), 'browser version explains Drive backup is in the Android app');
    // no sample data injected here: a new install starts blank
    ok(await p.evaluate(() => Object.keys(WT.D.templates).length === 0 && Object.keys(WT.D.debts).length === 0 && Object.keys(WT.D.incomes || {}).length === 0 && Object.keys(WT.D.instances).length === 0), 'without sample data the app starts blank (no bills, debts or income)');
  }
  // 2) Android app with the bridge
  const ctx = await browser.newContext(); await __skipOnb(ctx); await ctx.addInitScript({ path: SAMPLE }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await ctx.addInitScript(fakeBridge);
  await page.clock.install();
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
  await page.evaluate(() => { location.hash = '#/settings/data'; }); await page.clock.runFor(200);
  const row = () => page.locator('.set-row', { hasText: 'Google Drive backup' });
  ok(await row().locator('[data-act=gdSignIn]').count() === 1, 'shows "Sign in with Google"');
  await row().locator('[data-act=gdSignIn]').click(); await page.clock.runFor(500);
  ok(await page.evaluate(() => WT.settings().gdrive && WT.settings().gdrive.on && WT.settings().gdrive.email === 'alex@example.com'), 'signing in turns backup on and remembers the account');
  ok(await page.evaluate(() => window.__gd.backups.length) === 1, 'backs up right after signing in');
  const first = JSON.parse(await page.evaluate(() => window.__gd.drive));
  ok(first.app === 'WealthTrack' && first.data && Object.keys(first.data.templates).length === 17 && Object.keys(first.data.debts).length === 6, 'backup is a full WealthTrack backup (all 17 sample bills, 6 debts)');
  ok((await row().textContent()).includes('alex@example.com') && (await row().textContent()).includes('Last backup'), 'settings shows the account and last backup time');
  // automatic backup a minute after a change
  await page.clock.runFor(1000); await page.waitForTimeout(300); await page.clock.runFor(1000);
  await page.evaluate(() => { const i = Object.values(WT.D.instances).find(x => x.templateId === 'bill_carloan'); WT.markPaid(i.id); WTApp.refresh(); });
  await settle(page);
  await page.clock.runFor(30000);
  ok(await page.evaluate(() => window.__gd.backups.length) === 1, 'no backup before the 1-minute wait');
  await page.clock.runFor(35000);
  ok(await page.evaluate(() => window.__gd.backups.length) === 2, 'automatic backup about a minute after a change');
  ok(await page.evaluate(() => Object.values(JSON.parse(window.__gd.drive).data.payments).some(p => !p.voided)), 'the automatic backup includes the new payment');
  // nothing changed -> no extra backups (no loop from saving status)
  await page.clock.runFor(5 * 60000);
  ok(await page.evaluate(() => window.__gd.backups.length) === 2, 'no repeated backups when nothing changed');
  // the Drive row only shows status: no manual backup / restore / turn-off buttons
  await page.evaluate(() => { location.hash = '#/settings/data'; WTApp.refresh(); }); await page.clock.runFor(200);
  ok(await row().locator('[data-act=gdBackup], [data-act=gdRestore], [data-act=gdOff]').count() === 0 && /automatically/.test(await row().textContent()) && await row().locator('.pill', { hasText: 'On' }).count() === 1, 'Drive row is status only (backs up automatically)');
  // leaving the app with unsaved-to-Drive changes backs up right away
  await page.evaluate(() => { WT.markPaid(Object.values(WT.D.instances).find(x => x.templateId === 'bill_apartment').id); }); await settle(page);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await page.clock.runFor(300);
  ok(await page.evaluate(() => window.__gd.backups.length) === 3, 'backs up when you leave the app');
  // restore is offered on a new or reset phone
  await page.evaluate(() => { WT.deleteTemplate('bill_gym'); localStorage.setItem('wt.restoreAfterReset', '1'); location.hash = '#/settings/data'; WTApp.refresh(); }); await page.clock.runFor(200);
  await row().locator('[data-act=gdRestore]').click(); await page.clock.runFor(400);
  ok(await page.locator('.overlay h2', { hasText: 'Restore' }).count() === 1, 'restore asks before replacing anything');
  const pre = page.locator('.overlay input[name=pre]'); if (await pre.count()) await pre.uncheck();
  await page.locator('.overlay button[type=submit]').click(); for (let k = 0; k < 6; k++) await settle(page);
  ok(await page.evaluate(() => WT.D.templates.bill_gym && !WT.D.templates.bill_gym.deleted && Object.values(WT.D.templates).every(t => !t.deleted)), 'restore from Drive brings back the backed-up data (deleted Gym bill is back)');
  // Google asks to sign in again
  await page.evaluate(() => { window.__gd.mode = 'signin-required'; WTApp.refresh(); }); await page.clock.runFor(200);
  await page.evaluate(() => { WT.markPaid(Object.values(WT.D.instances).find(x => x.templateId === 'bill_carloan' && x.status !== 'paid').id); }); await settle(page); await page.clock.runFor(65000);
  await page.evaluate(() => { location.hash = '#/settings/data'; WTApp.refresh(); }); await page.clock.runFor(200);
  ok(await row().locator('[data-act=gdSignIn]', { hasText: 'Sign in again' }).count() === 1, 'shows "Sign in again" when Google needs it');
  await page.evaluate(() => { window.__gd.mode = 'ok'; });
  await row().locator('[data-act=gdSignIn]').click(); await page.clock.runFor(600);
  ok(await row().locator('.pill', { hasText: 'On' }).count() === 1, 'signing in again restores normal backups');
  // signing out of Google (Personal info) stops backups
  await page.evaluate(() => { location.hash = '#/settings/personal'; WTApp.refresh(); }); await page.clock.runFor(200);
  await page.click('[data-act=signOut]'); await page.clock.runFor(200);
  await page.locator('.overlay button[type=submit], .overlay .btn.danger').first().click(); await page.clock.runFor(300);
  await page.locator('.auth [data-auth=skip]').click(); await page.clock.runFor(200);
  const before = await page.evaluate(() => window.__gd.backups.length);
  await page.evaluate(() => { const i = Object.values(WT.D.instances).find(x => x.templateId === 'bill_apartment' && x.status !== 'paid'); if (i) WT.markPaid(i.id); }); await settle(page); await page.clock.runFor(120000);
  ok(await page.evaluate(() => !WT.settings().gdrive.on) && await page.evaluate(() => window.__gd.backups.length) === before, 'signing out stops automatic backups');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
