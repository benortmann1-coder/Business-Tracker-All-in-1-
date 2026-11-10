// Demo for new users (6 fictional bills, 2 fictional debts, never saved), Upcoming filters,
// greeting, double-tap safety, investment accounts.  Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/platform.js [--shots dir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
// what is really stored in IndexedDB (not what's on screen)
const stored = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('wealthtrack'); r.onsuccess = () => { const db = r.result; const out = {}; const cs = ['templates', 'debts', 'incomes', 'payments', 'meta'].filter(c => db.objectStoreNames.contains(c)); const tx = db.transaction(cs); let n = cs.length; cs.forEach(c => { const g = tx.objectStore(c).getAll(); g.onsuccess = () => { out[c] = g.result; if (!--n) res(out); }; }); }; }));

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (sample, extra) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); } catch (e) { } });
    if (sample) await ctx.addInitScript({ path: SAMPLE });
    if (extra) await ctx.addInitScript(extra);
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
    return { ctx, page };
  };
  const go = async (page, r) => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };

  // ---------------- demo for a brand-new user
  {
    const { ctx, page } = await mk(false);
    ok(await page.locator('.demo-bar').count() === 1 && /DEMO/.test(await page.locator('.demo-bar').textContent()), 'new user sees the DEMO banner');
    const mem = await page.evaluate(() => ({ tpl: Object.keys(WT.D.templates).length, debts: WT.debts().length, names: Object.values(WT.D.templates).map(t => t.name) }));
    ok(mem.tpl === 6 && mem.debts === 2, 'demo has exactly 6 bills and 2 debts');
    ok(mem.names.every(n => /^Demo /.test(n)), 'demo bills are clearly fictional (' + mem.names.join(', ') + ')');
    let st = await stored(page);
    ok(st.templates.length === 0 && st.debts.length === 0 && st.incomes.length === 0, 'nothing from the demo is stored');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'demo-dashboard.png') });
    // explore: Smart Budget works on the demo
    await go(page, 'smart');
    ok(!/Something went wrong/.test(await page.locator('#main').textContent()) && await page.locator('.demo-bar').count() === 1, 'Smart Budget works in the demo');
    // a payment in the demo is not stored
    await go(page, 'bills'); await page.locator('#main [data-act=markPaid]').first().click(); await page.waitForTimeout(400);
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(200);
    st = await stored(page);
    ok(await page.evaluate(() => Object.keys(WT.D.payments).length) >= 1 && st.payments.length === 0, 'demo payments are never saved');
    ok(await page.evaluate(() => !window.WTWealth || WTWealth.netWorth().demo === true), 'demo net worth is flagged as demo');
    // a real choice made during the demo (theme) IS kept
    await page.evaluate(() => { WT.saveSettings({ theme: 'dark' }); }); await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(200);
    st = await stored(page);
    const realSettings = (st.meta.find(m => m.id === 'settings') || {});
    ok(realSettings.theme === 'dark' && !realSettings.demo && !(realSettings.setAsides || []).length, 'device choices made in the demo are saved; demo budget data is not');
    // reload: still demo (not dismissed), still nothing stored
    await page.reload(); await page.waitForFunction(() => window.__wtReady);
    ok(await page.locator('.demo-bar').count() === 1 && (await stored(page)).templates.length === 0, 'demo comes back on reload until dismissed, still not stored');
    // adding your own bill leaves the demo first
    await go(page, 'bills'); await page.locator('.fab, [data-act=quickAdd]').first().click(); await page.waitForTimeout(300);
    ok(/Leave the demo/.test(await page.locator('.overlay').textContent()), 'adding your own records asks to leave the demo');
    await page.locator('.overlay button[type=submit], .overlay .btn.primary').last().click(); await page.waitForTimeout(500);
    ok(await page.evaluate(() => Object.keys(WT.D.templates).length) === 0 && await page.locator('.demo-bar').count() === 0, 'demo closed: back to your empty records');
    ok(await page.locator('.overlay, #menu').count() >= 1, 'then the add menu opens');
    await page.keyboard.press('Escape');
    await page.reload(); await page.waitForFunction(() => window.__wtReady);
    ok(await page.locator('.demo-bar').count() === 0 && await page.evaluate(() => Object.keys(WT.D.templates).length) === 0, 'after leaving, the demo never returns and real data stays empty');
    await ctx.close();
  }
  // "Use my own data" button
  {
    const { ctx, page } = await mk(false);
    await page.click('.demo-bar [data-act=demoExit]'); await page.waitForTimeout(200);
    await page.locator('.overlay button[type=submit], .overlay .btn.primary').last().click(); await page.waitForTimeout(400);
    ok(await page.locator('.demo-bar').count() === 0 && await page.evaluate(() => WT.debts().length) === 0, '"Use my own data" removes the demo');
    await ctx.close();
  }
  // someone with real data never sees the demo
  {
    const { ctx, page } = await mk(true);
    ok(await page.locator('.demo-bar').count() === 0, 'existing data: no demo');
    // ---------------- Upcoming: exactly 4 choices, This month by default, remembered; the old This month tab is merged in
    await go(page, 'bills'); await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.waitForTimeout(250);
    const labels = await page.locator('.up-range button').allTextContents();
    ok(JSON.stringify(labels) === JSON.stringify(['Through a date', 'This month', '30 days', '60 days']), 'Upcoming has exactly 4 choices: ' + labels.join(', '));
    ok(/on/.test(await page.locator('.up-range button[data-r=month]').getAttribute('class')), 'This month is the default');
    const tabs = await page.locator('[data-act=billsTab]').allTextContents();
    ok(JSON.stringify(tabs.map(x => x.trim())) === JSON.stringify(['Upcoming', 'All bills', 'Subscriptions']), 'Bills has 3 tabs (no separate This month): ' + tabs.join(', '));
    ok(await page.locator('#main .month-sel [data-act=monthStep]').count() === 2, 'This month has the month picker to browse months');
    const mIds = await page.evaluate(() => [...document.querySelectorAll('#main .bill[data-inst]')].map(b => b.dataset.inst));
    const allMonth = await page.evaluate(() => WT.instancesForMonth(WT.monthOf(WT.todayStr())).length);
    ok(new Set(mIds).size >= allMonth, 'This month lists every bill of the month, paid ones too (' + new Set(mIds).size + '/' + allMonth + ')');
    ok(/Left to pay this month/.test(await page.locator('#main').textContent()) && /Paychecks coming/.test(await page.locator('#main').textContent()), 'This month shows the cash outlook (left to pay, paychecks)');
    const due = await page.evaluate(() => [...document.querySelectorAll('#main .bill[data-inst]')].map(b => WT.D.instances[b.dataset.inst].dueDate));
    const eom = await page.evaluate(() => WT.monthEnd(WT.monthOf(WT.todayStr())));
    ok(due.length > 0 && due.every(d => d <= eom), 'This month shows bills due by ' + eom);
    await page.click('.up-range button[data-r="60"]'); await page.waitForTimeout(250);
    const due60 = await page.evaluate(() => [...document.querySelectorAll('#main .bill[data-inst]')].map(b => WT.D.instances[b.dataset.inst].dueDate));
    const lim = await page.evaluate(() => WT.addDays(WT.todayStr(), 60));
    ok(due60.some(d => d > eom) && due60.every(d => d <= lim), '60 days reaches past the month end, none past ' + lim);
    ok(await page.evaluate(() => [...document.querySelectorAll('#main .bill[data-inst]')].every(b => { const i = WT.D.instances[b.dataset.inst]; return WT.instStatus(i).remaining > 0; })), 'paid bills are not shown as outstanding');
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(200);
    await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'bills'); await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.waitForTimeout(250);
    ok(/on/.test(await page.locator('.up-range button[data-r="60"]').getAttribute('class')), 'the choice is remembered');
    await page.evaluate(() => { WTApp.ui.upRange = '14'; WT.saveSettings({ upRange: undefined }); WTApp.refresh(); }); await page.waitForTimeout(150);
    ok(/on/.test(await page.locator('.up-range button[data-r=month]').getAttribute('class')), 'an old saved choice falls back to This month');
    // ---------------- greeting
    await go(page, 'dashboard');
    const h1 = (await page.locator('#main h1').first().textContent()).trim();
    ok(/^Good (Morning|Afternoon|Evening)$/.test(h1), 'no name yet: generic greeting "' + h1 + '"');
    await page.evaluate(() => { WT.saveSettings({ profile: { first: 'Sam' } }); WTApp.refresh(); }); await page.waitForTimeout(150);
    const hour = await page.evaluate(() => new Date().getHours());
    const want = hour < 12 ? 'Good Morning, Sam' : hour < 17 ? 'Good Afternoon, Sam' : 'Good Evening, Sam';
    ok((await page.locator('#main h1').first().textContent()).trim() === want, 'greets by preferred name and local time: ' + want);
    // ---------------- double tap never pays the bill that slides under your finger
    await go(page, 'bills'); await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.click('.up-range button[data-r=month]'); await page.waitForTimeout(250);
    const before = await page.evaluate(() => Object.values(WT.D.payments).filter(p => !p.voided).length);
    const btn = page.locator('#main [data-act=markPaid]').first(); await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(150); const box = await btn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(120);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500);
    ok(await page.evaluate(() => Object.values(WT.D.payments).filter(p => !p.voided).length) - before === 1, 'a fast double tap pays exactly one bill');
    // ---------------- investment / property accounts count toward net worth
    await go(page, 'settings/accounts'); await page.click('[data-act=addAccount]'); await page.waitForTimeout(200);
    const types = await page.locator('.overlay select[name=type] option').allTextContents();
    ok(types.some(t => /Investment/.test(t)) && types.some(t => /Property/.test(t)), 'account types include Investment and Property');
    await ctx.close();
  }
  // ---------------- quick Settings button, Log out, lock-screen greeting
  {
    const { ctx, page } = await mk(true);
    for (const r of ['dashboard', 'bills', 'paychecks', 'smart', 'debts', 'progress', 'settings']) {
      await go(page, r);
      const n = await page.locator('#main .topbar .quick-set').count();
      const box = n ? await page.locator('#main .topbar .quick-set').boundingBox() : null;
      ok(n === 1 && box && box.x + box.width > 330, 'Settings button top right on ' + r);
    }
    await go(page, 'bills'); await page.click('#main .topbar .quick-set'); await page.waitForTimeout(200);
    ok(await page.evaluate(() => location.hash) === '#/settings', 'Settings button opens Settings');
    ok(await page.locator('#main [data-act=customizeDash]').count() === 0, 'no second gear on the dashboard');
    // Log out with no PIN yet: offers to create one
    await page.click('[data-act=moreMenu]'); await page.waitForTimeout(150);
    const items = await page.locator('#menu button').allTextContents();
    ok(items[items.length - 1].trim() === 'Log out', 'More menu ends with Log out');
    await page.locator('#menu button', { hasText: 'Log out' }).click(); await page.waitForTimeout(250);
    ok(/Set a PIN first/.test(await page.locator('.overlay').textContent()), 'no PIN: Log out offers to create one');
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    // with a PIN: confirm, then the lock screen greets by first name
    await page.evaluate(async () => { WT.saveSettings({ profile: { first: 'Sam', last: 'Rivers' } }); WTApp.refresh(); await WTStore.changeLock('246813', WT.D); });
    await page.waitForTimeout(300);
    await page.click('[data-act=moreMenu]'); await page.waitForTimeout(150);
    await page.locator('#menu button', { hasText: 'Log out' }).click(); await page.waitForTimeout(250);
    ok(/Log out\?/.test(await page.locator('.overlay').textContent()) && /PIN/.test(await page.locator('.overlay').textContent()), 'Log out asks to confirm');
    await page.locator('.overlay .btn.primary, .overlay button[type=submit]').last().click();
    await page.waitForSelector('.auth .pin-dots', { timeout: 8000 });
    const title = (await page.locator('.auth h1').textContent()).trim();
    const hour = await page.evaluate(() => new Date().getHours());
    const want = (hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening') + ', Sam';
    ok(title === want, 'lock screen greets by name: ' + title);
    ok(await page.evaluate(() => !window.WT.D || !Object.keys(WT.D.templates || {}).length), 'after logging out nothing is loaded until the PIN is entered');
    ok(await page.evaluate(() => WTStore.greetName()) === 'Sam' && await page.evaluate(() => new Promise(r => { const q = indexedDB.open('wealthtrack'); q.onsuccess = () => { const g = q.result.transaction('sys').objectStore('sys').get('greet'); g.onsuccess = () => r(Object.keys(g.result || {}).sort().join()); }; })) === 'first,id', 'only the first name is kept (unencrypted) for the greeting');
    await page.keyboard.type('246813'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__wtReady && WT.D && Object.keys(WT.D.templates).length > 0, null, { timeout: 8000 });
    ok(true, 'PIN opens the app again');
    await ctx.close();
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
