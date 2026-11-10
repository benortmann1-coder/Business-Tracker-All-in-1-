// Settings menu and Personal info: name greeting, photo/initials, currency, date format.
// Run: NODE_PATH=$(npm root -g) node wealthtrack/tests/settings.js [--shots <dir>]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const FILE = 'file://' + path.join(__dirname, '../dist/WealthTrack.html');
const SAMPLE = path.join(__dirname, 'fixtures/sample-data.js'); // made-up test data (the app itself starts blank)
const si = process.argv.indexOf('--shots'); const SHOTS = si > 0 ? process.argv[si + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
// 40x20 red PNG (not square, so the crop is exercised)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAKUlEQVR4nO3NMQEAAAjDMMC/56ECjlRA0kl6YeeAYGCDwWAwGAwGg8HgB1fpATF+5mHvAAAAAElFTkSuQmCC', 'base64');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
  await ctx.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
  await ctx.addInitScript({ path: SAMPLE }); // bills/debts/income so the currency checks cover real amounts
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  const go = async r => { await page.evaluate(r => { location.hash = '#/' + r; }, r); await page.waitForTimeout(200); };
  const shot = async n => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, n + '.png') }); } };
  await page.goto(FILE); await page.waitForFunction(() => window.__wtReady);

  await go('settings');
  const items = await page.locator('.set-item b').allTextContents();
  ok(JSON.stringify(items) === JSON.stringify(['Personal info', 'Security', 'App theme', 'Notifications', 'Accounts', 'Categories', 'Your data', 'About']), 'menu sections in order: ' + items.join(', '));
  ok(/Add your name/.test(await page.locator('.set-profile').textContent()), 'profile card asks for a name');
  await shot('settings-menu');
  await page.click('.set-item[data-sec=about]'); await page.waitForTimeout(200);
  ok(/About/.test(await page.locator('#main h1').textContent()) && /Version/.test(await page.locator('#main').textContent()), 'About page');
  await page.click('.set-back'); await page.waitForTimeout(200);
  ok(await page.locator('.set-item').count() === 8, 'back arrow returns to the menu');
  await page.evaluate(() => history.back()); await page.waitForTimeout(200);
  ok(/About/.test(await page.locator('#main h1').textContent()), 'browser/phone back goes to the previous page');

  // name, email, address
  await go('settings/personal');
  // Personal info saves by itself (no Save button): leaving a field saves it right away
  const save = async () => { await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await page.waitForTimeout(250); };
  ok(await page.locator('[data-act=saveProfile]').count() === 0 && /save automatically/.test(await page.locator('#piStatus').textContent()), 'no Save button: Personal info saves automatically');
  await page.fill('input[name=first]', 'Alex'); await page.fill('input[name=last]', 'Rivera');
  await page.fill('input[name=email]', 'not-an-email'); await save();
  ok(await page.evaluate(() => { const p = WT.settings().profile || {}; return p.first === 'Alex' && p.last === 'Rivera' && !p.email; }) && await page.locator('[data-pi-hint=email]').isVisible() && !(await page.locator('#toasts').textContent()).includes('saved'), 'bad email is not saved (inline hint, no toast); the rest is saved');
  await page.fill('input[name=email]', 'alex@example.org'); await save();
  ok(await page.evaluate(() => WT.settings().profile.email) === 'alex@example.org' && !(await page.locator('[data-pi-hint=email]').isVisible()), 'valid email saves and the hint goes away');
  // typing saves after a short pause, without redrawing the page (cursor stays in the box)
  await page.click('input[name=street]'); await page.keyboard.type('123 Main St', { delay: 20 });
  ok(!(await page.evaluate(() => (WT.settings().profile || {}).street)), 'not saved on every key');
  await page.waitForTimeout(900);
  ok(await page.evaluate(() => WT.settings().profile.street) === '123 Main St' && await page.evaluate(() => document.activeElement && document.activeElement.name) === 'street' && /Saved/.test(await page.locator('#piStatus').textContent()), 'saved ~0.6 s after typing stops; focus kept; "Saved" shown');
  await page.keyboard.type('X'); await page.evaluate(() => WTApp.refresh()); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.activeElement && document.activeElement.name === 'street' && document.activeElement.value === '123 Main StX' && document.activeElement.selectionStart === 12 && WT.settings().profile.street === '123 Main StX'), 'a redraw while typing saves first and keeps the cursor where it was');
  await page.keyboard.press('Backspace'); await page.waitForTimeout(800);
  await page.fill('input[name=unit]', 'Apt 4');
  await page.fill('input[name=city]', 'Austin'); await page.fill('input[name=state]', 'TX'); await page.fill('input[name=zip]', '78701'); await save();
  const prof = await page.evaluate(() => WT.settings().profile);
  ok(prof.first === 'Alex' && prof.last === 'Rivera' && prof.email === 'alex@example.org' && prof.street === '123 Main St' && prof.unit === 'Apt 4' && prof.city === 'Austin' && prof.state === 'TX' && prof.zip === '78701', 'first/last name, email and address saved');
  ok(await page.locator('input[name=email]').getAttribute('readonly') === null, 'email is editable when not signed in to Google');
  ok((await page.locator('.avatar').first().textContent()).trim() === 'AR', 'initials avatar');
  await go('dashboard');
  ok(/^Good (Morning|Afternoon|Evening), Alex$/.test((await page.locator('#main h1').textContent()).trim()), 'Overview greets by first name');
  await go('settings/personal');
  await page.fill('input[name=first]', '<img src=x onerror=alert(1)>'); await save();
  ok(!(await page.evaluate(() => WT.settings().profile.first)).includes('<') && await page.locator('#main img[src=x]').count() === 0, 'name cannot inject HTML');
  await page.fill('input[name=first]', 'Alex'); await save();
  // signed in with Google: email comes from Google and is locked
  await page.evaluate(() => { WT.saveSettings({ account: { email: 'alex.sample@gmail.com' } }); WTApp.refresh(); }); await page.waitForTimeout(200);
  ok(await page.locator('input[name=email]').inputValue() === 'alex.sample@gmail.com' && await page.locator('input[name=email]').getAttribute('readonly') !== null && /From Google/.test(await page.locator('#main').textContent()), 'Google email filled in and locked');
  await page.evaluate(() => { const i = document.querySelector('input[name=email]'); i.removeAttribute('readonly'); i.value = 'hacker@evil.com'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await save();
  ok(await page.evaluate(() => WT.settings().profile.email) === 'alex@example.org' && await page.locator('input[name=email]').inputValue() === 'alex.sample@gmail.com', 'Google email cannot be changed while signed in');
  await page.evaluate(() => { WT.saveSettings({ account: null }); WTApp.refresh(); }); await page.waitForTimeout(200);
  ok(await page.locator('input[name=email]').inputValue() === 'alex@example.org' && await page.locator('input[name=email]').getAttribute('readonly') === null, 'after signing out the typed email is back and editable');

  // photo
  const pf = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wtset-')), 'me.png'); fs.writeFileSync(pf, PNG);
  await page.setInputFiles('input[data-act-change=profilePhoto]', pf); await page.waitForTimeout(600);
  const photo = await page.evaluate(() => WT.settings().profile.photo || '');
  ok(/^data:image\/jpeg;base64,/.test(photo) && photo.length < 60000, 'photo saved as a small JPEG');
  ok(await page.evaluate(() => { const i = document.querySelector('.avatar img'); return i && i.naturalWidth === 192 && i.naturalHeight === 192; }), 'photo cropped to a square');
  ok(await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 192; const g = c.getContext('2d'); g.drawImage(i, 0, 0); const d = g.getImageData(96, 96, 1, 1).data; r(d[0] > 200 && d[1] > 200 && d[2] > 200); }; i.src = WT.settings().profile.photo; })), 'see-through areas become white, not black');
  await shot('settings-personal');
  await page.click('[data-act=removePhoto]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !WT.settings().profile.photo) && (await page.locator('.avatar').first().textContent()).trim() === 'AR', 'photo removed, initials back');

  // currency
  const before = await page.evaluate(() => WT.fmt(123456));
  await page.selectOption('select[data-act-change=currency]', 'EUR'); await page.waitForTimeout(200);
  ok(before === '$1,234.56' && await page.evaluate(() => WT.fmt(123456)) === '€1,234.56', 'currency symbol changes (€)');
  await go('dashboard');
  const dash = await page.locator('#main').textContent();
  ok((dash.match(/€\d/g) || []).length >= 3 && !/\$\d/.test(dash), 'dashboard amounts use € everywhere');
  await go('calendar');
  const cal = await page.locator('#main').textContent();
  ok(/€\d/.test(cal) && !/\$\d/.test(cal), 'calendar has no $ left');
  await go('settings/personal'); await page.selectOption('select[data-act-change=currency]', 'USD'); await page.waitForTimeout(200);

  // date format
  // more currencies; zero-decimal ones show no cents
  const curOpts = await page.locator('select[data-act-change=currency] option').evaluateAll(o => o.map(x => x.value));
  ok(curOpts.length >= 45 && curOpts[0] === 'USD' && ['JPY', 'KRW', 'CHF', 'SEK', 'ZAR', 'NGN', 'AED', 'BRL', 'VND'].every(c => curOpts.includes(c)), 'currency list has ' + curOpts.length + ' currencies, US dollar first');
  await page.selectOption('select[data-act-change=currency]', 'JPY'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.fmt(123456) === '¥1,235' && WT.settings().currency === 'JPY'), 'Japanese yen shows whole amounts (no .00)');
  await page.selectOption('select[data-act-change=currency]', 'CHF'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.fmt(123456)) === 'CHF 1,234.56', 'letter symbols get a space (CHF 1,234.56)');
  await page.selectOption('select[data-act-change=currency]', 'USD'); await page.waitForTimeout(200);

  // date format: a dropdown; every option shows today's date with the year
  const dfOpts = await page.locator('select[data-act-change=dateFormat] option').evaluateAll(o => o.map(x => [x.value, x.textContent]));
  const yr = String(new Date().getFullYear());
  ok(dfOpts.length === 7 && dfOpts.every(([, t]) => t.includes(yr)) && dfOpts[0][0] === 'mdy' && await page.locator('select[data-act-change=dateFormat]').inputValue() === 'mdy', 'date format dropdown: 7 formats, each with the year, "Nov 7, 2026" style by default');
  const want = { mdy: 'Nov 7, 2026', dmy: '7 Nov 2026', mdy_long: 'November 7, 2026', mdy_num: '11/07/2026', dmy_num: '07/11/2026', dmy_dot: '07.11.2026', ymd: '2026-11-07' };
  let allFmt = true;
  for (const [k, v] of Object.entries(want)) {
    await page.selectOption('select[data-act-change=dateFormat]', k); await page.waitForTimeout(120);
    const r = await page.evaluate(() => [WT.shortDate('2026-11-07'), WT.dateLabel('2026-11-07'), WT.settings().dateFormat]);
    if (r[0] !== v || r[1] !== 'Sat, ' + v || r[2] !== k) { allFmt = false; console.log('  ' + k + ': ' + r.join(' | ')); }
  }
  ok(allFmt, 'each format applies to short and long dates (with weekday)');
  // every place dates show follows it, with no clipping at 360px
  await page.setViewportSize({ width: 360, height: 760 });
  await page.selectOption('select[data-act-change=dateFormat]', 'mdy_long'); await page.waitForTimeout(150);
  const clipped = [];
  for (const r of ['bills', 'dashboard', 'calendar', 'history', 'paychecks']) {
    await go(r); await page.waitForTimeout(150);
    const res = await page.evaluate(() => {
      const text = document.querySelector('#main').textContent;
      const bad = [...document.querySelectorAll('#main *')].filter(e => { const s = getComputedStyle(e); if (s.display === 'none' || !e.offsetParent) return false; const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.right > window.innerWidth + 1) || e.closest('svg')) return false; for (let p = e.parentElement; p && p.id !== 'main'; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; } return true; }).map(e => e.className || e.tagName).slice(0, 3);
      return { long: /(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/.test(text), oldShort: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}\b(?!,? \d{4})(?!–)/.test(text), over: document.documentElement.scrollWidth > window.innerWidth + 1, bad };
    });
    if (!res.long || res.over || res.bad.length) clipped.push(r + JSON.stringify(res));
  }
  ok(clipped.length === 0, 'bills, overview, calendar, history and paychecks use the picked format, nothing wider than 360px' + (clipped.length ? ': ' + clipped.join(' ; ') : ''));
  await page.setViewportSize({ width: 390, height: 844 });
  await go('settings/personal');
  // an old saved value ('dm' from before) still works
  await page.evaluate(() => { WT.saveSettings({ dateFormat: 'dm' }); WTApp.refresh(); }); await page.waitForTimeout(150);
  ok(await page.evaluate(() => WT.shortDate('2026-11-07')) === '7 Nov 2026' && await page.locator('select[data-act-change=dateFormat]').inputValue() === 'dmy', 'old "7 Nov" setting becomes "7 Nov 2026"');
  await page.selectOption('select[data-act-change=dateFormat]', 'mdy'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => WT.dateLabel('2026-11-07', true)) === 'Sat, Nov 7, 2026', 'month-day dates');

  // settings survive reload; menu summaries
  await page.selectOption('select[data-act-change=dateFormat]', 'dmy_num'); await page.selectOption('select[data-act-change=currency]', 'GBP'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  ok(await page.evaluate(() => WT.fmt(100) === '£1.00' && WT.shortDate('2026-11-07') === '07/11/2026' && WT.settings().profile.first === 'Alex' && WT.settings().profile.zip === '78701'), 'personal info kept after restart');
  await go('settings');
  ok(/Alex Rivera/.test(await page.locator('.set-profile').textContent()), 'menu shows the name');

  // a restored backup can't smuggle in bad values
  const clean = await page.evaluate(() => { const d = { meta: { settings: { id: 'settings', profile: { first: 'A<script>', email: 'nope', zip: '<b>', photo: 'javascript:alert(1)' }, currency: 'BTC', dateFormat: 'xx' } } }; const r = WTStore.sanitizeData(d, WT.COLLS); return r.data.meta.settings; });
  ok(clean.profile && clean.profile.first === 'Ascript' && !clean.profile.email && !clean.profile.zip && !clean.profile.photo && !clean.currency && !clean.dateFormat, 'restored settings are cleaned');
  const old = await page.evaluate(() => { const d = { meta: { settings: { id: 'settings', profile: { name: 'Mary Jo Smith' } } } }; return WTStore.sanitizeData(d, WT.COLLS).data.meta.settings.profile; });
  ok(old.first === 'Mary' && old.last === 'Jo Smith', 'a single name from 1.2.5 is split into first and last');
  const kept = await page.evaluate(() => ['md', 'dm', 'ymd', 'dmy_dot', 'xx'].map(f => WTStore.sanitizeData({ meta: { settings: { id: 'settings', dateFormat: f, currency: 'KRW' } } }, WT.COLLS).data.meta.settings).map(s => (s.dateFormat || '-') + '/' + (s.currency || '-')));
  ok(JSON.stringify(kept) === JSON.stringify(['mdy/KRW', 'dmy/KRW', 'ymd/KRW', 'dmy_dot/KRW', '-/KRW']), 'backups keep the new date formats and currencies; old md/dm become mdy/dmy: ' + kept.join(' '));

  // Check data: duplicates and payments with no bill, cleaned up with a confirm and an Undo
  await page.evaluate(() => {
    const i = Object.values(WT.D.instances).find(x => x.templateId === 'bill_apartment' && x.periodMonth === '2026-11');
    WT.save('instances', Object.assign({}, i, { id: 'i_dup_test', createdAt: '2026-11-08' }));
    WT.save('payments', { id: 'pay_orphan_test', instanceId: 'i_gone', templateId: 'bill_gym', amountCents: 4200, date: '2026-10-02', voided: false });
    location.hash = '#/settings/data';
  }); await page.waitForTimeout(250);
  const instN = await page.evaluate(() => Object.keys(WT.D.instances).length);
  await page.click('[data-act=integrity]'); await page.waitForTimeout(200);
  const dc = await page.locator('.overlay').textContent();
  ok(/listed twice/.test(dc) && /£42\.00/.test(dc) && /not linked to any bill/.test(dc) && await page.locator('.overlay [data-ix=all]').count() === 1 && await page.locator('.overlay [data-ix=one]').count() === 2, 'Data check lists the duplicate and the payment with no bill, with Clean up and per-item buttons');
  if (SHOTS) await shot('data-check');
  await page.click('.overlay [data-ix=all]'); await page.waitForTimeout(200);
  ok(/Clean up duplicates/.test(await page.locator('.overlay').last().textContent()), 'Clean up asks first');
  await page.locator('.overlay').last().locator('button[type=submit]').click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => Object.keys(WT.D.instances).length) === instN - 1 && await page.evaluate(() => !!WT.D.payments.pay_orphan_test) && /Fixed 1 item/.test(await page.locator('#toasts').textContent()), 'Clean up removed the extra copy and left the payment with no bill alone');
  ok(await page.locator('.overlay [data-ix=one]').count() === 1, 'the check reopens with what is left');
  await page.click('.overlay [data-ix=one]'); await page.waitForTimeout(200);
  await page.locator('.overlay').last().locator('button[type=submit]').click(); await page.waitForTimeout(300);
  ok(await page.evaluate(() => !WT.D.payments.pay_orphan_test && WT.integrityIssues().length === 0) && await page.locator('.overlay').count() === 0, 'Delete removes the payment with no bill (after confirming)');
  await page.locator('#toasts .toast', { hasText: 'Fixed 1 item' }).last().locator('button', { hasText: 'Undo' }).click(); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.D.payments.pay_orphan_test && WT.D.payments.pay_orphan_test.amountCents === 4200), 'Undo puts the payment back');
  await page.waitForTimeout(600); // let the save reach IndexedDB
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  ok(await page.evaluate(() => !!WT.D.payments.pay_orphan_test && !WT.D.instances.i_dup_test), 'clean-up and undo are saved (after a restart)');
  await page.evaluate(() => WT.repairIntegrity(WT.integrityIssues())); await page.waitForTimeout(400);

  // dark mode screenshot
  if (SHOTS) {
    const dk = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'dark' });
    await dk.addInitScript(() => { try { localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1'); } catch (e) { } });
    const dp = await dk.newPage(); await dp.goto(FILE + '#/settings'); await dp.waitForFunction(() => window.__wtReady); await dp.waitForTimeout(400);
    await dp.screenshot({ path: path.join(SHOTS, 'settings-menu-dark.png') }); await dk.close();
  }
  // address suggestions (OpenStreetMap) with a stand-in for the Android lookup (real lookups only run in the app)
  {
    const ac = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: SHOTS ? 2 : 1 });
    await ac.addInitScript(() => {
      localStorage.setItem('wt.skipOnboarding', '1'); localStorage.setItem('wt.demoDone', '1');
      const send = d => setTimeout(() => window.dispatchEvent(new CustomEvent('address', { detail: d })), 20);
      let data = {}; window.__addr = { searches: [] };
      window.AndroidBridge = {
        addressSupported: () => true,
        addressSearch(q, seq) { __addr.searches.push(q); data[seq] = JSON.stringify([
          { id: 'osm0', main: '123 Main Street', secondary: 'Austin, Texas 78701', street: '123 Main Street', city: 'Austin', state: 'Texas', zip: '78701', countrycode: 'US' },
          { id: 'osm1', main: '123 Main Street', secondary: 'Austin, Minnesota', street: '123 Main Street', city: 'Austin', state: 'Minnesota', zip: '', countrycode: 'US' },
          { id: 'osm2', main: '<img src=x onerror=alert(1)>', secondary: 'x', street: '<img src=x onerror=alert(1)>', countrycode: 'US' }]); send({ op: 'search', seq, ok: true }); },
        addressTake(seq) { const d = data[seq]; delete data[seq]; return d; },
        googleDriveSupported: () => true, googleSignIn() { }, googleBackup() { }, googleRestore() { }, googleRestoreData() { return null; }, biometricStatus: () => 'none', saveFile: () => 'ok', shareFile: () => 'ok', setReminders() { }, requestNotificationPermission() { }, notificationsEnabled: () => true, appVersion: () => 'test',
      };
    });
    const ap = await ac.newPage(); ap.on('pageerror', e => errors.push('addr: ' + e.message));
    await ap.goto(FILE); await ap.waitForFunction(() => window.__wtReady);
    // this context has no sample data: a new install starts blank
    ok(await ap.evaluate(() => Object.keys(WT.D.templates).length === 0 && Object.keys(WT.D.debts).length === 0 && Object.keys(WT.D.incomes).length === 0), 'blank start: no bills, debts or income without sample data');
    await ap.evaluate(() => { localStorage.removeItem('wt.restoreAfterReset'); location.hash = '#/settings/personal'; }); await ap.waitForTimeout(300);
    await ap.click('input[name=street]'); await ap.keyboard.type('12', { delay: 30 }); await ap.waitForTimeout(600);
    ok(await ap.evaluate(() => __addr.searches.length) === 0, 'address: no lookup before 4 characters');
    await ap.keyboard.type('3 Main St', { delay: 30 }); await ap.waitForTimeout(800);
    ok(await ap.evaluate(() => __addr.searches.length) === 1, 'address: one lookup after you pause typing (not one per key)');
    ok(await ap.locator('#addrSug .addr-it').count() === 3 && /OpenStreetMap/.test(await ap.locator('#addrSug').textContent()) && !/Google/.test(await ap.locator('#addrSug').textContent()), 'address: OpenStreetMap suggestions with credit');
    ok(await ap.locator('#addrSug img').count() === 0, 'address: suggestion text cannot inject HTML');
    if (SHOTS) { await ap.waitForTimeout(200); await ap.screenshot({ path: path.join(SHOTS, 'address-suggestions.png') }); }
    await ap.locator('#addrSug .addr-it').first().click(); await ap.waitForTimeout(300);
    const vals = await ap.evaluate(() => ['street', 'city', 'state', 'zip'].map(n => document.querySelector('[data-pi] [name=' + n + ']').value));
    ok(JSON.stringify(vals) === JSON.stringify(['123 Main Street', 'Austin', 'TX', '78701']) && await ap.locator('#addrSug').count() === 0, 'address: picking one fills street, city, state (as TX), ZIP');
    await ap.waitForTimeout(700);
    ok(await ap.evaluate(() => __addr.searches.length) === 1, 'address: filling in does not trigger another lookup');
    ok(await ap.evaluate(() => WT.settings().profile.zip === '78701' && WT.settings().profile.state === 'TX' && WT.settings().profile.street === '123 Main Street' && WT.settings().profile.city === 'Austin'), 'address: saved right after picking a suggestion (no Save button)');
    ok(/Address filled in and saved/.test(await ap.locator('#toasts').textContent()) && !/Tap Save/.test(await ap.locator('#toasts').textContent()), 'address: toast says it was saved');
    // a suggestion without a ZIP asks for it; typing it saves it too
    await ap.fill('input[name=street]', ''); await ap.click('input[name=street]'); await ap.keyboard.type('123 Main Str', { delay: 20 }); await ap.waitForTimeout(800);
    await ap.locator('#addrSug .addr-it').nth(1).click(); await ap.waitForTimeout(300);
    ok(/Add the ZIP code/.test(await ap.locator('#toasts').textContent()) && await ap.evaluate(() => WT.settings().profile.state === 'MN' && !WT.settings().profile.zip), 'address: picking one without a ZIP saves it and asks for the ZIP');
    await ap.fill('input[name=zip]', '55912'); await ap.waitForTimeout(800);
    ok(await ap.evaluate(() => WT.settings().profile.zip) === '55912', 'address: ZIP typed afterwards saves by itself');
    await ap.fill('input[name=zip]', '<x'); await ap.locator('input[name=city]').focus(); await ap.waitForTimeout(300);
    ok(await ap.evaluate(() => WT.settings().profile.zip) === '55912' && await ap.locator('[data-pi-hint=zip]').isVisible(), 'address: a bad ZIP keeps the last good one and shows a hint');
    if (SHOTS) await ap.screenshot({ path: path.join(SHOTS, 'personal-autosave.png') });
    await ac.close();
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
