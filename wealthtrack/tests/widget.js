// Home-screen widget feed: what the page sends to AndroidBridge.updateWidgets / clearWidgets.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/widget.js   (after node wealthtrack/build.js)
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

// a fake Android bridge that records widget calls
const fakeBridge = () => {
  window.__w = { sent: [], cleared: 0 };
  window.AndroidBridge = {
    updateWidgets(j) { window.__w.sent.push(JSON.parse(j)); }, clearWidgets() { window.__w.cleared++; },
    googleDriveSupported: () => false, biometricStatus: () => 'none', saveFile: () => 'ok', shareFile: () => 'ok',
    setReminders() { }, requestNotificationPermission() { }, notificationsEnabled: () => true, appVersion: () => 'test', addressSupported: () => false,
  };
  try { localStorage.setItem('wt.skipOnboarding', '1'); } catch (e) { }
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (sample, pro) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(fakeBridge);
    if (pro === false) await ctx.addInitScript(() => { window.WT_isPro = () => false; });
    if (sample) await ctx.addInitScript({ path: SAMPLE });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
    await page.waitForTimeout(1200);
    return { ctx, page };
  };
  const lastSent = page => page.evaluate(() => window.__w.sent[window.__w.sent.length - 1] || null);

  {
    const { ctx, page } = await mk(true);
    let s = await lastSent(page);
    ok(s && s.state === 'ok', 'sample data: widget gets an ok snapshot');
    ok(s && s.bills.length >= 1 && s.bills.length <= 3, 'up to 3 bills sent');
    ok(s && /\$/.test(s.leftText), 'left amount is formatted');
    const n0 = await page.evaluate(() => window.__w.sent.length);
    // pay the first unpaid bill from the snapshot through the app's own data layer, then refresh
    const firstName = s.bills[0].name;
    await page.evaluate(name => {
      const W = window.WTUI.W; const t = W.todayStr();
      const i = W.overdue(t).map(x => x.i).concat(W.instancesBetween(t, W.addDays(t, 45))).find(x => x.name === name && W.instStatus(x, t).remaining > 0);
      W.markPaid(i.id); window.WTUI.refresh();
    }, firstName);
    await page.waitForTimeout(1000);
    const n1 = await page.evaluate(() => window.__w.sent.length);
    s = await lastSent(page);
    ok(n1 > n0, 'a change sends a new snapshot');
    const repeat = await page.evaluate(() => { const n = window.__w.sent.length; window.WTUI.refresh(); return new Promise(r => setTimeout(() => r(window.__w.sent.length === n), 900)); });
    ok(repeat, 'an unchanged snapshot is not sent again');
    await ctx.close();
  }
  {
    const { ctx, page } = await mk(true, false);
    const s = await lastSent(page);
    ok(s && s.state === 'pro' && !/\$\d/.test(JSON.stringify(s)), 'not Pro: locked snapshot, no amounts');
    const opened = await page.evaluate(() => new Promise(r => { window.WT_proDialog = k => r(k); location.hash = '#/settings?upgrade=widgets'; setTimeout(() => r(null), 1500); }));
    ok(opened === 'widgets', 'locked-widget link opens the Pro dialog for widgets');
    ok(await page.evaluate(() => location.hash) === '#/settings', 'upgrade link is cleared from the address');
    await ctx.close();
  }
  {
    const { ctx, page } = await mk(false);
    const s = await lastSent(page);
    ok(s && s.state === 'empty', 'blank install / demo: empty state');
    await ctx.close();
  }

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
