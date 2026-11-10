// Reorder bills by press-and-hold + drag (real touch events via CDP, like Android Chrome).
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/reorder.js [--shots <dir>]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript({ path: path.join(__dirname, 'fixtures/sample-data.js') }); // made-up sample bills
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
  // records reloaded from storage can come back with keys in a different order: compare with sorted keys
  const snap = () => page.evaluate(() => { const norm = v => Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = norm(v[k]), o), {}) : v; return JSON.stringify(norm(['templates', 'instances', 'payments'].map(c => WT.D[c]))); });
  const before = await snap();
  const order = sel => page.evaluate(sel => [...document.querySelectorAll(sel)].map(r => r.dataset.tpl), sel);
  // drag the row at index `from` down by `rows` rows (holding first)
  const dragRow = async (sel, from, rows, hold = 650) => {
    await page.locator(sel).nth(from).evaluate(el => el.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
    const box = await page.locator(sel).nth(from).boundingBox();
    const h = box.height, x = box.x + box.width / 2, y = box.y + h / 2;
    await touch('touchStart', x, y); await page.waitForTimeout(hold);
    const steps = 10; for (let k = 1; k <= steps; k++) { await touch('touchMove', x, y + (h * rows) * k / steps); await page.waitForTimeout(25); }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'reorder-dragging.png') });
    await touch('touchEnd', x, y + h * rows); await page.waitForTimeout(400);
  };

  // ---- All bills
  await go('bills'); await page.click('[data-act=billsTab][data-tab=manage]'); await page.waitForTimeout(200);
  const rowSel = '#main table.ledger tbody tr[data-tpl]';
  const o1 = await order(rowSel);
  ok(o1.length > 3 && await page.locator('[data-act=billMine]').count() === 1, 'All bills offers "Use my own order"');
  // a quick swipe (no hold) scrolls instead of dragging
  { const b = await page.locator(rowSel).nth(1).boundingBox(); await touch('touchStart', b.x + 20, b.y + 10); await touch('touchMove', b.x + 20, b.y + 80); await touch('touchEnd', b.x + 20, b.y + 80); await page.waitForTimeout(300); }
  ok(JSON.stringify(await order(rowSel)) === JSON.stringify(o1) && !(await page.evaluate(() => WT.settings().billOrder)), 'quick swipe does not move bills');
  await dragRow(rowSel, 0, 2);
  const o2 = await order(rowSel);
  ok(o2[2] === o1[0] && o2[0] === o1[1] && o2[1] === o1[2], 'hold + drag moves a bill down two places (' + o1[0] + ')');
  ok(await page.evaluate(() => WT.settings().billView) === 'mine' && /My order/.test(await page.locator('.manage-sum').textContent()), 'switches to My order');
  const saved = await page.evaluate(() => WT.settings().billOrder);
  ok(Array.isArray(saved) && saved.indexOf(o1[0]) > saved.indexOf(o1[2]), 'order saved in settings');
  // move it back up
  await dragRow(rowSel, 2, -2);
  ok(JSON.stringify((await order(rowSel)).slice(0, 3)) === JSON.stringify(o1.slice(0, 3)), 'drag up moves it back');
  // tap after drag still works normally (no stuck state)
  ok(await page.evaluate(() => !document.body.classList.contains('reordering') && !document.querySelector('.dragging')), 'drag state cleared');

  // ---- This month uses the same order
  await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.click('.up-range button[data-r=month]'); await page.waitForTimeout(250);
  const mSel = '#main .list .bill[data-tpl]';
  const m1 = await order(mSel);
  ok(m1.length > 3, 'This month list in My order (' + m1.length + ' bills)');
  const rank = await page.evaluate(() => WT.settings().billOrder);
  const uniq = [...new Set(m1)];
  ok(uniq.every((id, n) => n === 0 || rank.indexOf(uniq[n - 1]) <= rank.indexOf(id)), 'This month follows the saved order');
  const tapBefore = await page.evaluate(() => Object.values(WT.D.payments).length);
  await dragRow(mSel, 1, 1);
  const m2 = await order(mSel);
  ok(m2[2] === m1[1] && m2[1] === m1[2], 'This month: hold + drag reorders');
  ok(await page.evaluate(() => Object.values(WT.D.payments).length) === tapBefore, 'dragging never marks a bill paid');
  await page.click('[data-act=billsTab][data-tab=manage]'); await page.waitForTimeout(200);
  const a3 = await order(rowSel);
  ok(a3.indexOf(m1[1]) > a3.indexOf(m1[2]), 'All bills reflects the move made on This month');

  // ---- dragging up stops where you stop (no runaway): finger rests high on the screen for 1.5s
  {
    await page.click('[data-act=billsTab][data-tab=manage]'); await page.waitForTimeout(200);
    const startOrder = await order(rowSel);
    // scroll so row 6 sits near the top of the screen (finger will rest ~70px from the top)
    const clearToasts = () => page.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.innerHTML = ''; }); // toasts sit over the top of the screen
    await clearToasts();
    await page.evaluate(sel => { const r = document.querySelectorAll(sel)[6]; window.scrollBy(0, r.getBoundingClientRect().top - 260); }, rowSel); // finger will rest mid-screen
    await page.waitForTimeout(200);
    const b = await page.locator(rowSel).nth(6).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2, h = b.height;
    await touch('touchStart', x, y); await page.waitForTimeout(650);
    for (let k = 1; k <= 8; k++) { await touch('touchMove', x, y - h * 0.8 * k / 8); await page.waitForTimeout(25); }
    const s0 = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(1500); // finger stays put
    const mid = await order(rowSel);
    const crept = await page.evaluate(() => window.scrollY) - s0;
    ok(Math.abs(crept) <= 2, 'the page does not creep while you hold a bill still (moved ' + crept + 'px)');
    await touch('touchEnd', x, y - h * 0.8); await page.waitForTimeout(400);
    const end = await order(rowSel);
    ok(mid.indexOf(startOrder[6]) === 5 && end.indexOf(startOrder[6]) === 5, 'dragging up one place and holding still moves it exactly one place (no runaway) [mid ' + mid.indexOf(startOrder[6]) + ' end ' + end.indexOf(startOrder[6]) + ' y ' + Math.round(y) + ' h ' + Math.round(h) + ']');
    // a real edge drag: finger at the very top with more list above scrolls, but stops at the first bill of the group
    await clearToasts();
    const b2 = await page.locator(rowSel).nth(5).boundingBox(); const y2 = b2.y + b2.height / 2;
    await touch('touchStart', x, y2); await page.waitForTimeout(650);
    for (let k = 1; k <= 10; k++) { await touch('touchMove', x, y2 + (10 - y2) * k / 10); await page.waitForTimeout(25); }
    await page.waitForTimeout(2500);
    await touch('touchEnd', x, 10); await page.waitForTimeout(400);
    const end2 = await order(rowSel);
    ok(end2.indexOf(startOrder[6]) < 5 && end2.length === startOrder.length, 'holding at the very top edge scrolls the list and keeps moving up (to the top at most) [end ' + end2.indexOf(startOrder[6]) + ']');
    ok(await page.evaluate(() => !document.body.classList.contains('reordering') && !document.querySelector('.dragging')), 'drag ends when the finger lifts');
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  // ---- Upcoming: inside a date group
  await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.waitForTimeout(250);
  ok(await page.locator('#main .bill[data-tpl]').count() > 0, 'Upcoming shows bills in My order (grouped by date)');

  // ---- persists, nothing else changed
  const savedOrder = JSON.stringify(await page.evaluate(() => WT.settings().billOrder));
  await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(300);
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  const afterView = await page.evaluate(() => WTApp.ui.billView || WT.settings().billView), afterOrder = JSON.stringify(await page.evaluate(() => WT.settings().billOrder));
  ok(afterView === 'mine' && afterOrder === savedOrder, 'order kept after reload' + (afterView === 'mine' && afterOrder === savedOrder ? '' : ' [view=' + afterView + ' order same=' + (afterOrder === savedOrder) + ' ' + afterOrder.slice(0, 120) + ' vs ' + savedOrder.slice(0, 120) + ']'));
  ok(await snap() === before, 'bills, instances and payments unchanged (order is a setting only)');
  // sanitize
  const clean = await page.evaluate(() => WTStore.sanitizeData({ meta: { settings: { id: 'settings', billOrder: ['bill_apartment', 'bill_apartment', '<x>', 5] } } }, WT.COLLS).data.meta.settings.billOrder);
  ok(JSON.stringify(clean) === '["bill_apartment"]', 'restored order is cleaned');
  // 360px no overflow
  await page.setViewportSize({ width: 360, height: 740 }); await go('bills'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth), '360px: no horizontal overflow');
  if (SHOTS) { await page.setViewportSize({ width: 390, height: 844 }); await page.click('[data-act=billsTab][data-tab=manage]'); await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, 'reorder-allbills.png') }); }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
