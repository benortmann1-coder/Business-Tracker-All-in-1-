// First-run setup wizard in a real browser (Playwright/Chromium), at phone size.
// Run: node wealthtrack/tests/setup-wizard.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '../web');
const FIXTURE = path.join(__dirname, 'fixtures/sample-data.js');
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
// skipOnboarding skips the PIN screen in tests (and, by default, the wizard); wt.setupWizard=1 turns the wizard back on
const ctxOpts = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
async function newCtx(browser, o) {
  const c = await browser.newContext(ctxOpts);
  await c.addInitScript(force => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); if (force) localStorage.setItem('wt.setupWizard', '1'); } catch (e) { } }, !!(o && o.force));
  if (o && o.sample) await c.addInitScript({ path: FIXTURE });
  return c;
}
async function watch(p) { const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); return errs; }
const wz = p => p.locator('.wz-modal');
const step = p => p.$eval('.wz-modal .wz-count', el => el.textContent).catch(() => '');
// layout rules from the audit: no sideways scroll, 16px inputs, 40px+ touch targets, submit on screen
async function layoutOk(p, label) {
  const r = await p.evaluate(() => {
    const m = document.querySelector('.wz-modal'); const bad = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push('page scrolls sideways');
    if (m.scrollWidth > m.clientWidth + 1) bad.push('dialog scrolls sideways');
    m.querySelectorAll('input:not([type=checkbox]), select').forEach(el => { if (el.offsetParent && parseFloat(getComputedStyle(el).fontSize) < 16) bad.push('small text in ' + el.name); });
    m.querySelectorAll('button').forEach(el => { if (!el.offsetParent) return; const b = el.getBoundingClientRect(); if (b.height < 40 || b.width < 40) bad.push('small button "' + el.textContent.trim().slice(0, 20) + '" ' + Math.round(b.width) + 'x' + Math.round(b.height)); });
    const sub = m.querySelector('[type=submit]').getBoundingClientRect(); if (sub.bottom > window.innerHeight + 1 || sub.top < 0) bad.push('submit off screen');
    return bad;
  });
  ok(r.length === 0, label + ': phone layout' + (r.length ? ' — ' + r.join('; ') : ''));
}

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  // ---- complete the wizard on a blank install
  {
    const c = await newCtx(browser, { force: true }); const p = await c.newPage(); const errs = await watch(p);
    await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    ok(await wz(p).isVisible(), 'blank install: wizard opens');
    ok((await step(p)).includes('1 of 6'), 'starts on step 1 of 6');
    await layoutOk(p, 'welcome');
    ok(!(await p.locator('.wz-modal [data-wz=back]').isVisible()), 'first step hides Back');
    await p.click('.wz-modal [data-wz=next]');
    // balance
    ok((await step(p)).includes('2 of 6'), 'step 2: balance');
    await layoutOk(p, 'balance');
    await p.fill('.wz-modal [name=bal]', '1,250.00'); await p.click('.wz-modal [data-wz=next]');
    // paychecks: two jobs, the first via "add another"
    ok((await step(p)).includes('3 of 6'), 'step 3: paychecks');
    await layoutOk(p, 'paychecks');
    await p.click('.wz-modal [data-wz=next]');
    ok((await step(p)).includes('4 of 6'), 'empty paycheck form: Next moves on');
    await p.click('.wz-modal [data-wz=back]');
    ok((await step(p)).includes('3 of 6'), 'Back returns to paychecks');
    await p.fill('.wz-modal [name=name]', 'Warehouse job');
    await p.click('.wz-modal [data-wz=next]');
    ok((await p.$eval('.wz-modal .wz-err', el => el.textContent)).includes('take-home'), 'name without pay shows an error and stays');
    await p.fill('.wz-modal [name=amount]', '1,800');
    await p.selectOption('.wz-modal [name=schedule]', 'biweekly');
    await p.click('.wz-modal [data-wz-add=pay]'); await p.waitForTimeout(100);
    ok(await p.locator('.wz-modal .wz-list .wz-item').count() === 1, 'first paycheck listed after "add another"');
    await p.fill('.wz-modal [name=name]', 'Side gig'); await p.fill('.wz-modal [name=amount]', '300');
    await p.selectOption('.wz-modal [name=schedule]', 'semimonthly');
    ok(await p.locator('.wz-modal [name=day1]').isVisible(), 'twice a month shows the two payday fields');
    await p.click('.wz-modal [data-wz=next]');
    // bills: two presets and one of my own
    ok((await step(p)).includes('4 of 6'), 'step 4: bills');
    await layoutOk(p, 'bills');
    await p.click('.wz-modal [data-wz-preset=rent]');
    ok(await p.inputValue('.wz-modal [name=name]') === 'Rent', 'preset fills the name');
    await p.fill('.wz-modal [name=amount]', '1150'); await p.fill('.wz-modal [name=day]', '1');
    await p.click('.wz-modal [data-wz-add=bill]'); await p.waitForTimeout(100);
    await p.click('.wz-modal [data-wz-preset=electric]'); await p.fill('.wz-modal [name=amount]', '110'); await p.fill('.wz-modal [name=day]', '9');
    await p.click('.wz-modal [data-wz-add=bill]'); await p.waitForTimeout(100);
    await p.fill('.wz-modal [name=name]', 'Daycare'); await p.fill('.wz-modal [name=amount]', '200');
    await p.selectOption('.wz-modal [name=frequency]', 'weekly');
    ok(await p.locator('.wz-modal [name=date]').isVisible() && !(await p.locator('.wz-modal [name=day]').isVisible()), 'weekly bill asks for a date, not a day');
    await p.click('.wz-modal [data-wz=next]');
    // debts
    ok((await step(p)).includes('5 of 6'), 'step 5: debts');
    await layoutOk(p, 'debts');
    await p.fill('.wz-modal [name=name]', 'Visa'); await p.fill('.wz-modal [name=balance]', '2400'); await p.fill('.wz-modal [name=apr]', '24.99');
    await p.fill('.wz-modal [name=min]', '75'); await p.fill('.wz-modal [name=day]', '20');
    await p.click('.wz-modal [data-wz=next]');
    // done
    ok((await step(p)).includes('6 of 6'), 'step 6: done');
    await layoutOk(p, 'done');
    ok(!(await p.locator('.wz-modal [data-wz=back]').isVisible()) && !(await p.locator('.wz-modal [data-wz=skip]').isVisible()), 'last step hides Back and Skip');
    const doneText = await p.$eval('.wz-modal', el => el.textContent);
    ok(doneText.includes('$1,250.00') && /Paychecks\s*2/.test(doneText) && /Bills\s*4/.test(doneText) && /Cards and loans\s*1/.test(doneText), 'summary counts (4 bills: 3 + Visa minimum)');
    ok(/paycheck/i.test(doneText) && doneText.includes('Left over'), 'peek at the paycheck plan');
    const data = await p.evaluate(() => ({ inc: Object.values(WT.D.incomes).map(i => [i.name, i.netCents, i.schedule]), tpl: Object.values(WT.D.templates).map(t => t.name).sort(), debts: Object.values(WT.D.debts).length, bal: WT.accountBalance('acc_checking') }));
    ok(data.inc.length === 2 && data.inc.some(i => i[0] === 'Warehouse job' && i[1] === 180000 && i[2] === 'biweekly') && data.inc.some(i => i[0] === 'Side gig' && i[2] === 'semimonthly'), 'paychecks saved through WT.addIncome ' + JSON.stringify(data.inc));
    ok(JSON.stringify(data.tpl) === JSON.stringify(['Daycare', 'Electric', 'Rent', 'Visa']), 'bills saved ' + JSON.stringify(data.tpl));
    ok(data.debts === 1 && data.bal === 125000, 'debt and balance saved');
    await p.click('.wz-modal [data-wz=next]'); await p.waitForTimeout(300);
    ok(!(await wz(p).count()), 'wizard closes');
    const dash = await p.$eval('#main', el => el.textContent);
    ok(await p.evaluate(() => location.hash) === '#/dashboard', 'lands on the dashboard');
    ok(/Warehouse job|Side gig/.test(dash), 'dashboard shows the paycheck');
    ok(/Rent|Electric|Visa|Daycare/.test(dash) && !dash.includes('Something went wrong'), 'dashboard shows the bills');
    ok(await p.evaluate(() => WT.settings().setupWizard) === 'done', 'remembered as done');
    // saved for real: reload and it's all there, with no wizard
    await p.reload(); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    ok(!(await wz(p).count()), 'not shown again after reload');
    ok(await p.evaluate(() => Object.keys(WT.D.templates).length) === 4, 'data persisted');
    // Settings → Your data → Setup wizard runs it again
    await p.evaluate(() => { location.hash = '#/settings/data'; }); await p.waitForTimeout(300);
    await p.click('[data-act=setupWizard]'); await p.waitForTimeout(200);
    ok(await wz(p).isVisible(), 'Settings re-runs the wizard');
    await p.click('.wz-modal [data-close]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => WT.settings().setupWizard) === 'done', 'closing a re-run keeps "done"');
    ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await c.close();
  }

  // ---- closing mid-way keeps what was saved and doesn't nag again
  {
    const c = await newCtx(browser, { force: true }); const p = await c.newPage(); const errs = await watch(p);
    await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    await p.click('.wz-modal [data-wz=next]'); await p.fill('.wz-modal [name=bal]', '80'); await p.click('.wz-modal [data-wz=next]');
    await p.click('.wz-modal [data-close]'); await p.waitForTimeout(200);
    ok(!(await wz(p).count()), 'closed mid-way');
    ok(await p.evaluate(() => WT.accountBalance('acc_checking')) === 8000, 'balance from step 2 kept');
    ok(await p.evaluate(() => WT.settings().setupWizard) === 'dismissed', 'remembered as dismissed');
    await p.reload(); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    ok(!(await wz(p).count()), 'dismissed: not shown on the next start');
    ok(errs.length === 0, 'no console errors (dismiss)' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await c.close();
  }

  // ---- "Not now" on the welcome step
  {
    const c = await newCtx(browser, { force: true }); const p = await c.newPage();
    await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    await p.click('.wz-modal [data-wz=skip]'); await p.waitForTimeout(200);
    ok(!(await wz(p).count()) && await p.evaluate(() => WT.settings().setupWizard) === 'dismissed', '"Not now" closes and is remembered');
    await c.close();
  }

  // ---- existing user: never shown
  {
    const c = await newCtx(browser, { force: true, sample: true }); const p = await c.newPage();
    await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    ok(!(await wz(p).count()), 'existing data: wizard not shown');
    await c.close();
  }

  // ---- real first run: demo first, then "Use my own data" opens the wizard
  {
    const c = await browser.newContext(ctxOpts);
    await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.setupWizard', '1'); } catch (e) { } });
    const p = await c.newPage(); const errs = await watch(p);
    await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(300);
    ok(!(await wz(p).count()) && await p.locator('.demo-bar').count() === 1, 'demo shows first, no wizard over it');
    await p.click('.demo-bar [data-act=demoExit]'); await p.waitForTimeout(200);
    await p.click('.overlay [type=submit]'); await p.waitForTimeout(300);
    ok(await wz(p).isVisible(), 'leaving the demo opens the wizard');
    ok(await p.evaluate(() => Object.keys(WT.D.templates).length) === 0, 'on the real (blank) data');
    ok(errs.length === 0, 'no console errors (demo exit)' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await c.close();
  }

  await browser.close(); srv.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
