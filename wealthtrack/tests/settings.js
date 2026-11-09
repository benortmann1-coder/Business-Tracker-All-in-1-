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
  const save = async () => { await page.click('[data-act=saveProfile]'); await page.waitForTimeout(250); };
  await page.fill('input[name=first]', 'Alex'); await page.fill('input[name=last]', 'Rivera');
  await page.fill('input[name=email]', 'not-an-email'); await save();
  ok(/Check the email/.test(await page.locator('#toasts').textContent()) && !(await page.evaluate(() => (WT.settings().profile || {}).first)), 'bad email rejected, nothing saved');
  await page.fill('input[name=email]', 'alex@example.org');
  await page.fill('input[name=street]', '123 Main St'); await page.fill('input[name=unit]', 'Apt 4');
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
  await page.evaluate(() => { const i = document.querySelector('input[name=email]'); i.removeAttribute('readonly'); i.value = 'hacker@evil.com'; }); await save();
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
  await page.click('[data-act=dateFormat][data-v=dm]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.dateLabel('2026-11-07', true)) === 'Sat, 7 Nov 2026' && await page.evaluate(() => WT.shortDate('2026-11-07')) === '7 Nov', 'day-month dates');
  await page.click('[data-act=dateFormat][data-v=md]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => WT.dateLabel('2026-11-07', true)) === 'Sat, Nov 7, 2026', 'month-day dates');

  // settings survive reload; menu summaries
  await page.click('[data-act=dateFormat][data-v=dm]'); await page.selectOption('select[data-act-change=currency]', 'GBP'); await page.waitForTimeout(300);
  await page.reload(); await page.waitForFunction(() => window.__wtReady);
  ok(await page.evaluate(() => WT.fmt(100) === '£1.00' && WT.shortDate('2026-11-07') === '7 Nov' && WT.settings().profile.first === 'Alex' && WT.settings().profile.zip === '78701'), 'personal info kept after restart');
  await go('settings');
  ok(/Alex Rivera/.test(await page.locator('.set-profile').textContent()), 'menu shows the name');

  // a restored backup can't smuggle in bad values
  const clean = await page.evaluate(() => { const d = { meta: { settings: { id: 'settings', profile: { first: 'A<script>', email: 'nope', zip: '<b>', photo: 'javascript:alert(1)' }, currency: 'BTC', dateFormat: 'xx' } } }; const r = WTStore.sanitizeData(d, WT.COLLS); return r.data.meta.settings; });
  ok(clean.profile && clean.profile.first === 'Ascript' && !clean.profile.email && !clean.profile.zip && !clean.profile.photo && !clean.currency && !clean.dateFormat, 'restored settings are cleaned');
  const old = await page.evaluate(() => { const d = { meta: { settings: { id: 'settings', profile: { name: 'Mary Jo Smith' } } } }; return WTStore.sanitizeData(d, WT.COLLS).data.meta.settings.profile; });
  ok(old.first === 'Mary' && old.last === 'Jo Smith', 'a single name from 1.2.5 is split into first and last');

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
    ok(!(await ap.evaluate(() => (WT.settings().profile || {}).zip)), 'address: nothing saved until you tap Save');
    await ap.click('[data-act=saveProfile]'); await ap.waitForTimeout(300);
    ok(await ap.evaluate(() => WT.settings().profile.zip === '78701' && WT.settings().profile.state === 'TX'), 'address: saved with Save');
    await ac.close();
  }
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\n${pass} passed, ${fail} failed (aborted)`); process.exit(1); });
