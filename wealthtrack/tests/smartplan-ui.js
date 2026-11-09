// Smart Budget v2: paycheck-by-paycheck planner + debt payoff screens (web/smartplan-ui.js, WTPlanUI).
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/smartplan-ui.js [--shots <dir>]   (after node wealthtrack/build.js)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const fi = process.argv.indexOf('--file');
const FILE = 'file://' + (fi > 0 ? path.resolve(process.argv[fi + 1]) : path.join(__dirname, '../dist/WealthTrack.html'));
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
// all money data (everything except settings), canonical key order
const DATA = (fix) => { const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => { o[k] = canon(v[k]); return o; }, {}) : v;
  const D = JSON.parse(JSON.stringify(WT.D)); if (fix) for (const id in fix) { if (D.instances[id]) { if (fix[id] == null) delete D.instances[id].paycheckKey; else D.instances[id].paycheckKey = fix[id]; } }
  for (const id in D.instances) if (D.instances[id].paycheckKey == null) delete D.instances[id].paycheckKey;
  return JSON.stringify(WT.COLLS.filter(c => c !== 'meta').map(c => [c, canon(D[c])])); };

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let wired = null;
  const open = async (opts) => {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 }, opts || {}));
    await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
    await ctx.addInitScript({ path: path.join(__dirname, 'fixtures/sample-data.js') }); // made-up sample data
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);
    return { ctx, page };
  };
  // the real page renders the sections once app.js calls WTPlanUI; until then, put them on #/smart by hand
  const ensure = async p => {
    const has = await p.evaluate(() => !!document.getElementById('spPaychecks') && !!document.getElementById('spDebt'));
    if (wired == null) wired = has;
    if (!has) await p.evaluate(() => { document.querySelectorAll('#spPaychecks,#spDebt').forEach(e => e.remove()); document.querySelector('#main').insertAdjacentHTML('beforeend', WTPlanUI.renderPaychecks() + WTPlanUI.renderDebt()); });
  };
  const go = async (p, r) => { await p.evaluate(r => { location.hash = '#/' + r; }, r); await p.waitForTimeout(300); if (r === 'smart') await ensure(p); };
  const shot = async (p, n, sel) => { if (!SHOTS) return; await p.waitForTimeout(200); if (sel) await p.locator(sel).screenshot({ path: path.join(SHOTS, n + '.png') }); else await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const settle = async p => { await p.waitForTimeout(250); await ensure(p); };
  // the engine's numbers for what the screen currently previews (saved settings + the unsaved draft)
  const enginePlan = p => p.evaluate(() => { const d = WTPlanUI._draft, sb = WT.settings().smartBudget || {}; return WTPlan.paycheckPlan({ count: 4, moves: Object.assign({}, d.moves), income: Object.assign({}, sb.paycheckIncome || {}, d.income), alloc: Object.assign({}, sb.paycheckAlloc || {}, d.alloc), strategy: d.ctx && d.ctx.chosen }); });
  const cardsUI = p => p.$$eval('#spPaychecks .sp-card[data-key]', cs => cs.map(c => { const t = f => { const n = c.querySelector(`[data-f="${f}"]`); return n ? n.textContent.trim() : null; }; const vis = r => { const n = c.querySelector(`[data-row="${r}"]`); return !!n && !n.hidden; };
    return { key: c.dataset.key, remaining: t('remaining'), carryIn: t('carryIn'), reserveIn: t('reserveIn'), reserveOut: t('reserveOut'), billsDue: t('billsDue'), ci: vis('carryIn'), ri: vis('reserveIn'), ro: vis('reserveOut'), over: c.classList.contains('is-over'),
      resIn: [...c.querySelectorAll('.sp-res-in')].map(x => ({ key: x.dataset.from, amt: +x.dataset.amt, text: x.textContent })), short: !!c.querySelector('.sp-short,.sp-overw'),
      bills: [...c.querySelectorAll('.sp-bill')].map(b => ({ id: b.dataset.inst, paid: b.dataset.paid === '1', amt: +b.dataset.amt, pill: !!b.querySelector('.pill.paid') })) }; }));
  const fmtAll = (p, list) => p.evaluate(l => l.map(c => WT.fmt(c)), list);
  async function matchesEngine(p, label) {
    const [ui, eng] = [await cardsUI(p), await enginePlan(p)];
    const pcs = eng.paychecks;
    let good = ui.length === pcs.length && ui.length === 4;
    const bad = [];
    for (let i = 0; good && i < pcs.length; i++) {
      const e = pcs[i], u = ui[i];
      const [rem, ci, ri, ro, bd] = await fmtAll(p, [e.remaining, e.carryIn, e.reserveIn, e.reserveOut, e.billsDue]);
      if (u.key !== e.key || u.remaining !== rem || u.carryIn !== '+' + ci || u.reserveIn !== '+' + ri || u.reserveOut !== '−' + ro || u.billsDue !== bd) bad.push(i + ': ' + JSON.stringify({ u: [u.remaining, u.carryIn, u.reserveIn, u.billsDue], e: [rem, ci, ri, bd] }));
      if (u.ci !== (e.carryIn > 0) || u.ri !== (e.reserveIn > 0) || u.ro !== (e.reserveOut > 0)) bad.push(i + ': row visibility');
      if (e.remaining !== e.net + e.carryIn + e.reserveIn - e.billsDue - e.allocTotal - e.reserveOut) bad.push(i + ': remaining formula');
      const from = (e.reserveFrom || []).map(x => x.key + ':' + x.amount).join(), uf = u.resIn.map(x => x.key + ':' + x.amt).join(); if (from !== uf) bad.push(i + ': reserve sources ' + uf + ' vs ' + from);
    }
    ok(good && !bad.length, label + (bad.length ? ' ' + bad.join(' | ') : ''));
    return { ui, eng };
  }

  // ---------------------------------------------------------------- setup: one paid bill (before the data snapshot)
  const { ctx, page } = await open();
  ok(await page.evaluate(() => !!(window.WTPlanUI && WTPlanUI.ready && window.WTExt && WTExt.plan && WTExt.plan.act)), 'WTPlanUI ready and actions registered');
  ok(await page.evaluate(() => !!(window.WTPlan && WTPlan.ready)), 'WTPlan engine ready');
  const paidId = await page.evaluate(() => { const pcs = WTPlan.paycheckPlan({ count: 4 }).paychecks; const b = pcs[1].bills.find(x => !x.paid && x.remaining > 0) || pcs[0].bills.find(x => !x.paid); WT.markPaid(b.instId, WT.todayStr()); return b.instId; });
  await page.evaluate(() => WTStore.flush && WTStore.flush());
  await go(page, 'smart');
  const before = await page.evaluate(DATA);
  const settings0 = await page.evaluate(() => JSON.stringify(WT.settings().smartBudget || {}));
  ok(await page.locator('#main #spPaychecks').count() === 1 && await page.locator('#main #spDebt').count() === 1, 'both sections render inside #/smart' + (wired ? ' (via app.js)' : ' (injected: app.js does not call WTPlanUI yet)'));
  ok(!/Something went wrong/.test(await page.locator('#main').textContent()), 'page renders without errors');
  const c0 = await matchesEngine(page, 'paycheck cards: carry-in, reserve, bills and remaining match WTPlan');
  ok(c0.eng.paychecks.every((e, i) => c0.ui[i] && c0.ui[i].bills.length === e.bills.length), 'every bill listed in its paycheck');
  const allIds = c0.ui.flatMap(c => c.bills.map(b => b.id));
  ok(new Set(allIds).size === allIds.length, 'no bill appears in two paychecks (' + allIds.length + ' bills)');
  // paid bill
  const paidCard = c0.ui.find(c => c.bills.some(b => b.id === paidId));
  const pb = paidCard && paidCard.bills.find(b => b.id === paidId);
  ok(pb && pb.paid && pb.pill && pb.amt === 0, 'paid bill shows Paid and counts $0');
  const unpaidSum = paidCard.bills.reduce((t, b) => t + b.amt, 0);
  ok(paidCard.billsDue === (await fmtAll(page, [unpaidSum]))[0], 'bills due = unpaid bills only (' + paidCard.billsDue + ')');
  // reserve callout wording with an exact amount and date
  const anyRes = c0.ui.flatMap(c => c.resIn);
  if (anyRes.length) ok(anyRes.every(r => /Set aside \$[\d,]+\.\d\d from the [A-Z][a-z]{2} \d+ paycheck/.test(r.text)), 'reserve callout: "' + anyRes[0].text.trim().slice(0, 60) + '…"');
  else ok(true, 'no paycheck needs a reserve in this data');
  await shot(page, 'plan-paychecks', '#spPaychecks');

  // ---------------------------------------------------------------- live edits: income override + allocations
  const k0 = c0.ui[0].key;
  const net0 = `#spPaychecks .sp-card[data-key="${k0}"] input[data-k=net]`;
  const sav0 = `#spPaychecks .sp-card[data-key="${k0}"] input[data-k=savings]`;
  ok(await page.$eval(net0, el => el.getAttribute('inputmode') === 'decimal' && parseFloat(getComputedStyle(el).fontSize) >= 16), 'money fields: inputmode decimal, 16px+ text');
  await page.fill(net0, '1800.50');
  ok(await page.evaluate(s => document.activeElement === document.querySelector(s), net0), 'typing keeps focus in the field');
  await matchesEngine(page, 'income override updates the numbers live');
  ok((await enginePlan(page)).paychecks[0].net === 180050 && (await enginePlan(page)).paychecks[0].incomeOverridden, 'override is 1800.50 for that paycheck only');
  await page.fill(sav0, '100');
  await page.fill(`#spPaychecks .sp-card[data-key="${k0}"] input[data-k=wants]`, '25.75');
  const c1 = await matchesEngine(page, 'allocation edits (cents) update remaining live');
  ok(c1.eng.paychecks[0].alloc.savings === 10000 && c1.eng.paychecks[0].alloc.wants === 2575, 'allocations 100.00 / 25.75 in the preview');
  ok(await page.evaluate(() => JSON.stringify(WT.settings().smartBudget || {})) === settings0, 'nothing saved while editing');
  ok(await page.locator('#spPaychecks [data-act=spPcSave]').isEnabled(), 'Save enabled with unsaved changes');
  // overallocation warning
  const k3 = c0.ui[3].key;
  await page.fill(`#spPaychecks .sp-card[data-key="${k3}"] input[data-k=wants]`, '99999');
  const c2 = await cardsUI(page);
  ok(c2[3].over && c2[3].short, 'overallocated paycheck turns red with a warning');
  await shot(page, 'plan-overallocated', `#spPaychecks .sp-card[data-key="${k3}"]`);
  // cancel
  await page.click('#spPaychecks [data-act=spPcCancel]'); await page.waitForTimeout(150);
  ok(await page.$eval(net0, el => el.value) === (c0.eng.paychecks[0].net / 100).toFixed(2) && !(await cardsUI(page))[3].over, 'Cancel puts every amount back');
  ok(await page.evaluate(() => JSON.stringify(WT.settings().smartBudget || {})) === settings0, 'Cancel saved nothing');
  // save
  await page.fill(net0, '1800.50'); await page.fill(sav0, '100');
  await page.click('#spPaychecks [data-act=spPcSave]'); await settle(page);
  let sb = await page.evaluate(() => WT.settings().smartBudget);
  ok(sb.paycheckIncome && sb.paycheckIncome[k0] === 180050 && sb.paycheckAlloc && sb.paycheckAlloc[k0] && sb.paycheckAlloc[k0].savings === 10000, 'Save writes paycheckIncome + paycheckAlloc');
  ok(Object.keys(JSON.parse(settings0)).every(k => k === 'paycheckIncome' || k === 'paycheckAlloc' || JSON.stringify(JSON.parse(settings0)[k]) === JSON.stringify(sb[k])), 'Save keeps the other Smart Budget settings');
  await page.evaluate(() => WTStore.flush && WTStore.flush());
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  ok(await page.$eval(net0, el => el.value) === '1800.50' && await page.$eval(sav0, el => el.value) === '100.00', 'saved amounts are there after reload');
  ok(/Changed by you/.test(await page.locator(`#spPaychecks .sp-card[data-key="${k0}"]`).textContent()), 'overridden paycheck says "Changed by you"');
  await matchesEngine(page, 'after reload: numbers match WTPlan');

  // ---------------------------------------------------------------- move a bill to another paycheck ("Fund from…")
  const mv = await page.evaluate(() => { const pcs = WTPlan.paycheckPlan({ count: 4 }).paychecks; for (let i = 1; i < pcs.length; i++) for (const b of pcs[i].bills) { if (b.paid) continue; const t = WTPlan.moveTargets(b.instId).find(x => x.key === pcs[i - 1].key); if (t) { const inst = WT.D.instances[b.instId]; return { id: b.instId, from: pcs[i].key, to: t.key, due: inst.dueDate, amt: inst.amountCents, pk: inst.paycheckKey || null }; } } return null; });
  ok(!!mv, 'found a bill that can move to an earlier paycheck');
  if (mv) {
    const row = `#spPaychecks .sp-card[data-key="${mv.from}"] .sp-bill[data-inst="${mv.id}"]`;
    await page.click(row + ' [data-act=spFundOpen]');
    await page.selectOption(row + ' select[data-inst]', mv.to); await page.waitForTimeout(200);
    const inTarget = await page.locator(`#spPaychecks .sp-card[data-key="${mv.to}"] .sp-bill[data-inst="${mv.id}"]`).count();
    const inSource = await page.locator(`#spPaychecks .sp-card[data-key="${mv.from}"] .sp-bill[data-inst="${mv.id}"]`).count();
    ok(inTarget === 1 && inSource === 0, 'moved bill shows under the new paycheck (preview)');
    ok(/Moved · not saved/.test(await page.locator(`#spPaychecks .sp-card[data-key="${mv.to}"] .sp-bill[data-inst="${mv.id}"]`).textContent()), 'moved bill is labeled "not saved"');
    ok(await page.evaluate(id => WT.D.instances[id].paycheckKey || null, mv.id) === mv.pk, 'nothing written before Save');
    await matchesEngine(page, 'move preview: numbers match WTPlan');
    await shot(page, 'plan-moved', `#spPaychecks .sp-card[data-key="${mv.to}"]`);
    await page.click('#spPaychecks [data-act=spPcSave]'); await settle(page);
    const inst = await page.evaluate(id => { const i = WT.D.instances[id]; return { pk: i.paycheckKey, due: i.dueDate, amt: i.amountCents }; }, mv.id);
    ok(inst.pk === mv.to && inst.due === mv.due && inst.amt === mv.amt, 'Save: only paycheckKey changed (due ' + inst.due + ', ' + inst.amt + ' cents)');
    ok(await page.locator(`#spPaychecks .sp-card[data-key="${mv.to}"] .sp-bill[data-inst="${mv.id}"]`).count() === 1, 'after Save the bill stays in the new paycheck');
  }

  // ---------------------------------------------------------------- debt payoff
  // the debt section starts from the chosen strategy's extra payment (shown in the Extra field) and its repayment order
  const dp = await page.evaluate(() => { const f = document.querySelector('#spDebt input[data-k=extra]'); const ch = WTPlanUI._draft.ctx && WTPlanUI._draft.ctx.chosen || {}; const r = WTPlan.debtPlans({ extra: f ? WT.parseMoney(f.value) || 0 : 0 }); r.method = (WT.settings().smartBudget.debt || {}).method || (ch.debtOrder === 'snowball' ? 'snowball' : 'avalanche'); return r; });
  const tabOn = () => page.$eval('#spDebt .sp-tabs button.on', b => b.dataset.m);
  const orderUI = () => page.$$eval('#spDebt .sp-debt', ds => ds.map(d => d.dataset.debt));
  ok(await page.locator('#spDebt .sp-tabs button').count() === 3, 'three method tabs (Avalanche / Snowball / Custom)');
  ok(await page.locator('#spDebt .sp-tbl tbody tr').count() >= 3, 'side-by-side comparison rows');
  ok(JSON.stringify(await orderUI()) === JSON.stringify(dp.methods[dp.method].order.map(x => x.id)), 'order list matches WTPlan (' + dp.method + ')');
  const debtIds = await page.evaluate(() => WT.debts().filter(d => !d.closed && WT.debtBalance(d.id) > 0).map(d => d.id).sort().join());
  ok((await orderUI()).slice().sort().join() === debtIds, 'only real open debts are listed (' + (await orderUI()).length + ')');
  const settingsD = await page.evaluate(() => JSON.stringify(WT.settings().smartBudget.debt || null));
  await page.click('#spDebt [data-act=spDebtMethod][data-m=snowball]'); await page.waitForTimeout(150);
  const snow = await page.evaluate(() => WTPlan.debtPlans({ method: 'snowball', extra: WTPlanUI._draft.debt.extra, order: WTPlanUI._draft.debt.order }));
  ok(await tabOn() === 'snowball' && JSON.stringify(await orderUI()) === JSON.stringify(snow.methods.snowball.order.map(x => x.id)), 'Snowball tab switches the order');
  ok(await page.locator('#spDebt .sp-tbl tr.on[data-method=snowball]').count() === 1, 'comparison highlights the selected method');
  // missing APR (sample data: Furniture Plan and Gas Card have no APR)
  if (dp.missing.length) {
    const t = await page.locator('#spDebt .sp-missing').textContent();
    ok(dp.missing.every(m => t.includes(m.name)) && await page.locator('#spDebt .sp-missing a[href="#/debts"]').count() === 1, 'missing details warning lists ' + dp.missing.map(m => m.name).join(', ') + ' with a link to Debts');
    ok(/Need APR for|estimate/i.test(await page.locator('#spDebt [data-f=ddate]').textContent()), 'no precise payoff date: "' + (await page.locator('#spDebt [data-f=ddate]').textContent()) + '"');
    const m0 = dp.missing[0].id;
    ok(!/Paid off by/.test(await page.locator(`#spDebt .sp-debt[data-debt="${m0}"]`).textContent()), 'debt with missing APR has no payoff date');
  } else ok(false, 'expected sample data to have a debt without an APR');
  // custom order
  await page.click('#spDebt [data-act=spDebtMethod][data-m=custom]'); await page.waitForTimeout(150);
  const o1 = await orderUI();
  await page.click(`#spDebt .sp-debt[data-debt="${o1[1]}"] [data-act=spDebtMove][data-n="-1"]`); await page.waitForTimeout(150);
  const o2 = await orderUI();
  ok(await tabOn() === 'custom' && o2[0] === o1[1] && o2[1] === o1[0], 'Custom: moving a debt up changes who gets extra first');
  const cust = await page.evaluate(() => WTPlan.debtPlans({ method: 'custom', extra: WTPlanUI._draft.debt.extra, order: WTPlanUI._draft.debt.order }));
  ok(/starting with/.test(cust.methods.custom.notes.join(' ')) ? cust.methods.custom.notes.join(' ').includes(await page.evaluate(id => WT.D.debts[id].name, o2[0])) : true, 'engine agrees on the first custom debt');
  await page.fill('#spDebt input[data-k=extra]', '200');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.k === 'extra'), 'extra field keeps focus while typing');
  ok((await page.locator('#spDebt [data-f=dextra]').textContent()).includes('200.00'), 'extra payment shows in the summary live');
  const ex = await page.evaluate(() => WTPlan.debtPlans({ method: 'custom', extra: 20000, order: WTPlanUI._draft.debt.order }));
  ok((await page.locator('#spDebt [data-f=dint]').textContent()).includes(await page.evaluate(c => WT.fmt(c), ex.methods.custom.totalInterest)), 'total interest matches WTPlan');
  ok(await page.evaluate(() => JSON.stringify(WT.settings().smartBudget.debt || null)) === settingsD, 'debt plan not saved before Save');
  await shot(page, 'plan-debt', '#spDebt');
  await page.click('#spDebt [data-act=spDebtCancel]'); await page.waitForTimeout(150);
  ok(await tabOn() === (dp.method || 'avalanche') && await page.evaluate(() => JSON.stringify(WT.settings().smartBudget.debt || null)) === settingsD, 'Cancel discards the debt draft');
  await page.click('#spDebt [data-act=spDebtMethod][data-m=custom]'); await page.waitForTimeout(100);
  const o3 = await orderUI();
  await page.click(`#spDebt .sp-debt[data-debt="${o3[2]}"] [data-act=spDebtMove][data-n="-1"]`); await page.waitForTimeout(100);
  await page.fill('#spDebt input[data-k=extra]', '150.25');
  const want = await orderUI();
  await page.click('#spDebt [data-act=spDebtSave]'); await settle(page);
  sb = await page.evaluate(() => WT.settings().smartBudget);
  ok(sb.debt && sb.debt.method === 'custom' && sb.debt.extra === 15025 && JSON.stringify(sb.debt.order) === JSON.stringify(want), 'Save writes smartBudget.debt {method, extra, order}');
  ok(sb.paycheckIncome && sb.paycheckIncome[k0] === 180050, 'debt Save keeps the paycheck settings');
  await page.evaluate(() => WTStore.flush && WTStore.flush());
  await page.reload(); await page.waitForFunction(() => window.__wtReady); await go(page, 'smart');
  ok(await tabOn() === 'custom' && JSON.stringify(await orderUI()) === JSON.stringify(want) && await page.$eval('#spDebt input[data-k=extra]', e => e.value) === '150.25', 'debt plan is there after reload');

  // ---------------------------------------------------------------- nothing else changed
  const after = await page.evaluate(DATA, mv ? { [mv.id]: mv.pk } : null);
  ok(after === before, 'no money data changed (except the moved bill\'s paycheckKey)');
  await ctx.close();

  // ---------------------------------------------------------------- 360px phone
  {
    const { ctx, page } = await open({ viewport: { width: 360, height: 760 } });
    await go(page, 'smart');
    await page.click('#spDebt [data-act=spDebtMethod][data-m=custom]'); await page.waitForTimeout(100);
    const r = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, vw: innerWidth,
      wide: [...document.querySelectorAll('#spPaychecks *, #spDebt *')].filter(el => { const b = el.getBoundingClientRect(); if (!b.width) return false; for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'hidden' || o === 'scroll') && p !== document.body) return false; } return b.right > innerWidth + 1 || b.left < -1; }).map(e => e.className || e.tagName).slice(0, 5),
      small: [...document.querySelectorAll('#spPaychecks .btn, #spPaychecks input, #spPaychecks select, #spPaychecks .link, #spDebt .btn, #spDebt input, #spDebt .sp-tabs button')].filter(el => { const b = el.getBoundingClientRect(); return b.width && b.height < 39.5; }).map(e => e.className || e.tagName).slice(0, 5),
      fonts: [...document.querySelectorAll('#spPaychecks input, #spPaychecks select, #spDebt input')].filter(el => parseFloat(getComputedStyle(el).fontSize) < 16).length,
      table: getComputedStyle(document.querySelector('#spDebt .sp-tbl thead')).display }));
    ok(r.sw <= r.vw && r.wide.length === 0, `360px: no horizontal overflow (scrollWidth ${r.sw}${r.wide.length ? ', wide: ' + r.wide.join(' ') : ''})`);
    ok(r.small.length === 0, '360px: tap targets at least 40px' + (r.small.length ? ' (' + r.small.join(', ') + ')' : ''));
    ok(r.fonts === 0, '360px: inputs use 16px+ text (no zoom on focus)');
    ok(r.table === 'none', '360px: comparison table becomes stacked cards');
    await shot(page, 'plan-360-paychecks', '#spPaychecks');
    await shot(page, 'plan-360-debt', '#spDebt');
    await ctx.close();
  }
  // ---------------------------------------------------------------- dark mode
  {
    const { ctx, page } = await open({ colorScheme: 'dark' });
    await go(page, 'smart');
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('#spPaychecks .sp-card[data-key]')).backgroundColor);
    const lum = (bg.match(/\d+/g) || [255, 255, 255]).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
    const ink = await page.evaluate(() => getComputedStyle(document.querySelector('#spPaychecks .sp-src')).color);
    const inkLum = (ink.match(/\d+/g) || [0, 0, 0]).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
    ok(lum < 60 && inkLum > 150, 'dark mode renders (card ' + bg + ', text ' + ink + ')');
    await shot(page, 'plan-dark-paychecks', '#spPaychecks .sp-card[data-key]  >> nth=0');
    await shot(page, 'plan-dark-debt', '#spDebt');
    await ctx.close();
  }
  // ---------------------------------------------------------------- strategy repayment order + palette
  {
    const { ctx, page } = await open();
    await go(page, 'smart');
    const on = () => page.$eval('#spDebt .sp-tabs button.on', b => b.dataset.m);
    ok(await page.evaluate(() => !(WT.settings().smartBudget || {}).debt) && await on() === 'avalanche', 'no saved debt plan: Avalanche order by default');
    await page.locator('.sb-card[data-strategy=snowball] [data-act=sbUse]').click(); await page.waitForTimeout(300);
    ok(await page.evaluate(() => WT.settings().smartBudget.strategyId) === 'snowball' && await on() === 'snowball', 'using Debt Snowball opens the debt planner on the Snowball order');
    const col = await page.evaluate(() => { const b = document.querySelector('#spDebt .sp-tabs button.on'); const t = document.createElement('i'); t.style.color = 'var(--sb-accent)'; document.body.appendChild(t); const c = getComputedStyle(t).color; t.remove(); return [getComputedStyle(b).backgroundColor, c]; });
    ok(col[0] === col[1], 'selected method tab uses the navy accent token (' + col[0] + ')');
    await ctx.close();
  }
  // ---------------------------------------------------------------- engine missing: friendly fallback
  {
    const { ctx, page } = await open();
    await go(page, 'smart');
    const html = await page.evaluate(() => { const P = window.WTPlan; window.WTPlan = undefined; try { return WTPlanUI.renderPaychecks() + WTPlanUI.renderDebt(); } finally { window.WTPlan = P; } });
    ok(/isn't available right now/.test(html), 'engine missing: friendly message, no crash');
    await ctx.close();
  }

  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  if (!wired) console.log('NOTE: app.js does not call WTPlanUI yet; sections were injected into #/smart for this run.');
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
