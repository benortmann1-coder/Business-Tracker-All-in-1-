// Several WealthTrack accounts on one device, in a real browser (Playwright/Chromium) at phone size:
// add an account (opens blank, like a new install), switch, sign out to the account picker, create from the
// picker, rename, delete, and the "Preview as a free user" switch. The first account's data must never change.
// Run: node wealthtrack/tests/accounts.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');

const WEB = path.join(__dirname, '../web');
const FIXTURE = path.join(__dirname, 'fixtures/sample-data.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const serve = () => new Promise(res => {
  const srv = http.createServer((req, rsp) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { rsp.writeHead(404); return rsp.end(); }
    rsp.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
  }).listen(0, '127.0.0.1', () => res(srv));
});
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // skip the PIN screens; the first account skips its demo. The made-up sample data only goes into the first account.
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript(src => { try { const a = localStorage.getItem('wt.activeAccount'); if (!a || a === 'main') (0, eval)(src); } catch (e) { } }, fs.readFileSync(FIXTURE, 'utf8'));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const ready = async () => { await p.waitForFunction(() => window.__wtReady, null, { timeout: 15000 }); await p.waitForTimeout(250); };
  const go = async r => { await p.evaluate(r => { location.hash = '#/' + r; }, r); await p.waitForTimeout(250); };
  const bills = () => p.evaluate(() => Object.keys(WT.D.templates).length);
  const reloaded = async fn => { await Promise.all([p.waitForEvent('load'), fn()]); await ready(); };

  await p.goto(url); await ready();
  const mainBills = await bills();
  ok(mainBills > 0, 'first account opens with its data (' + mainBills + ' bills)');
  ok(await p.evaluate(() => WTAccounts.active()) === 'main', 'first account is "main"');

  // Settings row
  await go('settings/personal');
  ok(/Signed in as\s*My account/.test(await p.locator('main').textContent()), 'Settings shows the open account');

  // Add an account: opens blank, as a new user
  await p.click('[data-act=acctManage]'); await p.waitForTimeout(200);
  ok(await p.locator('.modal h2', { hasText: 'Accounts on this device' }).isVisible(), 'account manager opens');
  await p.click('.modal [data-act=acctAdd]'); await p.waitForTimeout(200);
  await p.fill('.modal input[name=name]', 'Test user');
  await reloaded(() => p.click('.modal [type=submit]'));
  ok(await p.evaluate(() => WTAccounts.get(WTAccounts.active()).name) === 'Test user', 'new account is open after adding');
  ok(await p.locator('.demo-bar').isVisible(), 'new account starts like a new install (demo shows)');
  ok(await p.evaluate(() => (window.WTDemo ? true : false)) && await p.evaluate(() => indexedDB.databases ? indexedDB.databases().then(d => d.some(x => /^wealthtrack-/.test(x.name))) : true), 'new account has its own database');
  // leave the demo with "use my own data" if the button is there, then check it's blank
  const own = p.locator('.demo-bar button').last();
  if (await own.count()) { await own.click(); await p.waitForTimeout(300); if (await p.locator('.overlay .modal-f .btn:last-child').count()) { await p.click('.overlay .modal-f .btn:last-child'); await p.waitForTimeout(500); } }
  await p.keyboard.press('Escape').catch(() => { }); await p.evaluate(() => document.querySelectorAll('.overlay').forEach(o => o.remove()));
  ok(await bills() === 0, 'new account has no bills');
  await p.evaluate(() => { WT.addTemplate({ name: 'Test only bill', amountCents: 1234, frequency: 'monthly', anchor: new Date().toISOString().slice(0, 10), category: Object.keys(WT.D.categories)[0] }); });
  await p.waitForTimeout(300);
  const testBills = await bills();

  // Fingerprint belongs to the first account only
  ok(await p.evaluate(() => WTAccounts.isMain()) === false, 'second account is not the first account');

  // Switch back: first account's data is untouched
  await go('settings/personal');
  await p.click('[data-act=acctManage]'); await p.waitForTimeout(200);
  ok(await p.locator('.modal [data-act=acctSwitch]').count() === 1, 'manager lists the other account to switch to');
  await reloaded(() => p.click('.modal [data-act=acctSwitch]'));
  ok(await p.evaluate(() => WTAccounts.active()) === 'main' && await bills() === mainBills, 'switching back: first account data unchanged');
  ok(!(await p.evaluate(() => Object.values(WT.D.templates).some(t => t.name === 'Test only bill'))), "the test account's bill isn't in the first account");

  // Sign out -> picker
  await go('settings/personal');
  await p.click('[data-act=acctSignOut]'); await p.waitForTimeout(200);
  await Promise.all([p.waitForEvent('load'), p.click('.modal .modal-f .btn:last-child')]);
  // picker shows before any data is open (boot waits), so __wtReady is set only after picking: wait for the picker instead
  await p.waitForSelector('.auth .acct-pick', { timeout: 10000 }).catch(() => { });
  ok(await p.locator('.auth .acct-pick').count() === 2, 'after sign out: picker lists both accounts');
  await p.click('.auth .acct-pick:has-text("Test user")'); await ready();
  ok(await p.evaluate(() => WTAccounts.active()) !== 'main' && await bills() === testBills, 'picker opens the chosen account with its own data');

  // Sign out again and create a third account from the picker
  await p.evaluate(() => { WTAccounts.signOut(); }); await p.reload(); await p.waitForSelector('.auth .acct-pick');
  await p.click('.auth .acct-new [type=submit]'); await p.waitForTimeout(150);
  ok(/name/i.test(await p.locator('.auth .auth-err').textContent()), 'picker: empty name is refused');
  await p.fill('.auth .acct-new input[name=name]', 'Test user'); await p.click('.auth .acct-new [type=submit]'); await p.waitForTimeout(150);
  ok(/already/i.test(await p.locator('.auth .auth-err').textContent()), 'picker: duplicate name is refused');
  await p.fill('.auth .acct-new input[name=name]', 'Third'); await p.click('.auth .acct-new [type=submit]'); await ready();
  ok(await p.evaluate(() => WTAccounts.get(WTAccounts.active()).name) === 'Third' && await p.evaluate(() => WTAccounts.list().length) === 3, 'picker: new account created and opened');

  // Rename + delete (from the third account, delete "Test user")
  await go('settings/personal');
  await p.click('[data-act=acctManage]'); await p.waitForTimeout(200);
  const testId = await p.evaluate(() => WTAccounts.list().find(a => a.name === 'Test user').id);
  await p.click(`.modal [data-act=acctRename][data-id="${testId}"]`); await p.waitForTimeout(200);
  await p.fill('.modal input[name=name]', 'Old test'); await p.click('.modal [type=submit]'); await p.waitForTimeout(200);
  ok(await p.evaluate(id => WTAccounts.get(id).name, testId) === 'Old test', 'rename works');
  await p.click('[data-act=acctManage]'); await p.waitForTimeout(200);
  ok(await p.locator('.modal [data-act=acctDelete][data-id=main]').count() === 0, 'the first account has no Delete button');
  await p.click(`.modal [data-act=acctDelete][data-id="${testId}"]`); await p.waitForTimeout(200);
  await p.fill('.modal input[name=c]', 'nope'); await p.click('.modal [type=submit]'); await p.waitForTimeout(200);
  ok(!!(await p.evaluate(id => WTAccounts.get(id), testId)), 'delete needs DELETE typed');
  await p.fill('.modal input[name=c]', 'DELETE'); await p.click('.modal [type=submit]'); await p.waitForTimeout(500);
  ok(!(await p.evaluate(id => WTAccounts.get(id), testId)), 'account deleted');
  ok(await p.evaluate(id => indexedDB.databases ? indexedDB.databases().then(d => !d.some(x => x.name === 'wealthtrack-' + id)) : true, testId), "deleted account's database is gone");

  // Preview as a free user (browser = not the Play build, so normally everything is unlocked)
  ok(await p.evaluate(() => WT_isPro()) === true, 'browser version: Pro unlocked by default');
  await go('settings/pro');
  await p.check('[data-act-change=proPreview]'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => WT_isPro()) === false, 'preview on: Pro features locked');
  await go('reports');
  ok(/Pro/.test(await p.locator('main').textContent()), 'preview on: Reports shows the Pro page');
  await go('settings/pro');
  await p.uncheck('[data-act-change=proPreview]'); await p.waitForTimeout(250);
  ok(await p.evaluate(() => WT_isPro()) === true, 'preview off: unlocked again');

  // back to the first account: everything still there
  await p.evaluate(() => { WTAccounts.switchTo('main'); }); await p.reload(); await ready();
  ok(await bills() === mainBills, 'first account still has all its bills at the end');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
