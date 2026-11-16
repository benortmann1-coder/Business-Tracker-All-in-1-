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
      window.__gd.tries = (window.__gd.tries || 0) + 1;
      // phone without internet (what GoogleDriveBackup.java sends for UnknownHostException & co.)
      if (window.__gd.mode === 'offline') return send({ op: 'backup', ok: false, offline: true, error: 'No internet connection. Backup will try again when you\'re back online.' });
      // an older app build that passes the raw Java message through
      if (window.__gd.mode === 'offline-raw') return send({ op: 'backup', ok: false, error: 'Unable to resolve host "www.googleapis.com": No address associated with hostname' });
      if (window.__gd.mode === 'error') return send({ op: 'backup', ok: false, error: 'Google Drive error 500' });
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
  // no internet when an automatic backup runs: shown as waiting (amber), retried when back online
  await page.clock.runFor(70000);
  await page.evaluate(() => { window.__gd.mode = 'offline'; window.__gd.tries = 0; const i = Object.values(WT.D.instances).find(x => x.templateId === 'bill_gym' && WT.instStatus(x).remaining > 0); WT.markPaid(i.id); }); await settle(page);
  await page.clock.runFor(65000);
  await page.evaluate(() => { location.hash = '#/settings/data'; WTApp.refresh(); }); await page.clock.runFor(200);
  const offTxt = await row().textContent();
  ok(await page.evaluate(() => window.__gd.tries) === 1 && /No internet connection\. Backup will try again when you're back online\./.test(offTxt) && await row().locator('.neg').count() === 0 && await row().locator('.warn').count() === 1 && /Last backup/.test(offTxt) && !/Unable to resolve host/.test(offTxt), 'offline: clear waiting message (amber, not a red error), last backup still shown');
  ok(await row().locator('[data-act=gdBackup]', { hasText: 'Back up now' }).count() === 1, 'offline: "Back up now" button appears');
  // backoff: tries again on its own after ~30 s, then ~1 min (not in a tight loop)
  await page.clock.runFor(31000); const t2 = await page.evaluate(() => window.__gd.tries);
  await page.clock.runFor(20000); const t2b = await page.evaluate(() => window.__gd.tries);
  await page.clock.runFor(45000); const t3 = await page.evaluate(() => window.__gd.tries);
  ok(t2 === 2 && t2b === 2 && t3 === 3, 'offline: retries with backoff (' + [t2, t2b, t3].join(',') + ')');
  // back online: the "online" event backs up right away and clears the message
  await page.evaluate(() => { window.__gd.mode = 'ok'; window.dispatchEvent(new Event('online')); }); await page.clock.runFor(4000);
  ok(await page.evaluate(() => window.__gd.tries) === 4 && await page.evaluate(() => Object.values(JSON.parse(window.__gd.drive).data.payments).some(p => p.templateId === 'bill_gym' && !p.voided)), 'back online: the waiting backup runs and includes the change');
  await page.evaluate(() => WTApp.refresh()); await page.clock.runFor(200);
  ok(!/No internet/.test(await row().textContent()) && await row().locator('[data-act=gdBackup]').count() === 0, 'after a good backup the message and button go away');
  ok(await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('wt.gd')); return !s.offline && !s.err; }), 'offline flag cleared after the next successful backup');
  // nothing to do: online/foreground events don't back up when the last one worked
  await page.evaluate(() => { window.dispatchEvent(new Event('online')); }); await page.clock.runFor(5000);
  ok(await page.evaluate(() => window.__gd.tries) === 4, 'no extra backup when nothing failed');
  // an older build's raw "Unable to resolve host" is treated the same way; coming back to the app retries
  await page.evaluate(() => { window.__gd.mode = 'offline-raw'; });
  await page.evaluate(() => WTApp.refresh()); await page.clock.runFor(100);
  await page.evaluate(() => { const i = Object.values(WT.D.instances).find(x => x.templateId === 'bill_internet' && WT.instStatus(x).remaining > 0) || Object.values(WT.D.instances).find(x => WT.instStatus(x).remaining > 0); WT.markPaid(i.id); }); await settle(page); await page.clock.runFor(65000);
  await page.evaluate(() => WTApp.refresh()); await page.clock.runFor(200);
  ok(/No internet connection/.test(await row().textContent()) && !/Unable to resolve host/.test(await row().textContent()) && await row().locator('.neg').count() === 0, 'raw "Unable to resolve host" from an older build shows as waiting for internet');
  const before5 = await page.evaluate(() => window.__gd.tries);
  await page.evaluate(() => { window.__gd.mode = 'ok'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); await page.clock.runFor(4000);
  ok(await page.evaluate(() => window.__gd.tries) === before5 + 1 && await page.evaluate(() => !JSON.parse(localStorage.getItem('wt.gd')).offline), 'returning to the app retries the waiting backup');
  // "Back up now" after a real error; a manual tap while offline gives a calm toast
  await page.evaluate(() => { window.__gd.mode = 'error'; }); await page.evaluate(() => WT.saveSettings({ tips: WT.settings().tips })); await settle(page); await page.clock.runFor(65000);
  await page.evaluate(() => WTApp.refresh()); await page.clock.runFor(200);
  ok(await row().locator('.neg', { hasText: 'Google Drive error 500' }).count() === 1 && await row().locator('[data-act=gdBackup]').count() === 1, 'a real Drive error stays red, with "Back up now"');
  await page.evaluate(() => { window.__gd.mode = 'offline'; }); await row().locator('[data-act=gdBackup]').click(); await page.clock.runFor(300);
  ok(await page.locator('#toasts .toast:not(.err)', { hasText: 'No internet connection' }).count() >= 1, 'tapping "Back up now" offline explains it will try again (not an error toast)');
  await page.evaluate(() => { window.__gd.mode = 'ok'; }); await row().locator('[data-act=gdBackup]').click(); await page.clock.runFor(300);
  ok(await row().locator('[data-act=gdBackup]').count() === 0 && /Last backup/.test(await row().textContent()), '"Back up now" works once online and the row goes back to normal');
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
