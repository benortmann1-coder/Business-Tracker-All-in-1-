// Bills → This month summary card, in a real browser at phone size.
// Run: node wealthtrack/tests/bill-summary.js [--shots dir]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); localStorage.setItem('wt.tour', '0'); } catch (e) { } });
  await c.addInitScript({ path: SAMPLE });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
  const toMonth = async () => { await p.evaluate(() => { location.hash = '#/bills'; WTApp.refresh(); }); await p.waitForTimeout(250); const m = p.locator('[data-act=upRange][data-r=month]'); if (await m.count()) { await m.first().click(); await p.waitForTimeout(250); } };
  const O = () => p.evaluate(() => WT.monthOutlook(WTApp.ui.month));
  const txt = sel => p.locator(sel).first().textContent();
  const fits = () => p.evaluate(() => { const el = document.querySelector('.bsum'); const r = el.getBoundingClientRect(); const over = [...el.querySelectorAll('*')].some(x => x.getBoundingClientRect().right > r.right + 1); return r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth + 1 && !over; });
  const cents = s => Math.round(parseFloat(String(s).replace(/[^0-9.\-]/g, '')) * 100);

  await toMonth();
  let o = await O();
  ok(await p.locator('.bsum').count() === 1, 'one summary card');
  ok(cents(await txt('.bsum-v')) === o.month.remaining, 'big number = still to pay this month (' + (await txt('.bsum-v')).trim() + ')');
  ok(new RegExp('of .*paid').test(await txt('.bsum-p')), 'progress line says paid of total');
  ok(await p.locator('.fig').count() === 0, 'the four separate cards are gone');
  ok(!(await p.locator('#main').textContent()).match(/\d+ of \d+ paid\s*$/m), 'no duplicate "x of y paid" next to the month');
  // balance never entered: ask for it instead of showing $0
  await p.evaluate(() => { const a = WT.accounts().find(x => x.inAvailable); a.needsBalance = true; WTApp.refresh(); }); await p.waitForTimeout(200);
  ok(await p.locator('.bsum-cover.none [data-act=setBalance]').count() === 1 && await p.locator('.bsum-stats').count() === 0, 'balance not entered: asks for it, shows no made-up numbers');
  if (SHOTS) await p.locator('.bsum').screenshot({ path: path.join(SHOTS, '1-no-balance.png') });
  // short: small balance
  await p.evaluate(() => { const a = WT.accounts().find(x => x.inAvailable); delete a.needsBalance; a.openingCents = 20000; a.openingDate = WT.todayStr(); WT.saveAccount ? 0 : 0; WTApp.refresh(); }); await p.waitForTimeout(250);
  o = await O();
  ok(o.available != null, 'balance known');
  ok(cents(await txt('.bsum-stats div:nth-child(1) b')) === o.available, 'Available now = checking + cash');
  ok(cents(await txt('.bsum-stats div:nth-child(2) b')) === o.after && o.after === o.available + o.incoming - o.cashLeft, 'After bills = available + paychecks - bills from cash');
  if (o.after < 0) {
    ok(await p.locator('.bsum-cover.short').count() === 1 && /Not enough/.test(await txt('.bsum-cover')), 'negative: says how short, in plain words');
    ok(await p.locator('.bsum-why').count() === 1 && /more than/.test(await txt('.bsum-why')), 'negative: explains why');
    ok(await p.locator('.bsum-stats b.neg').count() === 1, 'negative: shown in red');
  } else ok(false, 'test setup should be short (after=' + o.after + ')');
  await p.click('.bsum-math summary'); await p.waitForTimeout(150);
  const rows = await p.$$eval('.bsum-math .bsum-row b', bs => bs.map(x => x.textContent));
  ok(rows.length === 4 && cents(rows[0]) === o.available && cents(rows[1]) === o.incoming && cents(rows[2]) === o.cashLeft && cents(rows[3]) === o.after, 'the math adds up line by line');
  ok(await fits(), 'fits a 360px phone (short state, math open)');
  if (SHOTS) await p.locator('.bsum').screenshot({ path: path.join(SHOTS, '2-short.png') });
  // credit card bill comes out of cash
  const mv = await p.evaluate(() => { const t = WT.todayStr(); const i = WT.instancesBetween(t, WT.monthEnd(WT.monthOf(t))).find(x => !x.skipped && WT.instStatus(x).remaining > 0 && !String(x.accountId || '').startsWith('debt:')); if (!i) return null; const amt = WT.instStatus(i).remaining; i.accountId = 'debt:any_card'; WTApp.refresh(); return amt; });
  if (mv) { await p.waitForTimeout(200); const o2 = await O(); ok(o2.after === o.after + mv && o2.month.remaining === o.month.remaining, 'a bill paid by credit card leaves cash but still counts as still to pay'); await p.click('.bsum-math summary').catch(() => { }); ok(/credit card/.test(await p.locator('.bsum').textContent()), 'card bills are explained'); o = o2; }
  // covered
  await p.evaluate(() => { const a = WT.accounts().find(x => x.inAvailable); a.openingCents = 99999999; WTApp.refresh(); }); await p.waitForTimeout(250);
  ok(await p.locator('.bsum-cover.ok').count() === 1 && await p.locator('.bsum-why').count() === 0 && await p.locator('.bsum-stats b.pos').count() === 1, 'covered: green, no warning');
  if (SHOTS) { await p.evaluate(() => { const a = WT.accounts().find(x => x.inAvailable); a.openingCents = 300000; WTApp.refresh(); }); await p.waitForTimeout(200); await p.locator('.bsum').screenshot({ path: path.join(SHOTS, '3-covered.png') }); }
  // overdue banner
  o = await O();
  if (o.overdueTotal > 0) {
    ok(cents(await txt('.bsum-over b')) === o.overdueTotal, 'overdue banner shows every overdue bill, incl. earlier months');
    await p.click('.bsum-over [data-act=billFilter]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => WTApp.ui.billFilter) === 'overdue', 'Show switches the list to Overdue');
    await p.click('.chips [data-f=all]'); await p.waitForTimeout(150);
  } else ok(await p.locator('.bsum-over').count() === 0, 'no overdue banner when nothing is overdue');
  // paying a bill updates everything
  const before = await O();
  await p.evaluate(() => { const t = WT.todayStr(); const i = WT.instancesForMonth(WT.monthOf(t)).find(x => !x.skipped && WT.instStatus(x).remaining > 0); WT.recordPayment(i.id, { amountCents: WT.instStatus(i).remaining }); WTApp.refresh(); }); await p.waitForTimeout(200);
  const afterPay = await O();
  ok(afterPay.month.remaining < before.month.remaining && cents(await txt('.bsum-v')) === afterPay.month.remaining, 'paying a bill lowers still to pay on screen');
  // other months: bills only
  await p.click('[data-act=monthStep][data-n="1"]'); await p.waitForTimeout(250);
  const n = await O();
  ok(!n.isCurrent && await p.locator('.bsum-stats, .bsum-cover').count() === 0 && cents(await txt('.bsum-v')) === n.month.remaining, 'next month: bills only, no cash forecast');
  // filters: secondary ones hide when empty
  const chips = await p.$$eval('.chips [data-act=billFilter]', bs => bs.map(x => x.dataset.f));
  ok(['all', 'unpaid', 'soon', 'paid'].every(k => chips.includes(k)), 'main filters always there: ' + chips.join(', '));
  // month tools tucked away, still work
  ok(await p.locator('.month-tools:not([open])').count() === 1 && !(await p.locator('[data-act=genNext]').isVisible()), 'month tools are tucked away');
  await p.click('.month-tools summary'); await p.waitForTimeout(100);
  ok(await p.locator('[data-act=genNext]').isVisible() && await p.locator('[data-act=resetMonth]').isVisible() && await p.locator('[data-act=refreshMonth]').isVisible(), 'month tools open with all three actions');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
