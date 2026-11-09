// End-to-end check in a real browser (Playwright/Chromium).
// Run: node wealthtrack/tests/e2e.js [--shots <dir>]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const __skipOnb = async c => { await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); } catch (e) {} }); return c; };
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '../web');
const shotsArg = process.argv.indexOf('--shots');
const SHOTS = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
// made-up sample data (tests only); a real install starts blank
const FIXTURE = path.join(__dirname, 'fixtures/sample-data.js');
const __sample = async c => { await c.addInitScript({ path: FIXTURE }); return c; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  // ---- fresh install WITHOUT the sample fixture starts blank: no bills, debts or income
  {
    const bctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await __skipOnb(bctx);
    const bp = await bctx.newPage(); const berr = [];
    bp.on('pageerror', e => berr.push(e.message)); bp.on('console', m => { if (m.type() === 'error') berr.push(m.text()); });
    await bp.goto(url); await bp.waitForFunction(() => window.__wtReady);
    const blank = await bp.evaluate(() => ({ sample: !!window.WTSampleSeed, tpl: Object.keys(WT.D.templates).length, inst: Object.keys(WT.D.instances).length, debts: Object.keys(WT.D.debts).length, inc: Object.keys(WT.D.incomes).length, acc: Object.keys(WT.D.accounts).length, seeded: WT.settings().seeded }));
    ok(!blank.sample && blank.tpl === 0 && blank.inst === 0, 'blank start: no bills ' + JSON.stringify(blank));
    ok(blank.debts === 0, 'blank start: no debts');
    ok(blank.inc === 0, 'blank start: no income');
    ok(blank.acc === 1 && blank.seeded === 'blank', 'blank start: just an empty Checking account');
    await bp.evaluate(() => { location.hash = '#/dashboard'; }); await bp.waitForTimeout(200);
    const dash = await bp.$eval('#main', el => el.textContent);
    ok(!dash.includes('Something went wrong') && dash.trim().length > 0, 'blank dashboard renders its empty state');
    for (const r of ['bills', 'paychecks', 'debts', 'calendar']) { await bp.evaluate(r => { location.hash = '#/' + r; }, r); await bp.waitForTimeout(120); ok(!(await bp.$eval('#main', el => el.textContent.includes('Something went wrong'))) && await bp.locator('#main .bill').count() === 0, 'blank ' + r + ' renders with no bills'); }
    ok(berr.length === 0, 'blank start: no console errors' + (berr.length ? ': ' + berr.join(' | ') : ''));
    await bctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }); await __skipOnb(ctx); await __sample(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__wtReady);
  const routes = ['dashboard', 'bills', 'paychecks', 'calendar', 'expenses', 'debts', 'goals', 'reports', 'history', 'settings'];
  for (const r of routes) {
    await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(150);
    const bad = await page.$eval('#main', el => el.textContent.includes('Something went wrong'));
    ok(!bad, 'route ' + r + ' renders');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'desk-' + r + '.png'), fullPage: true });
  }
  // Mark Car Loan Payment paid on the bills page
  await page.evaluate(() => { location.hash = '#/bills'; });
  await page.waitForTimeout(150);
  const carPay = page.locator('.bill', { hasText: 'Car Loan Payment' }).first();
  await carPay.locator('[data-act=markPaid]').click();
  await page.waitForTimeout(200);
  ok(await page.locator('.bill.s-paid', { hasText: 'Car Loan Payment' }).count() === 1, 'Car Loan Payment shows paid in November');
  // next month: still unpaid
  await page.click('[data-act=monthStep][data-n="1"]'); await page.waitForTimeout(150);
  ok(await page.locator('.bill', { hasText: 'Car Loan Payment' }).locator('[data-act=markPaid]').count() === 1, 'Car Loan Payment unpaid in December');
  // partial payment for Student Loan Payment in November
  await page.click('[data-act=monthStep][data-n="-1"]'); await page.waitForTimeout(150);
  await page.locator('.bill', { hasText: 'Student Loan Payment' }).locator('[data-act=billMenu]').click();
  await page.locator('.menu button', { hasText: 'partial' }).click();
  await page.fill('input[name=amount]', '100'); await page.click('.modal button[type=submit]'); await page.waitForTimeout(200);
  ok(await page.locator('.bill.s-partial', { hasText: 'Student Loan Payment' }).count() === 1, 'Student Loan Payment partly paid');
  ok((await page.locator('.bill', { hasText: 'Student Loan Payment' }).textContent()).includes('$75.00 left'), 'Student Loan Payment shows $75.00 left ($175 - $100)');
  // add an expense
  await page.click('.fab'); await page.locator('.menu button', { hasText: 'Add expense' }).click();
  await page.fill('input[name=amount]', '42.17'); await page.fill('input[name=description]', 'Groceries test'); await page.click('.modal button[type=submit]'); await page.waitForTimeout(200);
  // reload (restart) and verify persistence
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  await page.evaluate(() => { location.hash = '#/bills'; }); await page.waitForTimeout(200);
  ok(await page.locator('.bill.s-paid', { hasText: 'Car Loan Payment' }).count() === 1, 'after restart: Car Loan Payment still paid');
  ok(await page.locator('.bill.s-partial', { hasText: 'Student Loan Payment' }).count() === 1, 'after restart: Student Loan Payment still partly paid');
  const counts = await page.evaluate(() => ({ inst: Object.keys(WT.D.instances).length, issues: WT.integrity().length, exp: Object.values(WT.D.expenses).filter(e => e.description === 'Groceries test').length }));
  ok(counts.issues === 0, 'no duplicate bills after restart');
  ok(counts.exp === 1, 'expense saved');
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  ok(await page.evaluate(() => Object.keys(WT.D.instances).length) === counts.inst, 'second restart creates no extra bills');
  // jump years ahead and back
  await page.evaluate(() => { location.hash = '#/bills'; }); await page.waitForTimeout(100);
  await page.evaluate(() => { const i = document.querySelector('[data-month-input=month]'); i.value = '2028-06'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  ok(await page.locator('.bill', { hasText: 'Apartment' }).count() >= 1, 'June 2028 has bills');
  await page.evaluate(() => { const i = document.querySelector('[data-month-input=month]'); i.value = '2026-11'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  ok(await page.locator('.bill.s-paid', { hasText: 'Car Loan Payment' }).count() === 1, 'Back in Nov 2026: Car Loan Payment still paid');
  // Excel export builds
  const xlsxLen = await page.evaluate(() => { const b = WTXlsx.buildXlsx([{ name: 'T', columns: [{ header: 'A', type: 'money' }], rows: [[12345]] }]); return b.length; });
  ok(xlsxLen > 500, 'xlsx builds');
  // mobile screenshots
  if (SHOTS) {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await __skipOnb(m); await __sample(m);
    const mp = await m.newPage(); mp.on('pageerror', e => errors.push('mobile: ' + e.message));
    await mp.goto(url); await mp.waitForFunction(() => window.__wtReady);
    for (const r of ['dashboard', 'bills', 'paychecks', 'calendar', 'debts']) { await mp.evaluate(r => { location.hash = '#/' + r; }, r); await mp.waitForTimeout(150); await mp.screenshot({ path: path.join(SHOTS, 'mob-' + r + '.png'), fullPage: true }); }
    const dk = await browser.newContext({ viewport: { width: 1360, height: 900 }, colorScheme: 'dark' }); await __skipOnb(dk); await __sample(dk);
    const dp = await dk.newPage(); await dp.goto(url); await dp.waitForFunction(() => window.__wtReady); await dp.screenshot({ path: path.join(SHOTS, 'dark-dashboard.png'), fullPage: true });
  }
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
