// Preferred pay day, in a real browser at phone size: set it in the bill form, see the bill in the month before its
// due date until the day passes, then back on the real due date (amber, not overdue). Run: node wealthtrack/tests/pay-by.js [--shots dir]
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); localStorage.setItem('wt.tour', '0'); } catch (e) { } });
  const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(FILE); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
  const day = async d => { await p.evaluate(d => { WT.setToday(d); WT.ensureGenerated(); WTApp.refresh(); }, d); await p.waitForTimeout(200); };
  await day('2026-11-20');
  // add the bill through the form
  await p.evaluate(() => { location.hash = '#/bills'; }); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('[data-act=addBill]') ? document.querySelector('[data-act=addBill]').click() : null); await p.waitForTimeout(250);
  if (!(await p.locator('.modal [name=payByDate]').count())) { await p.evaluate(() => { WTApp.ui.billsTab = 'manage'; WTApp.refresh(); }); await p.waitForTimeout(200); await p.locator('[data-act=addBill]').first().click(); await p.waitForTimeout(250); }
  ok(await p.locator('.modal input[type=date][name=payByDate]').count() === 1, 'bill form has Preferred pay day as a date picker');
  await p.fill('.modal [name=name]', 'Rent'); await p.fill('.modal [name=amount]', '700'); await p.fill('.modal [name=anchor]', '2026-12-01');
  await p.selectOption('.modal [name=frequency]', 'monthly');
  ok(await p.locator('.modal .pay-by-only').isVisible(), 'shown for a monthly bill');
  await p.check('.modal [name=autopay]'); await p.waitForTimeout(50);
  ok(!(await p.locator('.modal .pay-by-only').isVisible()), 'hidden for auto-pay');
  await p.uncheck('.modal [name=autopay]'); if (await p.locator('.modal [name=sub]').isChecked()) await p.uncheck('.modal [name=sub]');
  await p.selectOption('.modal [name=frequency]', 'weekly'); await p.waitForTimeout(50);
  ok(!(await p.locator('.modal .pay-by-only').isVisible()), 'hidden for weekly bills');
  await p.selectOption('.modal [name=frequency]', 'monthly'); await p.fill('.modal [name=payByDate]', '2026-11-30'); await p.waitForTimeout(80);
  ok(/Pay by the 30th every month.*This bill: pay by Nov 30, 2026, due Dec 1, 2026/.test(await p.locator('#payByHint').textContent()), 'hint explains: ' + (await p.locator('#payByHint').textContent()).trim());
  await p.fill('.modal [name=payByDate]', '2026-12-05'); await p.waitForTimeout(80);
  ok(/pay by Nov 5, 2026, due Dec 1/.test(await p.locator('#payByHint').textContent()), 'picking Dec 5 means the 5th: Nov 5 for this bill');
  await p.fill('.modal [name=payByDate]', '2026-12-01'); await p.waitForTimeout(80);
  ok(/no effect here/.test(await p.locator('#payByHint').textContent()), 'the due date\'s own day is flagged as no effect');
  await p.fill('.modal [name=payByDate]', '2026-11-30');
  await p.click('.modal [type=submit]'); await p.waitForTimeout(300);
  const tpl = await p.evaluate(() => Object.values(WT.D.templates).find(t => t.name === 'Rent'));
  ok(tpl && tpl.payByDay === 30, 'saved: pay by the 30th');
  await day('2026-11-20');
  // November: Dec 1 rent shows as pay by Nov 30
  await p.evaluate(() => { WTApp.ui.billsTab = 'upcoming'; WTApp.ui.upRange = 'month'; WTApp.ui.month = '2026-11'; WTApp.ui.billFilter = 'all'; location.hash = '#/bills'; WTApp.refresh(); }); await p.waitForTimeout(250);
  const decId = await p.evaluate(() => Object.values(WT.D.instances).find(i => i.name === 'Rent' && i.dueDate === '2026-12-01').id);
  const row = () => p.locator(`.bill[data-inst="${decId}"]`).first();
  ok(await row().count() === 1, 'November lists the Dec 1 rent');
  ok(/Pay in 10 days · by Nov 30.* · due Dec 1/.test(await row().locator('.due').textContent()), 'row says: ' + (await row().locator('.due').textContent()).trim());
  ok(await p.evaluate(() => WT.monthOutlook('2026-11').month.total) >= 70000, 'the November summary card includes it');
  ok(await p.evaluate(() => !WT.instancesForMonth('2026-11').some(i => i.name === 'Rent' && i.dueDate === '2026-12-01')), 'records still file it under December (reports, reset, exports unchanged)');
  ok(await p.evaluate(() => WT.projection(30, '2026-11-20').events.some(e => e.label === 'Rent' && e.date === '2026-12-01')), 'the forecast still uses the real due date');
  if (SHOTS) { await row().scrollIntoViewIfNeeded(); await row().screenshot({ path: path.join(SHOTS, '1-pay-by.png') }); }
  // December (Next month): not there, January rent is (pay by Dec 30)
  await p.click('.up-range button[data-r=next]'); await p.waitForTimeout(250);
  ok(await row().count() === 0, 'December does not list it twice');
  ok(/Pay by Dec 30 · due Jan 1/.test(await p.locator('#main').textContent()), 'December lists January rent as pay by Dec 30');
  // calendar: on Nov 30
  await p.evaluate(() => { location.hash = '#/calendar'; WTApp.ui.month = '2026-11'; WTApp.refresh(); }); await p.waitForTimeout(250);
  ok(await p.locator('[data-day="2026-11-30"] [data-drag="' + decId + '"]').count() === 1 && await p.locator('[data-day="2026-12-01"] [data-drag="' + decId + '"]').count() === 0, 'calendar shows it on Nov 30');
  // the pay-by day passes unpaid
  await day('2026-12-01');
  await p.evaluate(() => { WTApp.ui.month = '2026-12'; WTApp.ui.upRange = 'month'; location.hash = '#/bills'; WTApp.refresh(); }); await p.waitForTimeout(250);
  ok(await row().count() === 1, 'missed: now in December');
  ok(await row().locator('.missed-pb').count() === 1 && /missed your Nov 30 pay day/.test(await row().textContent()), 'missed: amber note');
  ok(!(await row().getAttribute('class')).includes('s-overdue'), 'missed: not overdue on the due date');
  if (SHOTS) { await row().scrollIntoViewIfNeeded(); await row().screenshot({ path: path.join(SHOTS, '2-missed.png') }); }
  await day('2026-12-02'); await p.waitForTimeout(100);
  ok((await row().getAttribute('class')).includes('s-overdue'), 'overdue only after the real due date');
  // edit: preselected, and can be turned off
  await p.evaluate(id => { WT.setToday('2026-11-20'); WTApp.refresh(); }, decId); await p.waitForTimeout(150);
  await p.evaluate(id => { const t = Object.values(WT.D.templates).find(t => t.name === 'Rent'); document.body.insertAdjacentHTML('beforeend', `<button id="__e" data-act="editTpl" data-id="${t.id}"></button>`); document.getElementById('__e').click(); }); await p.waitForTimeout(250);
  ok(await p.inputValue('.modal [name=payByDate]') === '2026-11-30', 'edit form shows Nov 30 (pay-by date for the next bill)');
  await p.click('.modal [data-pb-clear]'); ok(await p.inputValue('.modal [name=payByDate]') === '', 'Clear empties it'); await p.click('.modal [type=submit]'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => Object.values(WT.D.templates).find(t => t.name === 'Rent').payByDay) === undefined, 'turned off');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
