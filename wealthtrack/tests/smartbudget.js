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
// bucket color tokens: low saturation (<= 45%), none equal to the old bright slots, and the donut/bars use them
const PALETTE = () => {
  const cs = getComputedStyle(document.documentElement); const v = {}; let ok = true;
  const hsl = hex => { const n = parseInt(hex.replace('#', ''), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l }; };
  const old = ['--s1', '--s2', '--s3', '--auto'].map(k => cs.getPropertyValue(k).trim().toLowerCase());
  ['needs', 'debt', 'savings', 'wants'].forEach(k => { const c = cs.getPropertyValue('--sb-' + k).trim().toLowerCase(); const h = /^#[0-9a-f]{6}$/.test(c) ? hsl(c) : null; v[k] = c + (h ? ' s' + Math.round(h.s * 100) : ''); if (!h || h.s > 0.45 || old.includes(c)) ok = false; });
  const strokes = [...document.querySelectorAll('.sb-donut circle[stroke-dasharray]')].map(c => c.getAttribute('stroke'));
  const bars = [...document.querySelectorAll('.sb-stack i')].map(i => i.style.background);
  if (!strokes.length || !strokes.every(x => /var\(--sb-(needs|debt|savings|wants)\)/.test(x)) || !bars.every(x => /--sb-/.test(x))) ok = false;
  return { ok, v };
};
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
  // the page is split into 3 sections picked from the "Section" dropdown; inactive sections are hidden (still in the DOM)
  const SECS = ['plan', 'compare', 'customize'];
  const sec = async (p, v) => { await p.selectOption('#sbSec', v); await p.waitForTimeout(120); };

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
  ok(await page.locator('#main a[href="#/smart/plan"]').count() >= 1, 'dashboard Smart Budget widget (opens My plan)');

  // 1) recommended card
  await go(page, 'smart');
  ok(!/Something went wrong/.test(await mainText(page)), 'page renders with sample data');
  // sections: a labeled "Section" dropdown right under the page title, 3 choices, My plan first
  const SEC_CARDS = { plan: ['#sbPlans', '#sbRecSum', '#sbVa', '#sbSug', '#sbHist'], compare: ['#sbWhy', '#sbStrats', '#sbCmp'], customize: ['#sbEdit', '#sbSaved', '#spPaychecks', '#spDebt'] };
  const secInfo = () => page.evaluate(() => { const s = document.querySelector('#sbSec'), l = document.querySelector('label[for=sbSec]'), tb = document.querySelector('#main .topbar');
    return s && { tag: s.tagName, label: l && l.textContent.trim(), opts: [...s.options].map(o => o.value + '=' + o.textContent), val: s.value, under: tb.getBoundingClientRect().bottom <= s.getBoundingClientRect().top && !!(tb.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(s.compareDocumentPosition(document.querySelector('#sbPlans')) & Node.DOCUMENT_POSITION_FOLLOWING), fs: parseFloat(getComputedStyle(s).fontSize), h: s.getBoundingClientRect().height, w: s.getBoundingClientRect().width, mainW: document.querySelector('.sb').getBoundingClientRect().width }; });
  const si0 = await secInfo();
  ok(si0 && si0.tag === 'SELECT' && si0.label === 'Section' && si0.opts.join('|') === 'plan=My plan|compare=Strategies & compare|customize=Customize & paychecks', 'Section dropdown with 3 options: ' + (si0 && si0.opts.join(', ')));
  ok(si0.val === 'plan' && si0.under, 'dropdown sits under the page title, before the plan; opens on My plan');
  ok(si0.fs >= 16 && si0.h >= 40 && si0.w >= si0.mainW - 1, 'phone: dropdown is full width, 16px text, at least 40px tall (' + Math.round(si0.w) + '/' + Math.round(si0.mainW) + 'px, ' + Math.round(si0.h) + 'px)');
  const visMap = () => page.evaluate(C => { const o = {}; for (const k in C) o[k] = C[k].map(s => { const e = document.querySelector(s); return e ? (e.getClientRects().length > 0 ? 1 : 0) : -1; }); return o; }, SEC_CARDS);
  for (const v of SECS) {
    await sec(page, v);
    const m = await visMap(), bad = [];
    for (const k in m) m[k].forEach((x, i) => { if (x !== (k === v ? 1 : 0)) bad.push(SEC_CARDS[k][i] + (x < 0 ? ' missing' : x ? ' shown' : ' hidden')); });
    ok(!bad.length && await page.locator(`#sbSec-${v}`).isVisible(), `section "${v}" shows only its own cards` + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
  }
  ok(await page.locator('[data-sbsec]').evaluateAll(els => els.every(e => e.getAttribute('role') === 'region' && e.getAttribute('aria-label'))) && (await page.locator('#sbSec').getAttribute('aria-controls')).split(' ').length === 3, 'sections are labeled regions the dropdown controls');
  ok(await page.evaluate(() => WT.settings().sbSection) === 'customize' && await page.evaluate(() => location.hash) === '#/smart/customize', 'choice saved (settings.sbSection) and shown in the address (#/smart/customize)');
  await sec(page, 'compare');
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  ok(await page.locator('#sbSec').inputValue() === 'compare' && await page.locator('#sbWhy').isVisible() && !(await page.locator('#sbPlans').isVisible()), 'section choice persists across reload');
  await page.evaluate(() => { const u = JSON.parse(localStorage.getItem('wt.ui') || '{}'); delete u.sbSec; localStorage.setItem('wt.ui', JSON.stringify(u)); });
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  ok(await page.locator('#sbSec').inputValue() === 'compare', 'section also comes back from settings (another device / restored backup)');
  await go(page, 'dashboard'); await page.locator('#main a[href="#/smart/plan"]').first().click(); await page.waitForTimeout(300);
  ok(await page.locator('#sbSec').inputValue() === 'plan' && await page.locator('#sbPlans').isVisible(), 'the dashboard widget opens Smart Budget on My plan');
  await sec(page, 'compare');
  // deep links: a section name or a card id opens the right section and scrolls to the card
  await go(page, 'smart/sbEdit'); await page.waitForTimeout(150);
  const dl = await page.evaluate(() => ({ val: document.querySelector('#sbSec').value, top: Math.round(document.querySelector('#sbEdit').getBoundingClientRect().top), hash: location.hash }));
  ok(dl.val === 'customize' && dl.top >= -2 && dl.top < 120 && dl.hash === '#/smart/customize', 'deep link #/smart/sbEdit opens Customize & paychecks at the editor ' + JSON.stringify(dl));
  await go(page, 'smart/plan');
  ok(await page.locator('#sbSec').inputValue() === 'plan' && await page.locator('#sbPlans').isVisible(), 'deep link #/smart/plan opens My plan');
  // My plan: the essentials come first on a phone, with a short recommendation summary that links to the details
  const fold = await page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { sel: r('#sbSec').bottom, hero: r('.sb-hero-t').bottom, rows: r('.sb-hero .sb-row').top }; });
  ok(fold.sel < 844 && fold.hero < 844 && fold.rows < 844 * 1.1, 'phone: dropdown and the plan heading are above the fold ' + JSON.stringify(fold));
  ok(await page.locator('#sbRecSum').isVisible() && /Recommended strategy/.test(await page.locator('#sbRecSum').textContent()), 'My plan has a short recommendation summary');
  await page.click('#sbRecSum [data-act=sbGo][data-to=sbWhy]'); await page.waitForTimeout(150);
  const wj = await page.evaluate(() => ({ val: document.querySelector('#sbSec').value, top: Math.round(document.querySelector('#sbWhy').getBoundingClientRect().top) }));
  ok(wj.val === 'compare' && wj.top >= -2 && wj.top < 120, '"Why this plan" switches to Strategies & compare and scrolls to the reasons ' + JSON.stringify(wj));
  await sec(page, 'plan'); await page.evaluate(() => window.scrollTo(0, 0));
  // palette: the four bucket tokens are muted (low saturation), not the old bright categorical colors, and every chart uses them
  const pl = await page.evaluate(PALETTE);
  ok(pl.ok, 'professional palette: --sb-needs/debt/savings/wants are restrained ' + JSON.stringify(pl.v));
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
  ok(await page.locator('.sb-hero svg[role=img]').count() === 1 && /Essentials/.test(await page.locator('.sb-hero svg[role=img]').getAttribute('aria-label')), 'donut chart with accessible label');
  ok(/Personalized Plans for You/i.test(await page.locator('.sb-hero').textContent()), 'hero is "Personalized Plans for You"');
  // expandable categories: each one opens and closes on its own, items come from WTSmart.breakdown()
  const xs = () => page.evaluate(() => ['needs', 'debt', 'savings', 'wants'].map(k => { const b = document.querySelector(`[data-act=sbToggle][data-k=${k}]`), p = document.getElementById('sbx-' + k); return b.getAttribute('aria-expanded') + ':' + (p.hidden ? 'hidden' : 'shown'); }).join(','));
  ok(await xs() === 'false:hidden,false:hidden,false:hidden,false:hidden', 'all four categories start collapsed (aria-expanded=false)');
  await page.click('[data-act=sbToggle][data-k=needs]');
  ok(await xs() === 'true:shown,false:hidden,false:hidden,false:hidden', 'Essentials expands alone');
  await page.click('[data-act=sbToggle][data-k=debt]');
  ok(await xs() === 'true:shown,true:shown,false:hidden,false:hidden', 'Debt expands without closing Essentials');
  await page.click('[data-act=sbToggle][data-k=needs]');
  ok(await xs() === 'false:hidden,true:shown,false:hidden,false:hidden', 'Essentials collapses, Debt stays open');
  await page.click('[data-act=sbToggle][data-k=savings]'); await page.click('[data-act=sbToggle][data-k=wants]'); await page.click('[data-act=sbToggle][data-k=needs]');
  ok(await xs() === 'true:shown,true:shown,true:shown,true:shown', 'every category can be open at once');
  const bdChk = await page.evaluate(() => {
    const A = WTSmart.analyze(), L = WTSmart.strategies(A), id = (WT.settings().smartBudget || {}).strategyId || 'recommended';
    const s = L.find(x => x.id === id) || L[0]; const bd = WTSmart.breakdown(A, s); const out = { ok: true, why: [], tpls: [] };
    ['needs', 'debt', 'savings', 'wants'].forEach(k => {
      const ui = [...document.querySelectorAll(`#sbx-${k} .sb-it`)].map(li => li.querySelector('.sb-it-n').textContent + '=' + li.dataset.amt);
      const en = bd[k].items.map(it => it.name + '=' + Math.round(it.amount));
      if (ui.join('|') !== en.join('|')) { out.ok = false; out.why.push(k + ': ' + ui.join(',') + ' vs ' + en.join(',')); }
      const sum = bd[k].items.reduce((t, it) => t + it.amount, 0); if (sum !== bd[k].committed || bd[k].remaining !== bd[k].planned - bd[k].committed) { out.ok = false; out.why.push(k + ' committed/remaining'); }
      if (Math.round(+document.querySelector(`.sb-row[data-bucket=${k}]`).dataset.amt) !== bd[k].planned) { out.ok = false; out.why.push(k + ' planned'); }
    });
    out.tpls = [...document.querySelectorAll('.sb-x-p .sb-it[data-tpl]')].map(li => li.dataset.tpl);
    out.n = document.querySelectorAll('.sb-x-p .sb-it').length;
    out.due = document.querySelectorAll('#sbx-needs .sb-it .tiny').length && /Due /.test(document.querySelector('#sbx-needs').textContent);
    return out;
  });
  ok(bdChk.ok && bdChk.n > 0, 'expanded items match WTSmart.breakdown() for every category (' + bdChk.n + ' items)' + (bdChk.ok ? '' : ' ' + bdChk.why.join('; ')));
  ok(bdChk.tpls.length > 0 && new Set(bdChk.tpls).size === bdChk.tpls.length, 'no bill is listed twice across categories (' + bdChk.tpls.length + ' bills)');
  ok(bdChk.due, 'bills show their due dates');
  ok(/Allocated/.test(await page.locator('#sbx-needs').textContent()) && /Recommended/.test(await page.locator('#sbx-needs').textContent()) && /Remaining|Short by/.test(await page.locator('#sbx-needs').textContent()), 'expanded category shows allocated, recommended %, remaining');
  await shot(page, 'smart-top');
  for (const k of ['needs', 'debt', 'savings', 'wants']) await page.click(`[data-act=sbToggle][data-k=${k}]`);
  await sec(page, 'compare');
  // recommendation transparency
  const R = await page.evaluate(() => WTSmart.recommend(WTSmart.analyze()));
  const why = await page.locator('#sbWhy').textContent();
  ok(await page.locator('#sbWhy .sb-why-card').getAttribute('data-rec') === R.id && await page.locator('#sbWhy .sb-why-card').getAttribute('data-confidence') === R.confidence, 'transparency panel shows the engine recommendation (' + R.id + ', ' + R.confidence + ')');
  ok(await page.locator('#sbWhy .sb-fac').count() === R.factors.length && /What it’s based on/.test(why) && /How the percentages were worked out/.test(why) && /Benefits, drawbacks and what to change/.test(why), 'panel lists factors, how the % were worked out, benefits/drawbacks/what to change');
  ok(R.howCalculated.every(h => why.includes(h)) && R.improve.every(h => why.includes(h)), 'how-calculated and improvement steps come from the engine');

  // 2) the 8 named strategies
  const NAMED = ['avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced', 'custom'];
  const NAMES = ['Debt Avalanche', 'Debt Snowball', '50/30/20', 'Zero-Based', 'Pay Yourself First', 'Aggressive Debt Payoff', 'Balanced Wealth Building', 'Custom'];
  const cards = await page.locator('.sb-cards .sb-card').evaluateAll(els => els.map(e => ({ id: e.dataset.strategy, name: e.querySelector('.sb-card-t').textContent, sum: (e.querySelector('.sb-kind span:not(.sb-kind-tag)') || {}).textContent || '', rec: e.dataset.recommended, real: e.dataset.realistic, mod: e.dataset.modified, ben: e.querySelectorAll('.sb-more li').length, fit: !!e.querySelector('.sb-fit'), ex: [...e.querySelectorAll('.sb-split tbody tr')].map(r => r.children[1].textContent).join('/') })));
  ok(cards.length === 8 && cards.map(c => c.id).join() === NAMED.join(), '8 named strategy cards in order: ' + cards.map(c => c.id).join(', '));
  ok(cards.map(c => c.name).join('|') === NAMES.join('|'), 'strategy names: ' + cards.map(c => c.name).join(', '));
  ok(cards.every(c => c.sum.length > 20), 'every strategy has a short explanation');
  ok(cards.filter(c => c.id !== 'custom').every(c => c.ben >= 2 && c.fit), 'every named strategy lists benefits, drawbacks and why it may or may not fit you');
  ok(cards[0].ex === '50%/30%/15%/5%' && cards[2].ex === '40%/20%/10%/30%' && cards[4].ex === '50%/10%/30%/10%', 'illustrative example splits shown (Avalanche ' + cards[0].ex + ', 50/30/20 ' + cards[2].ex + ')');
  const eng = await page.evaluate(() => { const A = WTSmart.analyze(); const L = WTSmart.strategies(A); const R = WTSmart.recommend(A); return { badge: R.showBadge ? R.id : null, conf: R.confidence, unreal: L.filter(s => s.realistic === false).map(s => s.id), real: L.filter(s => s.realistic === true).map(s => s.id), mod: L.filter(s => s.modified).map(s => s.id), pct: Object.fromEntries(L.map(s => [s.id, s.pct])) }; });
  const recCards = cards.filter(c => c.rec === 'true').map(c => c.id);
  ok(recCards.length === (eng.badge ? 1 : 0) && (eng.badge ? recCards[0] === eng.badge : true) && await page.locator('.sb-cards .pill.sb-recp').count() === recCards.length, '"Recommended for you" badge only where the engine says so (' + (recCards.join() || 'none') + ', confidence ' + eng.conf + ')');
  ok(recCards.every(id => eng.real.includes(id)), 'the recommended strategy is realistic');
  ok(cards.filter(c => c.id !== 'custom').every(c => (c.real === 'true') === eng.real.includes(c.id)) && await page.locator('.sb-cards .sb-card .pill.sb-ok').count() + await page.locator('.sb-cards .sb-card .pill.over').count() === cards.length - (cards.find(c => c.id === 'custom' && !eng.real.includes('custom') && !eng.unreal.includes('custom')) ? 1 : 0), 'Realistic / Not realistic matches the engine');
  ok(cards.filter(c => eng.mod.includes(c.id)).every(c => c.mod === 'true') && await page.locator('.sb-card[data-modified=true] .sb-modp').count() === cards.filter(c => c.mod === 'true').length, '"Modified for you" shown where the engine changed the example (' + cards.filter(c => c.mod === 'true').map(c => c.id).join(', ') + ')');
  const pctUi = await page.locator('.sb-card[data-strategy=avalanche] .sb-split tbody tr').evaluateAll(rs => rs.map(r => parseFloat(r.children[2].textContent)));
  ok(['needs', 'debt', 'savings', 'wants'].every((k, i) => Math.abs(pctUi[i] - eng.pct.avalanche[k]) < 0.05), 'personalized % on the Avalanche card match the engine');
  ok(/highest interest rate first/.test(await page.locator('.sb-card[data-strategy=avalanche]').textContent()) && /smallest balance first/.test(await page.locator('.sb-card[data-strategy=snowball]').textContent()), 'Avalanche and Snowball explain their payoff order');
  ok(await page.locator('.sb-cards [data-act=sbCustomize]').count() === cards.length, 'every card has Customize this (or Create your own)');
  // compare over time: 6 mo / 12 mo / 3 yr / 5 yr
  const hz = async m => page.evaluate(m => [...document.querySelectorAll('#sbCmp tbody tr')].map(tr => ({ id: tr.dataset.strategy, debt: +tr.querySelector('[data-f=debtPaid]').dataset.v, sav: +tr.querySelector('[data-f=savingsEnd]').dataset.v, nw: tr.querySelector('[data-f=netWorthEnd]').dataset.v, int: tr.querySelector('[data-f=interest]').dataset.v })), m);
  ok(await page.locator('#sbCmp .sb-ftbl').getAttribute('data-months') === '12' && await page.locator('#sbCmp [data-act=sbHorizon][data-m="12"]').getAttribute('aria-pressed') === 'true', 'comparison starts at 12 months');
  ok((await page.locator('#sbCmp [data-act=sbHorizon]').allTextContents()).join('|') === '6 mo|12 mo|3 yr|5 yr', 'horizon choices: 6 mo, 12 mo, 3 yr, 5 yr');
  const h12 = await hz(12);
  await page.click('#sbCmp [data-act=sbHorizon][data-m="60"]'); await page.waitForTimeout(200);
  const h60 = await hz(60);
  const eng60 = await page.evaluate(() => { const r = WTSmart.compareAll(WTSmart.analyze(), 60); return Object.fromEntries(r.rows.map(x => [x.id, { debt: x.debtPaid, sav: x.savingsEnd }])); });
  ok(await page.locator('#sbCmp .sb-ftbl').getAttribute('data-months') === '60' && await page.locator('#sbCmp [data-act=sbHorizon][data-m="60"]').getAttribute('aria-pressed') === 'true', 'tapping 5 yr switches the table');
  ok(h60.length === 8 && h60.some((r, i) => r.sav !== h12[i].sav || r.debt !== h12[i].debt), 'numbers change with the horizon');
  ok(h60.every(r => eng60[r.id] && eng60[r.id].debt === r.debt && eng60[r.id].sav === r.sav), 'debt paid and savings match WTSmart.compareAll(60)');
  ok(h60.every(r => r.nw !== undefined && r.int !== undefined), 'projected net worth and interest shown for every strategy');
  const cmpTxt = await page.locator('#sbCmp').textContent();
  ok(/Assumptions/.test(cmpTxt) && /Savings earn 0%/.test(cmpTxt) && /estimate/i.test(cmpTxt), 'assumptions listed (0% savings growth, estimates)');
  const miss = await page.evaluate(() => WTSmart.compareAll(WTSmart.analyze(), 12).missing);
  ok(miss.every(m => cmpTxt.includes(m)), 'missing inputs listed (' + miss.length + ')');
  await page.click('#sbCmp [data-act=sbHorizon][data-m="12"]'); await page.waitForTimeout(150);
  // optional savings interest rate: 0% unless entered
  const sav0 = (await hz(12)).find(r => r.id === 'pay-first').sav;
  await page.fill('#sbCmp input[data-act-change=sbSavApr]', '4.5'); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  const sav1 = (await hz(12)).find(r => r.id === 'pay-first').sav;
  ok(await page.evaluate(() => WT.settings().smartBudget.savingsAprCenti) === 450 && sav1 > sav0 && /4\.5%/.test(await page.locator('#sbCmp .sb-assume').textContent()), 'savings interest rate (optional) is saved and grows savings in the estimates (' + sav0 + ' -> ' + sav1 + ')');
  ok(await page.$eval('#sbCmp input[data-act-change=sbSavApr]', e => e.inputMode === 'decimal' && parseFloat(getComputedStyle(e).fontSize) >= 16 && e.value === '4.5'), 'rate field: decimal keypad, 16px, keeps the value');
  await page.fill('#sbCmp input[data-act-change=sbSavApr]', '99'); await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.settings().smartBudget.savingsAprCenti) === 450, 'an impossible rate is refused');
  await page.fill('#sbCmp input[data-act-change=sbSavApr]', ''); await page.keyboard.press('Tab'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !('savingsAprCenti' in WT.settings().smartBudget)) && (await hz(12)).find(r => r.id === 'pay-first').sav === sav0, 'clearing the rate goes back to 0% growth');
  await page.locator('#sbCmp').scrollIntoViewIfNeeded(); await shot(page, 'smart-forecast');
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
  await sec(page, 'customize');
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
  ok(e1.donut !== e0.donut && /Essentials/.test(e1.donut), 'chart updates as you type');
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
  const recAmts = await page.evaluate(() => { const s = WTSmart.strategies(WTSmart.analyze()).find(x => x.id === 'recommended'); return ['needs', 'debt', 'savings', 'wants'].map(k => s.amounts[k]); });
  // Fill to 100%: exact to the cent, locked categories untouched (engine fillExactly)
  await typeIn('#sbf-needs', '1000.01'); await typeIn('#sbf-debt', '333.33'); await typeIn('#sbf-savings', '0'); await typeIn('#sbf-wants', '77.77'); await page.keyboard.press('Tab');
  await page.click('[data-act=sbLock][data-k=needs]');
  await page.click('[data-act=sbFill]'); await page.waitForTimeout(150);
  const f1 = await ed();
  ok(f1.f.reduce((t, v) => t + fc(v), 0) === income && /ok/.test(f1.cls) && /Every dollar/.test(f1.label), 'Fill to 100% totals take-home pay exactly, to the cent (' + f1.f.join(' / ') + ')');
  ok(f1.f[0] === '1,000.01' && f1.dis[0], 'Fill to 100%: locked Essentials untouched');
  const fe = await page.evaluate(() => { const r = WTSmart.fillExactly(WTSmart.analyze(), { needs: 100001, debt: 33333, savings: 0, wants: 7777 }, { needs: true }); return r.dollars || r; });
  ok(K.every((k, i) => fc(f1.f[i]) === fe[k]), 'Fill to 100% uses the engine fillExactly()');
  await typeIn('#sbf-debt', '99999'); await page.keyboard.press('Tab');
  await page.click('[data-act=sbFill]'); await page.waitForTimeout(150);
  const f2 = await ed();
  ok(f2.f.reduce((t, v) => t + fc(v), 0) === income && f2.f[0] === '1,000.01' && f2.f.every(v => fc(v) >= 0), 'Fill to 100% also trims an over-budget plan without touching locks or going negative');
  // compare current vs recommended
  const vs = await page.evaluate(() => [...document.querySelectorAll('#sbVsBody tbody tr')].map(tr => [+tr.children[1].dataset.v, +tr.children[2].dataset.v, +tr.children[3].dataset.v]));
  ok(vs.length === 4 && vs.every((r, i) => r[0] === fc(f2.f[i]) && r[1] === recAmts[i] && r[2] === r[0] - r[1]), 'Compare with recommended: yours, recommended and the difference per category');
  // preview impact before saving
  await page.click('#sbPrev summary');
  await typeIn('#sbf-debt', '1500'); await page.keyboard.press('Tab'); await page.waitForTimeout(450);
  const pv = await page.evaluate(() => { const r = {}; document.querySelectorAll('#sbPrevBody tr[data-f]').forEach(tr => { const c = tr.querySelector('[data-v]'); if (c) r[tr.dataset.f] = c.dataset.v; }); return r; });
  const pe = await page.evaluate(() => { const K = ['needs', 'debt', 'savings', 'wants'], A = WTSmart.analyze(), L = WTSmart.strategies(A), cur = L.find(s => s.id === WT.settings().smartBudget.strategyId);
    const d = {}; K.forEach(k => d[k] = WT.parseMoney(document.querySelector('#sbf-' + k).value));
    const a = WTSmart.forecast(A, cur, 12), b = WTSmart.forecast(A, { id: 'custom', amounts: d, debtOrder: cur.debtOrder === 'snowball' ? 'snowball' : 'avalanche' }, 12);
    return { debtPaid: b.debtPaid - a.debtPaid, savingsEnd: b.savingsEnd - a.savingsEnd, interest: b.interest - a.interest }; });
  ok(+pv.debtPaid === pe.debtPaid && +pv.savingsEnd === pe.savingsEnd && +pv.interest === pe.interest && pe.debtPaid !== 0, 'Preview impact shows the forecast change before saving (debt paid ' + pv.debtPaid + ', savings ' + pv.savingsEnd + ', interest ' + pv.interest + ')');
  ok(await page.evaluate(() => { const s = WT.settings().smartBudget; return s.strategyId === '50-30-20' && !s.customDollars; }), 'previewing saves nothing');
  await shot(page, 'smart-preview');
  // named custom strategies: save, no silent overwrite, restore, delete
  const draftNow = async () => (await ed()).f.map(fc);
  const saveAs = async name => { await page.click('#sbSaved [data-act=sbSaveAs]'); await page.waitForTimeout(150); await page.fill('.overlay input[name=name]', name); await page.click('.overlay button[type=submit]'); await page.waitForTimeout(250); };
  const savedS = () => page.evaluate(() => WT.settings().smartBudget.saved || []);
  const d1 = await draftNow();
  await saveAs('Lean month');
  let sv = await savedS();
  ok(sv.length === 1 && sv[0].name === 'Lean month' && K.map(k => sv[0].dollars[k]).join() === d1.join() && sv[0].locks.needs === true && sv[0].locks.debt === false && /^\d{4}-\d{2}-\d{2}$/.test(sv[0].savedOn), 'Save as stores a named strategy with dollars and locks');
  ok(await page.evaluate(() => { const s = WT.settings().smartBudget; return s.strategyId === '50-30-20' && !s.customDollars; }) && await page.locator('#sbSaved .sb-sv').count() === 1, 'Save as lists it without changing the budget in use');
  await typeIn('#sbf-wants', '10'); await page.keyboard.press('Tab');
  await saveAs('lean MONTH');
  ok(await page.locator('.overlay', { hasText: 'Replace' }).count() === 1, 'same name: asks before replacing');
  await page.locator('.overlay').last().locator('[data-close].btn:not(.icon)').click(); await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(JSON.stringify((await savedS())[0].dollars) === JSON.stringify(sv[0].dollars) && await page.locator('.overlay').count() === 0, 'declining keeps the saved strategy as it was');
  await saveAs('Lean month'); await page.locator('.overlay').last().locator('button[type=submit]').click(); await page.waitForTimeout(250);
  sv = await savedS();
  ok(sv.length === 1 && sv[0].dollars.wants === 1000, 'confirming replaces it (still one entry)');
  await typeIn('#sbf-savings', '25'); await page.keyboard.press('Tab');
  await saveAs('Second idea');
  ok((await savedS()).length === 2, 'a second named strategy');
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  ok((await savedS()).length === 2 && await page.locator('#sbSaved .sb-sv').count() === 2, 'saved strategies persist after reload');
  const svL = (await savedS())[0];
  await page.locator('.sb-sv', { hasText: 'Lean month' }).locator('[data-act=sbRestore]').click(); await page.waitForTimeout(200);
  let r1 = await ed();
  ok(r1.f.map(fc).join() === K.map(k => svL.dollars[k]).join() && r1.dis[0] && /Unsaved/.test(r1.dirty), 'Restore loads the saved amounts and locks into the draft');
  ok(await page.evaluate(() => WT.settings().smartBudget.strategyId) === '50-30-20', 'Restore alone saves nothing');
  await page.click('[data-act=sbCancel]'); await page.waitForTimeout(150);
  const base = await ed();
  await page.click('[data-act=sbLock][data-k=wants]');
  await page.locator('.sb-sv', { hasText: 'Lean month' }).locator('[data-act=sbRestore]').click(); await page.waitForTimeout(200);
  ok(await page.locator('.overlay', { hasText: 'locked' }).count() === 1, 'Restore over a locked category asks first (no silent overwrite)');
  await page.click('.overlay [data-act=sbRestoreKeep]'); await page.waitForTimeout(200);
  let r2 = await ed();
  ok(r2.f[3] === base.f[3] && r2.f[0] === W$(svL.dollars.needs).slice(1) && r2.f[1] === W$(svL.dollars.debt).slice(1), '"Keep locked amounts": locked Wants unchanged, the rest restored');
  await page.locator('.sb-sv', { hasText: 'Lean month' }).locator('[data-act=sbRestore]').click(); await page.waitForTimeout(200);
  await page.click('.overlay [data-act=sbRestoreAll]'); await page.waitForTimeout(200);
  ok(fc((await ed()).f[3]) === svL.dollars.wants, '"Replace them too" restores the locked amount only when chosen');
  await page.click('[data-act=sbCancel]'); await page.waitForTimeout(150);
  await page.locator('.sb-sv', { hasText: 'Second idea' }).locator('[data-act=sbDelSaved]').click(); await page.waitForTimeout(150);
  ok(await page.locator('.overlay', { hasText: 'Delete' }).count() === 1, 'Delete asks for confirmation');
  await page.click('.overlay [data-close].btn:not(.icon)'); await page.waitForTimeout(150);
  ok((await savedS()).length === 2, 'declining Delete keeps it');
  await page.locator('.sb-sv', { hasText: 'Second idea' }).locator('[data-act=sbDelSaved]').click(); await page.waitForTimeout(150);
  await page.click('.overlay button[type=submit]'); await page.waitForTimeout(200);
  ok((await savedS()).map(x => x.name).join() === 'Lean month' && await page.locator('#sbSaved .sb-sv').count() === 1, 'confirmed Delete removes only that strategy');
  ok((await ed()).f.join() === e0.f.join(), 'saved-strategy actions leave the budget in use unchanged');
  // Start from a strategy: loads it into the draft without saving
  await page.selectOption('select.sb-from', 'recommended'); await page.waitForTimeout(250);
  let e12 = await ed();
  ok(e12.f.map(fc).join() === recAmts.join() && /Unsaved/.test(e12.dirty), 'Start from Recommended loads it into the draft');
  ok(await page.evaluate(() => WT.settings().smartBudget.strategyId) === '50-30-20', 'loading a strategy does not save');
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
  await sec(page, 'plan');
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
  const san4 = await page.evaluate(() => WTStore.sanitizeData({ meta: { settings: { id: 'settings', smartBudget: { strategyId: 'debt', history: [{ month: '2026-01', strategyId: '60-20-20', pct: { needs: 50, debt: 30, savings: 10, wants: 10 }, amounts: { needs: 1, debt: 1, savings: 1, wants: 1 }, income: 4, savedAt: '2026-01-05' }],
    saved: [{ id: 'sv_1', name: '  <b>Lean</b>\u0001 month ', dollars: { needs: 100, debt: 200, savings: 0, wants: 5 }, locks: { needs: true, debt: 'yes' }, savedOn: '2026-11-09' }, { id: 'sv_1', name: 'dup', dollars: { needs: 1, debt: 1, savings: 1, wants: 1 } }, { id: 'bad id!', name: 'x', dollars: { needs: 1, debt: 1, savings: 1, wants: 1 } }, { id: 'sv_2', name: '', dollars: { needs: 1, debt: 1, savings: 1, wants: 1 } }, { id: 'sv_3', name: 'neg', dollars: { needs: -1, debt: 1, savings: 1, wants: 1 } }, ...Array.from({ length: 30 }, (_, i) => ({ id: 'sv_x' + i, name: 'n' + i, dollars: { needs: 1, debt: 1, savings: 1, wants: 1 }, savedOn: 'nope' }))] } } } }, ['meta']).data.meta.settings.smartBudget);
  ok(san4.strategyId === 'aggressive' && san4.history[0].strategyId === 'balanced', 'sanitize: old strategy ids are renamed (debt → aggressive, 60-20-20 → balanced)');
  ok(san4.saved.length === 20 && san4.saved[0].name === 'bLean/b month' && JSON.stringify(san4.saved[0].locks) === '{"needs":true,"debt":false,"savings":false,"wants":false}' && san4.saved[0].savedOn === '2026-11-09' && !san4.saved.some(x => x.id === 'bad id!' || x.id === 'sv_2' || x.id === 'sv_3' || x.name === 'dup') && !('savedOn' in san4.saved[1]), 'sanitize: saved strategies (max 20, unique ids, clean names, cents only, locks)');

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
  const san5 = await page.evaluate(() => [450, 2000, 2001, -1, 4.5, '450'].map(v => WTStore.sanitizeData({ meta: { settings: { id: 'settings', smartBudget: { savingsAprCenti: v } } } }, ['meta']).data.meta.settings.smartBudget.savingsAprCenti));
  ok(JSON.stringify(san5) === JSON.stringify([450, 2000, null, null, null, null].map(x => x == null ? undefined : x)), 'sanitize: savingsAprCenti integer 0..2000 only ' + JSON.stringify(san5));

  // guards: engine missing or throwing
  await page.evaluate(() => { window.__sb = window.WTSmart; window.WTSmart = undefined; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(/isn't available/.test(await mainText(page)) && !/Something went wrong/.test(await mainText(page)), 'engine missing: friendly message');
  await go(page, 'dashboard'); ok(!/Something went wrong/.test(await mainText(page)), 'engine missing: dashboard still works');
  await go(page, 'smart');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { analyze: () => { throw new Error('boom'); } }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(/couldn't work out a plan/.test(await mainText(page)), 'engine throwing: friendly message');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { recommend: A => Object.assign(window.__sb.recommend(A), { confidence: 'low', showBadge: false, missing: ['Add your take-home pay'] }) }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-cards .sb-card[data-recommended=true]').count() === 0 && await page.locator('#sbCmp .sb-recp').count() === 0 && /Not enough information/.test(await page.locator('#sbWhy').textContent()) && /Add your take-home pay/.test(await page.locator('#sbWhy').textContent()), 'low confidence: no "Recommended for you" badge, missing info listed');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { breakdown: undefined, forecast: undefined, compareAll: undefined, recommend: undefined, fillExactly: undefined }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-hero .sb-row').count() === 4 && await page.locator('#sbCmp tbody tr').count() >= 2 && await page.locator('#sbWhy').count() === 1 && !/Something went wrong/.test(await mainText(page)), 'older engine without the v3 functions: page still works with simple fallbacks');
  await page.evaluate(() => { window.WTSmart = Object.assign({}, window.__sb, { suggestions: () => { throw new Error('boom'); } }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-hero').count() === 1 && await page.locator('.sb-custom').count() === 1 && /couldn't be worked out/.test(await mainText(page)), 'one part failing leaves the rest of the page');
  await page.evaluate(() => { window.__pu = window.WTPlanUI; window.WTPlanUI = { ready: true, renderPaychecks: () => { throw new Error('boom'); }, renderDebt: () => '<section class="section" id="spDebtFake">debt</section>' }; window.WTSmart = window.__sb; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('#spDebtFake').count() === 1 && await page.locator('.sb-custom').count() === 1 && /couldn't be worked out/.test(await mainText(page)), 'a failing plan section is contained');
  await page.evaluate(() => { window.WTPlanUI = undefined; WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.locator('.sb-pc, .empty').count() >= 1 && await page.locator('#spPaychecks').count() === 0, 'no WTPlanUI: falls back to the old paycheck section');
  await page.evaluate(() => { window.WTPlanUI = window.__pu; WTApp.refresh(); }); await page.waitForTimeout(150);
  await page.evaluate(() => { window.WTSmart = window.__sb; WTApp.refresh(); }); await page.waitForTimeout(150);
  await ctx.close();

  // sections: "Customize this" jumps to Customize & paychecks; unsaved editor changes survive switching sections
  {
    const { ctx, page } = await open();
    await go(page, 'smart'); await sec(page, 'compare');
    await page.locator('.sb-card[data-strategy=balanced] [data-act=sbCustomize]').click(); await page.waitForTimeout(250);
    const cj = await page.evaluate(() => ({ val: document.querySelector('#sbSec').value, vis: document.querySelector('#sbEdit').getClientRects().length > 0, top: Math.round(document.querySelector('#sbEdit').getBoundingClientRect().top), cmp: document.querySelector('#sbCmp').getClientRects().length, hash: location.hash, dirty: document.querySelector('#sbDirty').textContent }));
    ok(cj.val === 'customize' && cj.vis && cj.cmp === 0 && cj.top >= -2 && cj.top < 120 && cj.hash === '#/smart/customize', '"Customize this" switches to Customize & paychecks and scrolls to the editor ' + JSON.stringify(cj));
    const bal = await page.evaluate(() => { const A = WTSmart.analyze(); const s = WTSmart.strategies(A).find(x => x.id === 'balanced'); return ['needs', 'debt', 'savings', 'wants'].map(k => WT.parseMoney(document.querySelector('#sbf-' + k).value) === s.amounts[k]).every(Boolean); });
    ok(bal && /Unsaved/.test(cj.dirty), 'and loads that strategy into the editor (unsaved)');
    // type, switch away and back: the typed amounts, locks and the Unsaved state are kept
    await page.fill('#sbf-needs', '1234.56'); await page.keyboard.press('Tab');
    await page.click('[data-act=sbLock][data-k=savings]');
    const keep0 = await page.evaluate(() => ['needs', 'debt', 'savings', 'wants'].map(k => document.querySelector('#sbf-' + k).value).join('|'));
    await sec(page, 'plan');
    ok(/unsaved changes/i.test(await page.locator('#sbSecNote').textContent()) && await page.locator('#sbSecNote').isVisible(), 'switching away with unsaved changes says they are kept');
    ok(await page.locator('.toast', { hasText: 'Unsaved changes kept' }).count() >= 1, 'and a toast confirms it');
    await sec(page, 'compare');
    await page.evaluate(() => WTApp.refresh()); await page.waitForTimeout(150); // a full re-render while away
    ok(await page.locator('#sbSec').inputValue() === 'compare' && await page.locator('#sbWhy').isVisible(), 'a re-render keeps the chosen section');
    await page.click('#sbSecNote [data-act=sbGo]'); await page.waitForTimeout(150);
    const keep1 = await page.evaluate(() => ({ f: ['needs', 'debt', 'savings', 'wants'].map(k => document.querySelector('#sbf-' + k).value).join('|'), lock: document.querySelector('[data-act=sbLock][data-k=savings]').getAttribute('aria-pressed'), dirty: document.querySelector('#sbDirty').textContent, val: document.querySelector('#sbSec').value, note: document.querySelector('#sbSecNote').textContent }));
    ok(keep1.val === 'customize' && keep1.f === keep0 && keep0.startsWith('1,234.56') && keep1.lock === 'true' && /Unsaved/.test(keep1.dirty) && !keep1.note, 'unsaved editor changes survive a section switch and a re-render (' + keep1.f + ')');
    ok(await page.evaluate(() => { const s = WT.settings().smartBudget || {}; return !s.customDollars; }), 'switching sections saves nothing');
    await page.click('[data-act=sbCancel]'); await page.waitForTimeout(150);
    await sec(page, 'plan');
    ok(!(await page.locator('#sbSecNote').textContent()), 'no note once the changes are cancelled');
    // keyboard: the dropdown is focusable and switches with the arrow keys
    await page.focus('#sbSec'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'sbSec') && await page.locator('#sbSec').inputValue() !== '', 'dropdown works from the keyboard and keeps focus');
    await ctx.close();
  }
  // 360px: no sideways scroll; tap targets
  {
    const { ctx, page } = await open({ viewport: { width: 360, height: 760 } });
    await go(page, 'smart');
    // every section on its own (inactive ones are hidden, so each is measured while it shows)
    const fit360 = () => page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, vw: innerWidth, wide: [...document.querySelectorAll('#main *')].filter(el => { const b = el.getBoundingClientRect(); if (!b.width) return false; for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'hidden' || o === 'scroll') && p !== document.body) return false; } return b.right > innerWidth + 1; }).length, small: [...document.querySelectorAll('#main .btn, #main .sb-range, #sbSec')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.height < 39.5; }).length }));
    for (const v of SECS) {
      await sec(page, v);
      const r = await fit360();
      ok(r.sw <= 360 && r.vw === 360 && r.wide === 0, `360px "${v}": no horizontal overflow (scrollWidth ${r.sw}, wide ${r.wide})`);
      ok(r.small === 0, `360px "${v}": buttons, sliders and the dropdown are at least 40px tall`);
      await shot(page, 'smart-360-' + v, true);
    }
    // editing on a phone: big amount fits, Remaining bar stays on screen, still no sideways scroll
    await sec(page, 'customize');
    await page.locator('#sbf-needs').scrollIntoViewIfNeeded();
    await page.fill('#sbf-needs', '12345678.90'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
    await page.fill('#sbf-wants', '9999'); await page.keyboard.press('Tab'); await page.waitForTimeout(100);
    await page.locator('#sbf-debt').scrollIntoViewIfNeeded();
    const m = await page.evaluate(() => { const f = document.querySelector('#sbf-needs'), rb = document.querySelector('#sbRemain').getBoundingClientRect(), nav = document.querySelector('.bottom-nav'); const nb = nav ? nav.getBoundingClientRect().top : innerHeight;
      return { val: f.value, fits: f.scrollWidth <= f.clientWidth + 1, inView: rb.top >= 0 && rb.bottom <= nb + 1, sw: document.scrollingElement.scrollWidth, vw: innerWidth, over: /Over by/.test(document.querySelector('#sbRemain').textContent), save: !!document.querySelector('#sbRemain [data-act=sbSave]'), cancel: !!document.querySelector('#sbRemain [data-act=sbCancel]') }; });
    ok(m.val === '12,345,678.90' && m.fits, '360px: a large typed amount fits its field (' + m.val + ')');
    ok(m.inView && m.over && m.save && m.cancel, '360px: sticky bar with Over warning, Save and Cancel stays on screen while editing');
    ok(m.sw <= 360, '360px: no sideways scroll while editing');
    await sec(page, 'plan');
    await page.locator('#sbPlans').scrollIntoViewIfNeeded();
    for (const k of ['needs', 'debt', 'savings', 'wants']) await page.click(`[data-act=sbToggle][data-k=${k}]`);
    await page.evaluate(() => document.querySelectorAll('.sb details').forEach(d => { d.open = true; }));
    const x3s = [];
    for (const v of SECS) { await sec(page, v); x3s.push(await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, vw: innerWidth, wide: [...document.querySelectorAll('#main *')].filter(el => { const b = el.getBoundingClientRect(); if (!b.width) return false; for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'hidden' || o === 'scroll') && p !== document.body) return false; } return b.right > innerWidth + 1; }).length, small: [...document.querySelectorAll('#main .sb-x-b, #main [data-act=sbHorizon]:not(.sm *), #sbSaved .btn')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.height < 39.5; }).map(el => el.className + ':' + el.textContent.trim().slice(0, 20) + ':' + Math.round(el.getBoundingClientRect().height)) }))); }
    const x3 = { sw: Math.max(...x3s.map(x => x.sw)), vw: 360 /* a phone viewport can grow to fit wide content, so compare with 360 itself */, wide: x3s.reduce((t, x) => t + x.wide, 0), small: [].concat(...x3s.map(x => x.small)) };
    ok(x3.sw <= x3.vw && x3.wide === 0, `360px: expanded categories, strategy details and forecast cards fit (scrollWidth ${x3.sw}, wide ${x3.wide})`);
    ok(x3.small.length === 0, '360px: category rows, horizon buttons and saved-strategy buttons are at least 40px tall ' + x3.small.join(', '));
    await sec(page, 'plan'); await page.locator('#sbPlans').scrollIntoViewIfNeeded(); await shot(page, 'smart-360-plans');
    await sec(page, 'compare'); await page.locator('#sbCmp').scrollIntoViewIfNeeded(); await shot(page, 'smart-360-forecast');
    await shot(page, 'smart-360-editing');
    await ctx.close();
  }
  // desktop: comparison table
  {
    const { ctx, page } = await open({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
    await go(page, 'smart');
    const dsel = await page.evaluate(() => { const r = document.querySelector('#sbSec').getBoundingClientRect(); return { w: r.width, vis: r.height > 0 }; });
    ok(dsel.vis && dsel.w >= 200 && dsel.w <= 420, 'desktop: the Section dropdown is there too (' + Math.round(dsel.w) + 'px wide)');
    await shot(page, 'smart-desktop-plan', true);
    await sec(page, 'compare');
    ok(await page.locator('#sbCmp .sb-ftbl thead').isVisible() && await page.locator('.sb-cards').evaluate(e => getComputedStyle(e).display) === 'grid', 'desktop: strategy cards in a grid and a comparison table');
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
    const pd = await page.evaluate(PALETTE);
    ok(pd.ok, 'dark mode: restrained bucket colors ' + JSON.stringify(pd.v));
    await sec(page, 'customize'); await page.locator('#sbEdit').scrollIntoViewIfNeeded(); await shot(page, 'smart-dark-editor');
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
    const R2 = await page.evaluate(() => WTSmart.recommend(WTSmart.analyze()));
    const recCards = await page.locator('.sb-cards .sb-card[data-recommended=true]').evaluateAll(els => els.map(e => e.dataset.strategy + ':' + e.dataset.realistic));
    ok(recCards.length <= 1 && recCards.every(x => /:true$/.test(x)) && (R2.showBadge ? recCards[0] === R2.id + ':true' : recCards.length === 0), 'low income: "Recommended for you" only on a realistic strategy the engine is sure of (' + (recCards.join() || 'none') + ')');
    const unrealCards = await page.locator('.sb-cards .sb-card:has(.pill:text-is("Not realistic"))').evaluateAll(els => els.map(e => e.dataset.strategy));
    ok(A.unreal.length > 0 && A.unreal.filter(id => id !== 'recommended' && id !== 'custom').every(id => unrealCards.includes(id)), 'low income: unrealistic strategies say Not realistic (' + unrealCards.join(', ') + ')');
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

  // demo (new user, nothing entered): Smart Budget works on the 6 fictional bills / 2 debts; saved strategies stay in memory
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); } catch (e) { } });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
    ok(await page.locator('.demo-bar').count() === 1 && await page.locator('.sb-cards .sb-card').count() === 8 && await page.locator('.sb-hero .sb-row').count() === 4, 'demo: DEMO banner, plans and 8 strategies');
    await page.click('[data-act=sbToggle][data-k=debt]');
    ok(/Demo Credit Card/.test(await page.locator('#sbx-debt').textContent()) && await page.locator('#sbx-debt .sb-it[data-kind=minimum]').count() === 2, 'demo: Debt expands to the 2 demo debts');
    await sec(page, 'customize');
    await page.click('#sbSaved [data-act=sbSaveAs]'); await page.fill('.overlay input[name=name]', 'Demo try'); await page.click('.overlay button[type=submit]'); await page.waitForTimeout(250);
    ok(await page.locator('#sbSaved .sb-sv').count() === 1, 'demo: Save as works');
    await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
    ok(await page.locator('.demo-bar').count() === 1 && await page.locator('#sbSaved .sb-sv').count() === 0 && await page.evaluate(() => !(WT.settings().smartBudget || {}).saved), 'demo: saved strategies were memory-only (gone after reload)');
    await shot(page, 'smart-demo');
    await ctx.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
