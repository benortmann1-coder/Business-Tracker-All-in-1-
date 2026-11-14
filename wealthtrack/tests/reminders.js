// Custom bill reminders in the browser: Settings controls and the per-bill Reminders field (phone size).
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/reminders.js
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript({ path: SAMPLE });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };
  const W = fn => page.waitForFunction(fn, null, { timeout: 4000 }).then(() => true, () => false);
  try {
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);

    // Settings → Notifications
    await go('settings/notifications');
    ok(await page.locator('[data-act-change=remDay]').count() === 8, 'Pro: 8 lead-day choices (2 weeks … on the day)');
    await page.locator('[data-act-change=remDay][data-d="14"]').check();
    ok(await W(() => WT.settings().reminders.daysBefore.includes(14)), '2 weeks before saved');
    await page.locator('[data-act-change=remTime]').selectOption('7:45');
    ok(await W(() => WT.settings().reminders.hour === 7 && WT.settings().reminders.minute === 45), 'time 7:45 AM saved');
    await page.locator('[data-act-change=remOverdue]').check();
    ok(await W(() => WT.settings().reminders.overdueDaily === true), 'daily overdue reminders on');

    // New bill with its own reminders
    await go('bills');
    await page.evaluate(() => document.querySelector('[data-act=addBill]').click());
    await page.waitForSelector('.overlay form select[name=remMode]');
    ok(!(await page.locator('.overlay .rem-custom').isVisible()), 'custom reminder options hidden until chosen');
    await page.fill('.overlay input[name=name]', 'Gym membership');
    await page.fill('.overlay input[name=amount]', '45');
    await page.selectOption('.overlay select[name=remMode]', 'custom');
    ok(await page.locator('.overlay .rem-custom').isVisible(), 'custom reminder options appear');
    ok(await page.locator('.overlay input[name=remD_14]').isChecked(), 'custom starts from your reminder settings');
    for (const d of [14, 10, 7, 5, 3, 2, 1, 0]) await page.locator('.overlay input[name=remD_' + d + ']').uncheck();
    await page.locator('.overlay button[type=submit]').click(); await page.waitForTimeout(300);
    ok(await page.locator('.overlay form').count() === 1 && /reminder day/.test(await page.locator('#toasts').textContent()), 'custom with no days shows an error and stays open');
    await page.locator('.overlay input[name=remD_5]').check();
    await page.selectOption('.overlay select[name=remTime]', '18:30');
    await page.locator('.overlay button[type=submit]').click();
    ok(await W(() => Object.values(WT.D.templates).some(t => t.name === 'Gym membership' && t.reminder && t.reminder.mode === 'custom' && t.reminder.daysBefore.join() === '5' && t.reminder.hour === 18 && t.reminder.minute === 30)), 'bill saved with its own reminder rule');
    ok(await page.evaluate(() => { const t = Object.values(WT.D.templates).find(x => x.name === 'Gym membership'); return WT.reminderList(undefined, 60).filter(r => r.id.includes(t.id)).every(r => r.hour === 18 && r.minute === 30); }), 'its reminders use 6:30 PM');

    // A bill set to "No reminders" gets none
    await page.evaluate(() => document.querySelector('[data-act=addBill]').click());
    await page.waitForSelector('.overlay form select[name=remMode]');
    await page.fill('.overlay input[name=name]', 'Newspaper'); await page.fill('.overlay input[name=amount]', '12');
    await page.selectOption('.overlay select[name=remMode]', 'off');
    await page.locator('.overlay button[type=submit]').click();
    ok(await W(() => Object.values(WT.D.templates).some(t => t.name === 'Newspaper' && t.reminder && t.reminder.mode === 'off')), '"No reminders" saved');
    ok(await page.evaluate(() => { const t = Object.values(WT.D.templates).find(x => x.name === 'Newspaper'); return !WT.reminderList(undefined, 60).some(r => r.id.includes(t.id)); }), 'bill set to No reminders gets none');

    // Free (no Pro): today's reminder settings only, Get Pro button, no per-bill field
    const fctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    await fctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } Object.defineProperty(window, 'WT_isPro', { configurable: true, get: () => () => false, set: () => {} }); window.__proAsked = []; Object.defineProperty(window, 'WT_proDialog', { configurable: true, get: () => k => window.__proAsked.push(k), set: () => {} }); }); // app.js sets these at load; keep the test's stand-ins
    await fctx.addInitScript({ path: SAMPLE });
    const fp = await fctx.newPage(); fp.on('pageerror', e => errors.push(e.message));
    await fp.goto(FILE); await fp.waitForFunction(() => window.__wtReady);
    await fp.evaluate(() => { location.hash = '#/settings/notifications'; }); await fp.waitForTimeout(300);
    ok(await fp.locator('[data-act-change=remDay]').count() === 4 && await fp.locator('[data-act-change=remOverdue]').count() === 0, 'free: 4 lead-day choices, no overdue switch');
    ok(await fp.locator('[data-act-change=remTime] option').count() === 24, 'free: hourly times only');
    await fp.click('[data-act=remPro]');
    ok(await fp.evaluate(() => window.__proAsked.join()) === 'reminders', 'free: Get Pro opens the upgrade dialog for reminders');
    await fp.evaluate(() => { location.hash = '#/bills'; }); await fp.waitForTimeout(200);
    await fp.evaluate(() => document.querySelector('[data-act=addBill]').click()); await fp.waitForSelector('.overlay form input[name=name]');
    ok(await fp.locator('.overlay select[name=remMode]').count() === 0, 'free: no per-bill Reminders field');
    await fctx.close();

    // Browser-only build: no Android bridge, nothing breaks
    ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  } catch (e) { console.error(e); fail++; }
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
