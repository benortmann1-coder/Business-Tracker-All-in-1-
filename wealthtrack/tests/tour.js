// Quick tour for new users, in a real browser (Playwright/Chromium): phone and desktop sizes.
// Run: node wealthtrack/tests/tour.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node-tools/node_modules/playwright'); } })();
const http = require('http'), fs = require('fs'), path = require('path');

const WEB = path.join(__dirname, '../web');
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
const PHONE = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 800 } };

async function open(browser, url, o) {
  const c = await browser.newContext(o.size || PHONE);
  // skipOnboarding skips the PIN pages; wt.tour=1 lets the tour run in tests
  await c.addInitScript(o => { try {
    localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.tour', o.tour === false ? '0' : '1');
    if (o.demoDone) localStorage.setItem('wt.demoDone', '1');
    if (o.wizard) localStorage.setItem('wt.setupWizard', '1');
    if (o.previewFree) localStorage.setItem('wt.previewFree', '1');
  } catch (e) { } }, o);
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(900);
  return { c, p, errs };
}
const card = p => p.locator('.tour-card');
const title = p => p.locator('.tour-card h2').textContent().catch(() => '');
async function layout(p, label) {
  const bad = await p.evaluate(() => {
    const out = []; const c = document.querySelector('.tour-card'); if (!c) return ['no card'];
    const r = c.getBoundingClientRect();
    if (r.left < 0 || r.right > innerWidth + 1 || r.top < 0 || r.bottom > innerHeight + 1) out.push('card off screen');
    if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways');
    c.querySelectorAll('button').forEach(b => { const q = b.getBoundingClientRect(); if (q.height < 44 || q.width < 44) out.push('small button ' + b.textContent.trim()); });
    if (parseFloat(getComputedStyle(c.querySelector('p')).fontSize) < 15) out.push('small text');
    const spot = document.querySelector('.tour-spot:not(.none)');
    if (spot) { const s = spot.getBoundingClientRect(); if (s.top < r.bottom && s.bottom > r.top && s.left < r.right && s.right > r.left) out.push('card covers the spotlight'); }
    return out;
  });
  ok(bad.length === 0, label + (bad.length ? ' — ' + bad.join('; ') : ''));
}

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const N = await (async () => { const { c, p } = await open(browser, url, { tour: false }); const n = await p.evaluate(() => WTTour.STEPS.length); await c.close(); return n; })();

  // ---- new user (demo showing): tour starts by itself and walks every page at phone size
  {
    const { c, p, errs } = await open(browser, url, {});
    ok(await p.locator('.demo-bar').isVisible(), 'new user: demo is showing');
    ok(await card(p).isVisible(), 'new user: tour starts by itself');
    ok(/Welcome/.test(await title(p)), 'starts on the welcome card');
    ok(await p.locator('.tour-card [data-tour=back]').count() === 0, 'no Back on the first card');
    await layout(p, 'phone: welcome card fits');
    const seen = [];
    for (let k = 1; k < N; k++) {
      await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(380);
      const t = await title(p); const route = await p.evaluate(() => location.hash);
      const spot = await p.locator('.tour-spot:not(.none)').count();
      seen.push(t + ' @' + route);
      const step = await p.evaluate(k => WTTour.STEPS[k], k);
      if (step[0]) ok(route.startsWith('#/' + step[0]), `step ${k + 1} "${step[2]}" opens ${step[0]}`);
      if (step[1].length) ok(spot === 1, `step ${k + 1} "${step[2]}" points at it on a phone`);
      await layout(p, `phone: step ${k + 1} fits`);
    }
    ok(/all set/.test(await title(p)), 'ends on the "all set" card');
    await p.click('.tour-card [data-tour=back]'); await p.waitForTimeout(350);
    ok(/Settings/.test(await title(p)), 'Back goes one step back');
    await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(350);
    await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(300);
    ok(!(await card(p).count()) && !(await p.locator('.tour-spot, .tour-block').count()), 'Done closes the tour completely');
    ok(await p.evaluate(() => location.hash) === '#/dashboard' || await p.evaluate(() => location.hash) === '', 'returns to where it started');
    ok(await p.evaluate(() => WTTour.isDone()), 'marked done for this account');
    await p.reload(); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(900);
    ok(!(await card(p).count()), 'does not come back after a reload');
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
    await c.close();
  }

  // ---- Skip, keyboard, replay from Settings
  {
    const { c, p, errs } = await open(browser, url, {});
    await p.click('.tour-card [data-tour=skip]'); await p.waitForTimeout(250);
    ok(!(await card(p).count()), 'Skip tour closes it');
    ok(/Replay/.test(await p.locator('#toasts').textContent()), 'skipping says how to replay');
    ok(await p.evaluate(() => WTTour.isDone()), 'skipping counts as seen');
    await p.evaluate(() => { location.hash = '#/settings/data'; }); await p.waitForTimeout(300);
    ok(await p.locator('[data-act=appTour]').isVisible(), 'Settings → Your data has App tour');
    await p.click('[data-act=appTour]'); await p.waitForTimeout(300);
    ok(await card(p).isVisible(), 'App tour replays it');
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(350);
    ok(/Home/.test(await title(p)), 'right arrow goes forward');
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(350);
    ok(/Welcome/.test(await title(p)), 'left arrow goes back');
    await p.keyboard.press('Escape'); await p.waitForTimeout(250);
    ok(!(await card(p).count()), 'Esc closes it');
    ok(errs.length === 0, 'no page errors (skip/replay)' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
    await c.close();
  }

  // ---- desktop: points at the side menu
  {
    const { c, p, errs } = await open(browser, url, { size: DESK });
    ok(await card(p).isVisible(), 'desktop: tour starts');
    await layout(p, 'desktop: welcome card fits');
    for (let k = 1; k < N - 1; k++) {
      await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(330);
      const step = await p.evaluate(k => WTTour.STEPS[k], k);
      if (step[1].length) ok(await p.locator('.tour-spot:not(.none)').count() === 1, `desktop: step ${k + 1} "${step[2]}" points at it`);
      await layout(p, `desktop: step ${k + 1} fits`);
    }
    ok(errs.length === 0, 'no page errors (desktop)' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
    await c.close();
  }

  // ---- Pro features are labelled for free users
  {
    const { c, p } = await open(browser, url, { previewFree: true });
    const idx = await p.evaluate(() => WTTour.STEPS.findIndex(s => s[2] === 'Wealth: Debt'));
    for (let k = 0; k < idx; k++) { await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(300); }
    ok(/Debt/.test(await title(p)) && await p.locator('.tour-card .tour-pro').count() === 1, 'free user: Debt payoff step shows a Pro label');
    await p.click('.tour-card [data-tour=back]'); await p.waitForTimeout(300);
    ok(await p.locator('.tour-card .tour-pro').count() === 0, 'free user: non-Pro steps have no Pro label');
    await c.close();
  }
  {
    const { c, p } = await open(browser, url, {});
    const idx = await p.evaluate(() => WTTour.STEPS.findIndex(s => s[2] === 'Wealth: Debt'));
    for (let k = 0; k < idx; k++) { await p.click('.tour-card [data-tour=next]'); await p.waitForTimeout(300); }
    ok(await p.locator('.tour-card .tour-pro').count() === 0, 'Pro unlocked: no Pro labels');
    await c.close();
  }

  // ---- after the setup wizard: the tour follows when the wizard closes
  {
    const { c, p, errs } = await open(browser, url, { demoDone: true, wizard: true });
    ok(await p.locator('.wz-modal').isVisible() && !(await card(p).count()), 'blank account: wizard first, no tour on top of it');
    await p.click('.wz-modal [data-close]'); await p.waitForTimeout(900);
    ok(await card(p).isVisible(), 'tour starts after the wizard closes');
    ok(errs.length === 0, 'no page errors (wizard → tour)' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
    await c.close();
  }

  // ---- each account gets its own tour
  {
    const { c, p } = await open(browser, url, { demoDone: true });
    await p.click('.tour-card [data-tour=skip]'); await p.waitForTimeout(200);
    await p.evaluate(() => { const id = WTAccounts.create('Second'); WTAccounts.switchTo(id); }); await p.reload(); await p.waitForFunction(() => window.__wtReady); await p.waitForTimeout(900);
    ok(await card(p).isVisible(), 'a new account gets the tour too');
    await c.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
