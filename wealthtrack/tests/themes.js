// Color themes in the browser: picker, instant apply, persistence, Pro lock, phone layout in two themes.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/themes.js [--shots <dir>]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js'); // made-up test data
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const ROUTES = ['dashboard', 'bills', 'paychecks', 'debts', 'reports', 'settings/theme'];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript({ path: SAMPLE });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };
  const cssVar = n => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), n);
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);

  await go('settings/theme');
  const n = await page.locator('.pal-btn').count();
  ok(n === 6, 'picker shows Default + 5 color themes (' + n + ')');
  ok(await page.locator('.pal-btn.on[data-v=default]').count() === 1, 'Default is selected on a new install');
  const sizes = await page.locator('.pal-btn').evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  ok(sizes.every(h => h >= 40), 'picker buttons are at least 40px tall');
  const defBrand = await cssVar('--brand');

  await page.click('.pal-btn[data-v=ocean]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.documentElement.dataset.palette) === 'ocean', 'Ocean applies instantly');
  ok((await cssVar('--brand')).toLowerCase() === '#0b5d8c' && (await cssVar('--brand')) !== defBrand, 'brand color changed');
  ok(await page.evaluate(() => WT.settings().palette) === 'ocean', 'saved in settings');
  ok(await page.locator('meta[name=theme-color]').getAttribute('content') === '#f1f5f8', 'browser theme color follows the palette');

  // Dark mode on top of a palette
  await page.click('[data-act=theme][data-v=dark]'); await page.waitForTimeout(150);
  ok((await cssVar('--brand')).toLowerCase() === '#5fb0e3' && (await cssVar('--bg')).toLowerCase() === '#0d1318', 'Ocean dark colors with Theme = Dark');

  // reload keeps it (no flash back to default)
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  ok(await page.evaluate(() => document.documentElement.dataset.palette) === 'ocean' && (await cssVar('--bg')).toLowerCase() === '#0d1318', 'palette and dark mode survive a reload');

  // Seasonal is its own color theme: palette steps aside, and picking a palette goes back to System
  await go('settings/theme');
  await page.click('[data-act=theme][data-v=seasonal]'); await page.waitForTimeout(150);
  ok(!(await page.evaluate(() => document.documentElement.dataset.palette)), 'Seasonal turns the palette off');
  await page.click('.pal-btn[data-v=plum]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => WT.settings().theme) === 'system' && await page.evaluate(() => document.documentElement.dataset.palette) === 'plum', 'picking a palette while Seasonal switches Theme to System');

  // layout at 360px in two themes x light/dark
  for (const [pal, mode] of [['contrast', 'light'], ['contrast', 'dark'], ['espresso', 'light'], ['espresso', 'dark']]) {
    await go('settings/theme');
    await page.click(`.pal-btn[data-v=${pal}]`); await page.click(`[data-act=theme][data-v=${mode}]`); await page.waitForTimeout(150);
    let bad = [];
    for (const r of ROUTES) {
      await go(r);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) bad.push(r + ' overflows by ' + over + 'px');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${pal}-${mode}-${r.replace('/', '-')}.png`) });
    }
    ok(!bad.length, `${pal} ${mode}: no sideways scrolling at 360px` + (bad.length ? ' — ' + bad.join('; ') : ''));
  }

  ok(await page.evaluate(() => WT.settings().palette) === 'espresso', 'last pick kept in settings'); // restore whitelist: tests/themes.test.js

  // Pro lock: when WT_isPro() says no, colored themes are locked and fall back to Default
  await page.evaluate(() => { window.WT_isPro = () => false; WTApp.refresh(); });
  await go('settings/theme'); await page.waitForTimeout(150);
  ok(await page.locator('.pal-btn .pal-lock').count() === 5, 'free: 5 themes show a lock');
  await page.click('.pal-btn[data-v=ocean]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.settings().palette) === 'espresso', 'free: tapping a locked theme does not change it');
  ok(/Pro/.test(await page.locator('#toasts').textContent()), 'free: says color themes are Pro');
  await page.click('[data-act=theme][data-v=light]'); await page.waitForTimeout(150);
  ok(!(await page.evaluate(() => document.documentElement.dataset.palette)), 'free: a saved Pro theme falls back to Default (setting kept)');
  await page.click('.pal-btn[data-v=default]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => WT.settings().palette) === 'default', 'free: Default can always be picked');

  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
