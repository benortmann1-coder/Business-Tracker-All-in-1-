// Browser security regression test (Playwright/Chromium): stored XSS + malicious backup restore.
// Run: node wealthtrack/tests/security.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const __skipOnb = async c => { await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) {} }); return c; };
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WEB = process.env.WT_WEB || path.join(__dirname, '../web');
// made-up sample data (tests only); a real install starts blank
const FIXTURE = path.join(__dirname, 'fixtures/sample-data.js');
const __sample = async c => { await c.addInitScript({ path: FIXTURE }); return c; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
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
let failures = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failures++; };
const ROUTES = ['dashboard', 'bills', 'paychecks', 'calendar', 'expenses', 'debts', 'goals', 'reports', 'history', 'settings'];

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await __skipOnb(ctx); await __sample(ctx);
  const page = await ctx.newPage();
  let dialogs = 0; const errors = [];
  page.on('dialog', d => { dialogs++; d.dismiss(); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForFunction(() => window.__wtReady);

  // ---- 1. stored XSS through every user-editable text field
  await page.evaluate(() => {
    const P = n => `<img src=x onerror="window.__xss=(window.__xss||[]).concat('${n}')">"><svg onload="window.__xss=(window.__xss||[]).concat('${n}s')"></svg>'"><script>window.__xss=(window.__xss||[]).concat('${n}j')</script>javascript:alert(1)`;
    const c = WT.addCategory(P('cat'), 'red;}</style><script>window.__xss=["color"]</script>');
    WT.D.categories[c.id].color = '" onmouseover="window.__xss=[1]" x="'; WT.save('categories', WT.D.categories[c.id]);
    WT.save('accounts', { id: 'acc_evil', name: P('acc'), type: P('acctype'), openingCents: 0, openingDate: WT.todayStr(), inAvailable: true });
    const d = WT.addDebt({ name: P('debt'), type: P('debttype'), startBalanceCents: 10000, aprCenti: 1999, minCents: 500, dueDay: 3, limitCents: 50000 });
    WT.addDebtTxn({ debtId: d.id, type: 'charge', amountCents: 100, note: P('dtx') });
    const t = WT.addTemplate({ name: P('bill'), amountCents: 1234, anchor: WT.todayStr(), frequency: 'monthly', category: c.id, notes: P('notes'), method: P('method'), debtId: d.id, subscription: true });
    const inst = WT.instancesForMonth(WT.monthOf(WT.todayStr())).find(i => i.templateId === t.id);
    WT.recordPayment(inst.id, { amountCents: 100, note: P('paynote'), method: P('paymethod') });
    WT.addIncome({ name: P('income'), employer: P('employer'), netCents: 100000, schedule: 'biweekly', anchor: WT.todayStr() });
    WT.addExtraIncome({ type: P('xtype'), amountCents: 500, note: P('xnote') });
    WT.save('receipts', { id: 'rcpt_evil', dataUrl: 'x" onerror="window.__xss=[\'rcpt\']' });
    WT.addExpense({ amountCents: 999, description: P('exp'), notes: P('expnotes'), category: c.id, receiptId: 'rcpt_evil' });
    const g = WT.addGoal({ name: P('goal'), type: P('goaltype'), targetCents: 100000, accountId: 'acc_evil' });
    WT.contributeGoal(g.id, 1000, WT.todayStr(), 'acc_checking');
    WT.addTransfer({ fromId: 'acc_checking', toId: 'acc_evil', amountCents: 10, note: P('trf') });
    WT.setBudget(c.id, 1000, true);
    WT.saveSettings({ setAsides: [{ id: 'sa1', name: P('setaside'), amountCents: 100 }] });
    WTApp.ui.billSearch = ''; WTApp.ui.histFrom = '"><img src=x onerror="window.__xss=[\'ui\']">';
  });
  for (const r of ROUTES) {
    await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(120);
    await page.mouse.move(300, 300); await page.mouse.move(700, 500); // trigger any injected mouseover
  }
  // open modals that render user text
  await page.evaluate(() => { location.hash = '#/expenses'; }); await page.waitForTimeout(120);
  const rc = await page.$('[data-act=viewReceipt]'); if (rc) { await rc.click(); await page.waitForTimeout(100); await page.keyboard.press('Escape'); }
  await page.evaluate(() => { location.hash = '#/debts'; }); await page.waitForTimeout(120);
  const dh = page.locator('[data-act=debtHistory]').first(); if (await dh.count()) { await dh.click(); await page.waitForTimeout(100); await page.keyboard.press('Escape'); }
  await page.evaluate(() => { location.hash = '#/bills'; }); await page.waitForTimeout(120);
  const bm = page.locator('.bill [data-act=billMenu]').first(); await bm.click(); await page.waitForTimeout(80);
  await page.locator('.menu button', { hasText: 'Edit bill' }).click(); await page.waitForTimeout(100); await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/expenses'; }); await page.waitForTimeout(120);
  const ee = page.locator('[data-act=editExpense]').first(); if (await ee.count()) { await ee.click(); await page.waitForTimeout(100); await page.keyboard.press('Escape'); }
  // export paths must not throw on hostile text
  const exp = await page.evaluate(() => { try { const b = WTXlsx.buildXlsx([{ name: 'x', columns: [{ header: 'a' }], rows: [[Object.values(WT.D.templates)[0].name]] }]); return b.length > 0; } catch (e) { return e.message; } });
  ok(exp === true, 'xlsx export with hostile text');
  const xss = await page.evaluate(() => window.__xss || null);
  const injectedImgs = await page.evaluate(() => document.querySelectorAll('img[src="x"], svg[onload], [onmouseover], [onerror]').length);
  ok(!xss, 'no injected script ran' + (xss ? ': ' + JSON.stringify(xss) : ''));
  ok(injectedImgs === 0, 'no injected elements/handlers in DOM (' + injectedImgs + ')');
  ok(dialogs === 0, 'no dialogs fired');
  const styleOk = await page.evaluate(() => !document.documentElement.innerHTML.includes('</style><script>'));
  ok(styleOk, 'category color cannot break out of style attribute');

  // ---- 2. malicious / malformed backup restore
  const evil = {
    app: 'WealthTrack', format: 1, exportedAt: '<img src=x onerror="window.__xss=[\'date\']">',
    data: JSON.parse(`{
      "templates": {"bill_ok": {"id":"bill_ok","name":"Restored bill","category":"cat_housing","versions":[{"from":"2026-11-01","anchor":"2026-11-01","amountCents":70000,"frequency":"monthly"}]},
                    "__proto__": {"id":"__proto__","polluted":"yes"},
                    "bill_str": {"id":"bill_str","name":12345,"versions":"nope"}},
      "instances": {"bad\\" onclick=\\"window.__xss=1": {"id":"bad\\" onclick=\\"window.__xss=1","templateId":"bill_ok","periodKey":"2026-11-01","dueDate":"2026-11-01","amountCents":1,"name":"x"}},
      "payments": {"p": {"id":"p","instanceId":"missing","amountCents":5,"date":"2026-11-01"}},
      "categories": {"cat_housing": {"id":"cat_housing","name":"Housing","color":"url(javascript:alert(1))"}},
      "receipts": {"r": {"id":"r","dataUrl":"data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="}},
      "meta": {"settings": {"id":"settings","dashboard":{"order":"x","hidden":5},"setAsides":"zzz","reminders":{"daysBefore":"a"}}},
      "accounts": {"acc_checking": {"id":"acc_checking","name":"Checking","type":"checking","openingCents":"x"}},
      "debts": "not an object"
    }`),
  };
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wtsec-')), 'evil.json');
  fs.writeFileSync(f, JSON.stringify(evil));
  await page.evaluate(() => { location.hash = '#/settings/data'; }); await page.waitForTimeout(150);
  await page.setInputFiles('input[data-act-change=restoreFile]', f);
  await page.waitForSelector('.modal');
  const modalText = await page.textContent('.modal');
  ok(/damaged record/.test(modalText), 'restore preview reports damaged records');
  await page.uncheck('.modal input[name=pre]');
  await page.click('.modal button[type=submit]'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    polluted: ({}).polluted, xss: window.__xss || null, bill: !!WT.D.templates.bill_ok, badInst: Object.keys(WT.D.instances).some(k => k.includes('"')),
    color: WT.catColor('cat_housing'), receipts: Object.keys(WT.D.receipts).length, issues: WT.integrity().length, main: document.querySelector('#main').textContent.includes('Something went wrong'),
  }));
  ok(after.polluted === undefined, 'no prototype pollution after restore');
  ok(!after.xss, 'no script ran during restore');
  ok(after.bill && !after.badInst, 'valid bill restored, malicious id dropped');
  ok(after.color === '#94a3b8', 'bad color replaced');
  ok(after.receipts === 0, 'non-image receipt dropped');
  ok(after.issues === 0 && !after.main, 'app healthy after restore');
  for (const r of ROUTES) { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(80); }
  ok(!(await page.evaluate(() => document.querySelector('#main').textContent.includes('Something went wrong'))), 'all routes render after restore');
  // reload: persisted cleaned data boots fine
  await page.reload(); await page.waitForFunction(() => window.__wtReady, null, { timeout: 10000 });
  ok(await page.evaluate(() => !!WT.D.templates.bill_ok), 'restored data survives restart');

  // ---- 3. a newer-format backup is refused, not half-applied
  fs.writeFileSync(f, JSON.stringify({ app: 'WealthTrack', format: 99, data: {} }));
  await page.evaluate(() => { location.hash = '#/settings/data'; }); await page.waitForTimeout(150);
  await page.setInputFiles('input[data-act-change=restoreFile]', f); await page.waitForTimeout(200);
  ok(await page.locator('.modal').count() === 0 && (await page.textContent('#toasts')).includes('newer version'), 'newer-format backup refused');

  // ---- 4. app lock: data encrypted at rest, unreadable before unlock, search text not kept in localStorage
  await page.evaluate(async () => { WTApp.ui.billSearch = 'Restored bill'; await WTStore.enableLock('2468', WT.D); WTApp.refresh(); await WTStore.flush(); });
  const atRest = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('wealthtrack'); r.onsuccess = () => { const tx = r.result.transaction('templates'); const g = tx.objectStore('templates').getAll(); g.onsuccess = () => res({ allEnc: g.result.every(x => x.__enc === 1 && !('name' in x)), ivs: new Set(g.result.map(x => x.iv)).size === g.result.length }); }; }));
  ok(atRest.allEnc, 'records encrypted at rest when locked');
  ok(atRest.ivs, 'unique IV per record');
  ok(!(await page.evaluate(() => localStorage.getItem('wt.ui') || '')).includes('Restored bill'), 'search text not stored in localStorage while locked');
  await page.reload(); await page.waitForSelector('.auth .pin-dots');
  ok(await page.evaluate(() => !window.WT.D || Object.keys(window.WT.D.templates || {}).length === 0), 'no data loaded before unlock');
  await page.keyboard.type('0000'); await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  ok(await page.locator('.auth').count() === 1 && /Wrong/.test(await page.locator('.auth .auth-err').textContent()), 'wrong PIN rejected');
  await page.keyboard.type('2468'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__wtReady, null, { timeout: 15000 });
  ok(await page.evaluate(() => !!WT.D.templates.bill_ok), 'correct PIN unlocks data');
  await page.evaluate(async () => { await WTStore.disableLock(WT.D); });
  await page.reload(); await page.waitForFunction(() => window.__wtReady, null, { timeout: 10000 });
  ok(await page.locator('.auth').count() === 0 && await page.evaluate(() => !!WT.D.templates.bill_ok), 'lock off: data readable without PIN');

  // ---- 5. a failed write is retried, not lost
  const retried = await page.evaluate(async () => {
    const realTx = WTStore.db.transaction.bind(WTStore.db); let fail = true;
    WTStore.db.transaction = (s, m) => { if (fail && m === 'readwrite') { fail = false; const e = new DOMException('quota', 'QuotaExceededError'); throw e; } return realTx(s, m); };
    WT.addExpense({ amountCents: 4242, description: 'retry-me' });
    await new Promise(r => setTimeout(r, 2600));
    WTStore.db.transaction = realTx;
    return new Promise(res => { const tx = WTStore.db.transaction('expenses'); const g = tx.objectStore('expenses').getAll(); g.onsuccess = () => res(g.result.some(e => e.description === 'retry-me')); });
  });
  ok(retried, 'write that failed with QuotaExceeded was retried and saved');

  // ---- 6. corrupted database: recovery screen instead of a blank page, data untouched
  await page.evaluate(() => new Promise(res => { const tx = WTStore.db.transaction('templates', 'readwrite'); tx.objectStore('templates').put({ id: 'corrupt', __enc: 1, iv: 'AAAAAAAAAAAAAAAA', c: 'AAAA' }); tx.oncomplete = res; }));
  await page.reload(); await page.waitForSelector('#rcDump', { timeout: 10000 });
  ok((await page.textContent('body')).includes("couldn't start"), 'corrupted DB shows recovery screen');
  const dumpOk = await page.evaluate(async () => { const d = await WTStore.rawDump(); return Array.isArray(d.templates) && d.templates.some(t => t.id === 'bill_ok'); });
  ok(dumpOk, 'raw data can still be downloaded from the recovery screen');
  await page.evaluate(() => new Promise(res => { const tx = WTStore.db.transaction('templates', 'readwrite'); tx.objectStore('templates').delete('corrupt'); tx.oncomplete = res; }));
  await page.reload(); await page.waitForFunction(() => window.__wtReady, null, { timeout: 10000 });
  ok(await page.evaluate(() => !!WT.D.templates.bill_ok), 'app recovers once the bad record is gone');

  ok(errors.filter(e => !/quota|decrypt|operation-specific|OperationError/i.test(e)).length === 0, 'no unexpected page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
