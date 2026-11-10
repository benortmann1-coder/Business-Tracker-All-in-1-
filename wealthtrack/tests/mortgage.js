// Mortgage: add one through the debt form (escrow field only for mortgages), then see it counted once under
// Essentials in Smart Budget, never as a Debt minimum. Uses the made-up fixture plus a mortgage created here.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/mortgage.js   (after node wealthtrack/build.js)
const { chromium } = require('playwright');
const path = require('path');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript({ path: path.join(__dirname, 'fixtures/sample-data.js') });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(250); };

  // built-in home categories were added to this (older-style) install, once
  const cats = await page.evaluate(() => ['cat_mortgage', 'cat_property_tax', 'cat_home_insurance', 'cat_pmi', 'cat_hoa', 'cat_home_maintenance'].filter(id => WT.D.categories[id]).length);
  ok(cats === 6, 'home categories added on start (' + cats + '/6)');
  const minsBefore = await page.evaluate(() => WTSmart.analyze().debtMinimums);

  // debt form: escrow only shows for a mortgage
  await go('debts');
  await page.click('[data-act=addDebt]'); await page.waitForSelector('.overlay form');
  const vis = () => page.evaluate(() => { const el = document.querySelector('.overlay [name=escrow]'); return !!el && el.closest('.mort-only').style.display !== 'none' && el.offsetParent !== null; });
  ok(!(await vis()), 'escrow field hidden for a credit card');
  await page.selectOption('.overlay [name=type]', 'mortgage');
  ok(await vis(), 'escrow field shown for a mortgage');
  ok(/Property taxes and homeowners insurance are usually in escrow/.test(await page.locator('.overlay #escrowHelp').textContent()), 'escrow helper text');
  const inp = await page.evaluate(() => { const el = document.querySelector('.overlay [name=escrow]'); const r = el.closest('label').getBoundingClientRect(); return { mode: el.getAttribute('inputmode'), fs: parseFloat(getComputedStyle(el).fontSize), h: r.height, sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  ok(inp.mode === 'decimal' && inp.fs >= 16 && inp.h >= 40, `escrow input: decimal keypad, ${inp.fs}px text, ${Math.round(inp.h)}px tap area`);
  ok(inp.sw <= inp.vw, `360px: debt form fits (scrollWidth ${inp.sw})`);
  await page.selectOption('.overlay [name=type]', 'auto');
  ok(!(await vis()), 'hidden again for other types');
  await page.selectOption('.overlay [name=type]', 'mortgage');
  await page.fill('.overlay [name=name]', 'Test Home Loan');
  await page.fill('.overlay [name=balance]', '250000');
  await page.fill('.overlay [name=apr]', '6.5');
  await page.fill('.overlay [name=min]', '2000');
  await page.fill('.overlay [name=escrow]', '2500');
  await page.click('.overlay [type=submit]'); await page.waitForTimeout(250);
  ok(await page.locator('.overlay form').count() === 1, 'escrow at or above the payment is refused');
  await page.fill('.overlay [name=escrow]', '450');
  await page.click('.overlay [type=submit]'); await page.waitForTimeout(300);
  const rec = await page.evaluate(() => { const d = WT.debts().find(x => x.name === 'Test Home Loan'); const t = d && WT.list('templates').find(x => x.debtId === d.id && !x.deleted); return d && { id: d.id, type: d.type, min: d.minCents, esc: d.escrowCents, bal: WT.debtBalance(d.id), cat: t && t.category, amt: t && WT.ruleAt(t, WT.todayStr()) ? WT.ruleAt(t, WT.todayStr()).amountCents : t && t.versions[0].amountCents, pi: WT.debtInputs().find(x => x.id === d.id).minCents }; });
  ok(rec && rec.type === 'mortgage' && rec.min === 200000 && rec.esc === 45000 && rec.bal === 25000000, 'mortgage saved with $450 escrow');
  ok(rec && rec.cat === 'cat_mortgage' && rec.amt === 200000, 'its monthly bill is in the Mortgage category for the full payment');
  ok(rec && rec.pi === 155000, 'payoff math uses principal + interest ($1,550)');
  ok(/incl\. \$450\.00 escrow/.test(await page.locator(`.debt-row[data-debt="${rec.id}"]`).textContent()), 'debt list shows the escrow part');

  // Smart Budget: under Essentials once, not in Debt minimums
  await go('smart');
  if (await page.locator('#sbSec').count()) { await page.selectOption('#sbSec', 'plan'); await page.waitForTimeout(150); }
  const eng = await page.evaluate(id => { const A = WTSmart.analyze(); const bd = WTSmart.breakdown(A); const all = ['needs', 'debt', 'savings', 'wants'].flatMap(b => bd[b].items.map(it => Object.assign({ b }, it))); return { mins: A.debtMinimums, home: all.filter(it => it.debtId === id && it.kind !== 'extra').map(it => it.b + ':' + it.amount) }; }, rec.id);
  ok(eng.mins === minsBefore, `Debt minimums unchanged by the mortgage (${eng.mins})`);
  ok(eng.home.length === 1 && eng.home[0] === 'needs:200000', 'engine: mortgage listed once, under Essentials (' + eng.home.join(',') + ')');
  const tog = page.locator('[data-act=sbToggle][data-k=needs]');
  if (await tog.count()) {
    await tog.first().click(); await page.waitForTimeout(200);
    const needsTxt = await page.locator('#sbx-needs').textContent();
    ok(/Test Home Loan/.test(needsTxt) && /\$2,000\.00/.test(needsTxt), 'Smart Budget Essentials shows the mortgage payment');
    const dt = page.locator('[data-act=sbToggle][data-k=debt]'); await dt.first().click(); await page.waitForTimeout(200);
    const debtTxt = await page.locator('#sbx-debt').textContent();
    ok(!/Test Home Loan[^:]*\$2,000\.00/.test(debtTxt) && (debtTxt.match(/Test Home Loan/g) || []).length <= 1, 'not listed again as a Debt minimum');
  } else ok(false, 'Essentials toggle not found on Smart Budget');
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(sw[0] <= sw[1], `360px: Smart Budget fits (scrollWidth ${sw[0]})`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
