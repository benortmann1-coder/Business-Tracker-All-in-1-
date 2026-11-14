// WealthTrack color themes (palettes).
// The Theme setting (System / Light / Dark / Soft blue / Seasonal / Random) picks light or dark;
// the palette recolors the app on top of System, Light or Dark. Palettes are fixed constants:
// settings only ever hold a palette id from this list, never CSS (audit S2).
// Every palette is checked for WCAG AA contrast by tests/themes.test.js.
(function (root) {
  'use strict';
  const P = {
    default: { name: 'Default', swatch: ['#0f5c4a', '#f6f5f1'] },
    ocean: {
      name: 'Ocean', swatch: ['#0b5d8c', '#f1f5f8'],
      light: { bg: '#f1f5f8', surface: '#ffffff', 'surface-2': '#f8fafc', sunken: '#e6edf3', hover: '#edf2f6', line: '#dbe3ea', 'line-2': '#c6d1db', rule: '#14212d',
        ink: '#13202b', 'ink-2': '#475665', 'ink-3': '#5f6c78', brand: '#0b5d8c', 'brand-ink': '#084a70', 'brand-soft': '#e1edf5', 'on-brand': '#ffffff', 'paid-soft': '#e8f3eb' },
      dark: { bg: '#0d1318', surface: '#131b22', 'surface-2': '#18212a', sunken: '#0a0f13', hover: '#1b252e', line: '#24313c', 'line-2': '#33424f', rule: '#c8d3dc',
        ink: '#e9eff4', 'ink-2': '#b0bcc7', 'ink-3': '#8f9ca8', brand: '#5fb0e3', 'brand-ink': '#86c6ee', 'brand-soft': '#13293a', 'on-brand': '#04192a' },
    },
    plum: {
      name: 'Plum', swatch: ['#6b2f86', '#f6f3f7'],
      light: { bg: '#f6f3f7', surface: '#ffffff', 'surface-2': '#fbf9fb', sunken: '#ece7ef', hover: '#f2eef4', line: '#e3dce7', 'line-2': '#d1c7d7', rule: '#241a2b',
        ink: '#1f1724', 'ink-2': '#534a59', 'ink-3': '#69606f', brand: '#6b2f86', 'brand-ink': '#56236c', 'brand-soft': '#efe6f3', 'on-brand': '#ffffff', 'paid-soft': '#e8f3eb' },
      dark: { bg: '#141016', surface: '#1b161e', 'surface-2': '#201a24', sunken: '#0f0c11', hover: '#241e28', line: '#2e2634', 'line-2': '#3e3446', rule: '#d6cddb',
        ink: '#f0ebf2', 'ink-2': '#bdb3c3', 'ink-3': '#9b91a2', brand: '#c08fdb', 'brand-ink': '#d3aee6', 'brand-soft': '#2c1f36', 'on-brand': '#1e0d29' },
    },
    slate: {
      name: 'Slate', swatch: ['#3d4f63', '#f2f4f6'],
      light: { bg: '#f2f4f6', surface: '#ffffff', 'surface-2': '#f8f9fa', sunken: '#e8ebee', hover: '#eef0f3', line: '#dde1e6', 'line-2': '#c9cfd6', rule: '#1a1f25',
        ink: '#171c22', 'ink-2': '#4a525c', 'ink-3': '#636b75', brand: '#3d4f63', 'brand-ink': '#2f3e4f', 'brand-soft': '#e6eaef', 'on-brand': '#ffffff', 'paid-soft': '#e8f3eb' },
      dark: { bg: '#111417', surface: '#171b1f', 'surface-2': '#1c2126', sunken: '#0c0e10', hover: '#20252b', line: '#2a3037', 'line-2': '#38404a', rule: '#cdd3d9',
        ink: '#eceff2', 'ink-2': '#b4bbc3', 'ink-3': '#939ba4', brand: '#9fb3c8', 'brand-ink': '#bccbdb', 'brand-soft': '#222c37', 'on-brand': '#0f1720' },
    },
    espresso: {
      name: 'Espresso', swatch: ['#5c4331', '#f5f1ec'],
      light: { bg: '#f5f1ec', surface: '#ffffff', 'surface-2': '#faf8f5', sunken: '#ebe5dd', hover: '#f1ece6', line: '#e3dbd1', 'line-2': '#d2c6b8', rule: '#241c15',
        ink: '#211912', 'ink-2': '#55493f', 'ink-3': '#6c6056', brand: '#5c4331', 'brand-ink': '#4a3526', 'brand-soft': '#eee6de', 'on-brand': '#ffffff', 'paid-soft': '#e8f3eb' },
      dark: { bg: '#14110e', surface: '#1b1713', 'surface-2': '#211c17', sunken: '#0f0c0a', hover: '#252019', line: '#302922', 'line-2': '#40372e', rule: '#d9cfc4',
        ink: '#f1ece6', 'ink-2': '#c0b5a9', 'ink-3': '#9e9286', brand: '#c4b08e', 'brand-ink': '#dccaa8', 'brand-soft': '#2e241b', 'on-brand': '#1f150c' },
    },
    contrast: {
      name: 'High contrast', swatch: ['#000000', '#ffffff'],
      light: { bg: '#ffffff', surface: '#ffffff', 'surface-2': '#ffffff', sunken: '#f0f0f0', hover: '#ebebeb', line: '#8a8a8a', 'line-2': '#5c5c5c', rule: '#000000',
        ink: '#000000', 'ink-2': '#1f1f1f', 'ink-3': '#3d3d3d', brand: '#003f7d', 'brand-ink': '#002e5c', 'brand-soft': '#e3ecf7', 'on-brand': '#ffffff',
        paid: '#0b5d2a', 'paid-soft': '#e2f2e7', due: '#6b3f00', 'due-ring': '#8a5300', 'due-soft': '#fbeed6', over: '#8f0f06', 'over-soft': '#fde5e2',
        partial: '#123f8a', 'partial-soft': '#e3ebf8', skip: '#4a4a4a', 'skip-soft': '#ececec', auto: '#3d2f9e', 'auto-soft': '#ebe8fa' },
      dark: { bg: '#000000', surface: '#0a0a0a', 'surface-2': '#111111', sunken: '#000000', hover: '#1a1a1a', line: '#7a7a7a', 'line-2': '#a0a0a0', rule: '#ffffff',
        ink: '#ffffff', 'ink-2': '#e6e6e6', 'ink-3': '#c7c7c7', brand: '#8cc8ff', 'brand-ink': '#b3daff', 'brand-soft': '#0f2740', 'on-brand': '#000000',
        paid: '#7ee2a8', 'paid-soft': '#0c2a18', due: '#ffcc66', 'due-ring': '#ffcc66', 'due-soft': '#2e2207', over: '#ff9a8c', 'over-soft': '#3a0f0a',
        partial: '#a6c8ff', 'partial-soft': '#10223f', skip: '#b5b5b5', 'skip-soft': '#1f1f1f', auto: '#c3bcff', 'auto-soft': '#1d1940' },
    },
  };
  const IDS = Object.keys(P);
  const HEX = /^#[0-9a-f]{6}$/i;
  const KEY = /^[a-z0-9-]+$/;
  // Modes a palette can sit on top of. Soft blue, Seasonal and Random are color themes of their own.
  const PALETTE_MODES = ['system', 'light', 'dark'];

  const block = vars => Object.keys(vars).filter(k => KEY.test(k) && HEX.test(vars[k])).map(k => `--${k}: ${vars[k]};`).join(' ');
  function css() {
    let out = '';
    for (const id of IDS) {
      const p = P[id]; if (!p.light) continue;
      const sel = `:root[data-palette="${id}"]`;
      out += `${sel} { ${block(p.light)} color-scheme: light; }\n`;
      out += `@media (prefers-color-scheme: dark) { ${sel}:not([data-theme="light"]) { ${block(p.dark)} color-scheme: dark; } }\n`;
      out += `${sel}[data-theme="dark"] { ${block(p.dark)} color-scheme: dark; }\n`;
    }
    return out;
  }

  const valid = id => IDS.includes(id);
  // the palette actually shown: only on System/Light/Dark, and only if allowed (Pro)
  function effective(palette, mode, allowed) {
    if (!valid(palette) || palette === 'default') return 'default';
    if (!PALETTE_MODES.includes(mode || 'system')) return 'default';
    if (!allowed) return 'default';
    return palette;
  }
  // page background for the browser theme-color and Android's system bars
  function barColor(palette, dark) {
    const p = P[palette];
    if (!p || !p.light) return null;
    return (dark ? p.dark : p.light).bg;
  }

  // PRO-GATE: color themes are a Pro feature. The one place that decides it; until the Pro
  // upgrade defines WT_isPro(), everything is unlocked.
  const themesPro = () => (typeof root.WT_isPro === 'function' ? !!root.WT_isPro() : true);

  const api = { themesPro, PALETTES: P, IDS, PALETTE_MODES, css, valid, effective, barColor };

  if (typeof document !== 'undefined') {
    const st = document.createElement('style');
    st.id = 'wt-palettes';
    st.textContent = css();
    (document.head || document.documentElement).appendChild(st);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WTThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
