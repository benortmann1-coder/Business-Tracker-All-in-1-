// Smart Budget page: recommended split, strategy comparison, sliders, save/history, guards, blank data.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/smartbudget.js [--shots <dir>]   (after node wealthtrack/build.js)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const fi = process.argv.indexOf('--file');
const FILE = 'file://' + (fi > 0 ? path.resolve(process.argv[fi + 1]) : path.join(__dirname, '../dist/WealthTrack.html'));
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
const cents = s => { const m = String(s).replace(/[^0-9.-]/g, ''); return Math.round(parseFloat(m) * 100); };
const W$ = c => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// everything except settings: Smart Budget must never touch money data
// (canonical: sorted keys, since records reloaded from IndexedDB can come back in a different key order)
const DATA = () => { const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v; return JSON.stringify(WT.COLLS.filter(c => c !== 'meta').map(c => [c, canon(WT.D[c])])); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  // every context loads the made-up sample data, except { blank: true } (a fresh install, which must start blank)
  const open = async (opts) => {
    opts = Object.assign({}, opts || {}); const blank = opts.blank; delete opts.blank;
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 }, opts));
    await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
    if (!blank) await ctx.addInitScript({ path: path.join(__dirname, 'fixtures/sample-data.js') });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
    return { ctx, page };
  };
  const { ctx, page } = await open();
  const go = async (p, r) => { await p.evaluate(r => { location.hash = '#/' + r; }, r); await p.waitForTimeout(250); };
  const shot = async (p, n, full) => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: !!full }); } };
  const mainText = p => p.locator('#main').textContent();

  ok(await page.evaluate(() => !!(window.WTSmart && WTSmart.analyze)), 'engine loaded (window.WTSmart)');
  const before = await page.evaluate(DATA);

  // reachable: phone More menu (the old Budgets page is gone)
  await page.click('[data-act=moreMenu]'); await page.waitForTimeout(150);
  const menuItems = await page.locator('#menu button').allTextContents();
  ok(menuItems.some(t => /Smart Budget/.test(t)) && !menuItems.some(t => /^\s*Budgets\s*$/.test(t)), 'More menu lists Smart Budget, no separate Budgets');
  await page.locator('#menu button', { hasText: 'Smart Budget' }).click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => location.hash) === '#/smart' && /Smart Budget/.test(await page.locator('#main h1').textContent()), 'More → Smart Budget opens #/smart');
  await go(page, 'budgets');
  ok(await page.evaluate(() => WTApp.ui.route) === 'smart', 'old Budgets link opens Smart Budget');
  await go(page, 'dashboard');
  ok(await page.locator('#main a[href="#/smart"]').count() >= 1, 'dashboard Smart Budget widget');

  // 1) recommended card
  await go(page, 'smart');
  ok(!/Something went wrong/.test(await mainText(page)), 'page renders with sample data');
  const income = await page.evaluate(() => WTSmart.analyze().income);
  // sample data: $1,600 biweekly x 26 / 12 = $3,466.67 a month
  ok(income === 346667, 'sample data has take-home income ' + income);
  const A0 = await page.evaluate(() => { const A = WTSmart.analyze(); return { living: A.living, min: A.debtMinimums, free: A.free, shortfall: A.shortfall }; });
  // living 210667 + minimums 82500 (380+175+150+40+50+30) = 293167; free = 346667 - 293167 = 53500
  ok(A0.living === 210667 && A0.min === 82500 && A0.free === 53500 && A0.shortfall === 0, 'sample data: living $2,106.67, minimums $825, $535 free, no shortfall ' + JSON.stringify(A0));
  const rows = await page.locator('.sb-hero .sb-row').evaluateAll(els => els.map(e => ({ k: e.dataset.bucket, p: +e.dataset.pct, a: +e.dataset.amt, pt: e.querySelector('.sb-p').textContent, at: e.querySelector('.sb-a').textContent })));
  ok(rows.length === 4 && rows.map(r => r.k).join() === 'needs,debt,savings,wants', '4 bucket rows in order');
  ok(Math.abs(rows.reduce((s, r) => s + r.p, 0) - 100) < 0.05, 'percentages sum to 100 (' + rows.map(r => r.pt).join(' + ') + ')');
  ok(Math.abs(rows.reduce((s, r) => s + parseFloat(r.pt), 0) - 100) < 0.05, 'percentages as shown sum to 100');
  ok(rows.reduce((s, r) => s + r.a, 0) === income && rows.reduce((s, r) => s + cents(r.at), 0) === income, 'amounts sum to take-home pay');
  ok(await page.locator('.sb-hero svg[role=img]').count() === 1 && /Needs/.test(await page.locator('.sb-hero svg[role=img]').getAttribute('aria-label')), 'donut chart with accessible label');
  ok((await page.locator('.sb-why').count()) === 1, 'shows why');
  await shot(page, 'smart-top');

  // 2) comparison
  const cards = await page.locator('.sb-cards .sb-card').evaluateAll(els => els.map(e => e.dataset.strategy));
  const kinds = await page.locator('.sb-cards .sb-card').evaluateAll(els => els.map(e => e.dataset.strategy + ':' + ((e.querySelector('.sb-kind-tag') || {}).textContent || '')));
  const wantKinds = { recommended: 'Personalized', '50-30-20': 'Balanced', '60-20-20': 'High cost of living', debt: 'Debt payoff', savings: 'Savings builder', zero: 'Zero-based', custom: 'Your own split' };
  ok(kinds.length >= 5 && kinds.every(x => { const [id, t] = x.split(':'); return wantKinds[id] === t; }), 'each strategy card is labeled with its kind: ' + kinds.join(', '));
  ok(await page.locator('.sb-cards .sb-card .sb-kind span:not(.sb-kind-tag)').count() === kinds.length, 'each label has a one-line description');
  ok(/Personalized/.test(await page.locator('.sb-hero').textContent()), 'recommended card labeled Personalized');
  ok(['recommended', '50-30-20', '60-20-20', 'debt', 'savings', 'zero'].every(id => cards.includes(id)), 'strategy cards incl. Zero-based: ' + cards.join(', '));
  const eng = await page.evaluate(() => { const A = WTSmart.analyze(); const L = WTSmart.strategies(A); return { best: WTSmart.compare(A, L).bestId, unreal: L.filter(s => s.realistic === false).map(s => s.id), real: L.filter(s => s.realistic === true).map(s => s.id) }; });
  const bestCards = await page.locator('.sb-cards .sb-card:has(.pill:text-is("Best fit"))').evaluateAll(els => els.map(e => e.dataset.strategy + ':' + e.dataset.realistic));
  ok(eng.best && eng.real.includes(eng.best) && bestCards.length === 1, 'sample data (not short): a realistic Best fit is shown (' + (bestCards.join() || 'none') + ')');
  ok(bestCards.length <= 1 && bestCards.every(x => /:true$/.test(x)) && (eng.best && eng.real.includes(eng.best) ? bestCards[0] === eng.best + ':true' : bestCards.length === 0), 'Best fit only on a realistic strategy (' + (bestCards.join() || 'none') + ')');
  const unrealCards = await page.locator('.sb-cards .sb-card:has(.pill:text-is("Not realistic"))').evaluateAll(els => els.map(e => e.dataset.strategy));
  ok(eng.unreal.every(id => unrealCards.includes(id)) && await page.locator('.sb-cards .sb-card .pill.sb-ok').count() + unrealCards.length === cards.length, 'every card says Realistic or Not realistic, matching the engine (' + unrealCards.join(', ') + ')');
  ok(await page.locator('.sb-cards .sb-card[data-strategy=zero]').count() === 1 && /Zero-based/.test(await page.locator('.sb-cards .sb-card[data-strategy=zero]').textContent()), 'Zero-based strategy card');
  const card0 = await page.locator('.sb-cards .sb-card[data-strategy=recommended]').textContent();
  ok(/Debt minimums/.test(card0) && /Extra on debt/.test(card0) && /Spending money/.test(card0) && /Saved in a year/.test(card0) && /Debt-free/.test(card0), 'cards show minimum vs extra debt, spending money, annual savings, debt-free');
  ok(await page.locator('.sb-cards [data-act=sbCustomize]').count() === cards.length, 'every card has Customize this');
  ok(await page.locator('.sb-cmp-tbl').isHidden(), 'phone: cards, not the table');
  await page.locator('.sb-card[data-strategy="50-30-20"]').scrollIntoViewIfNeeded();
  await shot(page, 'smart-compare');
  await page.locator('.sb-card[data-strategy="50-30-20"] [data-act=sbUse]').click(); await page.waitForTimeout(300);
  let sb = await page.evaluate(() => WT.settings().smartBudget);
  const mk = await page.evaluate(() => WT.monthOf(WT.todayStr()));
  ok(sb && sb.strategyId === '50-30-20', '"Use this" saves strategyId');
  ok(Array.isArray(sb.history) && sb.history.filter(h => h.month === mk).length === 1 && sb.history.find(h => h.month === mk).strategyId === '50-30-20', '"Use this" stores this month in history');
  ok(await page.locator('.sb-card[data-strategy="50-30-20"] button[disabled]', { hasText: 'In use' }).count() === 1, 'chosen strategy shows In use');

  // 3) Customize: Dollars | Percent editor over an unsaved draft
  const K = ['needs', 'debt', 'savings', 'wants'];
  await page.locator('#sbEdit').scrollIntoViewIfNeeded();
  await page.evaluate(() => { document.querySelector('.sb-custom').__keep = 1; });
  const ed = () => page.evaluate(() => { const K = ['needs', 'debt', 'savings', 'wants']; const rb = document.querySelector('#sbRemain'); return {
    f: K.map(k => document.querySelector('#sbf-' + k).value), r: K.map(k => +document.querySelector('#sb-' + k).value), cp: K.map(k => document.querySelector('#sbc-' + k).textContent),
    dis: K.map(k => document.querySelector('#sbf-' + k).disabled), cls: rb.className, label: rb.querySelector('.sb-remain-l').textContent, val: rb.querySelector('.sb-remain-v').textContent,
    keep: !!(document.querySelector('.sb-custom') || {}).__keep, focus: document.activeElement && document.activeElement.id, warn: document.querySelector('#sbWarn').textContent, dirty: document.querySelector('#sbDirty').textContent,
    donut: document.querySelector('.sb-ed-donut svg').getAttribute('aria-label') }; });
  const fc = v => cents(v);   // "1,500.50" -> 150050
  const typeIn = async (sel, txt) => { await page.click(sel, { clickCount: 3 }); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.type(sel, txt); };
  const e0 = await ed();
  ok(await page.locator('[data-act=sbMode][data-v=dollars]').getAttribute('aria-pressed') === 'true', 'editor opens in Dollars mode');
  ok(await page.locator('.sb-amt').evaluateAll(els => els.length === 4 && els.every(e => e.inputMode === 'decimal' && parseFloat(getComputedStyle(e).fontSize) >= 16)), '4 amount fields: inputmode=decimal (number keypad), font >= 16px');
  ok(e0.f.reduce((t, v) => t + fc(v), 0) === income && /Every dollar/.test(e0.label), 'starts from the saved plan (' + e0.f.join(' / ') + ')');
  // typed dollars with cents: updates live in place, focus kept, other buckets untouched
  await typeIn('#sbf-needs', '1500.5');
  let e1 = await ed();
  ok(e1.focus === 'sbf-needs' && e1.keep && e1.f[0] === '1500.5', 'typing keeps focus and the typed text (no re-render)');
  ok(e1.f.slice(1).join() === e0.f.slice(1).join(), 'other buckets are not changed by typing');
  ok(e1.cp[0] === (Math.round(150050 * 1000 / income) / 10) + '% of take-home', 'percent worked out live: ' + e1.cp[0]);
  ok(e1.donut !== e0.donut && /Needs/.test(e1.donut), 'chart updates as you type');
  await page.keyboard.press('Enter');
  e1 = await ed();
  ok(e1.f[0] === '1,500.50', 'formatted as currency on blur: ' + e1.f[0]);
  ok(/Unsaved/.test(e1.dirty), 'shows Unsaved changes');
  // under 100%: Remaining to allocate
  await typeIn('#sbf-debt', '500'); await typeIn('#sbf-savings', '200'); await typeIn('#sbf-wants', '100.25'); await page.keyboard.press('Tab');
  let e2 = await ed();
  const left = income - (150050 + 50000 + 20000 + 10025);
  ok(/left/.test(e2.cls) && e2.label === 'Remaining to allocate' && fc(e2.val) === left, 'less than 100% is allowed: Remaining to allocate ' + e2.val);
  ok(e2.f.join('|') === '1,500.50|500.00|200.00|100.25', 'typed amounts kept exactly: ' + e2.f.join(' / '));
  ok(await page.locator('#sbRemain').evaluate(el => getComputedStyle(el).position) === 'sticky', 'Remaining bar is sticky (stays visible on phones)');
  // over 100%: warning, still editable
  await typeIn('#sbf-wants', '5000'); await page.keyboard.press('Tab');
  let e3 = await ed();
  const over = 150050 + 50000 + 20000 + 500000 - income;
  ok(/over/.test(e3.cls) && e3.label === 'Over by' && fc(e3.val) === over, 'over income shows Over by ' + e3.val);
  ok(/more than your take-home/.test(e3.warn) && e3.dis.every(d => !d) && await page.locator('[data-act=sbSave]').isEnabled(), 'over: warning shown, fields stay editable, Save not blocked');
  ok(/below your living costs/.test(e3.warn), 'needs below living costs: warning');
  await shot(page, 'smart-editor-over');
  // locks: locked amounts never change; spread uses only unlocked buckets
  await page.click('[data-act=sbLock][data-k=needs]'); await page.click('[data-act=sbLock][data-k=savings]');
  let e4 = await ed();
  ok(e4.dis[0] && e4.dis[2] && !e4.dis[1] && await page.locator('[data-act=sbLock][data-k=needs]').getAttribute('aria-pressed') === 'true', 'lock disables that bucket (aria-pressed)');
  ok(await page.locator('#sb-needs').isDisabled(), 'locked slider is disabled');
  await page.click('[data-act=sbSpread]');
  let e5 = await ed();
  ok(e5.f[0] === '1,500.50' && e5.f[2] === '200.00', 'spread: locked Needs and Savings unchanged');
  ok(e5.f.reduce((t, v) => t + fc(v), 0) === income && /ok/.test(e5.cls), 'spread: unlocked buckets absorb the difference, total = take-home');
  // put remaining into one bucket
  await typeIn('#sbf-debt', '1000'); await page.keyboard.press('Tab');
  const before5 = await ed();
  await page.selectOption('select.sb-into', 'wants');
  let e6 = await ed();
  ok(e6.f[1] === '1,000.00' && e6.f[0] === '1,500.50' && fc(e6.f[3]) === fc(before5.f[3]) + income - before5.f.reduce((t, v) => t + fc(v), 0) && /ok/.test(e6.cls), 'Put remaining into Wants: only Wants changes');
  // a slider moves only its own bucket
  await page.click('[data-act=sbLock][data-k=savings]');
  const before7 = await ed();
  await page.fill('#sb-savings', '10');
  let e7 = await ed();
  ok(fc(e7.f[2]) === Math.round(income * 0.1) && e7.f[0] === before7.f[0] && e7.f[1] === before7.f[1] && e7.f[3] === before7.f[3], 'slider moves only its bucket (no auto-rebalancing)');
  // percent mode
  await page.click('[data-act=sbMode][data-v=percent]');
  let e8 = await ed();
  ok(await page.locator('[data-act=sbMode][data-v=percent]').getAttribute('aria-pressed') === 'true' && /^\$/.test(e8.cp[1]) && e8.f[2] === '10', 'Percent mode shows % fields with $ alongside (' + e8.f.join(' / ') + ')');
  await typeIn('#sbf-debt', '12.5');
  let e9 = await ed();
  ok(e9.cp[1] === W$(Math.round(income * 0.125)) + ' a month' && e9.focus === 'sbf-debt', 'typed percent works out the dollars: ' + e9.cp[1]);
  ok(e9.f[0] === e8.f[0], 'locked Needs unchanged in percent mode');
  await page.click('[data-act=sbMode][data-v=dollars]');
  let e10 = await ed();
  ok(fc(e10.f[1]) === Math.round(income * 0.125) && e10.f[0] === '1,500.50', 'values stay in sync when switching back to Dollars');
  ok(await page.evaluate(() => { const s = WT.settings().smartBudget; return s.strategyId === '50-30-20' && !s.customDollars; }), 'editing alone saves nothing');
  await shot(page, 'smart-editor');
  // Cancel discards
  await page.click('[data-act=sbCancel]'); await page.waitForTimeout(150);
  let e11 = await ed();
  ok(e11.f.join() === e0.f.join() && /Saved plan/.test(e11.dirty) && e11.dis.every(d => !d), 'Cancel discards the draft (amounts and locks)');
  // Customize this: loads a strategy into the draft without saving
  const recAmts = await page.evaluate(() => { const s = WTSmart.strategies(WTSmart.analyze()).find(x => x.id === 'recommended'); return ['needs', 'debt', 'savings', 'wants'].map(k => s.amounts[k]); });
  await page.locator('.sb-card[data-strategy=recommended] [data-act=sbCustomize]').click(); await page.waitForTimeout(250);
  let e12 = await ed();
  ok(e12.f.map(fc).join() === recAmts.join() && /Unsaved/.test(e12.dirty), 'Customize this loads Recommended into the draft');
  ok(await page.evaluate(() => WT.settings().smartBudget.strategyId) === '50-30-20', 'Customize this does not save');
  // rollover is part of the draft, saved with Save
  await page.locator('.sb-roll summary').click();
  await page.selectOption('select[data-act-change=sbRoll][data-k=savings]', 'carry');
  await page.selectOption('select[data-act-change=sbRoll][data-k=wants]', 'debt');
  ok(await page.evaluate(() => !WT.settings().smartBudget.rollover), 'rollover choice is not saved until Save');
  await typeIn('#sbf-needs', '1700'); await typeIn('#sbf-debt', '1250.75'); await typeIn('#sbf-savings', '300'); await typeIn('#sbf-wants', '150'); await page.keyboard.press('Tab');
  await page.click('[data-act=sbLock][data-k=debt]');
  const want = [170000, 125075, 30000, 15000];
  await page.click('[data-act=sbSave]'); await page.waitForTimeout(400);
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  sb = await page.evaluate(() => WT.settings().smartBudget);
  ok(sb.strategyId === 'custom' && K.map(k => sb.customDollars[k]).join() === want.join(), 'Save persists typed dollars after reload: ' + JSON.stringify(sb.customDollars));
  ok(sb.locks && sb.locks.debt === true && sb.locks.needs === false && sb.mode === 'dollars', 'Save stores locks and mode');
  ok(sb.rollover && sb.rollover.savings === 'carry' && sb.rollover.wants === 'debt' && sb.rollover.needs === 'reset', 'rollover settings saved: ' + JSON.stringify(sb.rollover));
  ok(sb.custom && Math.abs(sb.custom.needs - Math.round(170000 * 1000 / income) / 10) < 0.051, 'legacy custom % kept in sync');
  const snap = sb.history.filter(h => h.month === mk);
  ok(snap.length === 1 && snap[0].strategyId === 'custom' && K.map(k => snap[0].dollars[k]).join() === want.join() && snap[0].income === income && /^\d{4}-\d{2}-\d{2}$/.test(snap[0].savedAt), 'history upserts one snapshot for this month with dollars' + (snap.length === 1 ? '' : ' ' + JSON.stringify(snap)));
  let e13 = await ed();
  ok(e13.f.join('|') === '1,700.00|1,250.75|300.00|150.00' && e13.dis[1] && /left/.test(e13.cls), 'editor reopens with the saved amounts and lock (' + e13.f.join(' / ') + ')');
  ok(await page.locator('.sb-cards .sb-card[data-strategy=custom]').count() === 1, 'Custom shows in the comparison');
  // Reset asks first; declining changes nothing; confirming loads Recommended into the draft only
  await page.click('[data-act=sbReset]'); await page.waitForTimeout(200);
  ok(await page.locator('.overlay', { hasText: 'Reset your budget?' }).count() === 1, 'Reset asks for confirmation');
  await page.click('.overlay [data-close].btn:not(.icon)'); await page.waitForTimeout(200);
  ok((await ed()).f.join() === e13.f.join(), 'declining Reset keeps the amounts');
  await page.click('[data-act=sbReset]'); await page.waitForTimeout(200);
  await page.click('.overlay button[type=submit]'); await page.waitForTimeout(250);
  let e14 = await ed();
  ok(e14.f.map(fc).join() === recAmts.join() && e14.dis.every(d => !d), 'confirmed Reset loads Recommended and clears locks');
  ok(await page.evaluate(() => WT.settings().smartBudget.customDollars.needs) === 170000, 'Reset alone saves nothing');
  await page.click('[data-act=sbCancel]'); await page.waitForTimeout(150);
  ok((await ed()).f.join() === e13.f.join(), 'Cancel after Reset brings the saved plan back');
  // a past month's snapshot is kept untouched and listed
  await page.evaluate(() => { const s = WT.settings().smartBudget; const old = { month: WT.addMonthKey(WT.monthOf(WT.todayStr()), -1), strategyId: 'recommended', pct: { needs: 50, debt: 10, savings: 20, wants: 20 }, amounts: { needs: 100000, debt: 20000, savings: 40000, wants: 40000 }, income: 200000, savedAt: '2020-01-01' }; WT.saveSettings({ smartBudget: Object.assign({}, s, { history: [old].concat(s.history) }) }); WTApp.refresh(); });
  await page.waitForTimeout(200);
  await page.locator('[data-act=sbUse][data-id=recommended]').first().click(); await page.waitForTimeout(300);
  sb = await page.evaluate(() => WT.settings().smartBudget);
  const prevMk = await page.evaluate(() => WT.addMonthKey(WT.monthOf(WT.todayStr()), -1));
  ok(sb.history.length === 2 && sb.history[0].month === prevMk && sb.history[0].savedAt === '2020-01-01' && sb.history[1].strategyId === 'recommended', 'past months stay unchanged, this month is replaced');
  ok(await page.locator('.sb-hist .sb-h').count() === 2, 'history lists saved months');
  ok(sb.customDollars && sb.customDollars.needs === want[0], 'switching strategy keeps the saved custom plan');

  // 4) planned vs actual, 5) paychecks, 6) suggestions
  ok(await page.locator('.sb-va').count() === 4, 'planned vs actual: 4 progress bars');
  ok(await page.locator('.sb-va .sb-va-parts').count() === 4 && /Paid bills/.test(await page.locator('.sb-va-list').textContent()) && /Scheduled, not paid/.test(await page.locator('.sb-va-list').textContent()) && /Spent/.test(await page.locator('.sb-va-list').textContent()), 'planned vs actual separates paid bills, scheduled (unpaid) and spent');
  ok(await page.locator('.sb-va[data-status] .pill').count() === 4 && /% used/.test(await page.locator('.sb-va-list').textContent()), 'planned vs actual: status and % used per bucket');
  const vaEng = await page.evaluate(() => { const s = WT.settings().smartBudget; const A = WTSmart.analyze(); const st = WTSmart.strategies(A).find(x => x.id === s.strategyId); return WTSmart.vsActual(A, st).needs; });
  const vaUi = await page.locator('.sb-va[data-bucket=needs] .num.small b').textContent();
  ok(cents(vaUi) === vaEng.actual, 'needs actual matches the engine (' + vaUi + ')');
  const planUi = await page.evaluate(() => !!(window.WTPlanUI && WTPlanUI.ready));
  if (planUi) ok(await page.locator('#main #spPaychecks').count() === 1 && await page.locator('#main #spDebt').count() === 1 && await page.locator('.sb-pc').count() === 0, 'paycheck + debt sections from WTPlanUI replace the old paycheck list');
  else { const pcs = await page.locator('.sb-pc').count(); ok(pcs >= 1 && pcs <= 3, 'paycheck plan (fallback) shows the next ' + pcs + ' paychecks'); }
  const groups = await page.locator('.sb-sug-g').evaluateAll(els => els.map(e => e.dataset.urgency));
  ok(groups.length >= 1 && groups.join() === ['now', 'soon', 'later'].filter(u => groups.includes(u)).join(), 'suggestions grouped by urgency in order: ' + groups.join(', '));
  const scenEng = await page.evaluate(() => { const s = WT.settings().smartBudget; const A = WTSmart.analyze(); const st = WTSmart.strategies(A).find(x => x.id === s.strategyId); return WTSmart.suggestions(A, st).filter(x => x.kind === 'scenario' || x.optional).length; });
  const scen = await page.locator('.sb-sug-i[data-optional]').count();
  ok(scen === scenEng && scen === await page.locator('.sb-sug-i[data-optional] .pill', { hasText: 'Optional' }).count(), 'optional (scenario) suggestions are labeled Optional (' + scen + ')');
  ok(!(await page.locator('.sb-sug-i[data-kind=scenario] b').allTextContents()).some(t => /^Optional:/.test(t)), 'no doubled "Optional:" prefix');
  ok(/short/.test(await page.locator('.sb-hero').textContent()) === (await page.evaluate(() => WTSmart.analyze().shortfall > 0)) && /Living costs/.test(await page.locator('.sb-hero').textContent()) && /Required minimums/.test(await page.locator('.sb-hero').textContent()) && /Optional extra/.test(await page.locator('.sb-hero').textContent()), 'recommended card: living costs, required minimums vs optional extra, shortfall when short');
  ok(await page.locator('.sb-sug-i').count() >= 1, 'suggestions listed');
  await shot(page, 'smart-full', true);

  // needs vs wants
  await page.click('.topbar [data-act=sbCats]'); await page.waitForTimeout(200);
  ok(await page.locator('.overlay .sb-cat').count() > 0, 'Categories used modal lists categories');
  const cat = await page.locator('.overlay .sb-cat').first().getAttribute('data-cat');
  await page.locator(`.overlay .sb-cat[data-cat="${cat}"] [data-v="0"]`).click(); await page.waitForTimeout(200);
  ok(await page.evaluate(c => WT.settings().smartBudget.essentialOverrides[c], cat) === false && await page.locator(`.overlay .sb-cat[data-cat="${cat}"] [data-v="0"]`).getAttribute('aria-pressed') === 'true', 'flip a category to Want');
  ok(await page.evaluate(c => WTSmart.analyze().essentialCategory(c), cat) === false, 'engine sees the override');
  await shot(page, 'smart-categories');
  await page.click('.overlay [data-act=sbEssReset]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => Object.keys(WT.settings().smartBudget.essentialOverrides).length) === 0, 'reset to automatic');
  await page.click('.overlay [data-close].primary'); await page.waitForTimeout(150);

  // no money data created or changed
  const after = await page.evaluate(DATA);
  const diff = JSON.parse(before).filter(([c, v], n) => JSON.stringify(v) !== JSON.stringify(JSON.parse(after)[n][1])).map(([c]) => c);
  ok(diff.length === 0, 'no bills, payments, incomes or other records created or changed' + (diff.length ? ' (changed: ' + diff.join(', ') + ')' : ''));

  // store sanitize keeps smartBudget safely
  const san = await page.evaluate(() => {
    const raw = { meta: { settings: { id: 'settings', smartBudget: { strategyId: 'evil', custom: { needs: 50, debt: 10, savings: 20, wants: 20 }, essentialOverrides: { cat_food: true, '__proto__': true, 'bad id!': false, cat_x: 'yes' }, history: [{ month: '2026-01', strategyId: 'debt', pct: { needs: 50, debt: 30, savings: 10, wants: 10 }, amounts: { needs: 1, debt: 1, savings: 1, wants: 1 }, income: 4, savedAt: '2026-01-05' }, { month: 'bad', strategyId: 'debt' }, ...Array.from({ length: 40 }, (_, k) => ({ month: '20' + (30 + Math.floor(k / 12)) + '-' + String(k % 12 + 1).padStart(2, '0'), strategyId: 'custom', pct: { needs: 25, debt: 25, savings: 25, wants: 25 }, amounts: { needs: 1, debt: 1, savings: 1, wants: 1 }, income: 4, savedAt: 'x' })) ] } } } };
    const s = WTStore.sanitizeData(raw, ['meta']); return s && s.data && s.data.meta && s.data.meta.settings && s.data.meta.settings.smartBudget;
  });
  ok(san && !('strategyId' in san) && san.custom.needs === 50 && JSON.stringify(san.essentialOverrides) === '{"cat_food":true}' && san.history.length === 36 && san.history.every(h => /^\d{4}-\d{2}$/.test(h.month) && /^\d{4}-\d{2}-\d{2}$/.test(h.savedAt)), 'backup sanitize keeps smartBudget safe');

  const san2 = await page.evaluate(() => {
    const keys = {}; for (let i = 0; i < 70; i++) keys['inc_1|2026-11-' + String(i % 28 + 1).padStart(2, '0') + 'x' + i] = 1000 + i;
    const raw = { meta: { settings: { id: 'settings', smartBudget: { strategyId: 'zero', mode: 'evil', customDollars: { needs: 150050, debt: 0, savings: 20000, wants: 1.5 }, locks: { needs: true, debt: 'yes', savings: false }, rollover: { needs: 'carry', debt: 'nope', savings: 'savings', wants: 'debt' },
      paycheckIncome: Object.assign({ 'bad key!': 5, 'inc_1|2026-11-06': 160000, 'inc_1|2026-11-20': -5, 'inc_1|2026-12-04': 1e12 }, keys),
      paycheckAlloc: { 'inc_1|2026-11-06': { everyday: 10000, savings: 'x', extraDebt: 2500, wants: 0, evil: 1 }, 'inc_1|2026-11-20': { savings: -1 } },
      debt: { method: 'snowball', extra: 5000, order: ['d1', 'd1', 'bad id!', 'd2', ...Array.from({ length: 150 }, (_, i) => 'x' + i)] },
      history: [{ month: '2026-10', strategyId: 'zero', pct: { needs: 50, debt: 30, savings: 10, wants: 10 }, amounts: { needs: 1, debt: 1, savings: 1, wants: 1 }, income: 4, savedAt: '2026-10-05', dollars: { needs: 1, debt: 1, savings: 1, wants: 1 }, rollover: { needs: 5, debt: 0, savings: 0, wants: 0 } }] } } } };
    const s = WTStore.sanitizeData(raw, ['meta']); return s.data.meta.settings.smartBudget;
  });
  ok(san2.strategyId === 'zero' && !('mode' in san2) && !('customDollars' in san2) && JSON.stringify(san2.locks) === '{"needs":true,"debt":false,"savings":false,"wants":false}' && JSON.stringify(san2.rollover) === '{"needs":"carry","debt":"reset","savings":"savings","wants":"debt"}', 'sanitize: strategy, mode, customDollars (cents only), locks, rollover');
  ok(Object.keys(san2.paycheckIncome).length === 60 && san2.paycheckIncome['inc_1|2026-11-06'] === 160000 && !('bad key!' in san2.paycheckIncome) && !('inc_1|2026-11-20' in san2.paycheckIncome) && !('inc_1|2026-12-04' in san2.paycheckIncome), 'sanitize: paycheckIncome (max 60, valid keys, cents 0..10^11)');
  ok(JSON.stringify(san2.paycheckAlloc) === '{"inc_1|2026-11-06":{"everyday":10000,"extraDebt":2500,"wants":0}}', 'sanitize: paycheckAlloc ' + JSON.stringify(san2.paycheckAlloc));
  ok(san2.debt.method === 'snowball' && san2.debt.extra === 5000 && san2.debt.order.length === 100 && san2.debt.order.slice(0, 3).join() === 'd1,d2,x0', 'sanitize: debt method/extra/order');
  ok(san2.history.length === 1 && san2.history[0].strategyId === 'zero' && san2.history[0].dollars.needs === 1 && san2.history[0].rollover.needs === 5, 'sanitize: snapshot keeps dollars and rollover');
  const san3 = await page.evaluate(() => WTStore.sanitizeData({ meta: { settings: { id: 'settings', smartBudget: { mode: 'percent', customDollars: { needs: 1, debt: 2, savings: 3, wants: 4 } } } } }, ['meta']).data.meta.settings.smartBudget);
  ok(san3.mode === 'percent' && san3.customDollars.wants === 4, 'sanitize: valid mode and customDollars kept');

  // guards: engine missing or throwing
  await page.evaluate(() => { window.__sb = window.WTSmart; window.WTSmart = undefined; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(/isn't available/.test(await mainText(page)) && !/Something went wrong/.test(await mainText(page)), 'engine missing: friendly message');
  await go(page, 'dashboard'); ok(!/Something went wrong/.test(await mainText(page)), 'engine missing: dashboard still works');
  await go(page, 'smart');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { analyze: () => { throw new Error('boom'); } }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(/couldn't work out a plan/.test(await mainText(page)), 'engine throwing: friendly message');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { suggestions: () => { throw new Error('boom'); } }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-hero').count() === 1 && await page.locator('.sb-custom').count() === 1 && /couldn't be worked out/.test(await mainText(page)), 'one part failing leaves the rest of the page');
  await page.evaluate(() => { window.__pu = window.WTPlanUI; window.WTPlanUI = { ready: true, renderPaychecks: () => { throw new Error('boom'); }, renderDebt: () => '<section class="section" id="spDebtFake">debt</section>' }; window.WTSmart = window.__sb; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('#spDebtFake').count() === 1 && await page.locator('.sb-custom').count() === 1 && /couldn't be worked out/.test(await mainText(page)), 'a failing plan section is contained');
  await page.evaluate(() => { window.WTPlanUI = undefined; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-pc, .empty').count() >= 1 && await page.locator('#spPaychecks').count() === 0, 'no WTPlanUI: falls back to the old paycheck section');
  await page.evaluate(() => { window.WTPlanUI = window.__pu; WTApp.refresh(); }); await page.waitForTimeout(150);
  await page.evaluate(() => { window.WTSmart = window.__sb; WTApp.refresh(); }); await page.waitForTimeout(150);
  await ctx.close();

  // 360px: no sideways scroll; tap targets
  {
    const { ctx, page } = await open({ viewport: { width: 360, height: 760 } });
    await go(page, 'smart');
    const r = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, vw: innerWidth, wide: [...document.querySelectorAll('#main *')].filter(el => { const b = el.getBoundingClientRect(); if (!b.width) return false; for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'hidden' || o === 'scroll') && p !== document.body) return false; } return b.right > innerWidth + 1; }).length, small: [...document.querySelectorAll('#main .btn, #main .sb-range')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.height < 39.5; }).length }));
    ok(r.sw <= r.vw && r.wide === 0, `360px: no horizontal overflow (scrollWidth ${r.sw}, wide ${r.wide})`);
    ok(r.small === 0, '360px: buttons and sliders are at least 40px tall');
    await shot(page, 'smart-360', true);
    // editing on a phone: big amount fits, Remaining bar stays on screen, still no sideways scroll
    await page.locator('#sbf-needs').scrollIntoViewIfNeeded();
    await page.fill('#sbf-needs', '12345678.90'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
    await page.fill('#sbf-wants', '9999'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
    await page.locator('#sbf-debt').scrollIntoViewIfNeeded();
    const m = await page.evaluate(() => { const f = document.querySelector('#sbf-needs'), rb = document.querySelector('#sbRemain').getBoundingClientRect(), nav = document.querySelector('.bottom-nav'); const nb = nav ? nav.getBoundingClientRect().top : innerHeight;
      return { val: f.value, fits: f.scrollWidth <= f.clientWidth + 1, inView: rb.top >= 0 && rb.bottom <= nb + 1, sw: document.scrollingElement.scrollWidth, vw: innerWidth, over: /Over by/.test(document.querySelector('#sbRemain').textContent), save: !!document.querySelector('#sbRemain [data-act=sbSave]'), cancel: !!document.querySelector('#sbRemain [data-act=sbCancel]') }; });
    ok(m.val === '12,345,678.90' && m.fits, '360px: a large typed amount fits its field (' + m.val + ')');
    ok(m.inView && m.over && m.save && m.cancel, '360px: sticky bar with Over warning, Save and Cancel stays on screen while editing');
    ok(m.sw <= m.vw, '360px: no sideways scroll while editing');
    await shot(page, 'smart-360-editing');
    await ctx.close();
  }
  // desktop: comparison table
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    await go(page, 'smart');
    ok(await page.locator('.sb-tbl').isVisible() && await page.locator('.sb-cards').isHidden(), 'desktop: comparison table');
    ok(await page.locator('nav.nav-group a[data-nav=smart]').count() === 1, 'desktop nav has Smart Budget');
    const ord = await page.locator('nav.nav-group a').evaluateAll(a => a.map(x => x.dataset.nav));
    ok(ord.indexOf('smart') === ord.indexOf('expenses') + 1 && !ord.includes('budgets'), 'nav: Smart Budget right after Expenses; no Budgets');
    await shot(page, 'smart-desktop', true);
    await ctx.close();
  }
  // dark mode
  {
    const { ctx, page } = await open({ colorScheme: 'dark' });
    await go(page, 'smart');
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.sb-hero')).backgroundColor);
    const lum = (bg.match(/\d+/g) || [255, 255, 255]).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
    ok(lum < 60 && await page.locator('.sb-hero .sb-row').count() === 4, 'dark mode renders (card ' + bg + ')');
    const dk = await page.evaluate(() => { const l = el => (getComputedStyle(el).backgroundColor.match(/\d+/g) || [255, 255, 255]).slice(0, 3).reduce((a, b) => a + +b, 0) / 3; return { bk: l(document.querySelector('.sb-bk')), inp: l(document.querySelector('.sb-amt')), rb: l(document.querySelector('#sbRemain')) }; });
    ok(dk.bk < 60 && dk.inp < 60 && dk.rb < 60, 'dark mode: editor cards, fields and Remaining bar are dark ' + JSON.stringify(dk));
    await page.locator('#sbEdit').scrollIntoViewIfNeeded(); await shot(page, 'smart-dark-editor');
    await shot(page, 'smart-dark', true);
    await ctx.close();
  }
  // shortfall: the same sample data with a smaller paycheck ($1,000 biweekly = $2,166.67/mo, short of 293167 by 76500).
  // Changed only inside this throwaway context; the fixture itself is untouched.
  {
    const { ctx, page } = await open();
    await page.evaluate(async () => { WT.updateIncome('inc_job', { netCents: 100000 }); await WTStore.flush(); });
    await go(page, 'smart'); await page.evaluate(() => WTApp.refresh()); await page.waitForTimeout(200);
    const A = await page.evaluate(() => { const A = WTSmart.analyze(); const L = WTSmart.strategies(A); return { income: A.income, shortfall: A.shortfall, best: WTSmart.compare(A, L).bestId, real: L.filter(s => s.realistic === true).map(s => s.id), unreal: L.filter(s => s.realistic === false).map(s => s.id) }; });
    ok(A.income === 216667 && A.shortfall === 76500, 'low income: engine reports $765 short (' + A.income + ', ' + A.shortfall + ')');
    const hero = await page.locator('.sb-hero').textContent();
    ok(/short/.test(hero) && /Living costs/.test(hero) && /Required minimums/.test(hero), 'low income: recommended card explains the shortfall');
    const rows = await page.locator('.sb-hero .sb-row').evaluateAll(els => els.map(e => +e.dataset.amt));
    ok(rows.length === 4 && rows.reduce((a, b) => a + b, 0) === A.income, 'low income: split still adds up to take-home pay');
    const bestCards = await page.locator('.sb-cards .sb-card:has(.pill:text-is("Best fit"))').evaluateAll(els => els.map(e => e.dataset.strategy + ':' + e.dataset.realistic));
    ok(bestCards.length <= 1 && bestCards.every(x => /:true$/.test(x)) && (A.best && A.real.includes(A.best) ? bestCards[0] === A.best + ':true' : bestCards.length === 0), 'low income: Best fit only on a realistic strategy (' + (bestCards.join() || 'none') + ')');
    const unrealCards = await page.locator('.sb-cards .sb-card:has(.pill:text-is("Not realistic"))').evaluateAll(els => els.map(e => e.dataset.strategy));
    ok(A.unreal.length > 0 && A.unreal.every(id => unrealCards.includes(id)), 'low income: unrealistic strategies say Not realistic (' + unrealCards.join(', ') + ')');
    const g = await page.locator('.sb-sug-g').evaluateAll(els => els.map(e => e.dataset.urgency));
    ok(g[0] === 'now' && /short each month/.test(await page.locator('.sb-sug-g[data-urgency=now]').textContent()), 'low income: shortfall suggestion leads under Now');
    ok(!/Something went wrong/.test(await mainText(page)), 'low income: page renders');
    await shot(page, 'smart-short', true);
    await ctx.close();
  }
  // blank data (fresh install, no sample fixture): starts blank, helpful empty state
  {
    const { ctx, page } = await open({ blank: true });
    const cnt = await page.evaluate(() => ({ bills: Object.keys(WT.D.templates).length, debts: Object.keys(WT.D.debts).length, incomes: Object.keys(WT.D.incomes).length, income: WTSmart.analyze().income }));
    ok(cnt.bills === 0 && cnt.debts === 0 && cnt.incomes === 0 && cnt.income === 0, 'without the sample fixture the app starts blank (no bills, debts or income) ' + JSON.stringify(cnt));
    await go(page, 'smart'); await page.evaluate(() => WTApp.refresh()); await page.waitForTimeout(150);
    const t = await mainText(page);
    ok(/Add your income/.test(t) && await page.locator('#main [data-act=addIncome]').count() === 1 && !/Something went wrong/.test(t), 'blank data: empty state with Add income');
    await page.click('.topbar [data-act=sbCats]'); await page.waitForTimeout(150);
    ok(await page.locator('.overlay').count() === 1, 'blank data: categories modal opens');
    await page.keyboard.press('Escape');
    await go(page, 'dashboard'); ok(!/Something went wrong/.test(await mainText(page)), 'blank data: dashboard OK');
    
    await shot(page, 'smart-blank');
    await ctx.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
