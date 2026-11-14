// Contrast checks for every color theme × light/dark (WCAG AA), plus palette handling.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const T = require('../web/themes.js');

const cssText = fs.readFileSync(path.join(__dirname, '..', 'web', 'styles.css'), 'utf8');
function varsOf(selectorStart) {
  const i = cssText.indexOf(selectorStart);
  assert.ok(i >= 0, 'missing ' + selectorStart);
  const body = cssText.slice(cssText.indexOf('{', i) + 1, cssText.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2];
  return out;
}
const BASE = { light: varsOf(':root {'), dark: varsOf(':root[data-theme="dark"] {') };

const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const hue = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
// CIE76 color difference: about 2 is barely visible, 20+ reads as a different color
const lab = hex => {
  const lin = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const X = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047, Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2], Z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const deltaE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
const hueGap = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };

const TEXT = ['ink', 'ink-2', 'ink-3'];
const BGS = ['bg', 'surface', 'surface-2'];
const STATUS = ['paid', 'due', 'over', 'partial'];

for (const id of T.IDS) {
  if (!T.PALETTES[id].light) continue;
  for (const mode of ['light', 'dark']) {
    const v = Object.assign({}, BASE[mode], T.PALETTES[id][mode]);
    test(`${id} ${mode}: text meets AA (4.5:1)`, () => {
      for (const t of TEXT) for (const b of BGS) assert.ok(ratio(v[t], v[b]) >= 4.5, `${t} on ${b}: ${ratio(v[t], v[b]).toFixed(2)}`);
      for (const t of ['ink', 'ink-2']) assert.ok(ratio(v[t], v.sunken) >= 4.5, `${t} on sunken: ${ratio(v[t], v.sunken).toFixed(2)}`);
      assert.ok(ratio(v['ink-3'], v.sunken) >= 3, 'ink-3 on sunken (small print, 3:1 minimum)');
    });
    test(`${id} ${mode}: brand colors meet AA`, () => {
      for (const b of BGS) assert.ok(ratio(v.brand, v[b]) >= 4.5, `brand on ${b}: ${ratio(v.brand, v[b]).toFixed(2)}`);
      assert.ok(ratio(v['on-brand'], v.brand) >= 4.5, `on-brand on brand: ${ratio(v['on-brand'], v.brand).toFixed(2)}`);
      assert.ok(ratio(v['brand-ink'], v['brand-soft']) >= 4.5, `brand-ink on brand-soft: ${ratio(v['brand-ink'], v['brand-soft']).toFixed(2)}`);
      assert.ok(ratio(v.brand, v['brand-soft']) >= 4.5, `brand on brand-soft: ${ratio(v.brand, v['brand-soft']).toFixed(2)}`);
    });
    test(`${id} ${mode}: status colors readable and distinct`, () => {
      for (const s of STATUS) {
        for (const b of ['surface', 'bg']) assert.ok(ratio(v[s], v[b]) >= 4.5, `${s} on ${b}: ${ratio(v[s], v[b]).toFixed(2)}`);
        assert.ok(ratio(v[s], v[s + '-soft']) >= 4.5, `${s} on ${s}-soft: ${ratio(v[s], v[s + '-soft']).toFixed(2)}`);
      }
      for (let i = 0; i < STATUS.length; i++) for (let j = i + 1; j < STATUS.length; j++) {
        assert.ok(hueGap(v[STATUS[i]], v[STATUS[j]]) >= 25, `${STATUS[i]} vs ${STATUS[j]} too similar`);
      }
      // the accent color must not read as "overdue" or "due soon"
      for (const s of ['over', 'due']) assert.ok(deltaE(v.brand, v[s]) >= 25, `brand looks like ${s}: ΔE ${deltaE(v.brand, v[s]).toFixed(1)}`);
    });
  }
}

test('palette ids: only known ids, default otherwise', () => {
  assert.strictEqual(T.effective('ocean', 'system', true), 'ocean');
  assert.strictEqual(T.effective('ocean', 'dark', true), 'ocean');
  assert.strictEqual(T.effective('ocean', 'seasonal', true), 'default');
  assert.strictEqual(T.effective('ocean', 'blue', true), 'default');
  assert.strictEqual(T.effective('ocean', 'system', false), 'default', 'locked without Pro');
  assert.strictEqual(T.effective('nope', 'system', true), 'default');
  assert.strictEqual(T.effective('__proto__', 'system', true), 'default');
  assert.strictEqual(T.valid('constructor'), false);
});

test('generated CSS only holds hex colors and known selectors', () => {
  const c = T.css();
  for (const id of T.IDS) if (T.PALETTES[id].light) assert.ok(c.includes(`[data-palette="${id}"]`));
  assert.ok(!/url\(|expression|<|javascript:/i.test(c));
  for (const m of c.matchAll(/--[a-z0-9-]+:\s*([^;]+);/g)) assert.match(m[1], /^#[0-9a-f]{6}$/i);
});

test('restore keeps exactly the palette ids themes.js knows', () => {
  const store = fs.readFileSync(path.join(__dirname, '..', 'web', 'store.js'), 'utf8');
  const m = store.match(/\[([^\]]+)\]\.includes\(m\.palette\)/);
  assert.ok(m, 'store.js must whitelist m.palette');
  const ids = m[1].split(',').map(x => x.trim().replace(/'/g, ''));
  assert.deepStrictEqual(ids.sort(), T.IDS.slice().sort());
});
