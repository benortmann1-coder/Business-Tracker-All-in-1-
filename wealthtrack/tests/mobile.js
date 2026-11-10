// Phone / tablet layout checks (Playwright/Chromium).
// Run: node wealthtrack/tests/mobile.js [--shots <dir>] [--audit]
//  - fails on horizontal page overflow on any route or modal at 360px (and other viewports)
//  - fails on primary tap targets < 40px, inputs < 16px font (iOS zoom), modal footer off-screen
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const __skipOnb = async c => { await c.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) {} }); return c; };
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '../web');
const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const SHOTS = arg('--shots');
const AUDIT = process.argv.includes('--audit'); // print all findings, incl. soft ones
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
const VIEWPORTS = [
  { name: '360', viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
  { name: '390', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: '412', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  { name: 'tablet', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
];
const ROUTES = ['dashboard', 'bills', 'paychecks', 'calendar', 'expenses', 'debts', 'smart', 'budgets', 'goals', 'reports', 'history', 'settings', 'settings/personal', 'settings/security', 'settings/theme', 'settings/notifications', 'settings/accounts', 'settings/categories', 'settings/data', 'settings/about'];

// layout probe run in page
function probe(scopeSel) {
  const W = window.innerWidth, H = window.innerHeight;
  const out = { overflow: document.scrollingElement.scrollWidth - W, sw: document.scrollingElement.scrollWidth, vw: W, wide: [], small: [], fonts: [], footer: null };
  const scope = scopeSel ? document.querySelector(scopeSel) : document;
  if (!scope) return out;
  const inScroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const cs = getComputedStyle(p); if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll' || cs.overflowX === 'hidden') && p !== document.body && p !== document.documentElement) return true; } return false; };
  const desc = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' "' + (el.textContent || el.value || '').trim().slice(0, 30) + '"');
  for (const el of scope.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed' && el.classList.contains('tip')) continue;
    if ((r.right > W + 1 || r.left < -1) && !inScroller(el) && !el.closest('.toast-wrap,.tip,.drag-ghost')) out.wide.push(desc(el) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  for (const el of scope.querySelectorAll('.btn:not(.ghost), .btn.icon, .pay-btn, .chip, .bottom-nav button, .fab, .menu button, .pc-chip, .modal-f .btn')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    if (r.height < 39.5 || r.width < 39.5) out.small.push(desc(el) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  for (const el of scope.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=month]), select, textarea')) {
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 16) out.fonts.push(desc(el) + ' ' + fs + 'px');
  }
  out.cut = [];
  for (const w of scope.querySelectorAll('.tbl-wrap:not(.tbl-scroll)')) { const t = w.querySelector('table'); if (t && !t.classList.contains('tbl-cards') && w.scrollWidth > w.clientWidth + 2) out.cut.push('table cut off by ' + (w.scrollWidth - w.clientWidth) + 'px: ' + (t.textContent || '').trim().slice(0, 30)); }
  const f = document.querySelector('.overlay .modal-f');
  if (f) { const r = f.getBoundingClientRect(); out.footer = { bottom: Math.round(r.bottom), H, visible: r.bottom <= H + 1 && r.top >= 0 }; }
  return out;
}

let failures = 0; const findings = [];
const fail = (m) => { failures++; console.log('FAIL ' + m); };
const note = (m) => { findings.push(m); if (AUDIT) console.log('NOTE ' + m); };

async function check(page, label, scope, opts) {
  opts = opts || {};
  const r = await page.evaluate(probe, scope || null);
  if (r.overflow > 1) fail(`${label}: page scrolls sideways by ${r.overflow}px`);
  // On a phone the browser widens its layout viewport to fit content that's too wide,
  // which hides the overflow from innerWidth. Compare against the real screen width too.
  const screenW = page.viewportSize().width;
  if (r.vw > screenW + 1 || r.sw > screenW + 1) fail(`${label}: layout is ${Math.max(r.vw, r.sw)}px wide on a ${screenW}px screen`);
  if (r.wide.length) fail(`${label}: wider than screen: ${r.wide.slice(0, 4).join(' | ')}`);
  if (r.small.length) fail(`${label}: tap targets under 40px: ${r.small.slice(0, 6).join(' | ')}`);
  if (r.cut.length) fail(`${label}: ${r.cut.join(' | ')}`);
  if (r.fonts.length) fail(`${label}: inputs under 16px (iOS zooms): ${r.fonts.slice(0, 3).join(' | ')}`);
  if (r.footer && !r.footer.visible) fail(`${label}: modal buttons off-screen (bottom ${r.footer.bottom} > ${r.footer.H})`);
  return r;
}

async function openRoute(page, r) { await page.evaluate(r => { document.querySelectorAll('.overlay').forEach(o => o.remove()); location.hash = '#/' + r; }, r); await page.waitForTimeout(120); }
async function closeAll(page) { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.evaluate(() => { document.querySelectorAll('.overlay,#menu').forEach(o => o.remove()); }); await page.waitForTimeout(50); }

// modal openers: [route, label, async fn]
const MODALS = [
  ['bills', 'add bill', async p => { if (await p.locator('#main [data-act=addBill]').isVisible()) return p.click('#main [data-act=addBill]'); await p.click('.fab'); await p.click('#menu button:has-text("Add bill")'); }],
  ['bills', 'edit bill (this month)', async p => { await p.locator('.bill [data-act=billMenu]').first().click(); await p.locator('.menu button', { hasText: 'Edit bill' }).click(); }],
  ['bills', 'edit bill (future)', async p => { await p.locator('.bill [data-act=billMenu]').first().click(); await p.locator('.menu button', { hasText: 'Edit bill' }).click(); await p.click('#scopeSeg [data-scope=future]'); }],
  ['bills', 'bill menu', p => p.locator('.bill [data-act=billMenu]').first().click(), true],
  ['bills', 'payment', async p => { await p.locator('.bill [data-act=billMenu]').first().click(); await p.locator('.menu button', { hasText: 'payment' }).first().click(); }],
  ['bills', 'move date', async p => { await p.locator('.bill [data-act=billMenu]').first().click(); await p.locator('.menu button', { hasText: 'due date' }).click(); }],
  ['bills', 'assign paycheck', async p => { await p.locator('.bill [data-act=billMenu]').first().click(); await p.locator('.menu button', { hasText: 'Choose paycheck' }).click(); }],
  ['bills', 'reset month', p => p.click('[data-act=resetMonth]')],
  ['bills', 'manage tab', async p => { await p.click('[data-act=billsTab][data-tab=manage]'); }, false, true],
  ['bills', 'subs tab', async p => { await p.click('[data-act=billsTab][data-tab=subs]'); }, false, true],
  ['paychecks', 'add income', p => p.locator('#main [data-act=addIncome]:visible').first().click()],
  ['paychecks', 'edit income', p => p.locator('[data-act=editIncome]').first().click()],
  ['paychecks', 'receive check', p => p.locator('[data-act=receiveCheck]').first().click()],
  ['paychecks', 'extra income', p => p.locator('[data-act=addExtraIncome]').first().click()],
  ['paychecks', 'set-asides', p => p.locator('[data-act=setAsides]').first().click()],
  ['expenses', 'add expense', async p => { const b = p.locator('#main [data-act=addExpense]:visible'); if (await b.count()) return b.first().click(); await p.click('.fab'); await p.click('#menu button:has-text("Add expense")'); }],
  ['debts', 'add debt', p => p.click('[data-act=addDebt]')],
  ['debts', 'debt extra payment', p => p.locator('[data-act=debtPay]').first().click()],
  ['debts', 'debt charge', async p => { await p.locator('[data-act=debtMenu]').first().click(); await p.locator('#menu button', { hasText: 'Add charge' }).first().click(); }],
  ['debts', 'debt balance', async p => { await p.locator('[data-act=debtMenu]').first().click(); await p.locator('#menu button', { hasText: 'Update balance' }).first().click(); }],
  ['debts', 'debt history', async p => { await p.locator('[data-act=debtMenu]').first().click(); await p.locator('#menu button', { hasText: 'History' }).first().click(); }],
  ['debts', 'debt menu', p => p.locator('[data-act=debtMenu]').first().click(), true],
  ['goals', 'add goal', p => p.locator('[data-act=addGoal]').first().click()],
  ['calendar', 'day modal', p => p.locator('.cal .day').nth(10).click()],
  ['history', 'csv menu', p => p.click('[data-act=exportCsvMenu]')],
  ['settings/data', 'backup', p => p.click('[data-act=backup]')],
  ['settings/accounts', 'add account', p => p.click('[data-act=addAccount]')],
  ['settings/accounts', 'set balance', p => p.locator('[data-act=setBalance]').first().click()],
  ['settings/accounts', 'transfer', p => p.click('[data-act=addTransfer]')],
  ['settings/categories', 'add category', p => p.click('[data-act=addCat]')],
  ['settings/data', 'erase', p => p.click('[data-act=startOver]')],
  ['dashboard', 'quick add menu', p => p.click('.fab'), true],
  ['dashboard', 'more menu', p => p.click('[data-nav-btn=more]'), true],
];

(async () => {
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();
  const errors = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext(Object.assign({ deviceScaleFactor: 1 }, vp)); await __skipOnb(ctx); await __sample(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(vp.name + ': ' + e.message));
    await page.goto(url); await page.waitForFunction(() => window.__wtReady);
    await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
    for (const r of ROUTES) {
      await openRoute(page, r);
      await check(page, `[${vp.name}] ${r}`);
      if (SHOTS && (vp.name === '360' || vp.name === 'landscape')) await page.screenshot({ path: path.join(SHOTS, `m${vp.name}-${r}.png`), fullPage: true });
    }
    // dark mode pass at 360
    if (vp.name === '360' || vp.name === 'tablet') {
      for (const [r, label, fn, isMenu, isTab] of MODALS) {
        await openRoute(page, r);
        try { await fn(page); } catch (e) { fail(`[${vp.name}] could not open ${label}: ${e.message.split('\n')[0]}`); await closeAll(page); continue; }
        await page.waitForTimeout(260);
        await check(page, `[${vp.name}] ${label}`, isMenu ? '#menu' : isTab ? null : '.overlay .modal');
        if (isMenu) { const off = await page.evaluate(() => { const m = document.querySelector('#menu'); if (!m) return 'missing'; const b = m.getBoundingClientRect(); return b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight ? `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}` : ''; }); if (off) fail(`[${vp.name}] ${label} menu off-screen ${off}`); }
        if (SHOTS && vp.name === '360') await page.screenshot({ path: path.join(SHOTS, `m360-modal-${label.replace(/\W+/g, '_')}.png`) });
        await closeAll(page);
      }
    }
    // toast must not cover the first Mark paid button area forever: check toast position vs bottom nav
    if (vp.name === '390') {
      await openRoute(page, 'bills');
      await page.locator('.bill [data-act=markPaid]').first().click(); await page.waitForTimeout(200);
      const t = await page.evaluate(() => { const t = document.querySelector('.toast'); const n = document.querySelector('.bottom-nav'); const f = document.querySelector('.fab'); if (!t) return null; const a = t.getBoundingClientRect(), b = n.getBoundingClientRect(), c = f.getBoundingClientRect(); return { overlapNav: a.bottom > b.top, overlapFab: !(a.right < c.left || a.left > c.right || a.bottom < c.top || a.top > c.bottom) }; });
      if (!t) fail('[390] no toast after mark paid'); else { if (t.overlapNav) fail('[390] toast overlaps bottom nav'); if (t.overlapFab) fail('[390] toast overlaps FAB'); }
    }
    await ctx.close();
  }
  // dark mode screenshots
  if (SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, colorScheme: 'dark' }); await __skipOnb(ctx); await __sample(ctx);
    const page = await ctx.newPage(); await page.goto(url); await page.waitForFunction(() => window.__wtReady);
    for (const r of ['dashboard', 'bills', 'paychecks']) { await openRoute(page, r); await page.screenshot({ path: path.join(SHOTS, `m360-dark-${r}.png`), fullPage: true }); }
    await ctx.close();
  }
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  await browser.close(); srv.close();
  if (!AUDIT && findings.length) console.log(`(${findings.length} soft notes; run with --audit to list)`);
  console.log(failures ? `\n${failures} FAILED` : '\nMOBILE: ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
