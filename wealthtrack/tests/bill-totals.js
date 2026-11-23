// Totals line under the bill filter buttons (Bills → This month), at phone size, in a real browser.
// Run: node wealthtrack/tests/bill-totals.js [--shots dir]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const money = s => Math.round(parseFloat(String(s).replace(/[^0-9.\-]/g, '')) * 100);
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); localStorage.setItem('wt.tour', '0'); } catch (e) { } });
  await c.addInitScript({ path: SAMPLE });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
  // a paid and a partly paid bill so every filter has something to add up
  await p.evaluate(() => { const mk = new Date().toISOString().slice(0, 7); const l = WT.instancesForMonth(mk).filter(i => !i.skipped); WT.recordPayment(l[0].id, { amountCents: l[0].amountCents }); WT.recordPayment(l[1].id, { amountCents: 1000 }); location.hash = '#/bills'; });
  await p.waitForTimeout(300);
  const month = p.locator('[data-act=upRange][data-r=month]'); if (await month.count()) { await month.first().click(); await p.waitForTimeout(250); }
  ok(await p.locator('.filter-sum').count() === 1, 'totals line shows under the filter buttons');
  const filters = await p.$$eval('.chips [data-act=billFilter]', bs => bs.map(x => x.dataset.f));
  for (const f of filters) {
    await p.click(`.chips [data-act=billFilter][data-f=${f}]`); await p.waitForTimeout(200);
    const shown = await p.$eval('.filter-sum', el => ({ k: el.querySelector('.fs-k').textContent, v: el.querySelector('.fs-v').textContent, s: el.querySelector('.fs-s').textContent }));
    const exp = await p.evaluate(f => {
      const mk = WTApp.ui.month; const all = WT.instancesForMonth(mk).map(i => ({ i, s: WT.instStatus(i) }));
      const rows = [...document.querySelectorAll('.list [data-inst], .list .bill-row, .list .row-bill')].length;
      const pick = { all: () => true, unpaid: x => x.s.remaining > 0 && x.s.status !== 'skipped', overdue: x => x.s.overdue, soon: x => x.s.status === 'due-soon' || (x.s.status === 'partial' && WT.diffDays(new Date().toISOString().slice(0, 10), x.i.dueDate) <= 7), partial: x => x.s.status.includes('partial'), paid: x => x.s.status === 'paid', auto: x => WT.isAutopay(x.i), skipped: x => x.s.status === 'skipped' }[f];
      const t = WT.billTotals(all.filter(pick)); const sm = WT.billsSummary(mk);
      const v = { all: t.remaining, unpaid: t.remaining, overdue: t.overdue, soon: t.remaining, partial: t.remaining, paid: t.paid, auto: t.autoRemaining, skipped: t.skippedTotal }[f];
      return { v, n: f === 'skipped' ? t.skippedCount : t.count, chip: +document.querySelector(`.chips [data-f=${f}] .n`).textContent, smLeft: sm.total - sm.paid, rows };
    }, f);
    ok(money(shown.v) === exp.v, `${f}: shows ${shown.v.trim()} (expected ${(exp.v / 100).toFixed(2)})`);
    ok(new RegExp('· ' + exp.n + ' bills?').test(shown.k) && (f === 'skipped' || exp.n === exp.chip), `${f}: bill count matches the button (${shown.k})`);
    if (f === 'all' || f === 'unpaid') ok(money(shown.v) === exp.smLeft, `${f}: matches "paid of" at the top (left = total − paid)`);
    const fit = await p.evaluate(() => { const el = document.querySelector('.filter-sum'); const r = el.getBoundingClientRect(); return r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && el.querySelector('.fs-v').getBoundingClientRect().right <= r.right; });
    ok(fit, `${f}: fits the phone screen`);
    if (SHOTS && ['all', 'unpaid', 'auto'].includes(f)) { await p.locator('.filter-sum').scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -260)); await p.screenshot({ path: path.join(SHOTS, f + '.png') }); }
  }
  // search narrows the totals too
  await p.click('.chips [data-act=billFilter][data-f=all]'); await p.waitForTimeout(150);
  const name = await p.evaluate(() => WT.instancesForMonth(WTApp.ui.month)[2].name);
  await p.fill('[data-bind=billSearch]', name); await p.waitForTimeout(400);
  ok(/matching your search/.test(await p.locator('.filter-sum .fs-s').textContent()), 'search: totals say they follow the search');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
