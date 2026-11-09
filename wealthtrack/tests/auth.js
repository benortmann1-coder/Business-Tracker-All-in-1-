// Sign-in pages: first-run PIN setup, unlock, forgot PIN, auto-lock (browser), and the Android
// flow (Google sign-in, fingerprint, reset + restore) against a stand-in for the Android bridge.
// Real Google sign-in and the fingerprint sensor only run on a phone.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/auth.js [--shots <dir>]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js'); // made-up test data (the app itself starts blank)
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

// Stand-in for the Android bridge. State lives in localStorage so it survives reloads, like the phone.
const fakeBridge = () => {
  const ls = (k, v) => { if (v === undefined) return localStorage.getItem('fake.' + k); if (v === null) localStorage.removeItem('fake.' + k); else localStorage.setItem('fake.' + k, v); };
  const send = (n, d) => setTimeout(() => window.dispatchEvent(new CustomEvent(n, { detail: d })), 30);
  let taken = null;
  window.__fake = { ls };
  window.AndroidBridge = {
    googleDriveSupported: () => true,
    googleSignIn() { ls('signins', String(+(ls('signins') || 0) + 1)); send('googledrive', ls('signinFail') ? { op: 'signin', ok: false, error: 'Network error' } : { op: 'signin', ok: true, email: 'alex@example.com' }); },
    googleBackup(json) { ls('backups', String(+(ls('backups') || 0) + 1)); ls('drive', json); send('googledrive', { op: 'backup', ok: true, time: Date.now() }); },
    googleRestore() { ls('restores', String(+(ls('restores') || 0) + 1)); send('googledrive', ls('drive') ? { op: 'restore', ok: true } : { op: 'restore', ok: false, error: 'No WealthTrack backup was found in this Google Drive yet' }); },
    googleRestoreData() { return ls('drive'); },
    biometricStatus: () => ls('bioPin') ? 'enabled' : 'available',
    biometricEnable(pin) { ls('bioPin', pin); send('biometric', { op: 'enable', ok: true }); },
    biometricUnlock() { ls('bioPrompts', String(+(ls('bioPrompts') || 0) + 1)); if (ls('bioCancel')) return send('biometric', { op: 'unlock', ok: false, error: 'cancelled' }); taken = ls('bioPin'); send('biometric', { op: 'unlock', ok: true }); },
    biometricTakePin() { const p = taken; taken = null; return p; },
    biometricDisable() { ls('bioPin', null); },
    saveFile: () => 'ok:Downloads/x', shareFile: () => 'ok', setReminders() { }, requestNotificationPermission() { }, notificationsEnabled: () => true, appVersion: () => '1.2.2 (14)',
  };
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // sample: load the made-up sample data when the app starts empty; after noSample(page) it starts blank again
  // (window.name survives reloads; a localStorage flag read at page start made the reload tests flaky)
  const mk = async (opts, android, sample) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 860 } }, opts || {}));
    if (android) await ctx.addInitScript(fakeBridge);
    if (sample) {
      await ctx.addInitScript({ path: SAMPLE });
      await ctx.addInitScript(() => { if (window.name === 'wt-test-no-sample') delete window.WTSampleSeed; }); // set by noSample() below
    }
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
    return { ctx, page };
  };
  const noSample = p => p.evaluate(() => { window.name = 'wt-test-no-sample'; });
  const h1 = p => p.locator('.auth .auth-body h1').last().textContent();
  const typePin = async (p, pin, wait = 400) => { await p.keyboard.type(pin); await p.keyboard.press('Enter'); await p.waitForTimeout(wait); };
  const ready = p => p.waitForFunction(() => window.__wtReady === true);
  const shot = async (p, name) => { if (SHOTS) await p.waitForTimeout(600), await p.screenshot({ path: path.join(SHOTS, name + '.png') }); };

  // ---------------------------------------------------------------- browser
  {
    const { ctx, page } = await mk();
    await page.goto(FILE); await ready(page); await page.waitForSelector('.auth .pin-dots');
    ok(/Create a PIN/.test(await h1(page)), 'browser: first run asks for a PIN');
    ok(await page.locator('.auth [data-auth=skip], .auth .btn.google').count() === 0, 'browser: no Google step (Android only)');
    ok(await page.locator('.auth label', { hasText: 'Restore from a backup file' }).count() === 1, 'browser: offers restore from a backup file');
    await shot(page, 'auth-create-desktop');
    await typePin(page, '13579'); ok(/Create a PIN/.test(await h1(page)), 'browser: 5 digits is not enough');
    await page.keyboard.type('2'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok(/Confirm/.test(await h1(page)), 'browser: confirm step');
    await page.click('.auth [data-auth=restart]'); ok(/Create a PIN/.test(await h1(page)), 'browser: start again');
    await typePin(page, '135792'); await typePin(page, '135792', 3000);
    ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => !!WTStore.key), 'browser: PIN set, data encrypted');
    await page.reload(); await ready(page).catch(() => { }); await page.waitForSelector('.auth .pin-dots');
    ok(/Welcome back/.test(await h1(page)) && await page.evaluate(() => !window.WT.D), 'browser: locked on reopen, nothing loaded');
    ok(await page.locator('.auth [data-k=bio]').count() === 0, 'browser: no fingerprint key');
    await shot(page, 'auth-unlock-desktop');
    await typePin(page, '000000', 2500); ok(/Wrong PIN/.test(await page.locator('.auth .auth-err').textContent()), 'browser: wrong PIN');
    await typePin(page, '135792', 100); await ready(page); await page.waitForTimeout(200);
    ok(await page.locator('.auth').count() === 0, 'browser: right PIN opens the app');
    // auto-lock after 2 minutes in the background
    await page.evaluate(() => {
      const set = v => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      set('hidden'); document.dispatchEvent(new Event('visibilitychange'));
      const real = Date.now; Date.now = () => real() + 3 * 60 * 1000;
      set('visible'); document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForSelector('.auth .pin-dots', { timeout: 8000 }).catch(() => { });
    ok(/Welcome back/.test(await h1(page)), 'browser: locks again after 2 minutes away');
    // forgot PIN -> erase & start over
    await page.click('.auth [data-auth=forgot]');
    ok(/Forgot/.test(await h1(page)) && await page.locator('[data-auth=reset-restore]').count() === 0, 'browser: forgot PIN page (no Drive option)');
    await page.click('[data-auth=back]'); await page.waitForSelector('.auth .pin-dots'); ok(/Welcome back/.test(await h1(page)), 'browser: "I remember it" goes back');
    await page.click('.auth [data-auth=forgot]'); await page.click('[data-auth=reset-fresh]');
    await page.waitForTimeout(1500); await ready(page); await page.waitForSelector('.auth .pin-dots');
    ok(/Create a PIN/.test(await h1(page)) && await page.evaluate(async () => !(await WTStore.lockInfo())), 'browser: erase starts setup again');
    await ctx.close();
  }
  // dark mode + phone screenshots of the pages
  if (SHOTS) {
    const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' }, true);
    await page.goto(FILE); await ready(page); await page.waitForSelector('.auth .pin-dots'); await shot(page, 'auth-create-phone-dark');
    await ctx.close();
  }

  // ---------------------------------------------------------------- Android (stand-in bridge)
  {
    const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 }, true, true);
    await page.goto(FILE); await ready(page); await page.waitForSelector('.auth .pin-dots');
    ok(/Create a PIN/.test(await h1(page)), 'android: first run starts with Create a PIN (default)');
    ok(await page.evaluate(() => Object.keys(WT.D.templates).length) === 17, 'android: sample data loaded (17 bills)');
    ok(await page.locator('.auth [data-auth=to-google]').count() === 1 && await page.locator('.auth [data-auth=to-guest]').count() === 1, 'android: Google and guest offered under the keypad');
    await shot(page, 'auth-create-phone');
    await page.click('.auth [data-auth=to-google]'); await page.waitForSelector('.auth .btn.google');
    await page.click('.auth [data-auth=skip]'); await page.waitForSelector('.auth .pin-dots');
    ok(/Create a PIN/.test(await h1(page)), 'android: "Back to PIN" from the Google page');
    await page.click('.auth [data-auth=to-google]'); await page.waitForSelector('.auth .btn.google');
    ok(/Sign in with Google/.test(await h1(page)), 'android: Google sign-in page');
    await shot(page, 'auth-signin-phone');
    // failed sign-in shows the error and stays
    await page.evaluate(() => __fake.ls('signinFail', '1'));
    await page.click('.auth .btn.google'); await page.waitForTimeout(300);
    ok(/Network error/.test(await page.locator('.auth .auth-err').textContent()), 'android: sign-in error shown');
    await page.evaluate(() => __fake.ls('signinFail', null));
    await page.click('.auth .btn.google'); await page.waitForSelector('.auth .pin-dots');
    ok(/Create a PIN/.test(await h1(page)) && /Signed in/.test(await page.locator('.auth .auth-ok').textContent()), 'android: after Google, back to Create a PIN (shows signed in)');
    ok(await page.locator('.auth [data-auth=to-guest]').count() === 0, 'android: no guest option once signed in');
    ok(await page.evaluate(() => WT.settings().account && WT.settings().account.email === 'alex@example.com'), 'android: account remembered');
    ok(+await page.evaluate(() => __fake.ls('restores')) === 1, 'android: fresh install checks Drive for a backup first');
    await page.waitForTimeout(300);
    ok(+await page.evaluate(() => __fake.ls('backups')) === 1 && await page.evaluate(() => localStorage.getItem('wt.restoreAfterReset')) === null, 'android: no backup in Drive yet, so backups start');
    ok(!/No WealthTrack backup/.test(await page.locator('#toasts').textContent()), 'android: no scary error when Drive is empty');
    await page.setViewportSize({ width: 360, height: 640 });
    ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth && document.querySelector('.auth').scrollWidth <= window.innerWidth), 'android: PIN page fits a 360px phone');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const k of '864213') await page.tap(`.auth .key[data-k="${k}"]`);
    await page.tap('.auth [data-k=ok]'); await page.waitForTimeout(200);
    for (const k of '864213') await page.tap(`.auth .key[data-k="${k}"]`);
    await page.tap('.auth [data-k=ok]'); await page.waitForTimeout(3000);
    ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => !!WTStore.key), 'android: PIN set, no fingerprint question during setup');
    ok(/fingerprint unlock in Settings/.test(await page.locator('#toasts').textContent()), 'android: points to Settings for fingerprint');
    // fingerprint is turned on in Settings
    await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForTimeout(200);
    ok(/Fingerprint off/.test(await page.locator('.set-item[data-sec=security]').textContent()), 'android: settings menu summarizes security');
    await page.click('.set-item[data-sec=security]'); await page.waitForTimeout(200);
    await page.click('[data-act=bioOn]'); await page.waitForSelector('.auth.over');
    await typePin(page, '864213', 2500); await page.waitForSelector('.auth [data-auth=bio]');
    await shot(page, 'auth-fingerprint-phone');
    await page.click('.auth [data-auth=bio]'); await page.waitForTimeout(500);
    ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => __fake.ls('bioPin')) === '864213', 'android: fingerprint turned on in Settings');
    // reopen: fingerprint prompt starts by itself and unlocks
    await page.evaluate(() => __fake.ls('bioCancel', '1')); await page.reload(); await page.waitForSelector('.auth .pin-dots');
    ok(await page.locator('.auth [data-k=bio]').count() === 1, 'android: unlock page has fingerprint key');
    await shot(page, 'auth-unlock-phone'); await page.evaluate(() => __fake.ls('bioCancel', null)); await page.tap('.auth [data-k=bio]');
    await ready(page); await page.waitForTimeout(300);
    ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => Object.keys(WT.D.payments).length > 0), 'android: fingerprint unlocks');
    ok(await page.evaluate(() => __fake.ls('signins')) === '2', 'android: no second Google sign-in on reopen');
    // cancelled fingerprint -> PIN still works
    await page.evaluate(() => __fake.ls('bioCancel', '1'));
    await page.reload(); await page.waitForSelector('.auth .pin-dots'); await page.waitForTimeout(700);
    ok(await page.locator('.auth').count() === 1 && (await page.locator('.auth .auth-err').textContent()) === '', 'android: cancelling fingerprint stays on PIN page quietly');
    await typePin(page, '864213', 100); await ready(page); await page.waitForTimeout(200);
    ok(await page.locator('.auth').count() === 0, 'android: PIN works after cancelling fingerprint');
    await page.evaluate(() => __fake.ls('bioCancel', null));
    // settings
    await page.evaluate(() => { location.hash = '#/settings'; }); await page.waitForTimeout(200);
    ok(/alex@example.com/.test(await page.locator('.set-profile').textContent()), 'android: settings menu shows the Google account');
    await page.evaluate(() => { location.hash = '#/settings/security'; }); await page.waitForTimeout(200);
    ok(/Fingerprint/.test(await page.locator('#main').textContent()) && /PIN/.test(await page.locator('#main').textContent()), 'android: Security page has PIN and fingerprint');
    await page.click('[data-act=bioOff]'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => __fake.ls('bioPin')) === null && await page.locator('[data-act=bioOn]').count() === 1, 'android: fingerprint off');
    await page.click('[data-act=bioOn]'); await page.waitForSelector('.auth.over');
    await typePin(page, '864213', 2500); await page.click('.auth [data-auth=bio]'); await page.waitForTimeout(500);
    ok(await page.evaluate(() => __fake.ls('bioPin')) === '864213', 'android: fingerprint back on (asks for PIN first)');
    // backups happen while signed in; make sure one exists
    await page.evaluate(() => { WT.markPaid(Object.values(WT.D.instances).find(i => i.status !== 'paid').id); WTApp.refresh(); });
    await page.evaluate(() => { location.hash = '#/settings/data'; }); await page.waitForTimeout(400); await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); }); await page.waitForTimeout(500); // leaving the app backs up
    const backups = +await page.evaluate(() => __fake.ls('backups'));
    ok(backups > 0, 'android: data backed up to Drive');
    const payCount = await page.evaluate(() => Object.keys(WT.D.payments).length), tplCount = await page.evaluate(() => Object.keys(WT.D.templates).length);
    ok(payCount > 0 && tplCount === 17, 'android: phone copy has the sample bills and at least one payment before the reset');
    // sign out -> sign-in page again
    await page.evaluate(() => { location.hash = '#/settings/personal'; }); await page.waitForTimeout(200);
    ok(/Signed in as/.test(await page.locator('#main').textContent()), 'android: Personal info shows the Google account');
    await page.click('[data-act=signOut]'); await page.click('.overlay .btn.danger, .overlay [type=submit]').catch(() => { }); await page.waitForSelector('.auth .btn.google');
    ok(await page.evaluate(() => !WT.settings().account), 'android: sign out clears the account');
    await page.click('.auth [data-auth=skip]'); await page.waitForTimeout(200);
    ok(await page.locator('.auth').count() === 0, 'android: can continue without signing in');
    // forgot PIN -> erase & restore from Drive
    await page.reload(); await page.waitForSelector('.auth .pin-dots'); await page.evaluate(() => __fake.ls('bioCancel', '1'));
    await noSample(page); // the erased phone must come back blank, not with fresh sample data
    await page.click('.auth [data-auth=forgot]'); await page.click('[data-auth=reset-restore]');
    await page.waitForTimeout(1500); await ready(page); await page.waitForSelector('.auth [data-auth=to-google]');
    ok(/back up or restore/.test(await page.locator('.auth [data-auth=to-google]').textContent()), 'android: after reset, PIN page offers Google to restore');
    await page.click('.auth [data-auth=to-google]'); await page.waitForSelector('.auth .btn.google');
    ok(await page.evaluate(() => Object.keys(WT.D.payments).length === 0 && Object.keys(WT.D.templates).length === 0 && Object.keys(WT.D.debts).length === 0 && Object.keys(WT.D.incomes).length === 0), 'android: erase really wiped the phone copy (no payments, bills, debts or income)');
    ok(await page.evaluate(() => __fake.ls('bioPin')) === null, 'android: erase turns fingerprint off');
    const before = +await page.evaluate(() => __fake.ls('backups')), restBefore = +await page.evaluate(() => __fake.ls('restores'));
    await page.click('.auth .btn.google'); await page.waitForSelector('.overlay', { timeout: 5000 });
    ok(+await page.evaluate(() => __fake.ls('restores')) === restBefore + 1, 'android: after reset, sign-in restores from Drive');
    ok(+await page.evaluate(() => __fake.ls('backups')) === before, 'android: reset phone never backs up over the Drive copy');
    await page.click('.overlay [type=submit], .overlay .btn.primary'); await page.waitForTimeout(800);
    ok(await page.evaluate(() => Object.keys(WT.D.payments).length) === payCount && await page.evaluate(() => Object.keys(WT.D.templates).length) === tplCount, 'android: Drive data restored (bills and the payment made before the reset are back)');
    ok(await page.evaluate(() => localStorage.getItem('wt.restoreAfterReset')) === null, 'android: backups resume after restore');
    await typePin(page, '112233'); await typePin(page, '112233', 3000);
    await page.click('.auth [data-auth=later]').catch(() => { }); await page.waitForTimeout(300);
    ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => !!WTStore.key), 'android: new PIN after restore');
    await page.reload(); await page.waitForSelector('.auth .pin-dots'); await typePin(page, '112233', 100); await ready(page); await page.waitForTimeout(200);
    ok(await page.evaluate(() => Object.keys(WT.D.payments).length) === payCount && await page.evaluate(() => Object.keys(WT.D.templates).length) === tplCount, 'android: restored data opens with the new PIN');
    await ctx.close();
  }
  // new phone, Drive already has a backup: offered a restore, never overwritten by demo data
  {
    const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, true);
    const backup = JSON.stringify({ app: 'WealthTrack', format: 1, exportedAt: '2026-11-01T00:00:00Z', data: { templates: {}, instances: {}, payments: {}, expenses: {}, debts: {}, accounts: {}, categories: {}, settings: {} } });
    await ctx.addInitScript(b => { if (!localStorage.getItem('fake.seeded')) { localStorage.setItem('fake.seeded', '1'); localStorage.setItem('fake.drive', b); } }, backup);
    await page.goto(FILE); await ready(page); await page.waitForSelector('.auth [data-auth=to-google]');
    await page.click('.auth [data-auth=to-google]'); await page.waitForSelector('.auth .btn.google');
    await page.click('.auth .btn.google'); await page.waitForSelector('.overlay', { timeout: 5000 });
    ok(/Restore backup/.test(await page.locator('.overlay').textContent()), 'new phone: offers to restore the Drive backup');
    ok(await page.evaluate(() => __fake.ls('backups')) === null && await page.evaluate(() => __fake.ls('drive')) === backup, 'new phone: Drive backup not overwritten');
    await ctx.close();
  }
  // guest: no Google, no PIN, clearly not backed up
  {
    const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 }, true);
    await page.goto(FILE); await ready(page); await page.waitForSelector('.auth [data-auth=to-guest]');
    ok(await page.locator('.auth [data-auth=to-guest]').textContent() === 'Continue as guest', 'guest: option on the PIN page');
    await page.click('.auth [data-auth=to-guest]'); await page.waitForTimeout(300);
    const warn = await page.locator('.auth').textContent();
    ok(/Continue as a guest\?/.test(warn) && /not backed up/.test(warn) && /No PIN or fingerprint lock/.test(warn), 'guest: warns data is not backed up and not locked');
    ok(await page.locator('.auth-foot').isHidden(), 'guest: no "encrypted with your PIN" claim on the guest page');
    await shot(page, 'auth-guest-phone');
    await page.click('.auth [data-auth=guest-back]'); await page.waitForTimeout(200);
    ok(/Create a PIN/.test(await h1(page)) && await page.locator('.auth-foot').isVisible(), 'guest: back to PIN');
    await page.click('.auth [data-auth=to-guest]'); await page.click('.auth [data-auth=guest-ok]'); await page.waitForTimeout(400);
    ok(await page.locator('.auth').count() === 0, 'guest: opens the app');
    ok(await page.evaluate(() => Object.keys(WT.D.templates).length === 0 && Object.keys(WT.D.debts).length === 0 && Object.keys(WT.D.incomes).length === 0 && Object.keys(WT.D.payments).length === 0), 'guest: a fresh install starts blank (no bills, debts or income)');
    ok(await page.evaluate(async () => WT.settings().guest === true && !WTStore.key && !(await WTStore.lockInfo())), 'guest: no PIN, no encryption');
    ok(await page.evaluate(() => __fake.ls('backups')) === null && await page.evaluate(() => __fake.ls('signins')) === null, 'guest: nothing sent to Google');
    ok(/not backed up/.test(await page.locator('.guest-banner').textContent()), 'guest: dashboard says data is not backed up');
    await shot(page, 'auth-guest-dashboard');
    await page.reload(); await ready(page); await page.waitForTimeout(400);
    ok(await page.locator('.auth').count() === 0 && await page.locator('.guest-banner').count() === 1, 'guest: not asked to sign in again on reopen');
    await page.evaluate(() => { location.hash = '#/settings/personal'; }); await page.waitForTimeout(200);
    ok(/Guest: your data is not backed up/.test(await page.locator('.set-row', { hasText: 'Google account' }).textContent()), 'guest: settings says not backed up');
    await page.evaluate(() => { location.hash = '#/dashboard'; }); await page.waitForTimeout(200);
    await page.click('.guest-banner [data-act=gdSignIn]'); await page.waitForTimeout(600);
    ok(await page.evaluate(() => !WT.settings().guest && WT.settings().account.email === 'alex@example.com'), 'guest: signing in later ends guest mode');
    ok(+await page.evaluate(() => __fake.ls('backups')) === 1 && await page.locator('.guest-banner').count() === 0, 'guest: backups start after signing in');
    await ctx.close();
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
