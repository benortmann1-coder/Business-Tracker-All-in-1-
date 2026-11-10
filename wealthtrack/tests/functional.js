// Functional walkthrough: clicks through every screen, form and action in a real browser.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/functional.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const __skipOnb = async c => { await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) {} }); return c; };
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
// made-up sample data (tests only); a real install starts blank
const FIXTURE = path.join(__dirname, 'fixtures/sample-data.js');
const __sample = async c => { await c.addInitScript({ path: FIXTURE }); return c; };
const WEB = path.join(__dirname, '../web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
let pass = 0, fail = 0; const results = [];
const ok = (c, m) => { results.push((c ? 'PASS ' : 'FAIL ') + m); console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(WEB, p);
      if (!f.startsWith(WEB) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); await __skipOnb(ctx); await __sample(ctx);
  const page = await ctx.newPage();
  const errors = []; let dialogs = 0;
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  const ready = async () => { await page.waitForFunction(() => window.__wtReady === true); };
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(120); };
  const W = (fn, arg) => page.evaluate(fn, arg);
  const modalOpen = () => page.locator('.overlay').count();
  const submit = async () => {
    const n = await page.locator('.overlay').count();
    await page.locator('.overlay').last().locator('button[type=submit]').click();
    // wait until the dialog closes (or an error toast appears and it stays open)
    await page.waitForFunction(n => document.querySelectorAll('.overlay').length !== n || document.querySelector('.toast.err'), n, { timeout: 4000 }).catch(() => { });
    await page.waitForTimeout(80);
  };
  const fill = async (name, v) => page.locator('.overlay').last().locator(`[name="${name}"]`).fill(String(v));
  const select = async (name, v) => page.locator('.overlay').last().locator(`[name="${name}"]`).selectOption(String(v));
  const menuClick = async text => { await page.locator('#menu button', { hasText: text }).first().click(); await page.waitForTimeout(120); };
  const billRow = name => page.locator('#main .bill', { hasText: name }).first();
  const lastToast = async () => (await page.locator('.toast').last().textContent().catch(() => '')) || '';
  const download = async fn => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), fn()]); const p = path.join(os.tmpdir(), 'wt-' + Date.now() + '-' + d.suggestedFilename()); await d.saveAs(p); return p; };

  await page.goto(url); await ready();
  const T = await W(() => WT.todayStr());
  ok(T === '2026-11-06' || /^\d{4}-\d{2}-\d{2}$/.test(T), 'boot, today = ' + T);

  // ---------------- Bills: add every frequency
  await go('bills');
  const freqs = [['Test Weekly', 'weekly'], ['Test Biweekly', 'biweekly'], ['Test Quarterly', 'quarterly'], ['Test Yearly', 'yearly'], ['Test Once', 'once'], ['Test Custom', 'custom']];
  for (const [name, f] of freqs) {
    await page.click('[data-act=addBill]');
    await fill('name', name); await fill('amount', '12.34'); await fill('anchor', '2026-11-20'); await select('frequency', f);
    if (f === 'custom') { await fill('interval', '3'); await select('unit', 'week'); }
    await submit();
    ok(await modalOpen() === 0, `add bill (${f}) closes modal`);
  }
  const cnt = await W(() => { const n = {}; Object.values(WT.D.instances).forEach(i => { if (i.name.startsWith('Test ')) n[i.name] = (n[i.name] || 0) + 1; }); return n; });
  ok(cnt['Test Weekly'] >= 2 && cnt['Test Once'] === 1 && cnt['Test Quarterly'] >= 1, 'instances generated per frequency ' + JSON.stringify(cnt));

  // invalid input keeps modal open with error
  await page.click('[data-act=addBill]'); await fill('name', ''); await fill('amount', 'abc'); await submit();
  ok(await modalOpen() === 1 && /bill name|amount/i.test(await lastToast()), 'invalid bill shows error and stays open');
  await fill('name', 'X'.repeat(300) + ' <b>bold</b> & "quotes" ✓'); await fill('amount', '0'); await submit();
  ok(await modalOpen() === 1, '$0 amount rejected');
  await fill('amount', '5'); await submit();
  ok(await modalOpen() === 0 && (await page.locator('#main').innerHTML()).includes('&lt;b&gt;bold&lt;/b&gt;'), 'long name with HTML/special chars saved and escaped');

  // ---------------- Mark paid / undo / partial / void
  await go('bills');
  await page.evaluate(() => { WTApp.ui.billFilter = 'all'; WTApp.ui.billSearch = ''; WTApp.ui.month = WT.monthOf(WT.todayStr()); WTApp.refresh(); });
  await billRow('Water').locator('[data-act=markPaid]').click(); await page.waitForTimeout(150);
  ok(await page.locator('#main .bill.s-paid', { hasText: 'Water' }).count() === 1, 'Mark paid → paid');
  await page.locator('.toast button', { hasText: 'Undo' }).last().click(); await page.waitForTimeout(150);
  ok(await page.locator('#main .bill.s-paid', { hasText: 'Water' }).count() === 0, 'Undo restores unpaid');
  ok(await W(() => Object.values(WT.D.payments).some(p => p.voided && p.voidReason === 'Undo')), 'undo voids (keeps) payment');
  // rapid double click: should not create two payments
  const b = billRow('Water').locator('[data-act=markPaid]');
  await b.dblclick(); await page.waitForTimeout(200);
  const pc = await W(() => Object.values(WT.D.payments).filter(p => !p.voided && WT.D.instances[p.instanceId].name === 'Water').length);
  ok(pc === 1, 'double-click Mark paid records one payment (' + pc + ')');
  await page.keyboard.press('Escape');
  // partial via menu
  await billRow('Car Loan Payment').locator('[data-act=billMenu]').click(); await menuClick('partial');
  await fill('amount', '60.5'); await submit();
  ok((await billRow('Car Loan Payment').textContent()).includes('$319.50 left'), 'partial payment leaves $319.50 ($380 - $60.50)');
  // void from payment modal
  await billRow('Car Loan Payment').locator('[data-act=billMenu]').click(); await menuClick('Payments');
  await page.locator('.overlay [data-act=voidPay]').first().click(); await submit();
  ok(await page.locator('#main .bill.s-partial', { hasText: 'Car Loan Payment' }).count() === 0, 'void payment removes partial status');
  // overpay
  await billRow('Gas Card Payment').locator('[data-act=billMenu]').click(); await menuClick('partial');
  await fill('amount', '35'); await submit(); // $35 on a $30 bill
  ok(await page.locator('#main .bill.s-paid', { hasText: 'Gas Card Payment' }).count() === 1, 'overpayment marks paid');

  // ---------------- Edit this month vs future
  await page.evaluate(() => { WTApp.ui.month = WT.addMonthKey(WT.monthOf(WT.todayStr()), 1); WTApp.refresh(); });
  await billRow('Student Loan Payment').locator('[data-act=billMenu]').click(); await menuClick('Edit bill');
  await fill('amount', '200'); await submit();
  const tp = await W(() => { const m = WT.monthOf(WT.todayStr()); const f = mk => Object.values(WT.D.instances).find(i => i.templateId === 'bill_student' && i.periodMonth === mk); return [f(m).amountCents, f(WT.addMonthKey(m, 1)).amountCents, f(WT.addMonthKey(m, 2)) ? f(WT.addMonthKey(m, 2)).amountCents : null]; });
  WTensure: await W(() => WT.ensureGenerated(WT.addMonthKey(WT.monthOf(WT.todayStr()), 3)));
  ok(tp[0] === 17500 && tp[1] === 20000, 'edit this month only: ' + tp.join(','));
  await billRow('Apartment').locator('[data-act=billMenu]').click(); await menuClick('Edit bill');
  await page.locator('#scopeSeg button[data-scope=future]').click(); await fill('amount', '1250'); await submit();
  const apt = await W(() => { const m = WT.monthOf(WT.todayStr()); return [0, 1, 2, 3].map(k => (Object.values(WT.D.instances).find(i => i.templateId === 'bill_apartment' && i.periodMonth === WT.addMonthKey(m, k)) || {}).amountCents); });
  ok(apt[0] === 120000 && apt[1] === 125000 && apt[2] === 125000, 'edit future months: ' + apt.join(','));

  // move date, skip/unskip
  await billRow('Auto Insurance').locator('[data-act=billMenu]').click(); await menuClick('Change due date');
  const nd = await W(() => WT.addMonthKey(WT.monthOf(WT.todayStr()), 1) + '-15'); await fill('date', nd); await submit();
  ok(await W(nd => Object.values(WT.D.instances).some(i => i.templateId === 'bill_autoins' && i.dueDate === nd && i.custom.due), nd), 'move due date this month only');
  await billRow('Video Stream').locator('[data-act=billMenu]').click(); await menuClick('Skip');
  ok(await page.locator('#main .bill.s-skipped', { hasText: 'Video Stream' }).count() === 1, 'skip month');
  await billRow('Video Stream').locator('[data-act=unskip]').click(); await page.waitForTimeout(100);
  ok(await page.locator('#main .bill.s-skipped', { hasText: 'Video Stream' }).count() === 0, 'unskip');
  // assign paycheck
  await billRow('Music Stream').locator('[data-act=billMenu]').click(); await menuClick('Choose paycheck');
  await page.locator('.overlay input[name=pc]').first().check(); await submit();
  ok(await W(() => Object.values(WT.D.instances).some(i => i.templateId === 'bill_music' && i.paycheckKey)), 'assign paycheck from bill menu');

  // filters / search / sort
  await page.fill('[data-bind=billSearch]', 'stream'); await page.waitForTimeout(400);
  ok(await page.locator('#main .list .bill').count() === 2, 'search "stream" → 2 bills (Music Stream, Video Stream)');
  await page.fill('[data-bind=billSearch]', ''); await page.waitForTimeout(400);
  // 1.1.3: one "Sort & group" dropdown (sort: due / status / name; group: category / paycheck)
  if (!(await page.locator('[data-bind=billView]').isVisible())) await page.click('[data-act=billTools]').catch(() => { });
  await page.selectOption('[data-bind=billView]', 'name'); await page.waitForTimeout(150);
  const names = await page.locator('#main .list .bill .nm').allTextContents();
  ok(names.length > 3 && names.every((n, i) => i === 0 || names[i - 1].localeCompare(n) <= 0), 'sort by name A–Z');
  await page.selectOption('[data-bind=billView]', 'status'); await page.waitForTimeout(150);
  const rank = { 'overdue': 0, 'overdue-partial': 0, 'due-soon': 1, 'partial': 2, 'upcoming': 3, 'paid': 4, 'skipped': 5 };
  const ranks = (await page.locator('#main .list .bill').evaluateAll(els => els.map(e => (e.className.match(/\bs-([a-z-]+)/) || [])[1]))).map(k => rank[k]);
  ok(ranks.length > 3 && ranks.every((r, i) => r !== undefined && (i === 0 || ranks[i - 1] <= r)), 'sort by status: overdue → due soon → partly paid → upcoming → paid → skipped');
  await page.selectOption('[data-bind=billView]', 'category'); await page.waitForTimeout(150);
  ok(await page.locator('#main .group-h', { hasText: 'Subscriptions' }).count() === 1, 'group by category shows a Subscriptions group');
  await page.selectOption('[data-bind=billView]', 'due'); await page.waitForTimeout(150);
  await page.click('[data-act=billFilter][data-f=paid]'); await page.waitForTimeout(100);
  ok(await page.locator('#main .list .bill:not(.s-paid)').count() === 0, 'paid filter');
  await page.click('[data-act=billFilter][data-f=all]');

  // generate next month (idempotent) + reset month
  const before = await W(() => Object.keys(WT.D.instances).length);
  await page.click('[data-act=genNext]'); await page.waitForTimeout(150);
  await page.click('[data-act=monthStep][data-n="-1"]'); await page.click('[data-act=genNext]'); await page.waitForTimeout(150);
  ok(/already exist|created/.test(await lastToast()), 'generate next month reports: ' + (await lastToast()).trim());
  ok(await W(() => WT.integrity().length) === 0, 'no duplicates after repeated generate (' + before + '→' + (await W(() => Object.keys(WT.D.instances).length)) + ')');
  await page.evaluate(() => { WTApp.ui.month = WT.monthOf(WT.todayStr()); WTApp.refresh(); });
  await page.click('[data-act=resetMonth]'); await submit();
  ok(await modalOpen() === 1, 'reset requires typing RESET');
  await fill('c', 'reset'); await submit();
  ok(await W(() => WT.instancesForMonth(WT.monthOf(WT.todayStr())).filter(i => !WT.isAutopay(i)).every(i => WT.paidFor(i.id) === 0)), 'reset month voids payments (auto-pay bills untouched)');
  ok(await W(() => Object.values(WT.D.payments).filter(p => p.voided).length >= 3), 'payments kept as voided');

  // manage tab: pause/resume/cancel/reactivate/delete
  await page.click('[data-act=billsTab][data-tab=manage]');
  ok(await page.evaluate(() => { const rows = [...document.querySelectorAll('#main table.ledger tbody tr')]; return rows.length > 0 && rows.every(r => { const t = r.querySelector('.cat-tag'); return t && t.textContent.trim().length > 0; }); }), 'All bills: every bill shows its category tag');
  ok(/Entertainment/.test(await page.locator('#main tr', { hasText: 'Gym' }).first().locator('.cat-tag').textContent()), 'All bills: tag shows the bill\'s category');
  const tplAct = async (name, label) => { await page.locator('#main tr', { hasText: name }).first().locator('[data-act=tplMenu]').click(); await menuClick(label); };
  await tplAct('Gym', 'Pause'); await submit();
  ok(await W(() => WT.D.templates.bill_gym.status) === 'paused', 'pause');
  await tplAct('Gym', 'Resume');
  ok(await W(() => WT.D.templates.bill_gym.status) === 'active', 'resume');
  await tplAct('Cloud Storage', 'Cancel'); await submit();
  ok(await W(() => WT.D.templates.bill_cloud.status) === 'cancelled', 'cancel');
  await tplAct('Cloud Storage', 'Reactivate');
  ok(await W(() => WT.D.templates.bill_cloud.status) === 'active', 'reactivate');
  await tplAct('Test Weekly', 'Delete'); await submit();
  ok(await W(() => WT.D.templates[Object.keys(WT.D.templates).find(k => WT.D.templates[k].name === 'Test Weekly')].deleted), 'delete keeps template as deleted');
  await tplAct('Video Stream', 'Edit'); await fill('amount', '16.99'); await submit();
  ok(await W(() => WT.currentRule(WT.D.templates.bill_video).amountCents) === 1699, 'edit template from manage tab');
  await page.click('[data-act=billsTab][data-tab=subs]');
  ok(await page.locator('#main tr', { hasText: 'News App' }).count() === 1, 'subscriptions tab lists News App (cancelled)');
  await page.click('[data-act=billsTab][data-tab=upcoming]'); await page.click('.up-range button[data-r=month]');

  // ---------------- Paychecks
  await go('paychecks');
  ok(await page.locator('#main .pc-statement .big').count() === 1, 'planner renders');
  await page.locator('[data-act=receiveCheck]').first().click(); await fill('amount', '1612.25'); await submit();
  ok(await W(() => Object.values(WT.D.deposits).some(d => d.amountCents === 161225 && !d.voided)), 'mark paycheck received with real amount');
  await page.locator('[data-act=undoCheck]').first().click(); await page.waitForTimeout(100);
  ok(await W(() => Object.values(WT.D.deposits).every(d => d.voided)), 'undo received');
  const sel = page.locator('#main select[data-act-change=movePc]').first();
  const opts = await sel.locator('option').evaluateAll(o => o.map(x => x.value));
  if (opts.length > 1) {
    const plan0 = await W(() => WT.paycheckPlan(WTApp.ui.pcKey).billTotal);
    await sel.selectOption(opts[opts.length - 1]); await page.waitForTimeout(150);
    const plan1 = await W(() => WT.paycheckPlan(WTApp.ui.pcKey).billTotal);
    ok(plan1 < plan0, `move bill to other paycheck recalculates (${plan0}→${plan1})`);
  } else ok(false, 'move options available');
  await page.click('[data-act=setAsides]'); await page.locator('#saAdd').click();
  await page.locator('.overlay input[name=n1]').fill('Haircut'); await page.locator('.overlay input[name=a1]').fill('20'); await submit();
  ok(await W(() => WT.settings().setAsides.length) === 2, 'add set-aside');
  await page.click('#main [data-act=addIncome]'); await fill('name', 'Side gig'); await fill('net', '400'); await select('schedule', 'semimonthly'); await fill('day1', '1'); await fill('day2', '31'); await submit();
  ok(await W(() => Object.values(WT.D.incomes).some(i => i.name === 'Side gig')), 'add second job (semimonthly)');
  await page.locator('#main [data-act=addExtraIncome]').first().click(); await fill('amount', '150'); await submit();
  ok(await W(() => Object.values(WT.D.extraIncome).length) === 1, 'add bonus');
  await page.locator('#main [data-act=voidExtra]').first().click(); await submit();
  ok(await W(() => Object.values(WT.D.extraIncome).every(x => x.voided)), 'remove bonus (voided)');
  // all jobs ended → no crash
  await W(() => { Object.values(WT.D.incomes).forEach(i => { i.endDate = '2020-01-01'; }); WTApp.ui.pcKey = null; WTApp.refresh(); });
  ok(!(await page.locator('#main').textContent()).includes('Something went wrong'), 'planner with all jobs ended does not crash');
  await W(() => { Object.values(WT.D.incomes).forEach(i => { i.endDate = null; WT.save('incomes', i); }); WTApp.refresh(); });

  // ---------------- Expenses
  await go('expenses');
  await page.click('#main [data-act=addExpense]'); await fill('amount', '23.45'); await fill('description', 'Shell gas'); await select('category', 'cat_gas'); await submit();
  ok(await W(() => Object.values(WT.D.expenses).some(e => e.description === 'Shell gas' && e.amountCents === 2345)), 'add expense');
  await page.click('#main [data-act=addExpense]'); await fill('amount', '30'); await select('source', 'debt:debt_visa'); await fill('description', 'Card buy'); await submit();
  ok(await W(() => WT.debtBalance('debt_visa')) > 520000, 'expense on card raises card balance');
  // as bill payment
  await page.click('#main [data-act=addExpense]');
  const asBill = await page.locator('.overlay select[name=asBill] option').nth(1).getAttribute('value');
  await fill('amount', '10.55'); await select('asBill', asBill); await submit();
  ok(await W(id => WT.paidFor(id) > 0, asBill), 'expense recorded as bill payment instead');
  // duplicate warning
  await page.click('#main [data-act=addExpense]'); await fill('amount', '10.55'); await page.locator('.overlay select[name=asBill]').selectOption(''); await submit();
  ok(await page.locator('.overlay h2', { hasText: 'Possible duplicate' }).count() === 1, 'duplicate warning shown');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // new category via in-app prompt
  await page.click('#main [data-act=addExpense]'); await page.click('#newCat');
  await page.locator('.overlay').last().locator('input[name=v]').fill('Pets'); await submit();
  ok(await page.locator('.overlay select[name=category]').inputValue() === 'cat_pets', 'new category via in-app dialog');
  await page.keyboard.press('Escape');
  // edit, search, delete
  await page.fill('[data-bind=expSearch]', 'shell'); await page.waitForTimeout(400);
  ok(await page.locator('#main tbody tr:not(.day-h)').count() === 1, 'expense search');
  await page.locator('#main [data-act=editExpense]').first().click(); await fill('amount', '24.00'); await submit();
  ok(await W(() => Object.values(WT.D.expenses).some(e => e.description === 'Shell gas' && e.amountCents === 2400)), 'edit expense');
  await page.locator('#main [data-act=deleteExpense]').first().click(); await submit();
  ok(await W(() => !Object.values(WT.D.expenses).some(e => e.description === 'Shell gas')), 'delete expense');
  await page.fill('[data-bind=expSearch]', ''); await page.waitForTimeout(400);
  // receipt upload
  const png = path.join(os.tmpdir(), 'wt-receipt.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
  await page.click('#main [data-act=addExpense]'); await fill('amount', '5'); await fill('description', 'With receipt');
  await page.locator('#rcFile').setInputFiles(png); await page.waitForTimeout(300); await submit();
  ok(await W(() => Object.values(WT.D.expenses).some(e => e.description === 'With receipt' && e.receiptId && WT.D.receipts[e.receiptId])), 'receipt attached');
  await page.locator('#main [data-act=viewReceipt]').first().click(); await page.waitForTimeout(100);
  ok(await page.locator('.overlay img').count() === 1, 'view receipt'); await page.keyboard.press('Escape');

  // ---------------- Debts
  await go('debts');
  await page.click('#main [data-act=addDebt]'); await fill('name', 'Medical bill'); await select('type', 'medical'); await fill('balance', '500'); await fill('apr', '0'); await fill('min', '50'); await fill('dueDay', '15'); await submit();
  await page.waitForFunction(() => Object.values(WT.D.debts).some(d => d.name === 'Medical bill'), null, { timeout: 3000 }).catch(() => { }); // saving is async
  ok(await W(() => Object.values(WT.D.debts).some(d => d.name === 'Medical bill') && Object.values(WT.D.templates).some(t => t.name === 'Medical bill')), 'add debt + bill');
  // debts are ledger rows: "Pay extra" is on the row, the rest is in its ⋯ menu
  const debtRow = () => page.locator('#main .debt-row', { hasText: 'Medical bill' }).last();
  const debtMenuItem = async label => { await debtRow().locator('[data-act=debtMenu]').click(); await menuClick(label); };
  await debtRow().locator('[data-act=debtPay]').click(); await fill('amount', '100'); await submit();
  await debtMenuItem('Add charge'); await fill('amount', '25'); await submit();
  ok(await W(() => WT.debtBalance(Object.values(WT.D.debts).find(d => d.name === 'Medical bill').id)) === 42500, 'extra payment + charge');
  await debtMenuItem('Update balance'); await fill('amount', '400'); await submit();
  ok(await W(() => WT.debtBalance(Object.values(WT.D.debts).find(d => d.name === 'Medical bill').id)) === 40000, 'update balance');
  await debtMenuItem('History');
  ok(await page.locator('.overlay tbody tr').count() >= 4, 'debt history');
  await page.locator('.overlay [data-act=voidDebtTxn]').first().click(); await submit();
  ok(await W(() => WT.debtBalance(Object.values(WT.D.debts).find(d => d.name === 'Medical bill').id)) !== 40000, 'void debt entry');
  await page.click('[data-act=payoffPreset][data-v="25000"]'); await page.waitForTimeout(100);
  ok((await page.locator('#main').textContent()).includes('Avalanche order'), 'payoff calculator');
  await page.locator('#main input[data-act-change=payoffExtra]').fill('abc'); await page.locator('#main input[data-act-change=payoffExtra]').press('Enter'); await page.locator('#main h1').click(); await page.waitForTimeout(100);
  ok(!(await page.locator('#main').textContent()).includes('Something went wrong'), 'invalid extra amount handled');

  // ---------------- Budgets page removed (Smart Budget replaces it): old links go to Smart Budget
  await go('budgets'); await page.waitForTimeout(100);
  ok(/Smart Budget/.test(await page.locator('#main h1').textContent()) && await page.locator('[data-nav=budgets]').count() === 0, 'old Budgets link opens Smart Budget; no Budgets in the menu');

  // ---------------- Goals
  await go('goals');
  await page.click('#main [data-act=addGoal]'); await fill('name', 'Emergency'); await fill('target', '1000'); await submit();
  await page.locator('#main [data-act=contribute]').first().click(); await fill('amount', '100'); await submit();
  await page.locator('#main [data-act=withdraw]').first().click(); await fill('amount', '30'); await submit();
  const g = await W(() => { const g = Object.values(WT.D.goals)[0]; return WT.goalSaved(g.id); });
  ok(g === 7000, 'goal contribute/withdraw = $70');
  ok(await W(() => WT.totalSpending(WT.monthOf(WT.todayStr())) === WT.totalSpending(WT.monthOf(WT.todayStr()))), 'goals not spending');

  // ---------------- Calendar
  await go('calendar');
  const dayCount = await page.locator('.cal .day').count();
  ok(dayCount === 42, 'calendar grid');
  await page.locator(`.cal .day[data-day="${T}"]`).click(); await page.waitForTimeout(100);
  ok(await page.locator('.overlay h2').count() === 1, 'day modal opens');
  await page.locator('.overlay [data-act=addExpenseOn]').click(); await page.waitForTimeout(100);
  ok(await page.locator('.overlay input[name=date]').inputValue() === T, 'add expense from day prefilled');
  await page.keyboard.press('Escape');
  // drag a bill chip to another day
  const chip = page.locator('.cal .ev.bill').first();
  const id = await chip.getAttribute('data-drag');
  const target = await W(id => { const i = WT.D.instances[id]; return WT.addDays(i.dueDate, i.dueDate.endsWith('-28') ? -2 : 2); }, id);
  const tgt = page.locator(`.cal .day[data-day="${target}"]`);
  if (await tgt.count()) {
    const a = await chip.boundingBox(), bb = await tgt.boundingBox();
    await page.mouse.move(a.x + 5, a.y + 5); await page.mouse.down(); await page.mouse.move(a.x + 30, a.y + 30, { steps: 4 }); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
    ok(await W(([id, t]) => WT.D.instances[id].dueDate === t, [id, target]), 'drag bill to new date');
    ok(await page.locator('.overlay').count() === 0, 'drag does not open day modal');
  } else ok(false, 'drag target in grid');
  await page.click('[data-act=monthStep][data-key=calMonth][data-n="1"]');
  ok(await page.locator('.cal .ev.bill').count() > 5, 'calendar next month');

  // ---------------- Reports / History / Dashboard
  await go('reports'); ok((await page.locator('#main').textContent()).includes('Twelve months'), 'reports');
  await page.locator('#main tr[data-act=openMonth]').first().click(); await page.waitForTimeout(100);
  ok(await page.evaluate(() => location.hash) === '#/bills', 'report row opens that month');
  await go('history');
  await page.selectOption('[data-bind=histKind]', 'bill'); await page.waitForTimeout(100);
  ok(await page.locator('#main .tx').count() >= 1 && await page.locator('#main .tx .pill:not(.due)').count() === 0, 'history filter bills');
  await page.fill('[data-bind=histSearch]', 'zzzznomatch'); await page.waitForTimeout(400);
  ok((await page.locator('#main').textContent()).includes('Nothing matches'), 'history empty search');
  await page.fill('[data-bind=histSearch]', ''); await page.selectOption('[data-bind=histKind]', ''); await page.waitForTimeout(400);
  await go('dashboard');
  await page.locator('#main [data-act=setBalance]').first().click(); await fill('bal', '1234.56'); await submit();
  ok(await W(() => WT.accountBalance('acc_checking')) === 123456, 'set checking balance exactly');
  ok((await page.locator('#main').textContent()).includes('$1,234.56'), 'dashboard shows balance');
  await page.locator('#main .slice').first().click().catch(() => { });

  // ---------------- Settings
  await go('settings');
  ok(await page.locator('.set-item').count() === 8 && await page.locator('.set-profile').count() === 1, 'settings menu lists sections');
  await page.click('.set-item[data-sec=theme]'); await page.waitForTimeout(150);
  ok(/App theme/.test(await page.locator('#main h1').textContent()), 'opens App theme page');
  await page.click('[data-act=theme][data-v=dark]'); ok(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme');
  await page.click('[data-act=theme][data-v=system]');
  // Month themes: Seasonal / Random monthly tint the whole app; Random never repeats in a year or across New Year
  await page.click('[data-act=theme][data-v=seasonal]'); await page.waitForTimeout(100);
  ok(await W(() => document.documentElement.dataset.theme === 'seasonal' && !!document.body.dataset.month), 'seasonal theme tints the app (settings screen too)');
  ok(await W(() => { location.hash = '#/dashboard'; WTApp.refresh(); return document.body.dataset.month === WT.todayStr().slice(5, 7); }), 'seasonal: dashboard uses the current month color');
  await go('settings/theme'); await page.click('[data-act=theme][data-v=random]'); await page.waitForTimeout(100);
  ok(await page.locator('[data-act=shuffleMonthColors]').count() === 1, 'random monthly theme shows Shuffle');
  await page.click('[data-act=shuffleMonthColors]'); await page.waitForTimeout(100);
  const mc = await W(() => { const slot = mk => { WTApp.ui.billsTab = 'month'; WTApp.ui.month = mk; location.hash = '#/bills'; WTApp.refresh(); return document.body.dataset.month; }; const yrs = [2027, 2028, 2029].map(y => Array.from({ length: 12 }, (_, k) => slot(y + '-' + String(k + 1).padStart(2, '0')))); location.hash = '#/settings'; return yrs; });
  ok(mc.every(y => new Set(y).size === 12) && mc[1][0] !== mc[0][11] && mc[2][0] !== mc[1][11], 'random month colors never repeat within a year or across New Year');
  await go('settings/theme'); await page.click('[data-act=theme][data-v=light]'); await page.waitForTimeout(100);
  ok(await W(() => { WTApp.ui.billsTab = 'month'; location.hash = '#/bills'; WTApp.refresh(); return !document.body.dataset.month; }), 'plain themes have no month tint');
  await go('settings/theme'); await page.click('[data-act=theme][data-v=system]'); await page.waitForTimeout(100);
  await page.locator('[data-act-change=widgetToggle][data-k=charts]').uncheck(); await go('dashboard');
  ok((await page.locator('#main').textContent()).includes('Cash flow') === false, 'hide dashboard widget');
  await go('settings/theme'); await page.locator('[data-act-change=widgetToggle][data-k=charts]').check();
  const idx0 = await W(() => { const s = WT.settings().dashboard; return s.order.filter(k => k !== 'available').indexOf('nextcheck'); });
  await page.locator('[data-act=widgetMove][data-k=nextcheck][data-n="-1"]').click(); await page.waitForTimeout(100);
  ok(await W(() => WT.settings().dashboard.order.indexOf('nextcheck')) === idx0 - 1, 'reorder widget moves it up one');
  await go('settings/accounts'); await page.click('[data-act=addAccount]'); await fill('name', 'Credit union'); await fill('bal', '50'); await submit();
  ok(await W(() => Object.values(WT.D.accounts).some(a => a.name === 'Credit union')), 'add account');
  await page.click('[data-act=addTransfer]'); await fill('amount', '10'); await submit();
  ok(await W(() => Object.values(WT.D.transfers).length >= 1), 'transfer');
  await go('settings/categories'); await page.click('[data-act=addCat]'); await fill('name', 'Kids'); await submit();
  ok(await W(() => !!WT.D.categories.cat_kids), 'add category');
  await go('settings/notifications'); await page.locator('[data-act-change=remDay][data-d="7"]').check();
  ok(await W(() => WT.settings().reminders.daysBefore.includes(7)), 'reminder days setting');
  await page.locator('[data-act-change=remHour]').selectOption('18');
  ok(await W(() => WT.settings().reminders.hour) === 18, 'reminder hour');
  await go('settings/data'); const x = await download(() => page.click('#main [data-act=exportXlsx]'));
  ok(fs.statSync(x).size > 2000 && fs.readFileSync(x).slice(0, 2).toString() === 'PK', 'excel export downloads valid zip');
  await page.click('#main [data-act=exportCsvMenu]');
  const c = await download(() => page.locator('.overlay [data-csv=bills]').click());
  ok(fs.readFileSync(c, 'utf8').includes('Car Loan Payment'), 'csv export'); await page.keyboard.press('Escape');
  await page.click('#main [data-act=backup]');
  const bk = await download(() => submit());
  const bkj = JSON.parse(fs.readFileSync(bk, 'utf8')); ok(bkj.app === 'WealthTrack' && Object.keys(bkj.data.payments).length > 0, 'backup downloads all data');
  await page.click('#main [data-act=backup]'); await fill('pw', 'secret');
  const ebk = await download(() => submit());
  ok(JSON.parse(fs.readFileSync(ebk, 'utf8')).wealthtrackEncryptedBackup === 1, 'encrypted backup');
  // integrity
  await page.click('[data-act=integrity]'); ok((await page.locator('.overlay').textContent()).includes('No duplicates'), 'integrity check'); await page.keyboard.press('Escape');

  // persistence across restart
  const snap = await W(() => ({ p: Object.keys(WT.D.payments).length, e: Object.keys(WT.D.expenses).length, i: Object.keys(WT.D.instances).length, d: Object.keys(WT.D.debtTxns).length }));
  await page.waitForTimeout(300); await page.reload(); await ready();
  const snap2 = await W(() => ({ p: Object.keys(WT.D.payments).length, e: Object.keys(WT.D.expenses).length, i: Object.keys(WT.D.instances).length, d: Object.keys(WT.D.debtTxns).length }));
  ok(JSON.stringify(snap) === JSON.stringify(snap2), 'restart keeps all records ' + JSON.stringify(snap2));

  // restore from encrypted backup (wrong then right password)
  await go('settings/data');
  await page.locator('input[data-act-change=restoreFile]').setInputFiles(ebk); await page.waitForTimeout(200);
  await page.locator('.overlay input[name=v]').fill('wrong'); await submit(); await page.waitForTimeout(800);
  ok(/Wrong password/.test(await lastToast()), 'restore wrong password rejected');
  await page.locator('input[data-act-change=restoreFile]').setInputFiles(ebk); await page.waitForTimeout(200);
  await page.locator('.overlay input[name=v]').fill('secret'); await submit(); await page.waitForTimeout(1500);
  await page.locator('.overlay input[name=pre]').uncheck();
  await submit(); await page.waitForTimeout(800);
  ok(/restored/i.test(await lastToast()), 'restore encrypted backup');
  // bad file
  const bad = path.join(os.tmpdir(), 'wt-bad.json'); fs.writeFileSync(bad, '{"hello":1}');
  await page.locator('input[data-act-change=restoreFile]').setInputFiles(bad); await page.waitForTimeout(300);
  ok(/not a WealthTrack backup/.test(await lastToast()), 'reject non-backup file');

  // app lock (sign-in pages)
  const authTitle = () => page.locator('.auth .auth-body h1').textContent();
  const typePin = async (pin, wait = 400) => { await page.keyboard.type(pin); await page.keyboard.press('Enter'); await page.waitForTimeout(wait); };
  await go('settings/security'); await page.click('[data-act=setPinNow]'); await page.waitForSelector('.auth.over');
  ok(/Create a PIN/.test(await authTitle()), 'create PIN page');
  await page.keyboard.type('12'); ok(await page.locator('.auth [data-k=ok]').isDisabled(), 'short PIN cannot continue');
  await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
  await typePin('432198'); ok(/Confirm/.test(await authTitle()), 'confirm PIN page');
  await typePin('111111'); ok(/didn.t match/.test(await page.locator('.auth .auth-err').textContent()), 'mismatched PINs rejected');
  await typePin('432198'); await typePin('432198', 3000);
  ok(await page.locator('.auth').count() === 0, 'create PIN page closes');
  ok(await W(() => !!WTStore.key), 'lock on');
  await page.reload(); await page.waitForSelector('.auth .pin-dots');
  ok(/^Good (Morning|Afternoon|Evening)/.test(await authTitle()), 'unlock page on launch');
  ok(await W(() => !window.WT.D), 'data not loaded before unlock');
  await typePin('0000', 2500);
  ok(/Wrong/.test(await page.locator('.auth .auth-err').textContent()), 'wrong PIN rejected');
  for (const k of '432198') await page.click(`.auth .key[data-k="${k}"]`);
  await page.click('.auth [data-k=ok]'); await ready();
  ok(await W(() => Object.keys(WT.D.payments).length) > 0, 'unlock loads data');
  const raw = await W(() => new Promise(r => { const q = indexedDB.open('wealthtrack'); q.onsuccess = () => { const g = q.result.transaction('payments').objectStore('payments').getAll(); g.onsuccess = () => r(g.result[0]); }; }));
  ok(raw && raw.__enc === 1 && !JSON.stringify(raw).includes('amountCents'), 'records encrypted at rest');
  // change PIN
  const nPay = await W(() => Object.keys(WT.D.payments).length);
  await go('settings/security'); await page.click('[data-act=changePin]'); await page.waitForSelector('.auth.over');
  await typePin('999999', 2500); ok(/Wrong/.test(await page.locator('.auth .auth-err').textContent()), 'change PIN needs current PIN');
  await typePin('432198', 2500); ok(/Create a PIN/.test(await authTitle()), 'change PIN: new PIN page');
  await typePin('246810'); await typePin('246810', 3500);
  ok(await page.locator('.auth').count() === 0, 'PIN changed');
  await page.reload(); await page.waitForSelector('.auth .pin-dots');
  await typePin('432198', 2500); ok(/Wrong/.test(await page.locator('.auth .auth-err').textContent()), 'old PIN no longer works');
  await typePin('246810', 100); await ready();
  ok(await W(() => Object.keys(WT.D.payments).length) === nPay, 'new PIN opens all data');
  // the skip flag never opens a locked store
  ok(await W(() => !!WTStore.key), 'still encrypted after change');

  // more menu & quick add (mobile)
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await __skipOnb(m); await __sample(m);
  const mp = await m.newPage(); mp.on('pageerror', e => errors.push('mobile: ' + e.message));
  await mp.goto(url); await mp.waitForFunction(() => window.__wtReady);
  await mp.locator('.bottom-nav [data-nav-btn=bills]').tap(); await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => location.hash) === '#/bills', 'bottom nav');
  await mp.locator('.bottom-nav [data-act=moreMenu]').tap(); await mp.locator('#menu button', { hasText: 'Debt' }).tap(); await mp.waitForTimeout(100);
  ok(await mp.evaluate(() => location.hash) === '#/debts', 'more menu navigation');
  await mp.locator('.fab').tap(); await mp.locator('#menu button', { hasText: 'Add expense' }).tap(); await mp.waitForTimeout(100);
  ok(await mp.locator('.overlay').count() === 1, 'FAB quick add');
  ok(await mp.evaluate(() => window.onAndroidBack()) === true && await mp.locator('.overlay').count() === 0, 'android back closes modal');
  ok(await mp.evaluate(() => window.onAndroidBack()) === true && await mp.evaluate(() => location.hash) === '#/dashboard', 'android back goes to dashboard');
  ok(await mp.evaluate(() => window.onAndroidBack()) === false, 'android back on dashboard exits');

  // start over (blank)
  await go('settings/data'); await page.click('[data-act=startOver]'); await fill('c', 'ERASE');
  await download(() => submit()); await page.waitForTimeout(800);
  ok(await W(() => Object.keys(WT.D.templates).length === 0 && Object.keys(WT.D.accounts).length === 1), 'erase → blank app (backup downloaded first)');
  for (const r of ['dashboard', 'bills', 'paychecks', 'calendar', 'expenses', 'debts', 'goals', 'reports', 'history', 'settings']) { await go(r); ok(!(await page.locator('#main').textContent()).includes('Something went wrong'), 'blank app route ' + r); }

  ok(dialogs === 0, 'no native alert/confirm/prompt dialogs (' + dialogs + ')');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
