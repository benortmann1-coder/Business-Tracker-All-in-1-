// Home screen extras: Today's Wealth Tip, net worth card, Progress page (milestones, notifications, saved tips).
// Run: node wealthtrack/build.js && NODE_PATH=$(npm root -g) node wealthtrack/tests/home.js [--shots dir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js');
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
// settings really stored in IndexedDB (not what's in memory)
const storedSettings = page => page.evaluate(() => new Promise(res => { const r = indexedDB.open('wealthtrack'); r.onsuccess = () => { const db = r.result; const g = db.transaction('meta').objectStore('meta').getAll(); g.onsuccess = () => res(g.result.find(m => m.id === 'settings') || {}); }; }));
// record every toast shown from now on (toasts remove themselves after a few seconds)
const watchToasts = page => page.evaluate(() => { window.__toasts = []; const w = document.getElementById('toasts'); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) window.__toasts.push(n.textContent); }))).observe(w, { childList: true }); });
const toasts = page => page.evaluate(() => window.__toasts.slice());
const shot = (page, name, full) => SHOTS ? page.screenshot({ path: path.join(SHOTS, name), fullPage: !!full }) : null;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const mk = async (o) => {
    o = o || {};
    const ctx = await browser.newContext({ viewport: { width: o.width || 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1, colorScheme: o.dark ? 'dark' : 'light', reducedMotion: 'reduce' });
    await ctx.addInitScript(demo => { try { localStorage.setItem('wt.skipOnboarding', '1'); if (!demo) localStorage.setItem('wt.demoDone', '1'); } catch (e) { } }, !!o.demo);
    if (!o.demo) await ctx.addInitScript({ path: SAMPLE });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    if (o.time) await page.clock.setFixedTime(new Date(o.time));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
    return { ctx, page };
  };
  const go = async (page, r) => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(250); };
  const reload = async page => { await page.reload(); await page.waitForFunction(() => window.__wtReady); await page.waitForTimeout(150); };
  const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && [...document.querySelectorAll('.hm-card, .hm-list, .hm-sec')].every(e => e.getBoundingClientRect().right <= window.innerWidth + 1));

  // ---------------- tip of the day + net worth card
  let todayTipId;
  {
    const { ctx, page } = await mk();
    ok(await page.evaluate(() => window.WTHomeUI && window.WTHomeUI.ready === true && !!(window.WTExt && WTExt.home && WTExt.home.act.hmTipFav)), 'WTHomeUI registered with hm actions');
    ok(await page.locator('#wt-home-css').count() === 1, 'one injected <style id="wt-home-css">');
    const exp = await page.evaluate(() => WTTips.forDate(WT.todayStr()));
    todayTipId = exp.id;
    const card = page.locator('.hm-tip');
    ok(await card.count() === 1, 'dashboard shows the tip card');
    ok(await card.getAttribute('data-tip-id') === exp.id && (await card.locator('.hm-tip-text').textContent()).trim() === exp.text, "tip card shows today's WTTips.forDate tip");
    ok((await card.locator('.hm-topic').textContent()).trim() === exp.topicName, 'topic label shown (' + exp.topicName + ')');
    ok((await card.locator('details.hm-more').count()) === (exp.more ? 1 : 0), '"Why it matters" only when the tip has an explanation');
    const nw = await page.evaluate(() => WTWealth.netWorth());
    const nwCard = page.locator('.hm-nw');
    ok(+(await nwCard.locator('[data-nw-cents]').getAttribute('data-nw-cents')) === nw.netWorth, 'net worth card equals WTWealth.netWorth() (' + nw.netWorth + ')');
    ok(+(await nwCard.locator('[data-nw-assets]').getAttribute('data-nw-assets')) === nw.totalAssets && +(await nwCard.locator('[data-nw-liab]').getAttribute('data-nw-liab')) === nw.totalLiabilities, 'assets and liabilities match');
    const txt = await nwCard.textContent();
    ok(/since last month/.test(txt) && (!nw.estimate || /estimate/i.test(txt)), 'change vs last month shown, labeled estimate when flagged');
    ok(await nwCard.locator('a[href="#/progress"]').count() === 1, 'net worth card links to Progress');
    ok(!/Demo/.test(txt), 'real data: no demo label');
    await shot(page, 'home-dashboard.png');
    // favorite
    const before = await page.locator('.hm-tip .hm-fav').getAttribute('aria-pressed');
    await page.click('.hm-tip [data-act=hmTipFav]'); await page.waitForTimeout(200);
    ok(before === 'false' && await page.locator('.hm-tip .hm-fav').getAttribute('aria-pressed') === 'true', 'favorite toggles on');
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(150);
    ok(((await storedSettings(page)).tips || {}).favorites?.[0] === exp.id, 'favorite saved as settings.tips.favorites = [tip id]');
    await reload(page);
    ok(await page.locator('.hm-tip').getAttribute('data-tip-id') === exp.id, 'same tip after reload');
    ok(await page.locator('.hm-tip .hm-fav').getAttribute('aria-pressed') === 'true', 'favorite persists after reload');
    await go(page, 'progress');
    ok(await page.locator(`.hm-saved-tips [data-tip-id="${exp.id}"]`).count() === 1, 'favorite appears in Progress → Saved tips');
    // unfavorite from Progress
    await page.click(`.hm-saved-tips [data-tip-id="${exp.id}"] [data-act=hmTipFav]`); await page.waitForTimeout(200);
    ok(await page.locator('.hm-saved-tips [data-tip-id]').count() === 0 && (await page.evaluate(() => WT.settings().tips.favorites.length)) === 0, 'removing a saved tip works');
    await ctx.close();
  }
  // another day → a different tip
  {
    const { ctx, page } = await mk({ time: '2026-03-15T10:00:00' });
    const id = await page.locator('.hm-tip').getAttribute('data-tip-id');
    const exp = await page.evaluate(() => WTTips.forDate('2026-03-15').id);
    ok(id === exp && id !== todayTipId, 'clock on another day shows that day\'s different tip (' + id + ' vs ' + todayTipId + ')');
    await ctx.close();
  }

  // ---------------- Progress + achievements
  {
    const { ctx, page } = await mk();
    await go(page, 'progress');
    ok(/Progress/.test(await page.locator('.topbar h1').textContent()), 'Progress topbar');
    const ids = await page.locator('[data-ach]').evaluateAll(els => els.map(e => e.dataset.ach));
    const all = await page.evaluate(() => WTWealth.MILESTONES.map(m => m.id));
    ok(ids.length === 22 && all.length === 22 && all.every(i => ids.includes(i)), 'Progress lists all 22 milestones');
    ok(await page.locator('.hm-group').count() === 3 && /Debt/.test(await page.locator('.hm-group[data-group=debt] h2').textContent()) && /Net worth/.test(await page.locator('.hm-group[data-group=networth] h2').textContent()) && /Savings/.test(await page.locator('.hm-group[data-group=savings] h2').textContent()), 'grouped Debt / Net worth / Savings');
    ok(await page.locator('.hm-trend svg').count() === 1, 'trend chart drawn');
    ok(await page.locator('.hm-ach.next .hm-bar').count() >= 1, 'progress bar toward the next milestone');
    ok(/Only on this device/.test(await page.locator('.hm-privacy').textContent()), 'privacy note');
    ok(await page.locator('[data-act-change=hmNotify]').isChecked(), 'notifications on by default');
    ok(await page.locator('[data-ach=debt_first_payoff][data-earned=""]').count() === 1, 'first payoff not earned yet');
    // pay off the Gas Card ($250)
    await watchToasts(page);
    const bal = await page.evaluate(() => WT.debtBalance('debt_gascard'));
    ok(bal === 25000, 'Gas Card owes $250.00');
    await page.evaluate(b => { WT.payDebtExtra('debt_gascard', b - 10000); WT.payDebtExtra('debt_gascard', 10000); WTApp.refresh(); }, bal);
    await page.waitForTimeout(900);
    const td = await page.evaluate(() => WT.todayStr());
    ok(await page.evaluate(() => WT.debtBalance('debt_gascard')) === 0, 'Gas Card paid off');
    ok(await page.locator(`[data-ach=debt_first_payoff][data-earned="${td}"]`).count() === 1, '"First debt paid off" earned with today\'s date');
    ok(await page.locator(`[data-ach=debt_first_payment][data-earned="${td}"]`).count() === 1, '"First debt payment recorded" earned with today\'s date');
    ok(/Earned/.test(await page.locator('[data-ach=debt_first_payoff]').textContent()), 'earned date shown');
    await page.waitForTimeout(1600);
    let t = (await toasts(page)).filter(x => /Milestone reached/.test(x));
    ok(t.length === 2 && t.some(x => /First debt paid off/.test(x)) && t.some(x => /First debt payment/.test(x)), 'one toast per new milestone (' + t.length + ')');
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(150);
    const st = await storedSettings(page);
    ok(st.achievements && st.achievements.debt_first_payoff === td && st.achievements.debt_first_payment === td, 'settings.achievements saved with dates');
    // navigate around: no repeat toasts
    await go(page, 'dashboard'); await go(page, 'progress'); await page.waitForTimeout(400);
    ok((await toasts(page)).filter(x => /Milestone reached/.test(x)).length === 2, 'no repeat toast when re-rendering');
    await reload(page); await watchToasts(page); await go(page, 'dashboard'); await go(page, 'progress'); await page.waitForTimeout(600);
    ok((await toasts(page)).filter(x => /Milestone reached/.test(x)).length === 0, 'no toast again after reload');
    ok(await page.locator('[data-ach=debt_first_payoff]').count() === 1 && Object.keys(await page.evaluate(() => WT.settings().achievements)).filter(k => k === 'debt_first_payoff').length === 1 && (await page.evaluate(() => WTWealth.check())).length === 0, 'no duplicate after reload');
    await shot(page, 'home-progress.png', true);
    // 360px
    await page.setViewportSize({ width: 360, height: 780 }); await page.waitForTimeout(150);
    ok(await noOverflow(page), '360px: Progress has no horizontal overflow');
    const small = await page.locator('.hm-fav, .hm-link, .hm-more summary').evaluateAll(els => els.filter(e => e.offsetParent).filter(e => e.getBoundingClientRect().height < 40).length);
    ok(small === 0, 'tap targets at least 40px tall');
    await go(page, 'dashboard'); await page.waitForTimeout(150);
    ok(await noOverflow(page), '360px: dashboard has no horizontal overflow');
    const small2 = await page.locator('.hm-fav, .hm-link, .hm-more summary').evaluateAll(els => els.filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).length);
    ok(small2 === 0, 'dashboard tap targets at least 40px');
    await shot(page, 'home-dashboard-360.png');
    await ctx.close();
  }
  // notifications off: recorded, but no toast
  {
    const { ctx, page } = await mk();
    await go(page, 'progress');
    await page.locator('label.hm-set').click(); await page.waitForTimeout(200);
    ok(await page.evaluate(() => WT.settings().achievementsNotify === false && WTWealth.notifyEnabled() === false), 'toggle writes settings.achievementsNotify = false');
    await reload(page); await go(page, 'progress');
    ok(!(await page.locator('[data-act-change=hmNotify]').isChecked()), 'toggle state persists');
    await watchToasts(page);
    await page.evaluate(() => { WT.payDebtExtra('debt_gascard', WT.debtBalance('debt_gascard')); WTApp.refresh(); });
    await page.waitForTimeout(1500);
    ok((await toasts(page)).filter(x => /Milestone/.test(x)).length === 0, 'no milestone toast when notifications are off');
    ok(!!(await page.evaluate(() => WT.settings().achievements || {})).debt_first_payoff, 'milestone still recorded silently');
    await ctx.close();
  }

  // ---------------- demo: labeled, never records achievements
  {
    const { ctx, page } = await mk({ demo: true });
    ok(await page.locator('.demo-bar').count() === 1, 'demo is showing');
    ok(/Demo — not your real net worth/.test(await page.locator('.hm-nw').textContent()), 'demo net worth card says "Demo — not your real net worth"');
    await shot(page, 'home-demo-dashboard.png');
    await watchToasts(page);
    // the demo's debt gets paid off: still nothing recorded
    await page.evaluate(() => { WT.payDebtExtra('debt_demo_card', WT.debtBalance('debt_demo_card')); WTApp.refresh(); });
    await go(page, 'progress'); await page.waitForTimeout(600);
    ok(await page.evaluate(() => WTWealth.check().length === 0 && !WT.settings().achievements), 'demo: nothing recorded in memory');
    ok(await page.locator('.hm-ach.earned').count() === 0 && /Demo/.test(await page.locator('.hm-progress').textContent()), 'demo Progress: no earned milestones, demo label');
    ok((await toasts(page)).filter(x => /Milestone/.test(x)).length === 0, 'demo: no milestone toasts');
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(150);
    const st = await storedSettings(page);
    ok(!st.achievements, 'demo: no achievements stored in real settings');
    // a favorite made during the demo is a device choice and is kept
    await go(page, 'dashboard'); await page.click('.hm-tip [data-act=hmTipFav]'); await page.waitForTimeout(200);
    await page.evaluate(() => WTStore.flush()); await page.waitForTimeout(150);
    ok(((await storedSettings(page)).tips || {}).favorites?.length === 1, 'demo: saving a tip is kept in real settings');
    await ctx.close();
  }

  // ---------------- dark mode
  {
    const { ctx, page } = await mk({ dark: true });
    const lum = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.hm-card')).backgroundColor.match(/\d+/g).map(Number); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; });
    const ink = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.hm-tip-text')).color.match(/\d+/g).map(Number); return (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000; });
    ok(lum < 60 && ink > 180, 'dark mode: dark cards, light text (' + lum.toFixed(0) + ' / ' + ink.toFixed(0) + ')');
    await shot(page, 'home-dashboard-dark.png');
    await go(page, 'progress'); await shot(page, 'home-progress-dark.png', true);
    ok(!/Something went wrong/.test(await page.locator('#main').textContent()), 'dark Progress renders');
    await ctx.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
