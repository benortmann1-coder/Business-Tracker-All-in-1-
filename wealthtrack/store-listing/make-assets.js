// Generates the Google Play listing images: phone screenshots (1080x1920) of key screens using the
// made-up test data in tests/fixtures/sample-data.js, the 512x512 icon and the 1024x500 feature graphic.
// Run: node wealthtrack/store-listing/make-assets.js
const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '../web');
const OUT = path.join(__dirname, 'screenshots');
const FIXTURE = path.join(__dirname, '../tests/fixtures/sample-data.js');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const SHOTS = [
  ['01-dashboard', 'dashboard'],
  ['02-bills', 'bills'],
  ['03-paychecks', 'paychecks'],
  ['04-calendar', 'calendar'],
  ['05-debt', 'debts'],
  ['06-smart-budget', 'smart'],
  ['07-goals', 'goals'],
  ['08-reports', 'reports'],
];

// Launcher icon (res/drawable/ic_launcher_*.xml) redrawn as SVG: brand green, darker lower band, white trend arrow.
const iconSvg = (size, radius) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="18 18 72 72">
  <defs><clipPath id="c"><rect x="18" y="18" width="72" height="72" rx="${radius}"/></clipPath></defs>
  <g clip-path="url(#c)">
    <rect x="0" y="0" width="108" height="108" fill="#16A34A"/>
    <path d="M0,72 L108,48 L108,108 L0,108 Z" fill="#15803D"/>
    <path d="M32,76 L76,76" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="3" stroke-linecap="round"/>
    <path d="M32,66 L46,52 L56,60 L74,40" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M64,36 L78,36 L78,50 Z" fill="#FFFFFF"/>
  </g></svg>`;

const featureHtml = () => `<!DOCTYPE html><html><head><style>
  html,body{margin:0;width:1024px;height:500px;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{position:relative;width:1024px;height:500px;background:linear-gradient(160deg,#16A34A 0%,#15803D 100%);color:#fff;display:flex;align-items:center;padding:0 72px;box-sizing:border-box;gap:48px}
  .band{position:absolute;inset:0;background:#15803D;clip-path:polygon(0 78%,100% 52%,100% 100%,0 100%);opacity:.7}
  .icon{position:relative;width:220px;height:220px;border-radius:48px;box-shadow:0 18px 40px rgba(0,0,0,.25);flex:none}
  .icon svg{width:220px;height:220px;display:block}
  .txt{position:relative}
  h1{margin:0;font-size:72px;font-weight:800;letter-spacing:-1.5px}
  p{margin:14px 0 0;font-size:30px;line-height:1.3;font-weight:500;opacity:.95;max-width:560px}
  .tags{margin-top:22px;font-size:20px;opacity:.85}
</style></head><body><div class="wrap"><div class="band"></div>
  <div class="icon">${iconSvg(220, 14)}</div>
  <div class="txt"><h1>WealthTrack</h1><p>Plan every paycheck. Never miss a bill.</p><div class="tags">Private &middot; Offline &middot; No bank login</div></div>
</div></body></html>`;

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
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve(); const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch();

  // phone screenshots: 360x640 CSS px at 3x = 1080x1920 (9:16, inside Play's 320-3840 px limits)
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) {} });
  await ctx.addInitScript({ path: FIXTURE });
  // the fixture's accounts start at $0 with no goals; add believable made-up balances and one goal for the listing
  await ctx.addInitScript(() => {
    const S = window.WTSampleSeed; if (!S || S.__listing) return;
    const orig = S.seed; S.__listing = true;
    S.seed = function (WT, opts) {
      const r = orig.call(this, WT, opts);
      const set = (id, cents) => { const a = WT.D.accounts[id]; if (a) WT.save('accounts', Object.assign({}, a, { openingCents: cents, needsBalance: false })); };
      set('acc_checking', 284250); set('acc_savings', 650000); set('acc_cash', 12000);
      WT.addGoal({ name: 'Emergency fund', type: 'emergency', targetCents: 1000000, startCents: 350000, targetDate: '2027-08-01', accountId: 'acc_savings' });
      return r;
    };
  });
  const page = await ctx.newPage();
  await page.goto(url); await page.waitForFunction(() => window.__wtReady);
  for (const [name, route] of SHOTS) {
    await page.evaluate(r => { location.hash = '#/' + r; }, route);
    await page.waitForTimeout(700);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.addStyleTag({ content: '.toast{display:none!important}' }); // milestone pop-ups would cover the screen
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('screenshot', name);
  }
  await ctx.close();

  // 512x512 hi-res icon (Play applies its own rounded mask, so this one is square)
  const g = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await g.setContent(`<html><body style="margin:0">${iconSvg(512, 0)}</body></html>`);
  await g.screenshot({ path: path.join(__dirname, 'icon-512.png') });
  // 1024x500 feature graphic
  await g.setViewportSize({ width: 1024, height: 500 });
  await g.setContent(featureHtml());
  await g.screenshot({ path: path.join(__dirname, 'feature-graphic-1024x500.png') });
  console.log('icon and feature graphic done');

  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
