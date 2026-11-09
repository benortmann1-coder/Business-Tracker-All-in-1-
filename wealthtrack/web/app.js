/* WealthTrack UI (vanilla JS, no network). Depends on core.js, store.js, seed.js, xlsx.js. */
(function () {
  'use strict';
  const W = window.WT, S = window.WTStore;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = c => W.fmt(c);
  const fmt0 = c => W.fmt(c, { noCents: Math.abs(c) >= 100000 });
  const today = () => W.todayStr();
  // "Good Morning / Afternoon / Evening" from the phone's local time
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'; };
  // Demo for new users: 6 fictional bills + 2 fictional debts (web/demo.js), kept in memory only and never saved.
  const DEMO = { on: false, real: null };
  const curMonth = () => W.monthOf(today());
  const Bridge = window.AndroidBridge || null;
  const APP_VERSION = '1.4.3'; // keep in sync with android/app/build.gradle versionName

  // ------------------------------------------------------------ icons
  const P = {
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 11.5h.01M10.5 7.5h.01M15.5 7.5h.01', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01', db: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    bills: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4',
    wallet: 'M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2zM16 14.5h.01',
    cal: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
    card: 'M2 6h20v12H2zM2 10h20M6 15h4',
    pie: 'M12 3v9h9A9 9 0 1 1 12 3zM15 3.5A9 9 0 0 1 20.5 9H15z',
    target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
    gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    plus: 'M12 5v14M5 12h14', check: 'M20 6 9 17l-5-5', dots: 'M12 6h.01M12 12h.01M12 18h.01', chevL: 'M15 18l-6-6 6-6', chevR: 'M9 18l6-6-6-6',
    x: 'M18 6 6 18M6 6l12 12', alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3', download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
    edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', play: 'M5 3l14 9-14 9z',
    ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8', skip: 'M5 4l10 8-10 8zM19 5v14', cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20', undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8', clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    repeat: 'M17 2l4 4-4 4M3 11V10a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    up: 'M18 15l-6-6-6 6', down: 'M6 9l6 6 6-6', receipt: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6', trend: 'M3 17l6-6 4 4 8-8M14 7h7v7', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  };
  class UserError extends Error { }
  const isUserErr = e => e instanceof UserError || /^(Amount must|Enter |Pick |Type )/.test(e && e.message || '');
  const ic = (n, cls) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${cls ? ' class="' + cls + '"' : ''} aria-hidden="true"><path d="${P[n] || ''}"/></svg>`;

  // ------------------------------------------------------------ UI state (per-device convenience only)
  const ui = Object.assign({ route: 'dashboard', month: curMonth(), billFilter: 'all', billSort: 'due-asc', billGroup: 'none', upRange: '14', upGroup: 'timeline', upPaid: false, billSearch: '', billCat: '', billsTab: 'month', pcKey: null, expSearch: '', expCat: '', expSort: 'date', histSearch: '', histKind: '', histSort: 'date-desc', histFrom: '', histTo: '', payoffExtra: 10000, calMonth: curMonth(), repMonth: curMonth() }, (() => { try { return JSON.parse(localStorage.getItem('wt.ui') || '{}'); } catch (e) { return {}; } })());
  // ui comes from localStorage (untrusted): keep only well-formed values
  ['month', 'calMonth', 'repMonth'].forEach(k => { if (!/^\d{4}-\d{2}$/.test(ui[k] || '')) ui[k] = curMonth(); });
  ['histFrom', 'histTo'].forEach(k => { if (!/^(\d{4}-\d{2}-\d{2})?$/.test(ui[k] || '')) ui[k] = ''; });
  ['billSearch', 'billCat', 'expSearch', 'expCat', 'histSearch', 'histKind', 'billFilter', 'billSort', 'billView', 'billsTab', 'expSort', 'histSort'].forEach(k => { if (typeof ui[k] !== 'string') ui[k] = ''; else ui[k] = ui[k].slice(0, 200); });
  if (!Number.isInteger(ui.payoffExtra) || ui.payoffExtra < 0) ui.payoffExtra = 10000;
  if (ui.pcKey != null && typeof ui.pcKey !== 'string') ui.pcKey = null;
  // with app lock on, don't leave typed search text (bill names) in unencrypted localStorage
  function saveUi() { try { const u = Object.assign({}, ui); if (S.key) { u.billSearch = u.expSearch = u.histSearch = ''; } localStorage.setItem('wt.ui', JSON.stringify(u)); } catch (e) { /* storage blocked */ } }
  const IMG_DATA = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const safeImg = u => (typeof u === 'string' && IMG_DATA.test(u)) ? u : '';

  // ------------------------------------------------------------ routing
  const ROUTES = [
    ['dashboard', 'Dashboard', 'home'], ['bills', 'Bills', 'bills'], ['paychecks', 'Paychecks', 'wallet'], ['calendar', 'Calendar', 'cal'],
    ['expenses', 'Expenses', 'cash'], ['debts', 'Debt', 'card'], ['smart', 'Smart Budget', 'sliders'], ['goals', 'Savings goals', 'target'],
    ['reports', 'Reports', 'chart'], ['progress', 'Progress', 'trend'], ['history', 'History', 'list'], ['settings', 'Settings', 'gear'],
  ];
  const MOBILE = ['dashboard', 'bills', 'paychecks', 'calendar'];
  function go(r) { location.hash = '#/' + r; }
  function readRoute() { const full = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; let [r, sub] = full.split('/'); if (r === 'budgets') r = 'smart'; /* the old Budgets page became Smart Budget */ ui.route = ROUTES.some(x => x[0] === r) ? r : 'dashboard'; ui.setSec = ui.route === 'settings' && SET_SECTIONS.some(x => x[0] === sub) ? sub : ''; }

  // ------------------------------------------------------------ shell
  const NAV_GROUPS = [
    ['Overview', ['dashboard', 'bills', 'paychecks', 'calendar']],
    ['Money', ['expenses', 'smart', 'debts', 'goals']],
    ['Records', ['reports', 'progress', 'history', 'settings']],
  ];
  function shell() {
    const item = id => { const r = ROUTES.find(x => x[0] === id); return `<a class="nav-item" href="#/${id}" data-nav="${id}">${ic(r[2])}<span>${r[1]}</span>${id === 'bills' ? '<span class="count" id="navOverdue"></span>' : ''}</a>`; };
    document.body.innerHTML = `
      <div class="app">
        <aside class="side" aria-label="Main navigation">
          <div class="brand"><div class="logo">${ic('trend')}</div>WealthTrack</div>
          ${NAV_GROUPS.map(([label, ids]) => `<nav class="nav-group"><span class="eyebrow">${label}</span>${ids.map(item).join('')}</nav>`).join('')}
          <div class="spacer"></div>
          <div class="side-foot"><i class="dot"></i><span id="saveState">Saved on this device</span></div>
        </aside>
        <main class="main" id="main"></main>
      </div>
      <nav class="bottom-nav" aria-label="Main navigation">
        ${MOBILE.map(id => { const r = ROUTES.find(x => x[0] === id); return `<button data-nav-btn="${id}">${ic(r[2])}<span>${id === 'dashboard' ? 'Home' : r[1]}</span></button>`; }).join('')}
        <button data-act="moreMenu" data-nav-btn="more">${ic('grid')}<span>More</span></button>
      </nav>
      <button class="fab" data-act="quickAdd" aria-label="Add" title="Add an expense, bill or income">${ic('plus')}</button>
      <div class="toast-wrap" id="toasts" role="status" aria-live="polite"></div>
      <div class="tip" id="tip"></div>`;
  }
  function render() {
    readRoute(); applyDisplay();
    const main = $('#main'); if (!main) return;
    $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === ui.route));
    const viewedMonth = ui.route === 'bills' && (ui.billsTab || 'month') === 'month' && /^\d{4}-\d{2}$/.test(ui.month || '') ? ui.month : curMonth();
    const monthTint = monthColorSlot(viewedMonth);
    if (monthTint) document.body.dataset.month = monthTint; else delete document.body.dataset.month;
    const oc = $('#navOverdue'); if (oc) { const n = W.overdue().length; oc.textContent = n ? n : ''; oc.title = n ? n + ' overdue' : ''; }
    $$('[data-nav-btn]').forEach(b => b.classList.toggle('active', b.dataset.navBtn === ui.route || (b.dataset.navBtn === 'more' && !MOBILE.includes(ui.route))));
    const y = window.scrollY;
    try { main.innerHTML = demoBar() + (VIEWS[ui.route] || VIEWS.dashboard)(); }
    catch (e) { console.error(e); main.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="muted">${esc(e.message)}</p></div>`; }
    if (render.keepScroll) window.scrollTo(0, y); else window.scrollTo(0, 0);
    render.keepScroll = false;
    (AFTER[ui.route] || (() => { }))();
    saveUi();
  }
  function refresh() { try { W.applyAutopay(); } catch (e) { console.error(e); } render.keepScroll = true; render(); scheduleReminders(); }

  // ------------------------------------------------------------ toasts / modals / menus
  function toast(msg, opts) {
    opts = opts || {};
    const el = document.createElement('div'); el.className = 'toast' + (opts.error ? ' err' : '');
    el.innerHTML = `<span>${esc(msg)}</span>${opts.undo ? '<button>Undo</button>' : ''}`;
    if (opts.undo) el.querySelector('button').onclick = () => { opts.undo(); el.remove(); };
    const wrap = $('#toasts'); if (!wrap) { console.warn(msg); return; }
    wrap.appendChild(el); setTimeout(() => el.remove(), opts.undo ? 6000 : 3200);
  }
  let modalStack = [];
  function modal(o) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<form class="modal${o.wide ? ' wide' : ''}" novalidate>
      <div class="modal-h"><h2>${o.title}</h2><button type="button" class="btn ghost icon" data-close aria-label="Close">${ic('x')}</button></div>
      <div class="modal-b">${o.body || ''}</div>
      ${o.footer !== false ? `<div class="modal-f">${o.footer || `<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">${o.submit || 'Save'}</button>`}</div>` : ''}
    </form>`;
    document.body.appendChild(ov);
    const form = ov.querySelector('form');
    const close = () => { ov.remove(); modalStack = modalStack.filter(m => m !== close); };
    modalStack.push(close);
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    $$('[data-close]', ov).forEach(b => b.onclick = close);
    let busy = false;
    form.addEventListener('submit', e => {
      e.preventDefault();
      if (busy) return;
      if (!o.onSubmit) return close();
      try {
        const r = o.onSubmit(Object.fromEntries(new FormData(form)), form, close);
        if (r && typeof r.then === 'function') { busy = true; $$('[type=submit]', form).forEach(b => b.disabled = true); r.then(v => { if (v !== false) close(); }, err => { if (!isUserErr(err)) console.error(err); toast(err.message || String(err), { error: true }); }).finally(() => { busy = false; $$('[type=submit]', form).forEach(b => b.disabled = false); }); return; }
        if (r !== false) close();
      } catch (err) { if (!isUserErr(err)) console.error(err); toast(err.message, { error: true }); }
    });
    if (o.onMount) o.onMount(form, close);
    const first = form.querySelector('[autofocus]'); if (first && window.matchMedia('(min-width: 641px)').matches) setTimeout(() => first.focus(), 50);
    return { el: form, close };
  }
  function confirmBox(title, html, okLabel, danger) {
    return new Promise(res => {
      let done = false;
      const m = modal({ title, body: `<div class="muted">${html}</div>`, footer: `<button type="button" class="btn" data-close>Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}" type="submit">${okLabel || 'OK'}</button>`, onSubmit: () => { done = true; res(true); } });
      const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
      obs.observe(document.body, { childList: true });
    });
  }
  function menu(anchor, items) {
    closeMenu();
    const m = document.createElement('div'); m.className = 'menu'; m.id = 'menu';
    m.innerHTML = items.map((it, k) => it === '-' ? '<hr>' : `<button data-k="${k}" class="${it.danger ? 'danger' : ''}">${ic(it.icon || 'dots')}${esc(it.label)}</button>`).join('');
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect(); const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.right - mw)); let top = r.bottom + 6;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    m.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; closeMenu(); items[+b.dataset.k].run(); };
    setTimeout(() => document.addEventListener('mousedown', outside), 0);
    function outside(e) { if (!m.contains(e.target)) { closeMenu(); } }
    closeMenu.fn = () => { document.removeEventListener('mousedown', outside); m.remove(); };
  }
  function closeMenu() { if (closeMenu.fn) { closeMenu.fn(); closeMenu.fn = null; } }

  // ------------------------------------------------------------ form helpers
  const opt = (v, label, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(label)}</option>`;
  const catOptions = sel => W.categories().map(c => opt(c.id, c.name, sel)).join('');
  function sourceOptions(sel) {
    const accs = W.accounts().map(a => opt(a.id, a.name, sel)).join('');
    const cards = W.debts().filter(d => !d.closed && d.type === 'credit_card').map(d => opt('debt:' + d.id, d.name + ' (credit card)', sel)).join('');
    return `<optgroup label="Accounts">${accs}</optgroup>${cards ? `<optgroup label="Charge to card">${cards}</optgroup>` : ''}`;
  }
  const debtOptions = sel => opt('', 'Not linked', sel) + W.debts().map(d => opt(d.id, d.name, sel)).join('');
  const incomeOptions = sel => opt('auto', 'Auto — paycheck before due date', sel) + W.list('incomes').filter(i => !i.deleted).map(i => opt(i.id, i.name, sel)).join('');
  const moneyVal = c => c == null ? '' : W.centsToStr(c);
  const field = (label, inner, cls) => `<label class="field${cls ? ' ' + cls : ''}"><span>${label}</span>${inner}</label>`;
  const moneyInput = (name, val, extra) => `<input class="input money-in" name="${name}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(moneyVal(val))}" ${extra || ''}>`;
  function needMoney(v, label, allowZero) {
    const c = W.parseMoney(v);
    if (c == null || (allowZero ? c < 0 : c <= 0)) throw new UserError('Enter a valid ' + (label || 'amount') + (allowZero ? '' : ' greater than $0'));
    return c;
  }
  const needDate = (v, label) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) throw new UserError('Pick a ' + (label || 'date')); return v; };

  // ------------------------------------------------------------ status helpers
  const STATUS = { paid: ['Paid', 'paid'], partial: ['Partly paid', 'partial'], 'due-soon': ['Due soon', 'due'], upcoming: ['Upcoming', 'due'], overdue: ['Overdue', 'over'], 'overdue-partial': ['Overdue · partly paid', 'over'], skipped: ['Skipped', 'skip'] };
  const pill = st => `<span class="pill ${STATUS[st][1]}">${STATUS[st][0]}</span>`;
  function dueText(i, st) {
    const d = W.diffDays(today(), i.dueDate);
    if (st.status === 'paid' || st.status === 'skipped') return W.dateLabel(i.dueDate);
    if (d === 0) return 'Due today';
    if (d === 1) return 'Due tomorrow';
    if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue · ${W.shortDate(i.dueDate)}`;
    if (d <= 14) return `Due in ${d} days · ${W.shortDate(i.dueDate)}`;
    return 'Due ' + W.dateLabel(i.dueDate);
  }
  function billRow(i, o) {
    o = o || {};
    const st = W.instStatus(i);
    const pc = o.showPaycheck ? W.paycheckFor(i) : null;
    const t = st.template;
    const flags = [];
    if (i.custom && i.custom.amount) flags.push('<span class="pill" title="Amount changed for this month only">this month only</span>');
    if (i.custom && i.custom.due) flags.push('<span class="pill" title="Due date moved for this month only">moved</span>');
    if (st.deletedBill) flags.push('<span class="pill">deleted bill</span>');
    if (t && t.status === 'cancelled') flags.push('<span class="pill">cancelled</span>');
    const pct = i.amountCents > 0 ? Math.min(100, Math.round(st.paid * 100 / i.amountCents)) : 0;
    const label = STATUS[st.status][0];
    const auto = W.isAutopay(i);
    const tick = auto && st.status !== 'skipped'
      ? (st.remaining > 0
        ? `<span class="tick auto" role="img" aria-label="${esc(i.name)} auto-pays on ${W.shortDate(i.dueDate)}" title="Auto-pay: marked paid automatically on the due date">${ic('repeat')}</span>`
        : `<span class="tick done" role="img" aria-label="${esc(i.name)} was auto-paid" title="Auto-paid">${ic('check')}</span>`)
      : st.status === 'skipped'
      ? `<button class="tick skip" data-act="unskip" data-id="${i.id}" aria-label="Unskip ${esc(i.name)}" title="Skipped. Tap to unskip">${ic('skip')}</button>`
      : st.remaining > 0
        ? `<button class="tick" data-act="markPaid" data-id="${i.id}" aria-label="Mark ${esc(i.name)} paid" title="Mark paid"${pct ? ` style="--p:${pct}%"` : ''}>${ic('check')}</button>`
        : `<button class="tick done" data-act="paidMenu" data-id="${i.id}" aria-label="${esc(i.name)} is paid" title="Paid">${ic('check')}</button>`;
    // date of the most recent (non-voided) payment, for "Paid Nov 6"
    const pays = st.paid > 0 ? W.paymentsFor(i.id).filter(p => !p.voided) : [];
    const paidOn = pays.length ? pays.reduce((d, p) => p.date > d ? p.date : d, pays[0].date) : null;
    const paidOnTxt = paidOn ? (paidOn === today() ? 'today' : W.shortDate(paidOn)) : '';
    const dueLine = auto && st.status === 'paid' ? 'Auto-paid ' + (paidOnTxt || W.shortDate(i.dueDate))
      : auto && st.remaining > 0 && st.status !== 'skipped' ? (i.dueDate === today() ? 'Auto-pays today' : 'Upcoming · auto-pays ' + W.shortDate(i.dueDate))
      : st.status === 'paid' ? 'Paid ' + paidOnTxt + (st.paid > i.amountCents ? ' · ' + fmt(st.paid) : '') + ' · due ' + W.shortDate(i.dueDate)
      : st.status === 'skipped' ? 'Skipped · ' + W.shortDate(i.dueDate)
      : dueText(i, st) + (st.paid > 0 ? ' · paid ' + fmt(st.paid) + ' ' + paidOnTxt : '');
    const catTag = `<span class="cat-tag" style="--c:${W.catColor(i.category)}" title="Category">${esc(W.catName(i.category))}</span>`;
    return `<div class="bill s-${st.status}${auto ? ' autopay' : ''}" data-inst="${i.id}" data-tpl="${esc(i.templateId || '')}">
      ${tick}
      <div class="body">
        <div class="name"><span class="nm">${esc(i.name)}</span>${flags.join('')}</div>
        <div class="meta"><span class="due">${dueLine}</span>${pc ? `<span class="pc"> · ${W.shortDate(pc.date)} check</span>` : ''}</div>
        <div class="tags">${catTag}</div>
      </div>
      <div class="amt" title="${esc(label)}">${fmt(i.amountCents)}${st.paid > 0 && st.remaining > 0 ? `<span class="sub">${fmt(st.remaining)} left</span>` : ''}</div>
      <button class="btn sm icon ghost more" data-act="billMenu" data-id="${i.id}" aria-label="More options for ${esc(i.name)}">${ic('dots')}</button>
    </div>`;
  }
  // ---- Bills month colors: 'seasonal' (each month its own color), 'random' (shuffled per year), 'off'
  // Random never repeats a color within a year (each year is a shuffle of all 12) and never gives
  // January the same color as the December before it. It's stable: a month keeps its color until you shuffle.
  function shuffledYear(year, seed) {
    let t = ((seed >>> 0) ^ Math.imul(year, 0x9E3779B1)) >>> 0;
    const rnd = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
    const a = Array.from({ length: 12 }, (_, k) => k);
    for (let k = 11; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [a[k], a[j]] = [a[j], a[k]]; }
    return a;
  }
  function randomYearOrder(year, seed) {
    const cur = shuffledYear(year, seed);
    // only slots 0 and 1 are ever swapped, so the previous year's December is its raw last slot
    if (cur[0] === shuffledYear(year - 1, seed)[11]) [cur[0], cur[1]] = [cur[1], cur[0]];
    return cur;
  }
  const isMonthTheme = t => t === 'seasonal' || t === 'random';
  function monthColorSlot(mk) {
    const s = W.settings(); if (!isMonthTheme(s.theme)) return '';
    const mode = s.theme;
    const m = +mk.slice(5, 7);
    const slot = mode === 'random' ? randomYearOrder(+mk.slice(0, 4), s.monthColorSeed || 1)[m - 1] + 1 : m;
    return String(slot).padStart(2, '0');
  }
  function monthSel(key, value) {
    return `<div class="month-sel">
      <button class="btn sm icon ghost" data-act="monthStep" data-key="${key}" data-n="-1" aria-label="Previous month">${ic('chevL')}</button>
      <div class="m-label">${W.monthLabel(value)}<input type="month" value="${value}" data-month-input="${key}" aria-label="Pick month"></div>
      <button class="btn sm icon ghost" data-act="monthStep" data-key="${key}" data-n="1" aria-label="Next month">${ic('chevR')}</button>
      ${value !== curMonth() ? `<button class="btn sm ghost today" data-act="monthToday" data-key="${key}">Today</button>` : ''}
    </div>`;
  }
  function setMonth(key, mk) {
    if (!/^\d{4}-\d{2}$/.test(mk)) return;
    ui[key] = mk;
    // make sure the bills for the viewed month exist, plus next month's for bills paid a month early (idempotent)
    W.ensureGenerated(W.addMonthKey(mk > curMonth() ? mk : curMonth(), 1));
    refresh();
  }

  // ------------------------------------------------------------ charts (SVG, offline)
  // Thin marks, rounded data-ends on the baseline, recessive grid, one y-axis, hover values on every mark.
  function niceMax(v) { if (v <= 0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  const short$ = c => { const d = Math.abs(c) / 100; const s = d >= 1e6 ? (d / 1e6).toFixed(1) + 'M' : d >= 1e3 ? (d / 1e3).toFixed(d >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k' : d.toFixed(0); return (c < 0 ? '−' : '') + W.display().symbol + s; };
  const topRound = (x, y, w, h, r) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; };
  function barChart(o) {
    const Wd = 640, H = o.height || 220, pl = 44, pb = 24, pt = 8;
    const max = niceMax(Math.max(1, ...o.series.flatMap(s => s.values)));
    const n = o.labels.length, gw = (Wd - pl) / n, bw = Math.max(6, Math.min(18, (gw - 22) / o.series.length));
    const Y = v => pt + (H - pt - pb) * (1 - v / max);
    let g = '';
    for (let k = 0; k <= 3; k++) { const v = max * k / 3, y = Y(v); g += `<line class="${k ? 'gridline' : 'axis'}" x1="${pl}" x2="${Wd}" y1="${y}" y2="${y}"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${short$(v)}</text>`; }
    o.labels.forEach((lab, i) => {
      const groupW = bw * o.series.length + 2 * (o.series.length - 1);
      const x0 = pl + gw * i + (gw - groupW) / 2;
      const tip = lab + ' — ' + o.series.map(s => s.name + ' ' + fmt(s.values[i])).join(' · ');
      let bars = '';
      o.series.forEach((s, si) => { const v = s.values[i]; const y = Y(v); bars += `<path d="${topRound(x0 + si * (bw + 2), y, bw, H - pb - y, 3)}" fill="${s.color}"/>`; });
      g += `<g class="bar-hit" data-tip="${esc(tip)}" ${o.click ? `data-act="${o.click}" data-month="${o.keys[i]}"` : ''}><rect x="${pl + gw * i}" y="${pt}" width="${gw}" height="${H - pt - pb}" fill="transparent"/>${bars}<text x="${pl + gw * i + gw / 2}" y="${H - 6}" text-anchor="middle"${o.current === i ? ' style="fill:var(--ink);font-weight:650"' : ''}>${esc(lab)}</text></g>`;
    });
    return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(o.title || 'Bar chart')}">${g}</svg>${o.series.length > 1 ? `<div class="legend">${o.series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}`;
  }
  function lineChart(o) {
    // draw at roughly the on-screen size so axis labels stay ~11px on phones and wide desktops
    const vw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 1200;
    if (vw < 700) o = Object.assign({}, o, { width: Math.max(320, vw - 36), height: Math.min(o.height || 200, 180), maxLabels: Math.min(o.maxLabels || 8, 5) });
    const Wd = o.width || 640, H = o.height || 200, pl = 48, pb = 24, pt = 10;
    const all = o.series.flatMap(s => s.values);
    let max = Math.max(0, ...all), min = Math.min(0, ...all); max = niceMax(max || 1); if (min < 0) min = -niceMax(-min);
    const n = o.labels.length; const X = i => pl + (Wd - pl - 6) * (n <= 1 ? 0.5 : i / (n - 1)); const Y = v => pt + (H - pt - pb) * (max - v) / (max - min || 1);
    let g = '';
    for (let k = 0; k <= 3; k++) { const v = min + (max - min) * k / 3; const y = Y(v); g += `<line class="gridline" x1="${pl}" x2="${Wd}" y1="${y}" y2="${y}"/><text x="${pl - 8}" y="${y + 4}" text-anchor="end">${short$(v)}</text>`; }
    if (min < 0) g += `<line x1="${pl}" x2="${Wd}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--over)" stroke-width="1" stroke-dasharray="3 3"/><text x="${Wd}" y="${Y(0) - 5}" text-anchor="end" style="fill:var(--over)">${short$(0)}</text>`;
    const every = Math.ceil(n / (o.maxLabels || 8));
    o.labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) g += `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(l)}</text>`; });
    o.series.forEach(s => {
      const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
      if (s.fill) g += `<polygon points="${X(0)},${Y(Math.max(min, 0))} ${pts} ${X(n - 1)},${Y(Math.max(min, 0))}" fill="${s.color}" opacity=".08"/>`;
      g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""}/>`;
    });
    if (o.mark) { const i = o.mark.index; const v = o.series[0].values[i]; g += `<circle cx="${X(i)}" cy="${Y(v)}" r="4.5" fill="var(--surface)" stroke="${o.mark.color || o.series[0].color}" stroke-width="2"/><text x="${Math.min(Wd - 4, Math.max(pl + 4, X(i)))}" y="${Y(v) + (v < (max + min) / 2 ? -10 : 18)}" text-anchor="middle" style="fill:var(--ink);font-weight:650">${esc(o.mark.label)}</text>`; }
    // hover columns: one per point, tooltip lists every series
    const cw = (Wd - pl) / Math.max(1, n);
    o.labels.forEach((l, i) => { const x0 = Math.max(pl, X(i) - cw / 2), x1 = Math.min(Wd, X(i) + cw / 2); g += `<rect x="${x0}" y="${pt}" width="${Math.max(1, x1 - x0)}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(l + ' — ' + o.series.map(s => (o.series.length > 1 ? s.name + ' ' : '') + fmt(s.values[i])).join(' · '))}"/>`; });
    return `<svg class="chart" viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(o.title || 'Line chart')}">${g}</svg>${o.series.length > 1 ? `<div class="legend">${o.series.map(s => `<span><i class="dot" style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}`;
  }
  // Ranked horizontal bars for nominal categories: one colour, sorted, direct values.
  function rankBars(items, opts) {
    opts = opts || {};
    const total = items.reduce((a, x) => a + x.value, 0);
    if (!total) return `<div class="empty"><b>Nothing spent yet</b>${opts.empty || 'Expenses and paid bills show up here.'}</div>`;
    const max = Math.max(...items.map(x => x.value));
    const list = items.slice(0, opts.limit || 8); const rest = items.slice(opts.limit || 8).reduce((a, x) => a + x.value, 0);
    if (rest) list.push({ label: 'Everything else', value: rest });
    return `<div class="rank">${list.map(it => `<span class="lbl" ${it.act ? `data-act="${it.act}" data-cat="${it.id}"` : ''} title="${esc(it.label)}">${esc(it.label)}</span><span class="track" data-tip="${esc(it.label + ': ' + fmt(it.value) + ' (' + Math.round(it.value * 100 / total) + '%)')}"><i style="width:${Math.max(1, it.value * 100 / max)}%"></i></span><span class="val">${fmt(it.value)}</span>`).join('')}</div>`;
  }
  function donut(items, center) { return rankBars(items, { empty: center ? '' : undefined }); }
  // ------------------------------------------------------------ DASHBOARD
  function statCard(label, value, hint, cls, icon) {
    return `<div class="card stat"><div class="label">${label}</div><div class="value ${cls || ''}">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  }
  const fig = (label, value, hint, cls) => `<div class="fig"><span class="eyebrow">${label}</span><div class="v ${cls || ''}">${value}</div>${hint ? `<div class="h">${hint}</div>` : ''}</div>`;
  const sectionH = (title, meta, link) => `<div class="section-h"><h2>${title}</h2>${link ? `<a ${link}>${meta}</a>` : meta ? `<span class="meta">${meta}</span>` : ''}</div>`;
  // where each widget lives: summary spans the page; main = left column, side = right column
  const WIDGETS = {
    summary: { name: 'Month at a glance', col: 'top', html: dashSummary },
    overdue: { name: 'Overdue bills', col: 'main', html: dashOverdue },
    upcoming: { name: 'Coming up (next 14 days)', col: 'main', html: dashUpcoming },
    charts: { name: 'Cash flow chart', col: 'main', html: dashCharts },
    projection: { name: 'Cash forecast', col: 'main', html: dashProjection },
    nextcheck: { name: 'This paycheck', col: 'side', html: dashPaycheck },
    progress: { name: 'Where it went', col: 'side', html: dashProgress },
    smart: { name: 'Smart Budget', col: 'side', html: dashSmart },
    debt: { name: 'Debt', col: 'side', html: dashDebt },
    goals: { name: 'Savings goals', col: 'side', html: dashGoals },
  };
  function dashSummary() {
    const mk = ui.month; const sm = W.monthSummary(mk); const avail = W.availableBalance(today());
    const left = sm.income.total - sm.bills.total;
    const pct = sm.bills.total ? Math.round(sm.bills.paid * 100 / sm.bills.total) : 0;
    const acc = W.D.accounts.acc_checking;
    const nxt = W.nextPaycheck(W.addDays(today(), 1));
    const debt = W.totalDebt();
    return `${acc && acc.needsBalance ? `<div class="callout blue" style="margin-bottom:18px">${ic('wallet')}<div class="grow"><b>What's in checking right now?</b> Your available balance and forecast start at ${fmt(0)} until you enter it.</div><button class="btn sm primary" data-act="setBalance" data-id="acc_checking">Enter balance</button></div>` : ''}
    <div class="summary">
      <div>
        <span class="eyebrow">Left after ${W.monthLabel(mk).split(' ')[0]} bills</span>
        <div class="big ${left < 0 ? 'neg' : ''}">${fmt(left)}</div>
        <div class="sentence"><b>${fmt(sm.income.total)}</b> coming in, <b>${fmt(sm.bills.total)}</b> going out to ${sm.bills.count} bills.</div>
        <div class="meter"><div class="bar"><i style="width:${pct}%"></i></div><div class="legend-line"><span>${sm.bills.paidCount} of ${sm.bills.count} paid · ${fmt(sm.bills.paid)}</span><span>${fmt(sm.bills.remaining)} to go</span></div></div>
      </div>
      <div class="aside">
        <span class="eyebrow">Available now</span>
        <div class="big sm ${avail < 0 ? 'neg' : ''}">${fmt(avail)}</div>
        <div class="sentence">${W.accounts().filter(a => a.inAvailable).map(a => esc(a.name) + ' <b>' + fmt(W.accountBalance(a.id)) + '</b>').join(' · ') || 'No accounts yet'}${nxt ? `<br>Next paycheck <b>${fmt(nxt.amountCents)}</b> on ${W.dateLabel(nxt.date)}` : ''}</div>
        <div class="row" style="margin-top:12px;gap:14px"><button class="link" data-act="setBalance" data-id="acc_checking">Update balance</button><button class="link" data-nav-go="settings">Accounts</button></div>
      </div>
    </div>
    <div class="figures" style="--n:5">
      ${fig('Income', fmt(sm.income.total), sm.income.received ? fmt(sm.income.received) + ' received' : 'expected')}
      ${fig('Bills', fmt(sm.bills.total), sm.bills.count + ' this month')}
      ${fig('Unpaid', fmt(sm.bills.remaining), sm.bills.overdue ? `<span class="neg">${fmt(sm.bills.overdue)} overdue</span>` : 'nothing overdue', sm.bills.overdue ? 'neg' : '')}
      ${fig('Spent', fmt(sm.totalSpending), 'bills paid + purchases')}
      ${fig('Debt', fmt(debt), W.debts().filter(d => !d.closed).length + ' accounts')}
    </div>`;
  }
  function bucketOf(date, t) {
    const d = W.diffDays(t, date);
    if (d < 0) return ['overdue', 'Overdue'];
    if (d === 0) return ['today', 'Today'];
    if (d === 1) return ['tomorrow', 'Tomorrow'];
    const toSat = 6 - W.dow(t);
    if (d <= toSat) return ['week', 'Later this week'];
    if (d <= toSat + 7) return ['next', 'Next week'];
    if (W.monthOf(date) === W.monthOf(t)) return ['month', 'Later in ' + W.MONTHS[+t.slice(5, 7) - 1]];
    return ['later', 'Later'];
  }
  function groupedList(items, groupFn, opts) {
    opts = opts || {};
    if (!items.length) return opts.empty || '';
    const groups = []; const by = {};
    for (const x of items) { const [k, label, cls] = groupFn(x); if (!by[k]) { by[k] = { k, label, cls, items: [] }; groups.push(by[k]); } by[k].items.push(x); }
    if (opts.order) groups.sort((a, b) => opts.order(a, b));
    return groups.map(g => {
      const due = g.items.reduce((a, x) => a + (x.s.status === 'skipped' ? 0 : x.s.remaining), 0);
      const total = g.items.reduce((a, x) => a + (x.s.status === 'skipped' ? 0 : x.i.amountCents), 0);
      return `<div class="group-h"><span class="t ${g.cls || ''}">${esc(g.label)}</span><span class="s">${g.items.length} bill${g.items.length === 1 ? '' : 's'} · ${due === total ? `<b>${fmt(total)}</b>` : `<b>${fmt(due)}</b> left of ${fmt(total)}`}</span></div><div class="list">${g.items.map(x => billRow(x.i, opts.row)).join('')}</div>`;
    }).join('');
  }
  function dashOverdue() {
    const items = W.overdue();
    if (!items.length) return '';
    return `<section class="section">${sectionH(`<span class="neg">Overdue</span>`, `${items.length} bill${items.length === 1 ? '' : 's'} · ${fmt(items.reduce((a, x) => a + x.s.remaining, 0))}`)}<div class="list">${items.map(x => billRow(x.i)).join('')}</div></section>`;
  }
  function dashUpcoming() {
    const t = today(); const items = W.instancesBetween(t, W.addDays(t, 14)).filter(i => !i.skipped).map(i => ({ i, s: W.instStatus(i) })).filter(x => x.s.remaining > 0);
    const total = items.reduce((a, x) => a + x.s.remaining, 0);
    return `<section class="section">${sectionH('Coming up', `${fmt(total)} over the next 14 days`, '')}
      ${items.length ? groupedList(items, x => bucketOf(x.i.dueDate, t)) : `<div class="empty"><b>Nothing due for two weeks</b>Enjoy the quiet.</div>`}
      <div style="padding-top:10px"><a class="link" href="#/bills" data-act="openUpcoming">See everything that's coming up →</a></div></section>`;
  }
  function dashPaycheck() {
    const cur = W.currentPaycheck();
    if (!cur) return `<section class="section">${sectionH('This paycheck', '')}<div class="empty"><b>No income added</b>Add a job to plan bills by paycheck.<div style="margin-top:10px"><button class="btn sm primary" data-act="addIncome">Add income</button></div></div></section>`;
    const plan = W.paycheckPlan(cur.key);
    const nxt = W.paychecksBetween(W.addDays(cur.date, 1), W.addDays(cur.date, 45))[0];
    const nplan = nxt ? W.paycheckPlan(nxt.key) : null;
    const keep = nplan && nplan.remainingAfterSetAsides < 0 ? -nplan.remainingAfterSetAsides : 0;
    const unpaid = plan.bills.filter(b => b.s.remaining > 0);
    return `<section class="section">${sectionH('This paycheck', 'Open planner', 'href="#/paychecks"')}
      <div class="panel" style="margin-top:10px">
        <div class="row between"><span class="eyebrow">${W.dateLabel(cur.date)} · ${esc(cur.income.name)}</span>${cur.received ? '<span class="pill paid">Received</span>' : '<span class="pill">Expected</span>'}</div>
        <div style="margin-top:8px">
          <div class="kv"><span>Paycheck</span><b>${fmt(plan.pc.amountCents)}</b></div>
          <div class="kv"><span>${plan.bills.length} bills</span><b>−${fmt(plan.billTotal)}</b></div>
          ${plan.setAsides.map(s => `<div class="kv"><span>${esc(s.name)}</span><b>−${fmt(s.amountCents)}</b></div>`).join('')}
          <div class="kv total"><span>Left over</span><span class="num ${plan.remainingAfterSetAsides < 0 ? 'neg' : ''}">${fmt(plan.remainingAfterSetAsides)}</span></div>
        </div>
        ${keep ? `<div class="callout red small" style="margin-top:12px">${ic('alert')}<div>Hold back <b>${fmt(keep)}</b>. The ${W.shortDate(nxt.date)} check won't cover its own bills.</div></div>` : ''}
        ${!cur.received ? `<button class="btn sm" style="margin-top:12px;width:100%" data-act="receiveCheck" data-key="${cur.key}">${ic('check')}Mark this paycheck received</button>` : ''}
      </div>
      ${unpaid.length ? `<div class="group-h" style="padding-top:16px"><span class="t">Still to pay from it</span><span class="s"><b>${fmt(unpaid.reduce((a, b) => a + b.s.remaining, 0))}</b></span></div>${unpaid.map(b => `<div class="kv"><span>${esc(b.i.name)} <span class="faint tiny">· ${W.shortDate(b.i.dueDate)}${W.isAutopay(b.i) ? ' · auto-pay' : ''}</span></span><b class="${b.s.overdue ? 'neg' : ''}">${fmt(b.s.remaining)}</b></div>`).join('')}` : `<p class="small muted" style="margin:12px 0 0">${ic('check').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;color:var(--paid)"')} Every bill on this check is paid.</p>`}
    </section>`;
  }
  function dashProgress() {
    const mk = ui.month; const sm = W.monthSummary(mk); const inc = sm.income.total || 1;
    const pct = Math.min(100, Math.round(sm.totalSpending * 100 / inc));
    const items = Object.entries(sm.spending).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ id, label: W.catName(id), value: v, act: 'catDrill' }));
    return `<section class="section">${sectionH('Where it went', W.monthLabel(mk, true))}
      <div class="row between" style="margin:12px 0 6px"><span class="small muted">${fmt(sm.totalSpending)} of ${fmt(sm.income.total)} income</span><span class="small ${pct >= 100 ? 'neg' : 'muted'}">${pct}%</span></div>
      <div class="progress ${pct >= 100 ? 'over' : pct >= 85 ? 'warn' : ''}" style="margin-bottom:14px"><i style="width:${pct}%"></i></div>
      ${rankBars(items, { limit: 5 })}
      ${sm.cardPayments ? `<p class="tiny faint" style="margin:10px 0 0">${fmt(sm.cardPayments)} in card payments isn't counted again. Those purchases already were.</p>` : ''}
    </section>`;
  }
  function last6(mk) { const out = []; for (let k = 5; k >= 0; k--) out.push(W.addMonthKey(mk, -k)); return out; }
  function dashCharts() {
    const mk = ui.month; const months = last6(mk);
    const sums = months.map(m => W.monthSummary(m));
    return `<section class="section">${sectionH('Cash flow', 'Last 6 months · tap a month')}
      <div style="margin-top:12px">${barChart({ title: 'Income, bills and spending by month', labels: months.map(m => W.monthLabel(m, true).slice(0, 3)), keys: months, click: 'openMonth', current: 5, series: [{ name: 'Income', color: 'var(--s1)', values: sums.map(s => s.income.total) }, { name: 'Bills due', color: 'var(--s2)', values: sums.map(s => s.bills.total) }, { name: 'Spent', color: 'var(--s3)', values: sums.map(s => s.totalSpending) }] })}</div></section>`;
  }
  function dashProjection() {
    const pr = W.projection(60);
    const labels = pr.series.map(p => W.shortDate(p.date));
    const li = pr.series.findIndex(p => p.date === pr.low.date);
    return `<section class="section">${sectionH('Cash forecast', 'Next 60 days')}
      <p class="small muted" style="margin:10px 0 4px">${pr.low.balance < 0 ? `<span class="neg"><b>Heads up:</b></span> at this pace checking dips to <b class="neg">${fmt(pr.low.balance)}</b> around ${W.dateLabel(pr.low.date)}.` : `Lowest point is <b>${fmt(pr.low.balance)}</b> around ${W.dateLabel(pr.low.date)}.`} Counts expected paychecks${W.settings().projectionIncludesSetAsides ? ', set-asides' : ''} and every unpaid bill on its due date.</p>
      ${lineChart({ title: 'Projected checking balance', labels, series: [{ name: 'Projected balance', color: pr.low.balance < 0 ? 'var(--over)' : 'var(--brand)', values: pr.series.map(p => p.balance), fill: true }], maxLabels: 6, mark: { index: li, label: 'Low ' + short$(pr.low.balance) } })}</section>`;
  }
  function dashDebt() {
    const total = W.totalDebt();
    const sim = W.simulatePayoff(W.debtInputs(), 0, 'minimum');
    const cards = W.debts().filter(d => !d.closed && d.type === 'credit_card' && d.limitCents);
    const lim = cards.reduce((a, d) => a + d.limitCents, 0), bal = cards.reduce((a, d) => a + Math.max(0, W.debtBalance(d.id)), 0);
    const util = lim ? Math.round(bal * 100 / lim) : 0;
    return `<section class="section">${sectionH('Debt', 'Details', 'href="#/debts"')}
      <div class="kv" style="margin-top:6px"><span>Total owed</span><b>${fmt(total)}</b></div>
      <div class="kv"><span>Debt-free at minimums</span><b>${sim.months ? W.monthLabel(W.addMonthKey(curMonth(), sim.months), true) : 'Not at minimums'}</b></div>
      ${lim ? `<div class="kv"><span>Card utilization</span><b class="${util > 50 ? 'neg' : util > 30 ? 'warn' : ''}">${util}%</b></div><div class="progress thin ${util > 50 ? 'over' : util > 30 ? 'warn' : ''}" style="margin-top:4px"><i style="width:${Math.min(100, util)}%"></i></div>` : ''}
    </section>`;
  }

  function dashGoals() {
    const gs = W.list('goals').filter(g => !g.archived);
    if (!gs.length) return `<section class="section">${sectionH('Savings goals', 'Start one', 'href="#/goals"')}<p class="small muted" style="margin:10px 0 0">An emergency fund is a good first goal. Even ${fmt0(2500)} a paycheck adds up.</p></section>`;
    return `<section class="section">${sectionH('Savings goals', 'All goals', 'href="#/goals"')}${gs.slice(0, 4).map(g => { const p = W.goalProjection(g.id); return `<div class="cat-row small"><span>${esc(g.name)}</span><span class="num"><b>${fmt(p.saved)}</b> <span class="faint">of ${fmt(g.targetCents)}</span></span><div class="progress thin"><i style="width:${p.pct}%"></i></div></div>`; }).join('')}</section>`;
  }
  function viewDashboard() {
    const s = W.settings().dashboard; const order = s.order.filter(k => WIDGETS[k] && !s.hidden.includes(k));
    Object.keys(WIDGETS).forEach(k => { if (!s.order.includes(k) && !s.hidden.includes(k)) order.push(k); });
    const col = c => order.filter(k => WIDGETS[k].col === c).sort((a, b) => (a === 'overdue' ? -1 : 0) - (b === 'overdue' ? -1 : 0)).map(k => WIDGETS[k].html()).join('');
    const nxt = W.nextPaycheck(W.addDays(today(), 1));
    const days = nxt ? W.diffDays(today(), nxt.date) : null;
    const nm = profile().first; const greet = greeting();
    return `<div class="topbar"><div><h1 class="greet">${esc(greet)}${nm ? ', ' + esc(nm) : ''}</h1><div class="sub">${W.dateLabel(today(), true)}${days != null ? ` · payday ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'}` : ''}</div></div>
      <div class="row wrap">${monthSel('month', ui.month)}<button class="btn icon" data-act="customizeDash" aria-label="Customize dashboard" title="Customize dashboard">${ic('gear')}</button></div></div>
      <div class="fade-in">${homeExt('renderDashboardTop')}${W.settings().guest && GD.supported() && !(W.settings().account && W.settings().account.email) ? `<div class="callout red guest-banner">${ic('alert')}<div><b>Guest mode: your data is not backed up.</b> If you lose or reset this phone, it's gone. <button class="link" data-act="gdSignIn">Sign in with Google</button></div></div>` : ''}${col('top')}<div class="split" style="margin-top:30px"><div>${col('main')}</div><div>${col('side')}</div></div></div>`;
  }
  // ------------------------------------------------------------ BILLS
  function viewBills() {
    const tabs = `<div class="seg" style="margin-bottom:6px">${[['month', 'This month'], ['upcoming', 'Upcoming'], ['manage', 'All bills'], ['subs', 'Subscriptions']].map(([k, l]) => `<button class="${ui.billsTab === k ? 'on' : ''}" data-act="billsTab" data-tab="${k}">${l}</button>`).join('')}</div>`;
    const head = `<div class="topbar"><div><h1>Bills</h1><div class="sub">Tap the circle to mark a bill paid. Each month keeps its own record.</div></div><div class="row wrap desk-only"><button class="btn primary" data-act="addBill">${ic('plus')}New bill</button></div></div>${tabs}`;
    if (ui.billsTab === 'manage') return head + `<div style="margin-top:16px">${viewManageBills()}</div>`;
    if (ui.billsTab === 'subs') return head + `<div style="margin-top:16px">${viewSubs()}</div>`;
    if (ui.billsTab === 'upcoming') return head + viewUpcoming();
    const mk = ui.month; const sm = W.billsSummary(mk); const pct = sm.total ? Math.round(sm.paid * 100 / sm.total) : 0;
    let items = W.instancesForMonth(mk).map(i => ({ i, s: W.instStatus(i) }));
    items = applyBillSearch(items);
    const counts = {}; Object.keys(BILL_FILTERS).forEach(k => counts[k] = items.filter(BILL_FILTERS[k][1]).length);
    items = items.filter((BILL_FILTERS[ui.billFilter] || BILL_FILTERS.all)[1]);
    items.sort(viewSorter());
    const prevOver = mk === curMonth() ? W.overdue().filter(x => W.monthOf(x.i.dueDate) < mk) : [];
    const group = viewGroup(false);
    return head + `
      <div class="toolbar" style="padding-top:16px">${monthSel('month', mk)}<span class="grow"></span><span class="small muted">${sm.paidCount} of ${sm.count} paid</span></div>
      <div class="mob-only m-sum"><b>${fmt(sm.paid)}</b> paid of ${fmt(sm.total)}${sm.overdue ? ` · <span class="neg"><b>${fmt(sm.overdue)}</b> overdue</span>` : ''}</div>
      <div class="figures desk-only" style="--n:4;margin-bottom:6px">
        ${fig('Total', fmt(sm.total), sm.count + ' bills')}
        ${fig('Paid', fmt(sm.paid), pct + '% done', 'pos')}
        ${fig('Left to pay', fmt(sm.remaining), sm.count - sm.paidCount + ' to go')}
        ${fig('Overdue', fmt(sm.overdue), sm.overdue ? 'pay these first' : 'none', sm.overdue ? 'neg' : '')}
      </div>
      <div class="meter" style="margin:12px 0 4px"><div class="bar"><i style="width:${pct}%"></i></div></div>
      ${prevOver.length ? `<div class="group-h" style="padding-top:18px"><span class="t over">Still unpaid from earlier months</span><span class="s"><b>${fmt(prevOver.reduce((a, x) => a + x.s.remaining, 0))}</b></span></div><div class="list">${prevOver.map(x => billRow(x.i)).join('')}</div>` : ''}
      ${billToolbar(counts, true)}
      <div>${items.length ? renderBillGroups(items, group, { month: mk }) : `<div class="empty">${W.instancesForMonth(mk).length ? '<b>No bills match</b>Try a different filter or search.' : '<b>No bills for ' + W.monthLabel(mk) + '</b>Generate the month or add a bill.'}</div>`}</div>
      <div class="foot-actions"><button class="btn sm ghost" data-act="refreshMonth">${ic('cal')}Refresh due dates</button><button class="btn sm ghost" data-act="genNext">${ic('plus')}Generate next month</button><button class="btn sm ghost danger" data-act="resetMonth">${ic('undo')}Reset this month…</button></div>`;
  }
  const BILL_FILTERS = {
    all: ['All', () => true],
    unpaid: ['Unpaid', x => x.s.remaining > 0 && x.s.status !== 'skipped'],
    overdue: ['Overdue', x => x.s.overdue],
    soon: ['Due in 7 days', x => x.s.status === 'due-soon' || (x.s.status === 'partial' && W.diffDays(today(), x.i.dueDate) <= 7)],
    partial: ['Partly paid', x => x.s.status.includes('partial')],
    paid: ['Paid', x => x.s.status === 'paid'],
    auto: ['Auto-pay', x => W.isAutopay(x.i)],
    skipped: ['Skipped', x => x.s.status === 'skipped'],
  };
  const statusRank = { overdue: 0, 'overdue-partial': 0, 'due-soon': 1, partial: 2, upcoming: 3, paid: 4, skipped: 5 };
  const byDue = (a, b) => a.i.dueDate < b.i.dueDate ? -1 : a.i.dueDate > b.i.dueDate ? 1 : a.i.name.localeCompare(b.i.name);
  const byName = (a, b) => a.i.name.localeCompare(b.i.name) || byDue(a, b);
  const byStatus = (a, b) => statusRank[a.s.status] - statusRank[b.s.status] || byDue(a, b);
  // "My order": the order you dragged bills into (settings.billOrder, bill template ids); new bills go last by due date
  const billRank = () => { const o = W.settings().billOrder || []; const m = new Map(); o.forEach((id, n) => m.set(id, n)); return id => m.has(id) ? m.get(id) : 1e6; };
  const byMine = (a, b) => { const r = byMine.rank || billRank(); return r(a.i.templateId) - r(b.i.templateId) || byDue(a, b); };
  // One "Sort & group" dropdown: [label, how rows are sorted, sort|group, grouping]
  const BILL_VIEWS = {
    due: ['Sort: Due date', byDue, 'sort', 'none'],
    status: ['Sort: Status (overdue first)', byStatus, 'sort', 'none'],
    name: ['Sort: Name (A–Z)', byName, 'sort', 'none'],
    mine: ['Sort: My order', byMine, 'sort', 'none'],
    category: ['Group: Category', byDue, 'group', 'category'],
    paycheck: ['Group: Paycheck', byDue, 'group', 'paycheck'],
  };
  // the sort choice is kept per device (ui) and with your data (settings.billView), so My order survives reloads
  const billView = () => { const v = ui.billView || (W.D && W.settings().billView) || ''; return BILL_VIEWS[v] ? v : 'due'; };
  const setBillView = v => { ui.billView = v; saveUi(); if (W.settings().billView !== v) W.saveSettings({ billView: v }); };
  // paid bills sit together at the top; the chosen order applies within paid and within unpaid
  // (Status keeps its own order: overdue first, paid near the end)
  const paidRank = x => x.s.status === 'paid' ? 0 : 1;
  const viewSorter = () => { const v = billView(), base = BILL_VIEWS[v][1]; byMine.rank = billRank(); return v === 'status' || v === 'mine' ? base : (a, b) => paidRank(a) - paidRank(b) || base(a, b); };
  // Upcoming keeps its "when it's due" headings (Overdue, Today, This week…) for the due-date view
  const viewGroup = upcoming => { const v = billView(); const g = BILL_VIEWS[v][3]; return upcoming && (v === 'due' || v === 'mine') ? 'timeline' : g; };
  function applyBillSearch(items) {
    const q = (ui.billSearch || '').trim().toLowerCase();
    if (q) items = items.filter(x => x.i.name.toLowerCase().includes(q) || W.catName(x.i.category).toLowerCase().includes(q) || (x.i.note || '').toLowerCase().includes(q) || W.centsToStr(x.i.amountCents).includes(q));
    return items;
  }
  function billToolbar(counts, showFilters) {
    const cur = billView();
    const opts = kind => Object.entries(BILL_VIEWS).filter(([, x]) => x[2] === kind).map(([v, [l]]) => opt(v, l, cur)).join('');
    return `<div class="toolbar" style="padding-top:20px">
        <div class="search">${ic('search')}<input class="input" placeholder="Search name, category or amount" value="${esc(ui.billSearch)}" data-bind="billSearch" aria-label="Search bills"></div>
        <select class="input bill-view" data-bind="billView" aria-label="Sort and group bills"><optgroup label="Sort by">${opts('sort')}</optgroup><optgroup label="Group by">${opts('group')}</optgroup></select>
      </div>
      ${showFilters ? `<div class="chips" style="padding-bottom:8px">${Object.entries(BILL_FILTERS).map(([k, [l]]) => `<button class="chip ${ui.billFilter === k ? 'on' : ''}" data-act="billFilter" data-f="${k}">${l}<span class="n">${counts[k]}</span></button>`).join('')}</div>` : ''}`;
  }
  function renderBillGroups(items, group, ctx) {
    const t = today();
    const sorter = viewSorter();
    if (group === 'none') return `<div class="list" style="border-top:1px solid var(--line)">${items.map(x => billRow(x.i, { showPaycheck: true })).join('')}</div>`;
    const order = { overdue: 0, today: 1, tomorrow: 2, week: 3, next: 4, month: 5, later: 6 };
    const sRank = { overdue: 0, soon: 1, partial: 2, upcoming: 3, auto: 4, paid: 5, skipped: 6 };
    const fn = {
      timeline: x => { const [k, l] = bucketOf(x.i.dueDate, t); return [k, l, k === 'overdue' ? 'over' : '']; },
      week: x => { const d = W.parts(x.i.dueDate).d; const w = Math.min(4, Math.floor((d - 1) / 7)); const mk = W.monthOf(x.i.dueDate); const a = w * 7 + 1, b = w === 4 ? W.dim(+mk.slice(0, 4), +mk.slice(5, 7)) : a + 6; return [mk + w, W.MONTHS[+mk.slice(5, 7) - 1].slice(0, 3) + ' ' + a + '–' + Math.min(b, W.dim(+mk.slice(0, 4), +mk.slice(5, 7))), '']; },
      status: x => { const st = x.s.status; const k = st.startsWith('overdue') ? 'overdue' : st === 'due-soon' ? (W.isAutopay(x.i) ? 'auto' : 'soon') : st === 'upcoming' ? (W.isAutopay(x.i) ? 'auto' : 'upcoming') : st; const L = { overdue: 'Overdue', soon: 'Due within 7 days', partial: 'Partly paid', upcoming: 'Upcoming', auto: 'Auto-pay, not yet drafted', paid: 'Paid', skipped: 'Skipped' }; return [k, L[k], k === 'overdue' ? 'over' : k === 'paid' ? 'paid' : '']; },
      category: x => [x.i.category, W.catName(x.i.category), ''],
      paycheck: x => { const pc = W.paycheckFor(x.i); return pc ? [pc.date + pc.incomeId, W.dateLabel(pc.date) + ' paycheck', ''] : ['zz', 'No paycheck assigned', '']; },
    }[group] || (x => ['all', 'All bills', '']);
    const ord = {
      timeline: (a, b) => order[a.k] - order[b.k], status: (a, b) => sRank[a.k] - sRank[b.k],
      category: (a, b) => a.label.localeCompare(b.label), week: (a, b) => a.k < b.k ? -1 : 1, paycheck: (a, b) => a.k < b.k ? -1 : 1,
    }[group];
    return groupedList(items.slice().sort(sorter), fn, { order: ord, row: { showPaycheck: group !== 'paycheck' } });
  }
  const UP_RANGES = [['date', 'Through a date'], ['month', 'End of month'], ['30', '30 days'], ['60', '60 days']];
  // remembered per device (ui) and with your data (settings.upRange); older saved choices fall back to End of month
  const upRangeOf = () => { const v = UP_RANGES.some(x => x[0] === ui.upRange) ? ui.upRange : (W.D && W.settings().upRange) || ''; return UP_RANGES.some(x => x[0] === v) ? v : 'month'; };
  // default "through" date: the 1st of next month, so bills due on the 1st can be paid the month before
  const upDateOf = t => (ui.upDate && /^\d{4}-\d{2}-\d{2}$/.test(ui.upDate) && ui.upDate >= t) ? ui.upDate : W.addMonthKey(W.monthOf(t), 1) + '-01';
  function viewUpcoming() {
    const t = today(); const r = upRangeOf();
    const nxt = W.nextPaycheck(W.addDays(t, 1));
    const end = r === 'date' ? upDateOf(t) : r === 'month' ? W.monthEnd(W.monthOf(t)) : W.addDays(t, +r);
    W.ensureGenerated(W.monthOf(end) > curMonth() ? W.monthOf(end) : undefined);
    let items = W.instancesBetween(t, end).map(i => ({ i, s: W.instStatus(i) }));
    const over = W.overdue().map(x => ({ i: x.i, s: x.s }));
    items = over.concat(items);
    if (!ui.upPaid) items = items.filter(x => x.s.remaining > 0 && x.s.status !== 'skipped');
    items = applyBillSearch(items);
    if (ui.billFilter === 'auto') items = items.filter(x => W.isAutopay(x.i));
    const needed = items.reduce((a, x) => a + (x.s.status === 'skipped' ? 0 : x.s.remaining), 0);
    const autoAmt = items.filter(x => W.isAutopay(x.i)).reduce((a, x) => a + x.s.remaining, 0);
    const pays = W.paychecksBetween(t, end).filter(p => !p.received);
    const incoming = pays.reduce((a, p) => a + p.amountCents, 0);
    const avail = W.availableBalance(t);
    const after = avail + incoming - needed;
    const rangeLabel = r === 'month' ? 'through ' + W.shortDate(end) : 'through ' + W.dateLabel(end);
    return `
      <div class="seg boxed up-range" role="group" aria-label="Show bills through" style="margin:16px 0 4px">${UP_RANGES.map(([k, l]) => `<button class="${r === k ? 'on' : ''}" data-act="upRange" data-r="${k}" aria-pressed="${r === k}">${l}</button>`).join('')}</div>
      ${r === 'date' ? `<label class="row wrap small" style="gap:8px;margin:10px 0 2px"><span class="muted">Show bills due up to the end of</span><input class="input" type="date" style="width:auto" min="${t}" value="${end}" data-bind="upDate" aria-label="Show bills due through this date"></label>` : ''}
      <div class="figures" style="--n:4;margin-top:12px">
        ${fig('Due ' + rangeLabel, fmt(needed), items.length + ' bills' + (autoAmt ? ' · ' + fmt(autoAmt) + ' on auto-pay' : ''))}
        ${fig('Paychecks coming', fmt(incoming), pays.length ? pays.map(p => W.shortDate(p.date)).join(', ') : 'none in this window')}
        ${fig('Available now', fmt(avail), 'checking + cash')}
        ${fig('Projected after', fmt(after), after < 0 ? 'short, plan ahead' : 'if everything clears', after < 0 ? 'neg' : 'pos')}
      </div>
      ${billToolbar({}, false)}
      <label class="check small" style="margin:2px 0 6px"><input type="checkbox" data-act-change="upPaid" ${ui.upPaid ? 'checked' : ''}> Show paid and skipped bills too</label>
      <div>${items.length ? renderBillGroups(items, viewGroup(true), {}) : `<div class="empty"><b>You're clear</b>No unpaid bills ${rangeLabel}.</div>`}</div>`;
  }
  function viewManageBills() {
    const rk = billRank(); const mine = billView() === 'mine';
    const ts = W.list('templates').sort((a, b) => (mine ? rk(a.id) - rk(b.id) : 0) || a.name.localeCompare(b.name));
    const groups = [['active', 'Active'], ['paused', 'Paused'], ['cancelled', 'Cancelled'], ['deleted', 'Deleted · history kept']];
    const monthlyOf = t => { const r = W.currentRule(t); const m = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, weekly: 52 / 12, biweekly: 26 / 12, once: 0 }; return r.frequency === 'custom' ? 0 : Math.round(r.amountCents * (m[r.frequency] ?? 1)); };
    const active = ts.filter(t => (t.status || 'active') === 'active');
    const nDeleted = ts.filter(t => t.status === 'deleted').length;
    return `<div class="manage-sum small muted">${mine ? 'My order · hold a bill and drag it to move it · ' : '<button class="link" data-act="billMine">Use my own order</button> · '}${active.length} active bills · about <b class="num">${fmt(active.reduce((a, t) => a + monthlyOf(t), 0))}</b> a month</div>` + (groups.map(([st, label]) => {
      if (st === 'deleted' && !ui.showDeleted) return '';
      const list = ts.filter(t => (t.status || 'active') === st); if (!list.length) return '';
      return `<section class="section" style="margin-top:18px"><div class="section-h"><h2>${label}</h2><span class="meta">${list.length}</span></div><div class="tbl-wrap"><table class="tbl tbl-cards ledger"><thead><tr><th>Bill</th><th>Schedule</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${list.map(t => { const r = W.currentRule(t); const next = st === 'active' ? W.list('instances').filter(i => i.templateId === t.id && i.dueDate >= today() && W.instStatus(i).remaining > 0).sort((a, b) => a.dueDate < b.dueDate ? -1 : 1)[0] : null; const auto = t.autopay != null ? t.autopay : t.subscription; return `<tr class="${st !== 'active' ? 'muted-row' : ''}" data-tpl="${esc(t.id)}">
        <td><b>${esc(t.name)}</b> <span class="cat-tag" style="--c:${W.catColor(t.category)}" title="Category">${esc(W.catName(t.category))}</span>${auto ? ' <span class="pill auto">auto-pay</span>' : ''}${t.debtId ? ` <span class="pill">${esc((W.D.debts[t.debtId] || {}).name || '')}</span>` : ''}<div class="tiny muted">${next ? 'Next ' + W.dateLabel(next.dueDate) : t.cancelledOn ? 'Cancelled ' + W.shortDate(t.cancelledOn) : t.deletedOn ? 'Deleted ' + W.shortDate(t.deletedOn) : st === 'paused' ? 'Paused' : ''}</div></td>
        <td class="small muted">${esc(scheduleText(r))}</td><td class="r num"><b>${fmt(r.amountCents)}</b></td>
        <td class="r"><span class="row" style="gap:4px;justify-content:flex-end">${st !== 'deleted' ? `<button class="btn sm icon ghost danger" data-act="deleteTpl" data-id="${t.id}" aria-label="Delete ${esc(t.name)}" data-tip="Delete">${ic('trash')}</button>` : ''}<button class="btn sm icon ghost" data-act="tplMenu" data-id="${t.id}" aria-label="Actions for ${esc(t.name)}">${ic('dots')}</button></span></td></tr>`; }).join('')}
      </tbody></table></div></section>`;
    }).join('') || `<div class="empty"><b>No bills yet</b>Add your first bill to get started.</div>`)
      + (nDeleted ? `<div class="foot-actions"><button class="btn sm ghost" data-act="toggleDeleted">${ui.showDeleted ? 'Hide' : 'Show'} ${nDeleted} deleted bill${nDeleted > 1 ? 's' : ''} (history kept)</button></div>` : '');
  }
  function scheduleText(r) {
    const d = W.parts(r.anchor).d;
    const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    switch (r.frequency) {
      case 'monthly': return r.eom ? 'Monthly on the last day' : 'Monthly on the ' + ord(d);
      case 'quarterly': return 'Every 3 months on the ' + (r.eom ? 'last day' : ord(d));
      case 'yearly': return 'Yearly on ' + W.shortDate(r.anchor);
      case 'weekly': return 'Weekly on ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][W.dow(r.anchor)];
      case 'biweekly': return 'Every 2 weeks (' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][W.dow(r.anchor)] + ')';
      case 'once': return 'One time · ' + W.dateLabel(r.anchor, true);
      case 'custom': return 'Every ' + r.interval + ' ' + r.unit + (r.interval > 1 ? 's' : '');
      default: return r.frequency;
    }
  }
  function viewSubs() {
    const subs = W.list('templates').filter(t => t.subscription && !t.deleted).sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.name.localeCompare(b.name));
    const monthly = t => { const r = W.currentRule(t); const m = { monthly: 1, quarterly: 1 / 3, yearly: 1 / 12, weekly: 52 / 12, biweekly: 26 / 12, once: 0 }; return r.frequency === 'custom' ? 0 : Math.round(r.amountCents * (m[r.frequency] ?? 1)); };
    const act = subs.filter(t => t.status === 'active'); const mo = act.reduce((a, t) => a + monthly(t), 0);
    const nextOf = t => W.list('instances').filter(i => i.templateId === t.id && i.dueDate >= today()).sort((a, b) => a.dueDate < b.dueDate ? -1 : 1)[0];
    return `<div class="figures" style="--n:3">${fig('Active', String(act.length), subs.length - act.length ? (subs.length - act.length) + ' cancelled' : 'subscriptions')}${fig('Per month', fmt(mo), 'auto-pays on the due date')}${fig('Per year', fmt(mo * 12), 'at today\'s prices')}</div>
      <section class="section" style="margin-top:22px"><div class="section-h"><h2>Subscriptions</h2><span class="meta">Cancel here once you've cancelled with the company</span></div>
      <div class="tbl-wrap"><table class="tbl tbl-cards ledger"><thead><tr><th>Service</th><th>Schedule</th><th class="hide-m">Next charge</th><th class="r">Amount</th><th></th></tr></thead><tbody>
      ${subs.map(t => { const r = W.currentRule(t); const n = t.status === 'active' ? nextOf(t) : null; return `<tr class="${t.status === 'active' ? '' : 'muted-row'}"><td><b>${esc(t.name)}</b>${t.status !== 'active' ? ` <span class="pill skip">${esc(t.status)}</span>` : ''}</td><td class="small muted">${esc(scheduleText(r))}</td><td class="hide-m small">${n ? W.dateLabel(n.dueDate) : '—'}</td><td class="r num"><b>${fmt(r.amountCents)}</b></td>
        <td class="r"><span class="row" style="gap:4px;justify-content:flex-end">${t.status === 'active' ? `<button class="btn sm ghost danger" data-act="cancelTpl" data-id="${t.id}">Cancel</button>` : `<button class="btn sm ghost" data-act="reactivateTpl" data-id="${t.id}">Reactivate</button>`}<button class="btn sm icon ghost" data-act="editTpl" data-id="${t.id}" aria-label="Edit ${esc(t.name)}" data-tip="Edit">${ic('edit')}</button><button class="btn sm icon ghost danger" data-act="deleteTpl" data-id="${t.id}" aria-label="Delete ${esc(t.name)}" data-tip="Delete">${ic('trash')}</button></span></td></tr>`; }).join('') || '<tr><td colspan="5"><div class="empty"><b>No subscriptions</b>Tick "Subscription" when adding a bill to track it here.</div></td></tr>'}
      </tbody></table></div></section>`;
  }

  // bill add / edit
  function billForm(o) {
    // o: {mode:'add'|'edit', t, inst, anchor}
    const t = o.t; const r = t ? W.ruleAt(t, o.inst ? o.inst.periodKey : today()) : null;
    const i = o.inst;
    const v = {
      name: i ? i.name : t ? t.name : '', amount: i ? i.amountCents : r ? r.amountCents : null, anchor: i ? i.dueDate : (o.anchor || (r ? (W.nextOccurrenceOnOrAfter(r, today()) || r.anchor) : today())),
      frequency: r ? r.frequency : 'monthly', interval: r ? r.interval : 1, unit: r ? r.unit : 'month', category: i ? i.category : t ? t.category : 'cat_other',
      method: t ? t.method : '', source: i ? (i.accountId || t.accountId) : t ? t.accountId : W.defaultAccountId(), debtId: t ? t.debtId : '', payFrom: t ? t.payFrom : 'auto', sub: t ? t.subscription : false, eom: r ? !!r.eom : false, autopay: t ? (t.autopay != null ? t.autopay : t.subscription) : false, notes: i && i.custom && i.custom.note ? i.note : t ? t.notes : '',
    };
    return `<div class="form-grid">
      ${o.mode === 'edit' && i ? `<div class="full"><div class="seg" id="scopeSeg"><button type="button" class="on" data-scope="this">Only ${W.monthLabel(W.monthOf(i.periodKey))}</button><button type="button" data-scope="future">This &amp; all future months</button></div><input type="hidden" name="scope" value="this"><div class="tiny muted" style="margin-top:6px" id="scopeHelp">Changes apply to this month only. Other months stay the same.</div></div>` : ''}
      ${field('Bill name', `<input class="input" name="name" required value="${esc(v.name)}" autofocus>`, 'full')}
      ${field('Amount due', moneyInput('amount', v.amount), 'amt-field')}
      ${field(o.mode === 'add' ? 'First due date' : 'Due date', `<input class="input" type="date" name="anchor" value="${v.anchor}">`, 'anchor-full')}
      <div class="sched full eom-only">
        <label class="check"><input type="checkbox" name="eom" ${v.eom ? 'checked' : ''}> Due on the last day of each month</label>
        <div class="eom-inline row wrap small" style="gap:8px;margin:8px 0 0 28px"><span class="muted">starting</span><input class="input" type="month" name="eomMonth" value="${W.monthOf(v.anchor)}" style="width:auto;padding:5px 8px;font-size:13px" aria-label="Starting month"><span class="muted">→</span><b class="eom-due"></b></div>
      </div>
      <label class="field sched"><span>How often</span><select class="input" name="frequency">${Object.entries(W.FREQS).map(([k, l]) => opt(k, l, v.frequency)).join('')}</select></label>
      <div class="sched custom-only row" style="gap:8px;align-items:flex-end">${field('Every', `<input class="input" type="number" min="1" name="interval" value="${v.interval || 1}">`)}${field('Unit', `<select class="input" name="unit">${['day', 'week', 'month', 'year'].map(u => opt(u, u + 's', v.unit)).join('')}</select>`)}</div>
      ${field('Category', `<select class="input" name="category">${catOptions(v.category)}</select>`)}
      ${field('Paid from', `<select class="input" name="source">${sourceOptions(v.source)}</select>`)}
      ${field('Payment method', `<input class="input" name="method" list="methods" placeholder="Autopay, online, check…" value="${esc(v.method)}"><datalist id="methods">${['Autopay', 'Online', 'Debit card', 'Credit card', 'Bank transfer', 'Check', 'Cash', 'Zelle', 'In app'].map(m => `<option value="${m}">`).join('')}</datalist>`, 'sched-ok')}
      <label class="field sched"><span>Linked debt (updates its balance)</span><select class="input" name="debtId">${debtOptions(v.debtId)}</select></label>
      <label class="field sched"><span>Pay from paycheck</span><select class="input" name="payFrom">${incomeOptions(v.payFrom)}</select></label>
      <label class="check sched full"><input type="checkbox" name="autopay" ${v.autopay ? 'checked' : ''}> Auto-pay: deducted automatically, marked paid on the due date</label>
      <label class="check sched full"><input type="checkbox" name="sub" ${v.sub ? 'checked' : ''}> Subscription</label>
      ${field('Notes', `<textarea class="input" name="notes" placeholder="Optional">${esc(v.notes)}</textarea>`, 'full')}
    </div>`;
  }
  function mountBillForm(form) {
    const freq = form.frequency; const sync = () => { $$('.custom-only', form).forEach(e => e.style.display = freq.value === 'custom' ? '' : 'none'); };
    freq.addEventListener('change', sync); sync();
    if (form.sub && form.autopay) form.sub.addEventListener('change', () => { if (form.sub.checked) form.autopay.checked = true; });
    // the last-day option only makes sense for schedules that repeat by months
    // when it's ticked the full date picker is replaced by a small month picker; the due date is that month's last day
    const eomSync = () => {
      const row = $('.eom-only', form); if (!row) return;
      const monthly = MONTHLY_FREQ({ frequency: freq.value, unit: form.unit.value });
      row.style.visibility = monthly ? '' : 'hidden';
      const on = form.eom.checked && monthly && !(form.scope && form.scope.value === 'this');
      $('.anchor-full', form).style.display = on ? 'none' : '';
      $('.amt-field', form).classList.toggle('full', on);
      $('.eom-inline', form).style.display = on ? '' : 'none';
      if (on) { const mk = /^\d{4}-\d{2}$/.test(form.eomMonth.value) ? form.eomMonth.value : W.monthOf(form.anchor.value || today()); const d = W.monthEnd(mk); form.anchor.value = d; $('.eom-due', form).textContent = 'Due ' + W.dateLabel(d, true); }
    };
    form.anchor.addEventListener('change', () => { if (/^\d{4}-\d{2}-\d{2}$/.test(form.anchor.value)) form.eomMonth.value = W.monthOf(form.anchor.value); });
    [freq, form.unit, form.eom].forEach(el => el.addEventListener('change', eomSync));
    form.eomMonth.addEventListener('change', eomSync); form.eomMonth.addEventListener('input', eomSync);
    eomSync();
    const seg = $('#scopeSeg', form);
    if (seg) {
      const setScope = s => { form.scope.value = s; $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.scope === s)); $$('.sched', form).forEach(e => e.style.display = s === 'this' ? 'none' : ''); $('#scopeHelp', form).textContent = s === 'this' ? 'Changes apply to this month only. Other months stay the same.' : 'Changes apply from this month on. Earlier months, and any month you already paid, keep their amounts.'; sync(); if (s === 'this') $$('.custom-only', form).forEach(e => e.style.display = 'none'); eomSync(); };
      seg.onclick = e => { const b = e.target.closest('button'); if (b) setScope(b.dataset.scope); };
      setScope('this');
    }
  }
  const MONTHLY_FREQ = f => ['monthly', 'quarterly', 'yearly'].includes(f.frequency) || (f.frequency === 'custom' && (f.unit === 'month' || f.unit === 'year'));
  function readBillForm(f) {
    if (!f.name || !f.name.trim()) throw new UserError('Enter a bill name');
    // "last day of each month": only for schedules that repeat by months; the due date moves to its month's last day
    const eom = !!f.eom && MONTHLY_FREQ(f) && f.scope !== 'this';
    const anchor = eom && /^\d{4}-\d{2}$/.test(f.eomMonth || '') ? W.monthEnd(f.eomMonth) : needDate(f.anchor, 'due date');
    return { name: f.name, amountCents: needMoney(f.amount, 'amount'), anchor: eom ? W.monthEnd(W.monthOf(anchor)) : anchor, frequency: f.frequency, interval: Math.max(1, parseInt(f.interval, 10) || 1), unit: f.unit, category: f.category, accountId: f.source, method: f.method || '', debtId: f.debtId || null, payFrom: f.payFrom || 'auto', subscription: !!f.sub, autopay: !!f.autopay, eom: eom, notes: f.notes || '' };
  }
  function addBill(anchor) {
    modal({ title: 'Add bill', body: billForm({ mode: 'add', anchor }), submit: 'Add bill', onMount: mountBillForm, onSubmit: f => { const d = readBillForm(f); W.addTemplate(d); W.ensureGenerated(W.addMonthKey(ui.month > curMonth() ? ui.month : curMonth(), 1)); toast(d.name + ' added'); refresh(); } });
  }
  // edit-bill footer with a Delete button (bills that aren't already deleted)
  const delFooter = t => `${t && !t.deleted ? `<button type="button" class="btn danger" id="delBill" style="margin-right:auto">${ic('trash')}Delete</button>` : ''}<button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button>`;
  function bindDel(form, close, t) { const b = $('#delBill', form); if (b) b.onclick = async () => { if (await A.deleteTpl({ id: t.id })) close(); }; }
  function editInstance(instId) {
    const i = W.D.instances[instId]; const t = W.D.templates[i.templateId];
    modal({
      title: 'Edit ' + esc(i.name), body: billForm({ mode: 'edit', t, inst: i }), footer: delFooter(t), onMount: (f, close) => { mountBillForm(f); bindDel(f, close, t); },
      onSubmit: f => {
        const d = readBillForm(f);
        if (f.scope === 'this' || !t || t.deleted) {
          W.updateTemplate(i.templateId, { name: d.name, amountCents: d.amountCents, anchor: d.anchor, category: d.category, accountId: d.accountId, method: d.method, notes: d.notes }, { mode: 'this', instanceId: i.id });
          toast('Updated for ' + W.monthLabel(W.monthOf(i.periodKey)) + ' only');
        }
        else { const r = W.updateTemplate(t.id, d, { mode: 'future', fromMonth: W.monthOf(i.periodKey) }); toast('Updated from ' + W.monthLabel(W.monthOf(i.periodKey)) + ' on' + (r.changed ? '' : '')); }
        refresh();
      },
    });
  }
  function editTemplate(id) {
    const t = W.D.templates[id];
    modal({
      title: 'Edit ' + esc(t.name), body: `<div class="callout blue small" style="margin-bottom:12px">${ic('clock')}<div>Changes apply from <b>${W.monthLabel(curMonth())}</b> on. Earlier months and payments you've already made keep their amounts.</div></div>` + billForm({ mode: 'tpl', t }), footer: delFooter(t), onMount: (f, close) => { mountBillForm(f); bindDel(f, close, t); },
      onSubmit: f => { const d = readBillForm(f); W.updateTemplate(id, d, { mode: 'future', fromMonth: curMonth() }); toast(t.name + ' updated'); refresh(); },
    });
  }
  function paymentModal(instId) {
    const i = W.D.instances[instId]; const st = W.instStatus(i); const pays = W.paymentsFor(instId);
    if (W.isAutopay(i)) {
      modal({ title: 'Auto-pay · ' + esc(i.name), footer: false, body: `<div class="row between" style="margin-bottom:12px"><div><div class="muted small">Due ${W.dateLabel(i.dueDate, true)}</div><div style="font-weight:800;font-size:22px" class="num">${fmt(i.amountCents)}</div></div>${pill(st.status)}</div>
        <div class="callout blue small">${ic('repeat')}<div>This bill is on auto-pay, so it's marked paid automatically on its due date. To change that, edit the bill and turn off Auto-pay.</div></div>
        ${pays.length ? `<div class="section-title">Payment history</div><table class="tbl"><tbody>${pays.map(p => `<tr class="${p.voided ? 'void' : ''}"><td>${W.dateLabel(p.date, true)}<div class="tiny muted">${esc(p.note || p.method || '')}${p.voided ? ' · voided' : ''}</div></td><td class="r num"><b>${fmt(p.amountCents)}</b></td></tr>`).join('')}</tbody></table>` : `<p class="muted small">No payment yet. It will be recorded on ${W.dateLabel(i.dueDate)}.</p>`}` });
      return;
    }
    modal({
      title: 'Payment · ' + esc(i.name), submit: 'Record payment',
      body: `<div class="row between" style="margin-bottom:12px"><div><div class="muted small">Due ${W.dateLabel(i.dueDate, true)}</div><div style="font-weight:800;font-size:22px" class="num">${fmt(i.amountCents)}</div></div><div style="text-align:right">${pill(st.status)}<div class="small muted" style="margin-top:4px">${fmt(st.paid)} paid · ${fmt(st.remaining)} left</div></div></div>
      <div class="form-grid">
        ${field('Amount paid', moneyInput('amount', st.remaining || null, 'autofocus'))}
        ${field('Date paid', `<input class="input" type="date" name="date" value="${today()}">`)}
        ${field('Paid from', `<select class="input" name="source">${sourceOptions(i.accountId || W.defaultAccountId())}</select>`)}
        ${field('Method', `<input class="input" name="method" value="${esc(i.method || '')}">`)}
        ${field('Note', `<input class="input" name="note" placeholder="Confirmation #, etc.">`, 'full')}
      </div>
      ${i.dueDate > W.addDays(today(), 31) ? `<div class="callout blue small" style="margin-top:12px">${ic('clock')}<div>Early payment for ${W.monthLabel(W.monthOf(i.dueDate))}. It only marks that month.</div></div>` : ''}
      ${pays.length ? `<div class="section-title">Payment history</div><table class="tbl"><tbody>${pays.map(p => `<tr class="${p.voided ? 'void' : ''}"><td>${W.dateLabel(p.date, true)}<div class="tiny muted">${esc(W.sourceName(p.sourceId))}${p.method ? ' · ' + esc(p.method) : ''}${p.note ? ' · ' + esc(p.note) : ''}${p.voided ? ' · voided' + (p.voidReason ? ' (' + esc(p.voidReason) + ')' : '') : ''}</div></td><td class="r num"><b>${fmt(p.amountCents)}</b></td><td class="r">${p.voided ? '' : `<button type="button" class="btn sm ghost" data-act="voidPay" data-id="${p.id}">Void</button>`}</td></tr>`).join('')}</tbody></table>` : ''}`,
      onSubmit: f => { const c = needMoney(f.amount, 'payment'); W.recordPayment(instId, { amountCents: c, date: needDate(f.date), sourceId: f.source, method: f.method, note: f.note }); const s2 = W.instStatus(i); toast(s2.remaining ? `${fmt(c)} paid · ${fmt(s2.remaining)} left` : i.name + ' paid in full'); refresh(); },
    });
  }
  function moveDateModal(instId) {
    const i = W.D.instances[instId];
    modal({ title: 'Change due date for ' + W.monthLabel(W.monthOf(i.periodKey)), submit: 'Move', body: `<p class="muted small" style="margin-top:0">Only this month's ${esc(i.name)} moves. Future months keep their normal due date.</p>${field('New due date', `<input class="input" type="date" name="date" value="${i.dueDate}" autofocus>`)}`, onSubmit: f => { W.moveInstanceDue(instId, needDate(f.date)); toast(i.name + ' moved to ' + W.dateLabel(f.date)); refresh(); } });
  }
  function assignModal(instId) {
    const i = W.D.instances[instId]; const cur = W.paycheckFor(i);
    const pcs = W.paychecksBetween(W.addDays(i.dueDate, -50), W.addDays(i.dueDate, 20));
    modal({ title: 'Pay ' + esc(i.name) + ' from…', submit: 'Assign', body: `<div class="stack">${pcs.map(pc => `<label class="check"><input type="radio" name="pc" value="${pc.key}" ${cur && cur.key === pc.key ? 'checked' : ''}> ${W.dateLabel(pc.date, true)} · ${esc(pc.income.name)} <span class="muted">(${fmt(pc.amountCents)})</span></label>`).join('')}<label class="check"><input type="radio" name="pc" value="" ${!i.paycheckKey ? 'checked' : ''}> Automatic (latest paycheck before the due date)</label></div>`, onSubmit: f => { W.assignInstance(instId, f.pc || null); toast('Assigned'); refresh(); } });
  }

  // ------------------------------------------------------------ PAYCHECKS
  function viewPaychecks() {
    const incs = W.list('incomes').filter(x => !x.deleted);
    const head = (actions) => `<div class="topbar"><div><h1>Paychecks</h1><div class="sub">Every bill comes out of one paycheck. Move a bill and the math updates.</div></div>${actions || ''}</div>`;
    if (!incs.length) return head() + `<div class="empty">${ic('wallet')}<b>No income yet</b>Add a job or income source to plan bills by paycheck.<div style="margin-top:14px"><button class="btn primary" data-act="addIncome">${ic('plus')}Add income</button></div></div>`;
    const t = today();
    const pcs = W.paychecksBetween(W.addDays(t, -45), W.addDays(t, 100));
    if (!ui.pcKey || !W.paycheck(ui.pcKey)) ui.pcKey = (W.currentPaycheck() || pcs[0] || {}).key;
    const plan = ui.pcKey ? W.paycheckPlan(ui.pcKey) : null;
    const actions = `<div class="row wrap"><button class="btn" data-act="addExtraIncome">${ic('plus')}Extra income</button><button class="btn primary desk-only" data-act="addIncome">${ic('plus')}Add job</button></div>`;
    if (!plan) return head(actions) + `<div class="empty">${ic('wallet')}<b>No paychecks around today</b>Every job may have ended, or its pay schedule starts later.<div class="row wrap" style="justify-content:center;margin-top:14px">${incs.map(x => `<button class="btn" data-act="editIncome" data-id="${x.id}">Edit ${esc(x.name)}</button>`).join('')}</div></div>`;
    const all = W.paychecksBetween(W.addDays(plan.pc.date, -60), W.addDays(plan.pc.date, 60));
    const idx = all.findIndex(p => p.key === plan.pc.key); const next = all[idx + 1];
    const nplan = next ? W.paycheckPlan(next.key) : null;
    const keep = nplan && nplan.remainingAfterSetAsides < 0 ? -nplan.remainingAfterSetAsides : 0;
    const moveOpts = i => { const near = W.paychecksBetween(W.addDays(i.dueDate, -50), W.addDays(i.dueDate, 20)); return near.map(p => opt(p.key, 'Pay from ' + W.shortDate(p.date) + (incs.length > 1 ? ' · ' + p.income.name : ''), plan.pc.key)).join(''); };
    const mk = W.monthOf(plan.pc.date);
    const unassigned = W.instancesForMonth(mk).filter(i => !i.skipped && !W.paycheckFor(i));
    const extras = W.list('extraIncome').filter(x => !x.voided).sort((a, b) => a.date < b.date ? 1 : -1).slice(0, 8);
    const left = plan.remainingAfterSetAsides;
    const paidPct = plan.billTotal ? Math.round(plan.paid * 100 / plan.billTotal) : 0;
    const stop = p => {
      const pl = W.paycheckPlan(p.key); const l = pl ? pl.remainingAfterSetAsides : 0;
      const state = p.received ? 'Received' : p.date === t ? 'Today' : p.date < t ? 'Not marked' : 'Expected';
      return `<button class="pc-stop ${p.key === plan.pc.key ? 'on' : ''} ${p.date < t ? 'past' : ''}" data-act="pickPc" data-key="${p.key}" aria-pressed="${p.key === plan.pc.key}">
        <span class="pin ${l < 0 ? 'short' : ''} ${p.received ? 'got' : ''}"></span>
        <span class="d">${W.shortDate(p.date)}</span>
        <span class="a">${fmt(p.amountCents)}</span>
        <span class="st ${l < 0 ? 'neg' : ''}">${l < 0 ? 'Short ' + fmt(-l) : state}</span>
        ${incs.length > 1 ? `<span class="who">${esc(p.income.name)}</span>` : ''}</button>`;
    };
    const tickFor = (i, s) => W.isAutopay(i) && s.status !== 'skipped'
      ? (s.remaining > 0 ? `<span class="tick auto" role="img" aria-label="${esc(i.name)} auto-pays on ${W.shortDate(i.dueDate)}" title="Auto-pay">${ic('repeat')}</span>` : `<span class="tick done" role="img" aria-label="${esc(i.name)} was auto-paid">${ic('check')}</span>`)
      : s.remaining > 0 ? `<button class="tick" data-act="markPaid" data-id="${i.id}" aria-label="Mark ${esc(i.name)} paid" title="Mark paid"${s.paid ? ` style="--p:${Math.round(s.paid * 100 / i.amountCents)}%"` : ''}>${ic('check')}</button>`
        : `<button class="tick done" data-act="paidMenu" data-id="${i.id}" aria-label="${esc(i.name)} is paid">${ic('check')}</button>`;
    const metaFor = (i, s) => W.isAutopay(i) ? (s.remaining > 0 ? 'Auto-pays ' + W.shortDate(i.dueDate) : 'Auto-paid · ' + W.shortDate(i.dueDate)) : s.status === 'paid' ? 'Paid · due ' + W.shortDate(i.dueDate) : dueText(i, s);
    return head(actions) + `
      <div class="pc-line" role="tablist" aria-label="Paychecks">${pcs.map(stop).join('')}</div>
      <div class="split pc-split">
        <section class="pc-statement" aria-label="Paycheck statement">
          <div class="row between"><span class="eyebrow">${W.dateLabel(plan.pc.date, true)} · ${esc(plan.pc.income.name)}</span>${plan.pc.received ? '<span class="pill paid">Received</span>' : '<span class="pill">Expected</span>'}</div>
          <div class="hero-line"><span class="small muted">Left over after bills${plan.setAsideTotal ? ' and set-asides' : ''}</span><div class="big ${left < 0 ? 'neg' : ''}">${fmt(left)}</div></div>
          <div class="ledger">
            <div class="kv"><span>Paycheck${plan.pc.received && plan.pc.deposit && plan.pc.deposit.amountCents !== plan.pc.expectedCents ? ` <span class="faint tiny">(expected ${fmt(plan.pc.expectedCents)})</span>` : ''}</span><b>${fmt(plan.pc.amountCents)}</b></div>
            <div class="kv"><span>${plan.bills.length} bill${plan.bills.length === 1 ? '' : 's'}</span><b>−${fmt(plan.billTotal)}</b></div>
            ${plan.setAsides.map(s => `<div class="kv"><span>${esc(s.name)} <span class="faint tiny">set aside</span></span><b>−${fmt(s.amountCents)}</b></div>`).join('')}
            <div class="kv total"><span>Left over</span><span class="num ${left < 0 ? 'neg' : ''}">${fmt(left)}</span></div>
          </div>
          <div class="row wrap pc-actions">
            ${plan.pc.received ? `<button class="btn sm" data-act="undoCheck" data-key="${plan.pc.key}">${ic('undo')}Undo received</button>` : `<button class="btn sm primary" data-act="receiveCheck" data-key="${plan.pc.key}">${ic('check')}Mark received</button>`}
            <button class="btn sm" data-act="setAsides">Set-asides</button>
            <button class="btn sm ghost" data-act="editIncome" data-id="${plan.pc.incomeId}">Edit job</button>
          </div>
        </section>
        <aside class="pc-aside">
          <span class="eyebrow">Progress</span>
          <div class="pc-progress"><b class="num">${fmt(plan.paid)}</b> <span class="muted">paid of ${fmt(plan.billTotal)}</span></div>
          <div class="meter"><div class="bar"><i style="width:${paidPct}%"></i></div><div class="legend-line"><span>${plan.bills.filter(b => b.s.remaining === 0).length} of ${plan.bills.length} bills</span><span>${fmt(plan.unpaid)} to go</span></div></div>
          ${next ? `<div class="pc-next">
            <span class="eyebrow">Next check · ${W.shortDate(next.date)}</span>
            <div class="kv"><span>Left over after its bills</span><b class="${nplan.remainingAfterSetAsides < 0 ? 'neg' : ''}">${fmt(nplan.remainingAfterSetAsides)}</b></div>
            ${keep ? `<div class="callout red small" style="margin-top:10px">${ic('alert')}<div>Hold back <b>${fmt(keep)}</b> from this check. The ${W.shortDate(next.date)} check comes up short by that much${nplan.setAsideTotal ? ' after set-asides' : ''}.</div></div>` : `<p class="small muted" style="margin:8px 0 0">${ic('check').replace('<svg', '<svg style="width:14px;height:14px;vertical-align:-2px;color:var(--paid)"')} It covers its own bills.</p>`}
          </div>` : ''}
        </aside>
      </div>
      <section class="section" style="margin-top:30px">
        ${sectionH('Bills on this paycheck', `${plan.bills.length} · ${fmt(plan.billTotal)}`)}
        ${plan.bills.length ? `<div class="list pc-bills">${plan.bills.map(({ i, s }) => `<div class="pc-bill bill s-${s.status}${W.isAutopay(i) ? ' autopay' : ''}" data-inst="${i.id}">
          ${tickFor(i, s)}
          <div class="body"><div class="name"><span class="nm">${esc(i.name)}</span></div><div class="meta"><span class="due">${metaFor(i, s)}</span><span class="cat"> · ${esc(W.catName(i.category))}</span></div></div>
          <select class="input pc-move" data-act-change="movePc" data-id="${i.id}" aria-label="Which paycheck pays ${esc(i.name)}">${moveOpts(i)}</select>
          <div class="amt">${fmt(i.amountCents)}${s.paid && s.remaining ? `<span class="sub">${fmt(s.remaining)} left</span>` : ''}</div>
        </div>`).join('')}</div>
        <p class="tiny faint" style="margin:10px 0 0">Change "Pay from" to move a bill to another paycheck. A bill only ever comes out of one check.</p>` : `<div class="empty"><b>Nothing assigned</b>No bills come out of this paycheck.</div>`}
      </section>
      ${unassigned.length ? `<section class="section">${sectionH('Not on any paycheck', W.monthLabel(mk))}${unassigned.map(i => `<div class="kv"><span>${esc(i.name)} <span class="faint tiny">· due ${W.shortDate(i.dueDate)}</span></span><span class="row" style="gap:10px"><b class="num">${fmt(i.amountCents)}</b><button class="btn sm" data-act="assign" data-id="${i.id}">Assign</button></span></div>`).join('')}</section>` : ''}
      <div class="grid g2 pc-lists" style="margin-top:30px;gap:36px">
        <section class="section">${sectionH('Jobs & income', 'Add job', 'data-act="addIncome" href="#"')}
          ${incs.map(x => `<div class="kv"><span><b class="ink">${esc(x.name)}</b>${x.employer ? ` <span class="faint">· ${esc(x.employer)}</span>` : ''}<span class="tiny faint" style="display:block">${W.SCHED[x.schedule]}${x.kind === 'gross' && x.grossCents ? ' · gross ' + fmt(x.grossCents) : ''}${x.endDate ? ' · ended' : ''}</span></span><span class="row" style="gap:10px"><b class="num">${fmt(W.expectedNet(x))}</b><button class="btn sm ghost" data-act="editIncome" data-id="${x.id}">Edit</button></span></div>`).join('')}
        </section>
        <section class="section">${sectionH('Bonuses & extra income', 'Add', 'data-act="addExtraIncome" href="#"')}
          ${extras.map(x => `<div class="kv"><span>${esc(x.type[0].toUpperCase() + x.type.slice(1))}${x.note ? ' <span class="faint">· ' + esc(x.note) + '</span>' : ''}<span class="tiny faint" style="display:block">${W.dateLabel(x.date)}</span></span><span class="row" style="gap:10px"><b class="num pos">+${fmt(x.amountCents)}</b><button class="btn sm ghost" data-act="voidExtra" data-id="${x.id}">Remove</button></span></div>`).join('') || '<p class="small muted" style="margin:10px 0 0">Overtime, bonuses and side income you log here count toward the month.</p>'}
        </section>
      </div>`;
  }
  function incomeModal(id) {
    const x = id ? W.D.incomes[id] : null;
    modal({
      title: x ? 'Edit ' + esc(x.name) : 'Add job / income source', submit: x ? 'Save' : 'Add',
      body: `<div class="form-grid">
        ${field('Name', `<input class="input" name="name" value="${esc(x ? x.name : '')}" placeholder="Day job" autofocus>`)}
        ${field('Employer', `<input class="input" name="employer" value="${esc(x ? x.employer : '')}">`)}
        ${field('Net pay (take-home)', moneyInput('net', x ? x.netCents : null))}
        ${field('Gross pay (optional)', moneyInput('gross', x ? x.grossCents : null))}
        ${field('Pay schedule', `<select class="input" name="schedule">${Object.entries(W.SCHED).map(([k, l]) => opt(k, l, x ? x.schedule : 'biweekly')).join('')}</select>`)}
        ${field('A recent or next payday', `<input class="input" type="date" name="anchor" value="${x ? x.anchor : today()}">`)}
        <div class="semi row" style="gap:8px">${field('1st payday of month', `<input class="input" type="number" min="1" max="31" name="day1" value="${x ? x.day1 || 1 : 1}">`)}${field('2nd payday (31 = last day)', `<input class="input" type="number" min="1" max="31" name="day2" value="${x ? x.day2 || 15 : 15}">`)}</div>
        ${field('Deposited into', `<select class="input" name="accountId">${W.accounts().map(a => opt(a.id, a.name, x ? x.accountId : W.defaultAccountId())).join('')}</select>`)}
        ${x ? `<label class="check full"><input type="checkbox" name="ended" ${x.endDate ? 'checked' : ''}> This job has ended (stop future paychecks)</label>` : ''}
      </div><p class="tiny muted">Paycheck planner uses net pay. If you only know gross, enter it as net for now and edit it later.</p>`,
      onMount: f => { const s = () => $('.semi', f).style.display = f.schedule.value === 'semimonthly' ? '' : 'none'; f.schedule.onchange = s; s(); },
      onSubmit: f => {
        if (!f.name.trim()) throw new UserError('Enter a name');
        const net = W.parseMoney(f.net), gross = W.parseMoney(f.gross);
        if (!(net > 0) && !(gross > 0)) throw new UserError('Enter net or gross pay');
        const d = { name: f.name.trim(), employer: f.employer, netCents: net > 0 ? net : gross, grossCents: gross > 0 ? gross : null, kind: net > 0 ? 'net' : 'gross', schedule: f.schedule, anchor: needDate(f.anchor, 'payday'), day1: +f.day1 || 1, day2: +f.day2 || 15, accountId: f.accountId };
        if (f.schedule === 'monthly') d.day1 = W.parts(d.anchor).d;
        if (x) { if (d.anchor < (x.startDate || d.anchor)) d.startDate = d.anchor; d.endDate = f.ended ? (x.endDate || today()) : null; W.updateIncome(id, d); }
        else W.addIncome(Object.assign(d, { startDate: d.anchor }));
        toast('Saved'); refresh();
      },
    });
  }
  function receiveModal(key) {
    const pc = W.paycheck(key);
    modal({ title: 'Paycheck received', submit: 'Save', body: `<div class="form-grid">${field('Amount deposited', moneyInput('amount', pc.expectedCents, 'autofocus'))}${field('Deposit date', `<input class="input" type="date" name="date" value="${pc.date <= today() ? pc.date : today()}">`)}${field('Into account', `<select class="input" name="acc">${W.accounts().map(a => opt(a.id, a.name, pc.income.accountId)).join('')}</select>`)}${field('Note', `<input class="input" name="note">`)}</div>`, onSubmit: f => { W.recordDeposit(key, { amountCents: needMoney(f.amount), date: needDate(f.date), accountId: f.acc, note: f.note }); toast('Paycheck recorded'); refresh(); } });
  }
  function extraIncomeModal() {
    modal({ title: 'Add bonus / extra income', submit: 'Add', body: `<div class="form-grid">${field('Type', `<select class="input" name="type">${['bonus', 'overtime', 'side job', 'refund', 'gift', 'other'].map(t => opt(t, t[0].toUpperCase() + t.slice(1))).join('')}</select>`)}${field('Amount', moneyInput('amount', null, 'autofocus'))}${field('Date', `<input class="input" type="date" name="date" value="${today()}">`)}${field('Into account', `<select class="input" name="acc">${W.accounts().map(a => opt(a.id, a.name, W.defaultAccountId())).join('')}</select>`)}${field('From job (optional)', `<select class="input" name="inc"><option value="">—</option>${W.list('incomes').map(i => opt(i.id, i.name)).join('')}</select>`)}${field('Note', `<input class="input" name="note">`)}</div>`, onSubmit: f => { W.addExtraIncome({ type: f.type, amountCents: needMoney(f.amount), date: needDate(f.date), accountId: f.acc, incomeId: f.inc || null, note: f.note }); toast('Income added'); refresh(); } });
  }
  function setAsidesModal() {
    const sa = (W.settings().setAsides || []).slice();
    const rows = () => sa.map((s, k) => `<div class="row" style="margin-bottom:8px"><input class="input grow" name="n${k}" value="${esc(s.name)}" placeholder="Name">${moneyInput('a' + k, s.amountCents, 'style="width:130px"')}<button type="button" class="btn icon ghost" data-rm="${k}">${ic('trash')}</button></div>`).join('');
    const m = modal({ title: 'Per-paycheck set-asides', body: `<p class="muted small" style="margin-top:0">Money you keep from every paycheck for things that aren't bills, like food and gas. It's subtracted in the paycheck planner and in future cash.</p><div id="saRows">${rows()}</div><button type="button" class="btn sm" id="saAdd">${ic('plus')}Add set-aside</button><label class="check" style="margin-top:14px"><input type="checkbox" name="proj" ${W.settings().projectionIncludesSetAsides ? 'checked' : ''}> Include in future cash projection</label>`,
      onMount: f => {
        const collect = () => sa.forEach((s, k) => { s.name = f['n' + k].value; s.amountCents = W.parseMoney(f['a' + k].value) || 0; });
        f.addEventListener('click', e => { const rm = e.target.closest('[data-rm]'); if (rm) { collect(); sa.splice(+rm.dataset.rm, 1); $('#saRows', f).innerHTML = rows(); } });
        $('#saAdd', f).onclick = () => { collect(); sa.push({ id: W.uid('sa'), name: '', amountCents: 0 }); $('#saRows', f).innerHTML = rows(); };
      },
      onSubmit: (f, form) => { sa.forEach((s, k) => { s.name = (form['n' + k].value || 'Set-aside').trim(); s.amountCents = W.parseMoney(form['a' + k].value) || 0; }); W.saveSettings({ setAsides: sa.filter(s => s.amountCents > 0), projectionIncludesSetAsides: !!f.proj }); toast('Set-asides saved'); refresh(); } });
    void m;
  }

  // ------------------------------------------------------------ EXPENSES
  function viewExpenses() {
    const mk = ui.month;
    const monthEx = W.list('expenses').filter(e => W.monthOf(e.date) === mk);
    let ex = monthEx.slice();
    const q = ui.expSearch.trim().toLowerCase();
    if (q) ex = ex.filter(e => (e.description || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q) || W.catName(e.category).toLowerCase().includes(q) || W.centsToStr(e.amountCents).includes(q));
    if (ui.expCat) ex = ex.filter(e => e.category === ui.expCat);
    const SORT = { date: (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || '') < (a.createdAt || '') ? -1 : 1, amount: (a, b) => b.amountCents - a.amountCents, category: (a, b) => W.catName(a.category).localeCompare(W.catName(b.category)) || b.amountCents - a.amountCents };
    const sortKey = SORT[ui.expSort] ? ui.expSort : 'date';
    ex.sort(SORT[sortKey]);
    const sp = W.spendingByCategory(mk); const total = Object.values(sp).reduce((a, b) => a + b, 0);
    const exTotal = monthEx.reduce((a, e) => a + e.amountCents, 0);
    const ranked = Object.entries(sp).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const top = ranked[0];
    const card = W.cardPaymentsInMonth(mk);
    const filteredTotal = ex.reduce((a, e) => a + e.amountCents, 0);
    const row = e => `<tr data-exp="${e.id}">
        <td class="ex-what"><span class="ex-name">${esc(e.description || W.catName(e.category))}</span>${e.receiptId ? ` <button class="ex-rcpt" data-act="viewReceipt" data-id="${e.receiptId}" aria-label="View receipt" title="View receipt">${ic('receipt')}</button>` : ''}
          <span class="ex-meta"><i class="dot" style="background:${W.catColor(e.category)}"></i>${esc(W.catName(e.category))}${sortKey !== 'date' ? ' · ' + W.shortDate(e.date) : ''} · ${esc(W.sourceName(e.sourceId))}${e.notes ? ' · ' + esc(e.notes) : ''}</span></td>
        <td class="r num ex-amt">${fmt(e.amountCents)}</td>
        <td class="r ex-act"><button class="btn sm icon ghost" data-act="editExpense" data-id="${e.id}" aria-label="Edit ${esc(e.description || 'expense')}">${ic('edit')}</button><button class="btn sm icon ghost" data-act="deleteExpense" data-id="${e.id}" aria-label="Delete ${esc(e.description || 'expense')}">${ic('trash')}</button></td></tr>`;
    let body = '';
    if (!ex.length) body = `<tr><td colspan="3"><div class="empty">${ic('cash')}<b>${q || ui.expCat ? 'Nothing matches' : 'No purchases yet'}</b>${q || ui.expCat ? 'Try a different search or category.' : 'Log groceries, gas and everyday spending for ' + W.monthLabel(mk) + '.'}</div></td></tr>`;
    else if (sortKey === 'date') {
      let cur = null; const dayTot = {};
      ex.forEach(e => { dayTot[e.date] = (dayTot[e.date] || 0) + e.amountCents; });
      ex.forEach(e => { if (e.date !== cur) { cur = e.date; body += `<tr class="day-h"><td>${e.date === today() ? 'Today · ' : W.diffDays(e.date, today()) === 1 ? 'Yesterday · ' : ''}${W.dateLabel(e.date)}</td><td class="r num">${fmt(dayTot[e.date])}</td><td></td></tr>`; } body += row(e); });
    } else body = ex.map(row).join('');
    return `<div class="topbar"><div><h1>Expenses</h1><div class="sub">Everyday purchases. Bills you mark paid are counted for you, so there's no need to log them twice.</div></div><div class="row wrap">${monthSel('month', mk)}<button class="btn primary desk-only" data-act="addExpense">${ic('plus')}Add expense</button></div></div>
      <div class="figures" style="--n:4">
        ${fig('Purchases', fmt(exTotal), monthEx.length + ' logged')}
        ${fig('Total spending', fmt(total), 'purchases + bills paid')}
        ${fig('Biggest category', top ? esc(W.catName(top[0])) : '—', top ? fmt(top[1]) + ' · ' + Math.round(top[1] * 100 / Math.max(1, total)) + '%' : 'nothing yet')}
        ${fig('Card payments', fmt(card), 'not counted again')}
      </div>
      <div class="split ex-split" style="margin-top:28px">
        <section class="section">
          ${sectionH('Ledger', ex.length ? `${ex.length} item${ex.length === 1 ? '' : 's'} · ${fmt(filteredTotal)}` : W.monthLabel(mk, true))}
          <div class="toolbar">
            <div class="search">${ic('search')}<input class="input" placeholder="Search store, note or amount" value="${esc(ui.expSearch)}" data-bind="expSearch" aria-label="Search expenses"></div>
            <select class="input" data-bind="expCat" aria-label="Category"><option value="">All categories</option>${catOptions(ui.expCat)}</select>
            <select class="input" data-bind="expSort" aria-label="Sort">${[['date', 'By day, newest first'], ['amount', 'Largest first'], ['category', 'By category']].map(([v, l]) => opt(v, l, sortKey)).join('')}</select>
          </div>
          <table class="tbl ex-tbl"><colgroup><col><col class="c-amt"><col class="c-act"></colgroup><tbody>${body}</tbody></table>
        </section>
        <aside class="section">
          ${sectionH('By category', W.monthLabel(mk, true))}
          <div style="margin-top:14px">${rankBars(ranked.map(([id, v]) => ({ id, label: W.catName(id), value: v, act: 'catDrill' })), { limit: 8, empty: 'Purchases and paid bills appear here.' })}</div>
          ${ui.expCat ? `<p class="small" style="margin:14px 0 0">Showing <b>${esc(W.catName(ui.expCat))}</b> only. <button class="link" data-act="expAllCats">Show all</button></p>` : `<p class="tiny faint" style="margin:14px 0 0">Tap a category to filter the ledger. Credit-card payments${card ? ` (${fmt(card)})` : ''} are transfers, so they're left out here; the purchases on the card already count.</p>`}
        </aside>
      </div>`;
  }
  function expenseModal(id, preset) {
    const e = id ? W.D.expenses[id] : null; preset = preset || {};
    let receiptData = e && e.receiptId ? (W.D.receipts[e.receiptId] || {}).dataUrl : null;
    const unpaid = W.instancesBetween(W.addDays(today(), -45), W.addDays(today(), 30)).filter(i => !i.skipped && !W.isAutopay(i) && W.instStatus(i).remaining > 0);
    modal({
      title: e ? 'Edit expense' : 'Add expense', submit: e ? 'Save' : 'Add expense',
      body: `<div class="form-grid">
        ${field('Amount', moneyInput('amount', e ? e.amountCents : null, 'autofocus'))}
        ${field('Date', `<input class="input" type="date" name="date" value="${e ? e.date : preset.date || today()}">`)}
        ${field('Category', `<select class="input" name="category">${catOptions(e ? e.category : preset.category || 'cat_groceries')}</select><button type="button" class="btn sm ghost" style="margin-top:4px" id="newCat">${ic('plus')}New category</button>`)}
        ${field('Paid with', `<select class="input" name="source">${sourceOptions(e ? e.sourceId : W.defaultAccountId())}</select>`)}
        ${field('Description', `<input class="input" name="description" value="${esc(e ? e.description : '')}" placeholder="Walmart, Shell, …">`, 'full')}
        ${field('Notes', `<input class="input" name="notes" value="${esc(e ? e.notes : '')}">`, 'full')}
        <div class="full"><span class="small muted" style="font-weight:650">Receipt</span><div class="row" style="margin-top:6px"><img id="rcPrev" class="receipt-thumb" ${safeImg(receiptData) ? `src="${safeImg(receiptData)}"` : 'style="display:none"'}><label class="btn sm">${ic('upload')}${receiptData ? 'Replace' : 'Attach photo'}<input type="file" accept="image/*" id="rcFile" hidden></label>${receiptData ? '<button type="button" class="btn sm ghost" id="rcRm">Remove</button>' : ''}</div></div>
        ${!e && unpaid.length ? `<div class="full callout blue small">${ic('alert')}<div class="grow">Is this a bill payment? Mark the bill paid instead, so it isn't counted twice.<select class="input" name="asBill" style="margin-top:8px"><option value="">No, it's a regular expense</option>${unpaid.map(i => opt(i.id, i.name + ' · ' + W.shortDate(i.dueDate) + ' · ' + fmt(W.instStatus(i).remaining))).join('')}</select></div></div>` : ''}
      </div>`,
      onMount: f => {
        $('#rcFile', f).onchange = async ev => { const file = ev.target.files[0]; if (!file) return; receiptData = await shrinkImage(file); const img = $('#rcPrev', f); img.src = receiptData; img.style.display = ''; };
        const rm = $('#rcRm', f); if (rm) rm.onclick = () => { receiptData = null; $('#rcPrev', f).style.display = 'none'; };
        $('#newCat', f).onclick = async () => { const n = await askText('New category', 'Name for the new category.'); if (n && n.trim()) { const c = W.addCategory(n.trim().slice(0, 40), randomColor()); if (!f.category.querySelector(`option[value="${c.id}"]`)) f.category.insertAdjacentHTML('beforeend', opt(c.id, c.name)); f.category.value = c.id; } };
      },
      onSubmit: (f, form, close) => {
        const amt = needMoney(f.amount); const date = needDate(f.date);
        if (f.asBill) { W.recordPayment(f.asBill, { amountCents: amt, date, sourceId: f.source, note: f.description }); toast('Recorded as a bill payment'); refresh(); return; }
        if (receiptData && !safeImg(receiptData)) throw new Error('That receipt file isn\'t a supported image (use a JPG, PNG or WebP photo)');
        const doSave = () => {
          let receiptId = e ? e.receiptId : null;
          if (receiptData && (!receiptId || (W.D.receipts[receiptId] || {}).dataUrl !== receiptData)) { receiptId = receiptId || W.uid('rcpt'); W.save('receipts', { id: receiptId, dataUrl: receiptData }); }
          if (!receiptData && receiptId) { W.del('receipts', receiptId); receiptId = null; }
          const d = { amountCents: amt, date, category: f.category, sourceId: f.source, description: f.description.trim(), notes: f.notes, receiptId };
          if (e) W.updateExpense(id, d); else W.addExpense(d);
          toast(e ? 'Expense updated' : 'Expense added'); refresh();
        };
        const dup = !e && W.findDuplicatePayment(amt, date);
        if (dup && dup.length) { confirmBox('Possible duplicate', `You already recorded a <b>${fmt(amt)}</b> payment for <b>${esc(dup[0].i ? dup[0].i.name : 'a bill')}</b> on ${W.dateLabel(dup[0].p.date)}. Add this expense anyway?`, 'Add anyway').then(ok => { if (ok) { doSave(); close(); } }); return false; }
        doSave();
      },
    });
  }
  // centered square crop for the profile photo (small JPEG, kept in settings)
  function squareImage(file, size) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = rej;
      fr.onload = () => { const img = new Image(); img.onload = () => { const m = Math.min(img.width, img.height); const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size); g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size); res(c.toDataURL('image/jpeg', 0.82)); }; img.onerror = rej; img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  function shrinkImage(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader(); fr.onerror = rej;
      fr.onload = () => { const img = new Image(); img.onload = () => { const max = 1400; const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.78)); }; img.onerror = () => res(fr.result); img.src = fr.result; };
      fr.readAsDataURL(file);
    });
  }
  const randomColor = () => ['#6366f1', '#0ea5e9', '#f97316', '#22c55e', '#ec4899', '#14b8a6', '#a855f7', '#eab308', '#ef4444', '#84cc16'][Math.floor(Math.random() * 10)];

  // ------------------------------------------------------------ DEBTS
  const DEBT_TYPES = { credit_card: 'Credit card', auto: 'Auto loan', personal: 'Personal loan', student: 'Student loan', mortgage: 'Mortgage', medical: 'Medical', other: 'Other loan' };
  function viewDebts() {
    const ds = W.debts();
    const open = ds.filter(d => !d.closed);
    const total = W.totalDebt(); const mins = open.reduce((a, d) => a + (d.minCents || 0), 0);
    const inputs = W.debtInputs();
    const extra = ui.payoffExtra || 0;
    const sMin = W.simulatePayoff(inputs, 0, 'minimum'), sAva = W.simulatePayoff(inputs, extra, 'avalanche'), sSnow = W.simulatePayoff(inputs, extra, 'snowball');
    const when = s => s.months ? W.monthLabel(W.addMonthKey(curMonth(), s.months), true) : 'Never';
    const cards = open.filter(d => d.type === 'credit_card' && d.limitCents);
    const lim = cards.reduce((a, d) => a + d.limitCents, 0), cb = cards.reduce((a, d) => a + Math.max(0, W.debtBalance(d.id)), 0);
    const util = lim ? Math.round(cb * 100 / lim) : null;
    const weighted = open.reduce((a, d) => a + Math.max(0, W.debtBalance(d.id)) * (d.aprCenti || 0), 0);
    const avgApr = total ? Math.round(weighted / total) : 0;
    const monthlyInterest = open.reduce((a, d) => a + W.monthlyInterest(Math.max(0, W.debtBalance(d.id)), d.aprCenti || 0), 0);
    const groups = [['Credit cards', ds.filter(d => d.type === 'credit_card' && !d.closed)], ['Loans', ds.filter(d => d.type !== 'credit_card' && !d.closed)], ['Closed', ds.filter(d => d.closed)]];
    const len = Math.max(sAva.timeline.length, Math.min(sMin.timeline.length, 240));
    const best = sAva.totalInterest <= sSnow.totalInterest ? 'ava' : 'snow';
    const order = s => s.debts.slice().sort((a, b) => (a.paidOffMonth || 999) - (b.paidOffMonth || 999)).map(d => `<li><span>${esc(d.name)}</span><span class="num faint">${d.paidOffMonth ? W.monthLabel(W.addMonthKey(curMonth(), d.paidOffMonth), true) : '—'}</span></li>`).join('');
    const planRow = (key, name, how, s) => `<tr class="${best === key ? 'best' : ''}"><td><b>${name}</b><div class="tiny muted">${how}</div></td><td class="num">${when(s)}</td><td class="r num">${s.months ? fmt(s.totalInterest) : '—'}</td><td class="r num ${key !== 'min' ? 'pos' : ''}">${key === 'min' ? '<span class="faint">—</span>' : sMin.months ? fmt(sMin.totalInterest - s.totalInterest) : s.months ? '<span title="Minimum payments alone never pay this off">Gets you out</span>' : '—'}</td></tr>`;
    return `<div class="topbar"><div><h1>Debt</h1><div class="sub">What you owe, what it costs each month, and the fastest way out.</div></div><button class="btn primary" data-act="addDebt">${ic('plus')}Add a debt</button></div>
      <div class="figures" style="--n:4">
        ${fig('Total owed', fmt(total), open.length + ' open account' + (open.length === 1 ? '' : 's'))}
        ${fig('Minimums', fmt(mins) + '<span class="unit">/mo</span>', 'about ' + fmt(monthlyInterest) + ' of it is interest')}
        ${fig('Card utilization', util == null ? '—' : util + '%', lim ? fmt(cb) + ' of ' + fmt(lim) + ' in limits' : 'no card limits set', util > 50 ? 'neg' : util > 30 ? 'warn' : '')}
        ${fig('Debt-free at minimums', sMin.months ? when(sMin) : 'Never', sMin.months ? fmt(sMin.totalInterest) + ' total interest' : 'minimums don\'t cover the interest', sMin.months ? '' : 'neg')}
      </div>
      <section class="section" style="margin-top:30px">
        <div class="section-h"><h2>Accounts</h2><span class="meta">Avg. APR ${W.pctStr(avgApr)} · paying a linked bill lowers its balance</span></div>
        ${ds.length ? `<div class="debt-list">
          <div class="debt-row debt-head"><span>Account</span><span class="r">Balance</span><span class="r">Minimum</span><span>Utilization</span><span>Paid off at minimum</span><span></span></div>
          ${groups.filter(g => g[1].length).map(([label, list]) => `<div class="group-h"><span class="t">${label}</span><span class="s"><b>${fmt(list.reduce((a, d) => a + Math.max(0, W.debtBalance(d.id)), 0))}</b></span></div>${list.map(debtCard).join('')}`).join('')}
        </div>` : `<div class="empty"><b>No debts added</b>Add a card or loan to see payoff dates and interest.</div>`}
      </section>
      ${inputs.length ? `<section class="section">
        <div class="section-h"><h2>Payoff plan</h2><span class="meta">Snowball vs. avalanche</span></div>
        <div class="payoff-controls"><label class="small muted" for="pxtra">Extra each month on top of minimums</label>
          <div class="row wrap"><input id="pxtra" class="input money-in" style="width:120px" inputmode="decimal" value="${W.centsToStr(extra)}" data-act-change="payoffExtra"><div class="chips">${[0, 5000, 10000, 25000, 50000].map(v => `<button class="chip ${extra === v ? 'on' : ''}" data-act="payoffPreset" data-v="${v}">${v ? '+' + fmt0(v) : 'None'}</button>`).join('')}</div></div></div>
        <div class="tbl-wrap"><table class="tbl plan-tbl"><thead><tr><th>Plan</th><th>Debt-free</th><th class="r">Interest</th><th class="r">Saves</th></tr></thead><tbody>
          ${planRow('min', 'Minimums only', 'What happens if nothing changes', sMin)}
          ${planRow('ava', 'Avalanche', 'Extra goes to the highest APR first', sAva)}
          ${planRow('snow', 'Snowball', 'Extra goes to the smallest balance first', sSnow)}
        </tbody></table></div>
        <div style="margin-top:18px">${lineChart({ title: 'Total debt balance over time by plan', width: 1000, height: 240, labels: Array.from({ length: len }, (_, k) => W.monthLabel(W.addMonthKey(curMonth(), k), true)), series: [{ name: 'Minimums only', color: 'var(--ink-3)', values: pad(sMin.timeline, len) }, { name: 'Avalanche', color: 'var(--s1)', values: pad(sAva.timeline, len) }, { name: 'Snowball', color: 'var(--s2)', values: pad(sSnow.timeline, len), dash: '6 4' }], maxLabels: 6 })}</div>
        <div class="payoff-order">
          <div><span class="eyebrow">Avalanche order</span><ol>${order(sAva)}</ol></div>
          <div><span class="eyebrow">Snowball order</span><ol>${order(sSnow)}</ol></div>
        </div>
      </section>` : ''}`;
  }
  const pad = (arr, n) => arr.concat(Array(Math.max(0, n - arr.length)).fill(0)).slice(0, n);
  function debtCard(d) {
    const bal = W.debtBalance(d.id); const util = d.limitCents ? Math.round(bal * 100 / d.limitCents) : null;
    const one = W.simulatePayoff([{ id: d.id, name: d.name, balanceCents: bal, aprCenti: d.aprCenti, minCents: d.minCents }], 0, 'minimum');
    const plus = W.simulatePayoff([{ id: d.id, name: d.name, balanceCents: bal, aprCenti: d.aprCenti, minCents: d.minCents }], 5000, 'avalanche');
    const bills = W.list('templates').filter(t => t.debtId === d.id && !t.deleted);
    const ord = n => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
    const payoff = bal <= 0 ? '<span class="pos">Paid off</span>' : one.months ? `${W.monthLabel(W.addMonthKey(curMonth(), one.months), true)}<div class="tiny faint">${fmt(one.totalInterest)} interest${plus.months && one.months - plus.months > 0 ? ` · +${fmt0(5000)}/mo saves ${fmt(one.totalInterest - plus.totalInterest)}` : ''}</div>` : '<span class="neg">Minimum doesn\'t cover interest</span>';
    return `<div class="debt-row ${d.closed ? 'closed' : ''}" data-debt="${d.id}">
      <div class="d-name"><b>${esc(d.name)}</b><div class="tiny muted">${esc(DEBT_TYPES[d.type] || d.type)} · ${esc(W.pctStr(d.aprCenti || 0))} APR · due the ${esc(ord(+d.dueDay || 1))}${bills.length ? '' : ' · <span class="warn">no linked bill</span>'}</div></div>
      <div class="d-bal r num"><b>${fmt(bal)}</b></div>
      <div class="d-min r num">${fmt(d.minCents || 0)}<span class="tiny faint m-lbl"> min</span></div>
      <div class="d-util">${util != null ? `<div class="util"><span class="progress thin ${util > 70 ? 'over' : util > 30 ? 'warn' : ''}"><i style="width:${Math.min(100, util)}%"></i></span><span class="num tiny ${util > 70 ? 'neg' : ''}">${util}%</span></div>` : '<span class="faint tiny">—</span>'}</div>
      <div class="d-pay small">${payoff}</div>
      <div class="d-act"><button class="btn sm" data-act="debtPay" data-id="${d.id}" title="Make an extra payment">Pay extra</button><button class="btn sm icon ghost" data-act="debtMenu" data-id="${d.id}" aria-label="More for ${esc(d.name)}">${ic('dots')}</button></div>
    </div>`;
  }
  function debtModal(id) {
    const d = id ? W.D.debts[id] : null;
    modal({
      title: d ? 'Edit ' + esc(d.name) : 'Add debt', submit: d ? 'Save' : 'Add',
      body: `<div class="form-grid">
        ${field('Name', `<input class="input" name="name" value="${esc(d ? d.name : '')}" autofocus>`)}
        ${field('Type', `<select class="input" name="type">${Object.entries(DEBT_TYPES).map(([k, l]) => opt(k, l, d ? d.type : 'credit_card')).join('')}</select>`)}
        ${d ? '' : field('Current balance', moneyInput('balance', null))}
        ${field('Interest rate (APR %)', `<input class="input" name="apr" inputmode="decimal" value="${d ? W.centsToStr(d.aprCenti || 0) : ''}" placeholder="24.99">`)}
        ${field('Minimum monthly payment', moneyInput('min', d ? d.minCents : null))}
        ${field('Payment due day', `<input class="input" type="number" min="1" max="31" name="dueDay" value="${d ? d.dueDay : 1}">`)}
        ${field('Credit limit (cards)', moneyInput('limit', d ? d.limitCents : null))}
        <label class="check full"><input type="checkbox" name="autoInterest" ${!d || d.autoInterest ? 'checked' : ''}> Add interest automatically each month on the due date</label>
        ${d ? `<label class="check full"><input type="checkbox" name="closed" ${d.closed ? 'checked' : ''}> Account closed / paid off</label>` : `<label class="check full"><input type="checkbox" name="mkBill" checked> Also create a monthly bill for the minimum payment</label>`}
      </div>`,
      onSubmit: f => {
        if (!f.name.trim()) throw new UserError('Enter a name');
        const apr = W.parsePct(f.apr || '0'); if (apr == null || apr < 0) throw new UserError('Enter a valid APR');
        const data = { name: f.name.trim(), type: f.type, aprCenti: apr, minCents: W.parseMoney(f.min) || 0, dueDay: Math.min(31, Math.max(1, +f.dueDay || 1)), limitCents: W.parseMoney(f.limit) || null, autoInterest: !!f.autoInterest };
        if (d) { data.closed = !!f.closed; W.updateDebt(id, data); }
        else {
          const nd = W.addDebt(Object.assign(data, { startBalanceCents: needMoney(f.balance || '0', 'balance', true), startDate: today() }));
          if (f.mkBill && data.minCents > 0) { const mk = W.dateInMonthClamped(curMonth(), data.dueDay); W.addTemplate({ name: data.name, amountCents: data.minCents, anchor: mk >= today() ? mk : W.addMonthsClamp(mk, 1), frequency: 'monthly', category: data.type === 'credit_card' ? 'cat_credit_cards' : 'cat_loans', debtId: nd.id }); }
        }
        toast('Saved'); refresh();
      },
    });
  }
  function debtTxnModal(id, kind) {
    const d = W.D.debts[id];
    const titles = { pay: 'Extra payment to ' + d.name, charge: 'Add charge / purchase to ' + d.name, balance: 'Update balance for ' + d.name };
    modal({
      title: esc(titles[kind]), submit: 'Save',
      body: `<div class="form-grid">${field(kind === 'balance' ? 'Balance on your statement' : 'Amount', moneyInput('amount', kind === 'balance' ? W.debtBalance(id) : null, 'autofocus'))}${field('Date', `<input class="input" type="date" name="date" value="${today()}">`)}
        ${kind === 'pay' ? field('Paid from', `<select class="input" name="acc">${W.accounts().map(a => opt(a.id, a.name, W.defaultAccountId())).join('')}</select>`) : ''}
        ${kind === 'charge' ? field('What for', `<input class="input" name="note" placeholder="Fee, purchase…">`) + `<p class="tiny muted full">To track a purchase as spending too, add it in Expenses and pick this card under "Paid with". Don't add it in both places.</p>` : ''}
        ${kind === 'balance' ? `<p class="tiny muted full">Adds an adjustment so the balance matches your statement. Payment history isn't changed.</p>` : ''}</div>`,
      onSubmit: f => {
        const c = needMoney(f.amount, 'amount', kind === 'balance'); const date = needDate(f.date);
        if (kind === 'pay') W.payDebtExtra(id, c, date, f.acc);
        else if (kind === 'charge') W.addDebtTxn({ debtId: id, type: 'charge', amountCents: c, date, note: f.note || 'Charge' });
        else W.setDebtBalance(id, c, date);
        toast('Saved'); refresh();
      },
    });
  }
  function debtHistory(id) {
    const d = W.D.debts[id]; let bal = d.startBalanceCents;
    const rows = W.debtCharges(id).map(x => { bal += x.amountCents; return { x, bal }; }).reverse();
    modal({ title: esc(d.name) + ' history', wide: true, footer: false, body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Activity</th><th class="r">Amount</th><th class="r">Balance</th><th></th></tr></thead><tbody>${rows.map(({ x, bal }) => `<tr><td class="small">${W.shortDate(x.date)}</td><td>${esc(x.label)} <span class="pill">${esc(x.type)}</span></td><td class="r num ${x.amountCents < 0 ? 'pos' : ''}">${x.amountCents < 0 ? '−' : '+'}${fmt(Math.abs(x.amountCents))}</td><td class="r num">${fmt(bal)}</td><td class="r">${x.txn ? `<button class="btn sm ghost" type="button" data-act="voidDebtTxn" data-id="${x.ref}">Void</button>` : ''}</td></tr>`).join('')}<tr><td class="small">${W.shortDate(d.startDate)}</td><td>Starting balance</td><td></td><td class="r num">${fmt(d.startBalanceCents)}</td><td></td></tr></tbody></table></div>` });
  }

  // ------------------------------------------------------------ SMART BUDGET
  // UI over window.WTSmart (smartbudget.js). Read-only on money data: it only writes settings.smartBudget,
  // and only when the user taps Save / Use this. Editing happens in an in-memory draft (sbDraft).
  const SB_BUCKETS = [['needs', 'Needs', 'var(--s1)', 'Essential bills, groceries, gas'], ['debt', 'Debt', 'var(--s2)', 'Minimums plus any extra'], ['savings', 'Savings', 'var(--s3)', 'Emergency fund and goals'], ['wants', 'Wants', 'var(--auto)', 'Subscriptions, eating out, fun']];
  const SB_KEYS = SB_BUCKETS.map(b => b[0]);
  // what kind of plan each strategy is (shown as a label on the strategy cards)
  const SB_KINDS = {
    recommended: ['Personalized', 'Built from your actual paychecks, bills and debts.'],
    '50-30-20': ['Balanced', '50% needs and minimum payments, 30% wants, 20% savings.'],
    '60-20-20': ['High cost of living', '60% needs and minimum payments, 20% wants, 20% savings.'],
    debt: ['Debt payoff', 'Covers bills, then puts extra toward your highest-interest debt.'],
    savings: ['Savings builder', 'Covers bills, then builds your emergency fund and goals.'],
    zero: ['Zero-based', 'Every dollar gets a job: bills and minimums first, then the rest.'],
    custom: ['Your own split', 'The amounts you set yourself.'],
  };
  const sbKind = (id, withDesc) => { const k = SB_KINDS[id]; return k ? `<div class="sb-kind"><span class="sb-kind-tag k-${esc(id)}">${k[0]}</span>${withDesc ? `<span>${k[1]}</span>` : ''}</div>` : ''; };
  const SB_NAMES = { recommended: 'Recommended for you', '50-30-20': '50/30/20', '60-20-20': '60/20/20', debt: 'Debt-focused', savings: 'Savings-focused', zero: 'Zero-based', custom: 'Custom' };
  const SB_ROLL = [['reset', 'Reset to $0'], ['carry', 'Carry into next month'], ['savings', 'Move to savings'], ['debt', 'Extra debt payment']];
  if (!P.unlock) P.unlock = 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.6-1.8';
  const sbPct = p => { const v = Math.round((+p || 0) * 10) / 10; return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + '%'; };
  const sbCfg = () => { const s = W.settings().smartBudget; return s && typeof s === 'object' ? s : {}; };
  const sbEngine = () => { const E = window.WTSmart; return E && typeof E.analyze === 'function' && typeof E.strategies === 'function' ? E : null; };
  function sbTry(fn, fb) { try { const v = fn(); return v == null ? fb : v; } catch (e) { console.error(e); return fb; } }
  const sbValid = s => s && s.pct && s.amounts && SB_KEYS.every(k => isFinite(+s.pct[k]) && Number.isFinite(+s.amounts[k]));
  const sbCentsOk = o => o && typeof o === 'object' && SB_KEYS.every(k => Number.isInteger(o[k]) && o[k] >= 0);
  const sbSum = o => SB_KEYS.reduce((t, k) => t + (Math.round(+o[k]) || 0), 0);
  const sbName = s => (s && (s.name || SB_NAMES[s.id])) || 'Budget';
  const sbMoneyIn = c => W.fmt(Math.max(0, Math.round(+c || 0))).replace(/^\$/, ''); // "1,234.56" for the $ field
  const sbPctIn = p => { const v = Math.round((+p || 0) * 10) / 10; return String(v); };
  // living costs = essential bills + everyday necessities (groceries, gas, transport)
  const sbLiving = a => isFinite(+a.living) && a.living != null ? +a.living : (+a.essentials || 0) + (a.everyday != null ? +a.everyday || 0 : (a.spending && +a.spending.needs) || 0);
  // realistic = living costs and minimums are covered (engine decides when it says so)
  const sbRealistic = (s, a) => { if (!s) return false; if (typeof s.realistic === 'boolean') return s.realistic; if (s.feasible === false) return false; const e = sbEff(s); return !a || ((+e.amounts.needs || 0) >= sbLiving(a) && (+e.amounts.debt || 0) >= (+a.debtMinimums || 0)); };
  // a preset that doesn't fit the user's bills is planned with its adjusted (realistic) numbers; a custom plan is planned exactly as typed
  function sbEff(s) {
    if (!(s && s.id !== 'custom' && (s.feasible === false || s.realistic === false) && s.adjusted && sbValid(s.adjusted))) return s;
    const total = SB_KEYS.reduce((t, k) => t + (+s.amounts[k] || 0), 0);
    const amounts = sbFit(s.adjusted.amounts, total);
    const fits = SB_KEYS.every(k => amounts[k] === s.adjusted.amounts[k]);
    const pct = fits ? s.adjusted.pct : sbPctOf(amounts, total, s.adjusted.pct);
    return Object.assign({}, s, { pct, amounts, adjusted: { pct, amounts }, isAdjusted: true });
  }
  // percentages (1 decimal, sum exactly 100) of amounts that sum to total
  function sbPctOf(amts, total, fb) {
    if (!(total > 0)) return fb;
    const t = SB_KEYS.map(k => amts[k] * 1000 / total), fl = t.map(Math.floor); let left = 1000 - fl.reduce((a, b) => a + b, 0);
    t.map((v, i) => [v - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
    const o = {}; SB_KEYS.forEach((k, i) => o[k] = fl[i] / 10); return o;
  }
  // adjusted amounts must still add up to take-home pay: trim any excess from needs, then wants, savings, debt
  function sbFit(amts, total) {
    const o = {}; SB_KEYS.forEach(k => o[k] = Math.max(0, Math.round(+amts[k] || 0)));
    let extra = SB_KEYS.reduce((t, k) => t + o[k], 0) - total;
    if (extra < 0) o.needs -= extra; // short: the rest goes to needs
    for (const k of ['needs', 'wants', 'savings', 'debt']) { if (extra <= 0) break; const t = Math.min(o[k], extra); o[k] -= t; extra -= t; }
    return o;
  }
  // ---- editor math (no forced 100%). Engine helpers are used when present; local fallbacks match the contract.
  function sbCalc(a, dollars) {
    const d = {}; SB_KEYS.forEach(k => d[k] = Math.max(0, Math.round(+dollars[k] || 0)));
    const E = sbEngine(), I = +a.income || 0;
    const r = E && typeof E.fromDollars === 'function' ? sbTry(() => E.fromDollars(a, Object.assign({}, d)), null) : null;
    const pct = {}; SB_KEYS.forEach(k => { pct[k] = r && r.pct && isFinite(+r.pct[k]) ? +r.pct[k] : I > 0 ? Math.round(d[k] * 1000 / I) / 10 : 0; });
    const total = sbSum(d), un = I - total, living = sbLiving(a), min = +a.debtMinimums || 0;
    const warnings = [];
    if (un < 0) warnings.push(`Your plan is ${fmt(-un)} more than your take-home pay (${fmt(I)}). Lower a bucket, or tap “Spread over unlocked”.`);
    if (d.needs < living) warnings.push(`Needs is ${fmt(living - d.needs)} below your living costs (${fmt(living)} for essential bills and everyday needs).`);
    if (d.debt < min) warnings.push(`Debt is ${fmt(min - d.debt)} below your minimum payments (${fmt(min)}). Missing a minimum can mean late fees.`);
    return { dollars: d, pct, total, unallocated: un, over: Math.max(0, -un), warnings };
  }
  // spread the unallocated amount (+ or -) over unlocked buckets in proportion (never below 0), or all into one bucket
  function sbSpreadLocal(d, locks, income, into) {
    const o = {}; SB_KEYS.forEach(k => o[k] = Math.max(0, Math.round(+d[k] || 0)));
    let u = income - sbSum(o);
    if (into) { if (!locks[into]) o[into] = Math.max(0, o[into] + u); return o; }
    let keys = SB_KEYS.filter(k => !locks[k]);
    for (let pass = 0; pass < 8 && u !== 0 && keys.length; pass++) {
      const base = keys.reduce((t, k) => t + o[k], 0), s = u < 0 ? -1 : 1, abs = Math.abs(u);
      if (s < 0 && base <= 0) break;
      const raw = keys.map(k => abs * (base > 0 ? o[k] / base : 1 / keys.length));
      const fl = raw.map(Math.floor); let left = abs - fl.reduce((x, y) => x + y, 0);
      raw.map((v, i) => [v - fl[i], i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (left > 0) { fl[i]++; left--; } });
      keys.forEach((k, i) => { o[k] = Math.max(0, o[k] + s * fl[i]); });
      u = income - sbSum(o);
      keys = keys.filter(k => o[k] > 0);
    }
    return o;
  }
  function sbDistribute(a, dollars, locks, into) {
    const E = sbEngine(), I = +a.income || 0;
    let out = E && typeof E.distribute === 'function' ? sbTry(() => E.distribute(a, Object.assign({}, dollars), Object.assign({}, locks), into || undefined), null) : null;
    if (out && out.dollars) out = out.dollars;
    if (!(out && SB_KEYS.every(k => Number.isFinite(+out[k])))) out = sbSpreadLocal(dollars, locks, I, into);
    const o = {}; SB_KEYS.forEach(k => { o[k] = locks[k] ? dollars[k] : Math.max(0, Math.round(+out[k])); }); // locked buckets never change
    return o;
  }

  function sbState() {
    const E = sbEngine(); if (!E) return null;
    const a = E.analyze(curMonth());
    const cfg = sbCfg();
    const list = (E.strategies(a) || []).filter(sbValid);
    const cd = sbCentsOk(cfg.customDollars) ? cfg.customDollars : null;
    let cust = list.find(s => s.id === 'custom');
    if (cd) { // the saved dollars are the source of truth for the custom plan
      const c = sbCalc(a, cd);
      const fix = { amounts: c.dollars, pct: c.pct, feasible: c.dollars.needs >= (+a.essentials || 0) && c.dollars.debt >= (+a.debtMinimums || 0) };
      if (!cust) { cust = Object.assign({ id: 'custom', name: 'Custom', why: 'Your own amounts.', warnings: c.warnings }, fix); list.push(cust); }
      else if (!SB_KEYS.every(k => cust.amounts[k] === cd[k])) { Object.assign(cust, fix); delete cust.adjusted; }
    } else if (!cust && cfg.custom && typeof E.allocate === 'function') {
      const al = sbTry(() => E.allocate(a, cfg.custom), null);
      if (sbValid(al)) list.push(Object.assign({ id: 'custom', name: 'Custom', why: 'Your own split.', warnings: [] }, al));
    }
    const rec = list.find(s => s.id === 'recommended') || list[0] || null;
    const chosen = list.find(s => s.id === cfg.strategyId) || rec;
    const cmp = typeof E.compare === 'function' ? sbTry(() => E.compare(a, list), null) : null;
    return { E, a, cfg, list, rec, chosen, eff: sbEff(chosen), cmp: cmp && typeof cmp === 'object' ? cmp : { bestId: rec && rec.id, rows: [] } };
  }
  // ---- draft (unsaved editor state). Lives in memory until Save or Cancel.
  let sbDraft = null, sbLive = null, sbModeUi = null;
  function sbSaved(st) {
    const cfg = st.cfg, src = st.chosen.id === 'custom' && sbCentsOk(cfg.customDollars) ? cfg.customDollars : sbEff(st.chosen).amounts;
    const dollars = {}, locks = {}, rollover = {};
    SB_KEYS.forEach(k => {
      dollars[k] = Math.max(0, Math.round(+src[k] || 0));
      locks[k] = !!(cfg.locks && cfg.locks[k] === true);
      rollover[k] = cfg.rollover && SB_ROLL.some(r => r[0] === cfg.rollover[k]) ? cfg.rollover[k] : 'reset';
    });
    return { dollars, locks, rollover, mode: cfg.mode === 'percent' ? 'percent' : 'dollars', from: st.chosen.id };
  }
  function sbGetDraft(st) {
    if (!sbDraft || !sbDraft.dirty || sbDraft.month !== curMonth()) sbDraft = Object.assign(sbSaved(st), { dirty: false, month: curMonth(), pctTyped: {} });
    if (sbModeUi) sbDraft.mode = sbModeUi;
    return sbDraft;
  }

  const sbStack = pct => `<div class="sb-stack" aria-hidden="true">${SB_BUCKETS.map(([k, , c]) => `<i style="width:${Math.max(0, +pct[k] || 0)}%;background:${c}"></i>`).join('')}</div>`;
  function sbDonut(s, income, sub) {
    let off = 25, g = '';
    SB_BUCKETS.forEach(([k, , c]) => { const p = Math.max(0, Math.min(100, +s.pct[k] || 0)); if (p > 0) g += `<circle cx="21" cy="21" r="15.9155" fill="none" stroke="${c}" stroke-width="5.5" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${off}"/>`; off -= p; });
    const label = 'Budget split: ' + SB_BUCKETS.map(([k, n]) => n + ' ' + sbPct(s.pct[k]) + ' (' + fmt(s.amounts[k]) + ')').join(', ');
    return `<div class="sb-donut"><svg viewBox="0 0 42 42" role="img" aria-label="${esc(label)}"><circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--sunken)" stroke-width="5.5"/>${g}</svg><div class="sb-donut-c"><b class="num">${fmt0(income)}</b><span class="tiny faint">${sub || 'a month'}</span></div></div>`;
  }
  // the editor's donut: slices are shares of take-home pay (or of the total when over), the gap is unallocated money
  function sbDonutLive(c, income) {
    const base = Math.max(income, c.total) || 1, pct = {};
    SB_KEYS.forEach(k => pct[k] = c.dollars[k] * 100 / base);
    return sbDonut({ pct, amounts: c.dollars }, c.total, c.over > 0 ? 'planned · over' : 'planned');
  }
  const sbRows = s => `<div class="sb-rows">${SB_BUCKETS.map(([k, n, c, h]) => `<div class="sb-row" data-bucket="${k}" data-pct="${+s.pct[k] || 0}" data-amt="${+s.amounts[k] || 0}"><i class="dot" style="background:${c}"></i><div class="grow"><b>${n}</b><div class="tiny faint">${h}</div></div><span class="num sb-p">${sbPct(s.pct[k])}</span><b class="num sb-a">${fmt(s.amounts[k])}</b></div>`).join('')}</div>`;
  const sbWarnings = list => (list || []).filter(w => typeof w === 'string' && w).map(w => `<div class="callout small">${ic('alert')}<div>${esc(w)}</div></div>`).join('');
  const sbHead = sub => `<div class="topbar"><div><h1>Smart Budget</h1><div class="sub">${sub}</div></div><div class="row wrap"><button class="btn" data-act="sbCats">${ic('tag')}Categories used</button></div></div>`;
  const sbDebtSplit = (st, s) => { const d = s.debtSplit; const min = Math.min(+s.amounts.debt || 0, +st.a.debtMinimums || 0); return d && isFinite(+d.minimum) && isFinite(+d.extra) ? { minimum: +d.minimum, extra: +d.extra } : { minimum: min, extra: Math.max(0, (+s.amounts.debt || 0) - (+st.a.debtMinimums || 0)) }; };

  // home-ui.js (WTHomeUI) renders the daily tip, net worth card and the Progress page; never let it break the app
  function homeExt(fn) { const H = window.WTHomeUI; if (!H || !H.ready || typeof H[fn] !== 'function') return ''; try { return H[fn]() || ''; } catch (e) { console.error(e); return ''; } }
  function viewProgress() {
    const html = homeExt('renderProgress');
    return html || `<div class="topbar"><div><h1>Progress</h1><div class="sub">Net worth and milestones.</div></div></div><div class="empty"><b>Progress isn't available right now</b>The rest of WealthTrack works as usual.</div>`;
  }
  function viewSmart() {
    const intro = 'A plan for your take-home pay, built from your paychecks, bills and debts. It never changes them.';
    sbLive = null;
    if (!sbEngine()) return sbHead(intro) + `<div class="callout blue">${ic('info')}<div><b>Smart Budget isn't available right now.</b> The rest of WealthTrack works as usual. Try reopening the app.</div></div>`;
    let st;
    try { st = sbState(); } catch (e) { console.error(e); st = null; }
    if (!st || !st.a) return sbHead(intro) + `<div class="callout red">${ic('alert')}<div><b>Smart Budget couldn't work out a plan.</b> Your bills, paychecks and payments are not affected. Check your income and bills, then try again.</div></div>`;
    const a = st.a;
    if (!(a.income > 0) || !st.rec) return sbHead(intro) + `<div class="empty">${ic('sliders')}<b>Add your income to get a Smart Budget</b>It splits your take-home pay into needs, debt, savings and wants, using your bills and debts.<div class="row wrap" style="justify-content:center;margin-top:12px"><button class="btn primary" data-act="addIncome">${ic('plus')}Add income</button><a class="btn" href="#/bills">Bills</a></div></div>`;
    sbLive = st;
    const sec = (fn, title) => { try { return fn(); } catch (e) { console.error(e); return `<section class="section">${sectionH(title, '')}<p class="small muted" style="margin:10px 0 0">This part couldn't be worked out right now.</p></section>`; } };
    const PU = window.WTPlanUI, planUi = PU && PU.ready && typeof PU.renderPaychecks === 'function';
    const ctx = { a, chosen: st.eff, strategies: st.list, smart: st.E };
    const plan = planUi
      ? sec(() => PU.renderPaychecks(ctx) || '', 'Paycheck by paycheck') + (typeof PU.renderDebt === 'function' ? sec(() => PU.renderDebt(ctx) || '', 'Debt payoff') : '')
      : sec(() => sbPaychecks(st), 'Paycheck by paycheck');
    return sbHead(st.chosen && st.chosen.id !== st.rec.id ? `Using <b>${esc(sbName(st.chosen))}</b>. ${intro}` : intro) + `<div class="fade-in sb">
      ${sec(() => sbHero(st), 'Recommended for you')}
      ${sec(() => sbCompare(st), 'Compare strategies')}
      ${sec(() => sbCustom(st), 'Customize')}
      <div class="split" style="margin-top:30px"><div>${sec(() => sbVsActual(st), 'Planned vs actual')}</div><div>${sec(() => sbSuggest(st), 'Suggestions')}</div></div>
      <div class="sb-plan">${plan}</div>
      ${sec(() => sbHistory(st), 'History')}
    </div>`;
  }
  function sbHero(st) {
    const a = st.a, rec = st.rec, r = sbEff(rec);
    const inUse = st.chosen && st.chosen.id === rec.id;
    const pp = a.incomeDetail && a.incomeDetail.perPaycheck > 0 ? ` · about ${fmt(a.incomeDetail.perPaycheck)} a paycheck` : '';
    const ds = sbDebtSplit(st, r), living = sbLiving(a);
    const short = Math.max(0, isFinite(+a.shortfall) && a.shortfall != null ? +a.shortfall : living + (+a.debtMinimums || 0) - a.income);
    const notFeasible = rec.feasible === false || short > 0;
    const opts = (Array.isArray(rec.options) ? rec.options : Array.isArray(a.options) ? a.options : []).filter(x => typeof x === 'string' && x);
    const free = isFinite(+a.free) && a.free != null ? +a.free : a.income - living - (+a.debtMinimums || 0);
    return `<section class="section"><div class="card sb-hero" data-strategy="${esc(rec.id)}">
      <div class="row between wrap" style="gap:8px"><div><span class="eyebrow">Recommended for you</span>${sbKind('recommended', false)}<div class="small muted">Take-home pay <b class="num">${fmt(a.income)}</b> a month${pp}</div></div>
        <div class="row wrap" style="gap:6px">${inUse ? '<span class="pill paid">In use</span>' : `<button class="btn sm" data-act="sbUse" data-id="${esc(rec.id)}">Use this</button>`}<button class="btn sm ghost" data-act="sbCustomize" data-id="${esc(rec.id)}">Customize this</button></div></div>
      <div class="sb-hero-b">${sbDonut(r, a.income)}${sbRows(r)}</div>
      ${rec.why ? `<p class="small muted sb-why">${esc(rec.why)}</p>` : ''}
      ${r.isAdjusted ? `<p class="tiny faint" style="margin:6px 0 0">Adjusted so your essential bills and minimum debt payments are covered.</p>` : ''}
      ${notFeasible ? `<div class="callout red sb-short" style="margin-top:12px">${ic('alert')}<div><b>Your take-home pay is ${fmt(short)} short</b> of your living costs and minimum payments this month.${opts.length ? `<div class="small" style="margin-top:6px">Some options to think about:</div><ul class="sb-opts">${opts.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ' Pay essential bills first, then call your lenders about lower payments.'}</div></div>` : ''}
      ${(() => { const w = (rec.warnings || []).filter(x => !(notFeasible && typeof x === 'string' && x.indexOf(fmt(short)) >= 0)); return w.length ? `<div class="gap-s" style="margin-top:12px">${sbWarnings(w)}</div>` : ''; })()}
      <div class="figures sb-figs" style="--n:4;margin-top:16px">
        ${fig('Living costs', fmt(living), 'bills + everyday needs')}
        ${fig('Required minimums', fmt(+a.debtMinimums || 0), a.debtTotal ? fmt0(a.debtTotal) + ' owed' : 'no debt')}
        ${fig('Optional extra debt', fmt(ds.extra), ds.extra > 0 ? 'on top of minimums' : 'not planned now')}
        ${fig('Free after these', fmt(free), 'a month', free < 0 ? 'neg' : '')}
      </div>
      <div style="margin-top:10px"><button class="link" data-act="sbCats">How needs and wants are counted</button></div>
    </div></section>`;
  }
  function sbProj(st, s) {
    const row = (st.cmp.rows || []).find(x => x && x.id === s.id) || {}; const p = s.projection || {};
    const pick = k => row[k] !== undefined ? row[k] : p[k];
    return { savings12: s.annualSavings != null && isFinite(+s.annualSavings) ? +s.annualSavings : +pick('savings12') || 0, debtPaid12: +pick('debtPaid12') || 0, debtFreeMonths: pick('debtFreeMonths') == null ? null : +pick('debtFreeMonths'), estimate: !!(pick('debtFreeEstimate') || pick('estimate')), spendingMonthly: s.disposable != null && isFinite(+s.disposable) ? +s.disposable : pick('spendingMonthly') != null ? +pick('spendingMonthly') : +s.amounts.wants || 0 };
  }
  const sbFree = (st, m, est) => m == null || !isFinite(m) ? (st.a.debtTotal > 0 ? 'Not in 12+ yrs' : 'No debt') : m <= 0 ? 'Now' : (est ? 'About ' : '') + W.monthLabel(W.addMonthKey(curMonth(), Math.round(m)), true) + (est ? ' (estimate)' : '');
  function sbCompare(st) {
    const best = st.cmp.bestId;
    const isBest = s => s.id === best && sbRealistic(s, st.a);
    const badges = s => `${isBest(s) ? '<span class="pill paid">Best fit</span>' : ''}${sbRealistic(s, st.a) ? '<span class="pill sb-ok">Realistic</span>' : '<span class="pill over">Not realistic</span>'}`;
    const btn = s => s.id === st.chosen.id ? `<button class="btn sm" disabled aria-label="${esc(sbName(s))} is in use">${ic('check')}In use</button>` : `<button class="btn sm${isBest(s) ? ' primary' : ''}" data-act="sbUse" data-id="${esc(s.id)}" aria-label="Use ${esc(sbName(s))}">Use this</button>`;
    const cust = s => `<button class="btn sm ghost sb-cz" data-act="sbCustomize" data-id="${esc(s.id)}" aria-label="Customize ${esc(sbName(s))}">${ic('sliders')}Customize this</button>`;
    const cards = st.list.map(s => { const e = sbEff(s), p = sbProj(st, s), ds = sbDebtSplit(st, e); const risks = (Array.isArray(s.risks) ? s.risks : []).filter(x => typeof x === 'string' && x).slice(0, 2);
      return `<article class="sb-card${isBest(s) ? ' best' : ''}${s.id === st.chosen.id ? ' on' : ''}" data-strategy="${esc(s.id)}" data-realistic="${sbRealistic(s, st.a)}">
        <div class="sb-card-h"><b>${esc(sbName(s))}</b><span class="sb-badges">${badges(s)}</span></div>
        ${sbKind(s.id, true)}
        ${sbStack(e.pct)}
        <div class="sb-mini">${SB_BUCKETS.map(([k, n, c]) => `<span><i class="dot" style="background:${c}"></i>${n} <b class="num">${sbPct(e.pct[k])}</b></span>`).join('')}</div>
        <div class="kv"><span>Debt minimums</span><b class="num">${fmt0(ds.minimum)}/mo</b></div>
        <div class="kv"><span>Extra on debt</span><b class="num">${ds.extra > 0 ? fmt0(ds.extra) + '/mo' : 'None'}</b></div>
        <div class="kv"><span>Spending money</span><b class="num">${fmt0(p.spendingMonthly)}/mo</b></div>
        <div class="kv"><span>Saved in a year</span><b class="num">${fmt0(p.savings12)}</b></div>
        <div class="kv"><span>Debt paid in 12 months</span><b class="num">${p.estimate ? 'about ' : ''}${fmt0(p.debtPaid12)}</b></div>
        <div class="kv"><span>Debt-free</span><b>${sbFree(st, p.debtFreeMonths, p.estimate)}</b></div>
        ${risks.length ? `<ul class="sb-risks">${risks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${s.feasible === false && !risks.length ? `<p class="tiny sb-note">${esc((s.warnings && s.warnings[0]) || 'Your bills need more than this plan allows.')}${e.isAdjusted ? ' Planned as ' + SB_BUCKETS.map(([k, n]) => n.toLowerCase() + ' ' + sbPct(e.pct[k])).join(', ') + '.' : ''}</p>` : ''}
        <div class="sb-card-f">${btn(s)}${cust(s)}</div>
      </article>`; }).join('');
    const table = `<div class="tbl-wrap"><table class="tbl sb-tbl"><thead><tr><th>Strategy</th>${SB_BUCKETS.map(([, n]) => `<th class="r">${n}</th>`).join('')}<th class="r">Debt min + extra</th><th class="r">Saved in a year</th><th>Debt-free</th><th class="r">Spending/mo</th><th></th></tr></thead><tbody>
      ${st.list.map(s => { const e = sbEff(s), p = sbProj(st, s), ds = sbDebtSplit(st, e); return `<tr data-strategy="${esc(s.id)}"${s.id === st.chosen.id ? ' class="on"' : ''}><td><b>${esc(sbName(s))}</b>${sbKind(s.id, false)}<div class="sb-badges">${badges(s)}</div></td>${SB_KEYS.map(k => `<td class="r num">${sbPct(e.pct[k])}</td>`).join('')}<td class="r num">${fmt0(ds.minimum)} + ${fmt0(ds.extra)}</td><td class="r num">${fmt0(p.savings12)}</td><td>${sbFree(st, p.debtFreeMonths, p.estimate)}</td><td class="r num">${fmt0(p.spendingMonthly)}</td><td class="r"><div class="row" style="gap:6px;justify-content:flex-end;flex-wrap:nowrap">${btn(s)}${cust(s)}</div></td></tr>`; }).join('')}
    </tbody></table></div>`;
    return `<section class="section">${sectionH('Compare strategies', 'Next 12 months')}<div class="sb-cards" role="list" aria-label="Budget strategies">${cards.replace(/<article /g, '<article role="listitem" ')}</div><div class="sb-cmp-tbl">${table}</div><p class="tiny faint" style="margin:6px 0 0">Debt figures are estimates based on your balances, rates and minimums.</p></section>`;
  }

  // ---- Customize: Dollars | Percent editor over the draft
  function sbCustom(st) {
    const a = st.a, d = sbGetDraft(st), c = sbCalc(a, d.dollars), I = +a.income || 0, pm = d.mode === 'percent';
    const living = sbLiving(a), min = +a.debtMinimums || 0;
    const floor = { needs: `Living costs ${fmt(living)}`, debt: min ? `Minimums ${fmt(min)}` : 'No minimums', savings: '', wants: '' };
    const roll = sbTry(() => typeof st.E.rollover === 'function' ? st.E.rollover(curMonth()) : null, null);
    const carry = roll && roll.carryIn && typeof roll.carryIn === 'object' ? roll.carryIn : null;
    const carryTot = carry ? sbSum(carry) : 0;
    const cards = SB_BUCKETS.map(([k, n, col, h]) => { const lk = !!d.locks[k]; const val = pm ? sbPctIn(d.pctTyped[k] != null ? d.pctTyped[k] : c.pct[k]) : sbMoneyIn(c.dollars[k]);
      return `<div class="sb-bk${lk ? ' locked' : ''}" data-sl="${k}" style="--c:${col}">
        <div class="sb-bk-h"><label for="sbf-${k}" class="grow"><span class="row" style="gap:7px"><i class="dot" style="background:${col}"></i><b>${n}</b></span><span class="tiny faint">${h}</span></label>
          <button type="button" class="btn icon sb-lock${lk ? ' on' : ''}" data-act="sbLock" data-k="${k}" aria-pressed="${lk}" aria-label="${lk ? 'Unlock' : 'Lock'} ${n}" title="${lk ? 'Locked: this amount won’t change' : 'Lock this amount'}">${ic(lk ? 'lock' : 'unlock')}</button></div>
        <div class="sb-bk-in"><span class="sb-unit" aria-hidden="true">${pm ? '' : '$'}</span><input id="sbf-${k}" class="input sb-amt" type="text" inputmode="decimal" autocomplete="off" enterkeyhint="done" spellcheck="false" data-sbin="${k}" value="${esc(val)}"${lk ? ' disabled' : ''} aria-describedby="sbc-${k}"><span class="sb-unit" aria-hidden="true">${pm ? '%' : ''}</span></div>
        <div class="row between sb-bk-f"><span class="small muted sb-cp" id="sbc-${k}">${pm ? fmt(c.dollars[k]) + ' a month' : sbPct(c.pct[k]) + ' of take-home'}</span>${floor[k] ? `<span class="tiny faint">${floor[k]}</span>` : ''}</div>
        <input type="range" class="sb-range" id="sb-${k}" min="0" max="100" step="0.5" value="${Math.min(100, c.pct[k])}" data-sb="${k}"${lk ? ' disabled' : ''} aria-label="${n} slider" aria-valuetext="${sbPct(c.pct[k])}, ${esc(fmt(c.dollars[k]))} a month" style="--c:${col};--p:${Math.min(100, c.pct[k])}%">
        ${lk ? `<div class="tiny faint">${ic('lock')} Locked. Other changes won’t move it.</div>` : ''}
      </div>`; }).join('');
    const opts = st.list.map(s => `<option value="${esc(s.id)}">${esc(sbName(s))}</option>`).join('');
    const unlocked = SB_BUCKETS.filter(([k]) => !d.locks[k]);
    return `<section class="section" id="sbEdit">${sectionH('Customize', `<span id="sbDirty">${d.dirty ? '<span class="pill due">Unsaved changes</span>' : 'Saved plan'}</span>`)}
      <div class="sb-custom" data-income="${I}">
        <p class="small muted" style="margin:10px 0 8px">Type an amount or drag a slider. Each bucket only moves when you change it. Nothing is saved until you tap Save.</p>
        <div class="sb-ed-top">
          <div class="seg boxed sb-mode" role="group" aria-label="Enter amounts as"><button type="button" class="${pm ? '' : 'on'}" aria-pressed="${!pm}" data-act="sbMode" data-v="dollars">Dollars</button><button type="button" class="${pm ? 'on' : ''}" aria-pressed="${pm}" data-act="sbMode" data-v="percent">Percent</button></div>
          <select class="input sb-from" data-act-change="sbFrom" aria-label="Start from a strategy"><option value="">Start from a strategy…</option>${opts}</select>
        </div>
        <div class="sb-ed-b"><div class="sb-ed-donut">${sbDonutLive(c, I)}</div><div class="sb-bks">${cards}</div></div>
        <div class="sb-warn gap-s" id="sbWarn" aria-live="polite">${sbWarnings(c.warnings)}</div>
        <div class="sb-tools">
          <select class="input sb-into" data-act-change="sbInto" aria-label="Put remaining into"${unlocked.length ? '' : ' disabled'}><option value="">Put remaining into…</option>${unlocked.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select>
          <button type="button" class="btn" data-act="sbSpread"${unlocked.length ? '' : ' disabled'}>${ic('sliders')}Spread over unlocked</button>
          <button type="button" class="btn" data-act="sbReset">${ic('undo')}Reset</button>
        </div>
        <details class="sb-roll"${d.dirty && SB_KEYS.some(k => d.rollover[k] !== 'reset') ? ' open' : ''}><summary><b>Leftover money at month end</b> <span class="tiny faint">Rollover</span></summary>
          <p class="small muted" style="margin:6px 0 8px">What happens to money left in a bucket when the month ends. Saved with your budget. Past months stay as they were.</p>
          ${SB_BUCKETS.map(([k, n, col]) => `<label class="sb-roll-r"><span class="row" style="gap:7px"><i class="dot" style="background:${col}"></i>${n}</span><select class="input" data-act-change="sbRoll" data-k="${k}" aria-label="${n} leftover">${SB_ROLL.map(([v, t]) => `<option value="${v}"${d.rollover[k] === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`).join('')}
          <div class="sb-carry small" style="margin-top:8px">${carry ? (carryTot > 0 ? `Carried into ${W.monthLabel(curMonth())}: ` + SB_BUCKETS.filter(([k]) => +carry[k] > 0).map(([k, n]) => `${n} <b class="num">+${fmt(+carry[k])}</b>`).join(', ') : `<span class="muted">Nothing carried into ${W.monthLabel(curMonth())}.${roll.note ? ' ' + esc(roll.note) : ''}</span>`) : '<span class="muted">Carry-in shows here once last month’s budget is saved.</span>'}</div>
        </details>
        <div class="sb-remain ${c.over > 0 ? 'over' : c.unallocated > 0 ? 'left' : 'ok'}" id="sbRemain">
          <div class="sb-remain-t" role="status" aria-live="polite"><span class="tiny sb-remain-l">${c.over > 0 ? 'Over by' : c.unallocated > 0 ? 'Remaining to allocate' : 'Every dollar allocated'}</span><b class="num sb-remain-v">${fmt(c.over > 0 ? c.over : Math.max(0, c.unallocated))}</b><span class="tiny faint sb-remain-s">${fmt(c.total)} of ${fmt(I)}</span></div>
          <div class="sb-remain-b"><button type="button" class="btn" data-act="sbCancel"${d.dirty ? '' : ' disabled'}>Cancel</button><button type="button" class="btn primary" data-act="sbSave">${ic('check')}Save</button></div>
        </div>
      </div></section>`;
  }
  // repaint the editor in place (no page re-render, focus and caret kept). `src` is the element being edited: never rewritten.
  function sbPaint(src) {
    const root = $('.sb-custom'); if (!root || !sbDraft || !sbLive) return;
    const a = sbLive.a, I = +a.income || 0, c = sbCalc(a, sbDraft.dollars), pm = sbDraft.mode === 'percent';
    SB_KEYS.forEach(k => {
      const card = root.querySelector(`[data-sl="${k}"]`); if (!card) return;
      const f = card.querySelector('[data-sbin]'), r = card.querySelector('[data-sb]'), cp = card.querySelector('.sb-cp');
      const d = c.dollars[k], p = sbDraft.pctTyped[k] != null ? sbDraft.pctTyped[k] : c.pct[k];
      if (f && f !== src) {
        if (pm) { const cur = parseFloat(f.value); if (!(isFinite(cur) && Math.abs(cur - p) < 0.05)) f.value = sbPctIn(p); }
        else { let cur = null; try { cur = W.parseMoney(f.value); } catch (e) { cur = null; } if (cur !== d) f.value = sbMoneyIn(d); }
        f.removeAttribute('aria-invalid');
      }
      if (r) { const rp = Math.min(100, c.pct[k]); if (r !== src && Math.abs(+r.value - rp) >= 0.25) r.value = rp; r.style.setProperty('--p', Math.min(100, +r.value) + '%'); r.setAttribute('aria-valuetext', `${sbPct(c.pct[k])}, ${fmt(d)} a month`); }
      if (cp) cp.textContent = pm ? fmt(d) + ' a month' : sbPct(c.pct[k]) + ' of take-home';
    });
    const dn = root.querySelector('.sb-ed-donut'); if (dn) dn.innerHTML = sbDonutLive(c, I);
    const rb = root.querySelector('#sbRemain');
    if (rb) {
      rb.className = 'sb-remain ' + (c.over > 0 ? 'over' : c.unallocated > 0 ? 'left' : 'ok');
      rb.querySelector('.sb-remain-l').textContent = c.over > 0 ? 'Over by' : c.unallocated > 0 ? 'Remaining to allocate' : 'Every dollar allocated';
      rb.querySelector('.sb-remain-v').textContent = fmt(c.over > 0 ? c.over : Math.max(0, c.unallocated));
      rb.querySelector('.sb-remain-s').textContent = fmt(c.total) + ' of ' + fmt(I);
      const cb = rb.querySelector('[data-act=sbCancel]'); if (cb) cb.disabled = !sbDraft.dirty;
    }
    const w = root.querySelector('#sbWarn'); if (w) { const html = sbWarnings(c.warnings); if (w.innerHTML !== html) w.innerHTML = html; }
    const dp = $('#sbDirty'); if (dp) { const html = sbDraft.dirty ? '<span class="pill due">Unsaved changes</span>' : 'Saved plan'; if (dp.innerHTML !== html) dp.innerHTML = html; }
  }
  // typing in a $ / % field, or dragging a slider: changes only that bucket
  function sbInput(el) {
    if (!sbLive) return;
    const d = sbGetDraft(sbLive), k = el.dataset.sbin || el.dataset.sb;
    if (!SB_KEYS.includes(k) || d.locks[k]) return;
    const I = +sbLive.a.income || 0;
    if (el.dataset.sb) {
      const p = Math.max(0, Math.min(100, +el.value || 0)); d.dollars[k] = Math.round(I * p / 100); d.pctTyped[k] = p;
    } else if (d.mode === 'percent') {
      const v = el.value.trim().replace(/\s*%$/, '');
      const p = v === '' || v === '.' ? 0 : /^\d*\.?\d*$/.test(v) ? parseFloat(v) : NaN;
      if (!(isFinite(p) && p >= 0 && p <= 100)) { el.setAttribute('aria-invalid', 'true'); return; }
      el.removeAttribute('aria-invalid');
      const E = sbEngine(); let cents = Math.round(I * p / 100);
      if (E && typeof E.fromPct === 'function') { const r = sbTry(() => E.fromPct(sbLive.a, Object.assign({}, d.pctTyped, { [k]: p })), null); if (r && r.dollars && Number.isFinite(+r.dollars[k])) cents = Math.max(0, Math.round(+r.dollars[k])); }
      d.dollars[k] = cents; d.pctTyped[k] = p;
    } else {
      let c = null; const v = el.value.trim();
      try { c = v === '' || v === '$' ? 0 : W.parseMoney(v); } catch (e) { c = null; }
      if (c == null || c < 0) { el.setAttribute('aria-invalid', 'true'); return; }
      el.removeAttribute('aria-invalid');
      d.dollars[k] = c; delete d.pctTyped[k];
    }
    d.dirty = true; sbPaint(el);
  }
  // leaving a field: show it formatted ($1,234.50 / 12.5)
  function sbBlur(el) {
    if (!sbDraft || el.getAttribute('aria-invalid') === 'true') return;
    const k = el.dataset.sbin; if (!SB_KEYS.includes(k)) return;
    if (sbDraft.mode === 'percent') { const p = sbDraft.pctTyped[k] != null ? sbDraft.pctTyped[k] : sbCalc(sbLive.a, sbDraft.dollars).pct[k]; el.value = sbPctIn(p); }
    else el.value = sbMoneyIn(sbDraft.dollars[k]);
  }
  function sbRedraw(focusSel) {
    const sec = $('#sbEdit'); if (!sec || !sbLive) { refresh(); return; }
    const y = window.scrollY; sec.outerHTML = sbCustom(sbLive); window.scrollTo(0, y);
    if (focusSel) { const n = $(focusSel); if (n) try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } }
  }
  // load a strategy's amounts into the draft (unsaved). Locked buckets keep their amounts.
  function sbLoad(id, clearLocks) {
    const st = sbLive; if (!st) return false;
    const s = st.list.find(x => x.id === id); if (!s) return false;
    const src = s.id === 'custom' && sbCentsOk(st.cfg.customDollars) ? st.cfg.customDollars : sbEff(s).amounts;
    const d = sbGetDraft(st);
    if (clearLocks) SB_KEYS.forEach(k => { d.locks[k] = false; });
    SB_KEYS.forEach(k => { if (!d.locks[k]) d.dollars[k] = Math.max(0, Math.round(+src[k] || 0)); });
    d.pctTyped = {}; d.from = id; d.dirty = true;
    return true;
  }
  function sbCustomize(id) {
    if (!sbLoad(id)) return;
    sbRedraw();
    const sec = $('#sbEdit'); if (sec && sec.scrollIntoView) sec.scrollIntoView({ block: 'start', behavior: 'smooth' });
    const s = sbLive.list.find(x => x.id === id);
    toast(sbName(s) + ' loaded. Change it, then tap Save.');
  }
  async function sbSaveDraft() {
    const st = sbLive; if (!st) return;
    const d = sbGetDraft(st), c = sbCalc(st.a, d.dollars);
    if (c.over > 0 && !(await confirmBox('Save a plan that’s over your pay?', `This plan is <b>${esc(fmt(c.over))}</b> more than your take-home pay (${esc(fmt(st.a.income))}). You can save it, but you’ll need to lower something to make it work.`, 'Save anyway'))) return;
    const custom = {}; SB_KEYS.forEach(k => custom[k] = Math.max(0, Math.min(100, Math.round(c.pct[k] * 10) / 10)));
    const locks = {}, rollover = {}; SB_KEYS.forEach(k => { locks[k] = !!d.locks[k]; rollover[k] = d.rollover[k] || 'reset'; });
    sbCommit('custom', { custom, customDollars: Object.assign({}, c.dollars), mode: d.mode, locks, rollover });
  }
  // save a strategy: strategyId (+ custom plan) and this month's snapshot in history (one per month, max 36)
  function sbCommit(id, extra) {
    const E = sbEngine(); if (!E) { toast('Smart Budget isn\'t available right now', { error: true }); return; }
    const prev = sbCfg();
    const next = Object.assign({}, prev, { strategyId: id }, extra || {});
    W.saveSettings({ smartBudget: next });
    sbDraft = null; sbModeUi = null;
    let s = null, a = null;
    try { a = E.analyze(curMonth()); s = (E.strategies(a) || []).find(x => x && x.id === id) || null; } catch (e) { console.error(e); }
    if (id === 'custom' && a && sbCentsOk(next.customDollars)) { const c = sbCalc(a, next.customDollars); s = Object.assign({}, s || { id: 'custom', name: 'Custom' }, { amounts: c.dollars, pct: c.pct }); delete s.adjusted; }
    else if (!sbValid(s) && id === 'custom' && a && typeof E.allocate === 'function') s = sbTry(() => Object.assign({ id: 'custom', name: 'Custom' }, E.allocate(a, next.custom)), null);
    if (!sbValid(s)) { refresh(); toast('Saved'); return; }
    s = sbEff(s);
    const snap0 = sbTry(() => typeof E.snapshot === 'function' ? E.snapshot(curMonth(), s) : null, null) || {};
    const snap = { month: /^\d{4}-\d{2}$/.test(snap0.month || '') ? snap0.month : curMonth(), strategyId: id, pct: {}, amounts: {}, income: 0, savedAt: /^\d{4}-\d{2}-\d{2}$/.test(snap0.savedAt || '') ? snap0.savedAt : today() };
    const sp = id === 'custom' ? s : sbValid(snap0) ? snap0 : s;
    SB_KEYS.forEach(k => { snap.pct[k] = Math.max(0, Math.min(100, Math.round((+sp.pct[k] || 0) * 10) / 10)); snap.amounts[k] = Math.max(0, Math.round(+sp.amounts[k] || 0)); });
    snap.income = a && Number.isInteger(a.income) ? a.income : Number.isInteger(snap0.income) ? snap0.income : SB_KEYS.reduce((t, k) => t + snap.amounts[k], 0);
    snap.dollars = Object.assign({}, snap.amounts);
    const roll = sbTry(() => typeof E.rollover === 'function' ? E.rollover(curMonth()) : null, null);
    if (roll && roll.carryIn && SB_KEYS.every(k => Number.isFinite(+roll.carryIn[k]))) { snap.rollover = {}; SB_KEYS.forEach(k => snap.rollover[k] = Math.max(0, Math.round(+roll.carryIn[k]))); }
    const hist = (Array.isArray(prev.history) ? prev.history : []).filter(h => h && h.month !== snap.month).concat([snap]).sort((x, y) => x.month < y.month ? -1 : x.month > y.month ? 1 : 0).slice(-36);
    W.saveSettings({ smartBudget: Object.assign({}, next, { history: hist }) });
    toast(sbName(s.id === 'custom' ? { id: 'custom' } : s) + ' saved for ' + W.monthLabel(snap.month));
    refresh();
  }
  function sbVsActual(st) {
    const va = typeof st.E.vsActual === 'function' ? st.E.vsActual(st.a, st.eff, curMonth()) : null;
    if (!va) return '';
    const good = { debt: 1, savings: 1 };
    const n0 = v => Number.isFinite(+v) ? +v : null;
    return `<section class="section">${sectionH('Planned vs actual', W.monthLabel(curMonth()))}
      <p class="tiny faint" style="margin:8px 0 0">Actual = bills paid + money spent. Scheduled bills are reserved, not spent yet. Future payments don’t count as spending.</p>
      <div class="sb-va-list">${SB_BUCKETS.map(([k, n, c]) => { const v = va[k] || {}; const planned = +v.planned || 0, actual = +v.actual || 0, rem = v.remaining != null ? +v.remaining : planned - actual;
        const pctU = n0(v.pctUsed) != null ? Math.round(+v.pctUsed) : planned > 0 ? Math.round(actual * 100 / planned) : actual > 0 ? 100 : 0;
        const bar = Math.max(0, Math.min(100, pctU)); const over = rem < 0;
        const status = ['under', 'near', 'over'].includes(v.status) ? v.status : over ? 'over' : pctU >= 85 ? 'near' : 'under';
        const cls = status === 'over' ? (good[k] ? '' : 'over') : status === 'near' && !good[k] ? 'warn' : '';
        const stTxt = status === 'over' ? (good[k] ? 'Ahead of plan' : 'Over plan') : status === 'near' ? 'Near limit' : 'Under plan';
        const stCls = status === 'over' ? (good[k] ? 'paid' : 'over') : status === 'near' ? (good[k] ? '' : 'due') : 'paid';
        const paid = n0(v.paid), spent = n0(v.spent), sched = n0(v.scheduled), resv = n0(v.reserved), fas = n0(v.freeAfterScheduled);
        const parts = [paid != null ? `<span>Paid bills <b class="num">${fmt(paid)}</b></span>` : '', spent != null ? `<span>Spent <b class="num">${fmt(spent)}</b></span>` : '', sched != null ? `<span>Scheduled, not paid <b class="num">${fmt(sched)}</b></span>` : '', resv != null && resv !== sched ? `<span>Reserved <b class="num">${fmt(resv)}</b></span>` : ''].filter(Boolean).join('');
        return `<div class="sb-va" data-bucket="${k}" data-status="${status}"><div class="row between wrap" style="gap:6px"><span class="row" style="gap:7px"><i class="dot" style="background:${c}"></i><b>${n}</b><span class="pill ${stCls}">${stTxt}</span></span><span class="num small"><b>${fmt(actual)}</b> <span class="faint">of ${fmt(planned)}</span></span></div>
          <div class="progress ${cls}" role="progressbar" aria-label="${n}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${bar}"><i style="width:${bar}%"></i></div>
          <div class="row between wrap tiny" style="gap:4px 10px"><span class="${over ? (good[k] ? 'pos' : 'neg') : 'muted'}">${over ? (good[k] ? fmt(-rem) + ' more than planned' : fmt(-rem) + ' over plan') : fmt(rem) + ' left'}${fas != null && sched ? ` · ${fmt(fas)} after scheduled bills` : ''}</span><span class="faint">${pctU}% used</span></div>
          ${parts ? `<div class="sb-va-parts tiny muted">${parts}</div>` : ''}</div>`; }).join('')}</div></section>`;
  }
  function sbPaychecks(st) {
    const pcs = typeof st.E.paycheckPlan === 'function' ? st.E.paycheckPlan(st.eff, 3) : [];
    const list = Array.isArray(pcs) ? pcs.filter(p => p && p.date) : [];
    return `<section class="section">${sectionH('Paycheck by paycheck', 'Next ' + (list.length || 3), 'href="#/paychecks"')}
      ${list.length ? `<div class="gap-s" style="margin-top:12px">${list.map(p => { const bills = Array.isArray(p.bills) ? p.bills : []; const res = p.reserve || {};
        return `<div class="panel sb-pc" data-key="${esc(p.key || '')}">
          <div class="row between"><span class="eyebrow">${W.dateLabel(p.date)}${p.incomeName ? ' · ' + esc(p.incomeName) : ''}</span><b class="num">${fmt(+p.net || 0)}</b></div>
          <div style="margin-top:8px">${bills.length ? bills.map(b => `<div class="kv"><span>${esc(b.name)} <span class="faint tiny">· ${W.shortDate(b.dueDate)}${b.essential === false ? ' · want' : ''}</span></span><b>${fmt(+b.amountCents || 0)}</b></div>`).join('') : '<p class="small muted" style="margin:0 0 6px">No bills due from this check.</p>'}
          ${bills.length ? `<div class="kv"><span><b>Bills due</b></span><b>${fmt(+p.billsTotal || 0)}</b></div>` : ''}</div>
          <div class="sb-res">${SB_BUCKETS.map(([k, n, c]) => `<div><span class="tiny faint"><i class="dot" style="background:${c}"></i> ${n}</span><b class="num">${fmt(+res[k] || 0)}</b></div>`).join('')}</div>
          ${p.shortfall > 0 ? `<div class="callout red small" style="margin-top:10px">${ic('alert')}<div>Bills due from this check are <b>${fmt(p.shortfall)}</b> more than the paycheck. Hold some back from the check before it.</div></div>` : ''}
        </div>`; }).join('')}</div>` : `<div class="empty"><b>No paychecks coming up</b>Add or check your income to plan each paycheck.</div>`}
    </section>`;
  }
  const SB_SUG_IC = { overspend: 'alert', save: 'target', debt: 'card', leftover: 'wallet', warning: 'alert', priority: 'check', shortfall: 'alert', 'fund-first': 'check', 'paycheck-setaside': 'wallet', emergency: 'target', reduce: 'alert', 'extra-debt': 'card', 'safe-to-spend': 'wallet', cashflow: 'cal', 'goal-eta': 'target', scenario: 'sliders' };
  const SB_URG = [['now', 'Do now'], ['soon', 'Soon'], ['later', 'Later']];
  const sbUrg = x => SB_URG.some(u => u[0] === x.urgency) ? x.urgency : ({ warning: 'now', shortfall: 'now', priority: 'now', 'fund-first': 'now', overspend: 'soon', reduce: 'soon', cashflow: 'soon', 'paycheck-setaside': 'soon' }[x.kind] || 'later');
  function sbSuggest(st) {
    const sug = typeof st.E.suggestions === 'function' ? st.E.suggestions(st.a, st.eff) : [];
    const list = Array.isArray(sug) ? sug.filter(x => x && x.title) : [];
    const item = x => { const k = SB_SUG_IC[x.kind] ? x.kind : 'priority'; const opt = x.kind === 'scenario' || x.optional === true; const title = opt ? String(x.title).replace(/^Optional:\s*/i, '') : x.title; const amt = Number.isFinite(x.amount) && x.amount ? x.amount : Number.isFinite(x.impact) && x.impact && opt ? x.impact : 0;
      return `<div class="sb-sug-i k-${esc(k)}${opt ? ' opt' : ''}" data-kind="${esc(x.kind || '')}"${opt ? ' data-optional="1"' : ''}>${ic(SB_SUG_IC[k])}<div class="grow" style="min-width:0">${opt ? '<span class="pill sb-optional">Optional</span> ' : ''}<b>${esc(title)}</b>${x.detail ? `<div class="small muted">${esc(x.detail)}</div>` : ''}${Array.isArray(x.options) && x.options.length ? `<ul class="sb-opts small muted">${x.options.filter(o => typeof o === 'string').map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}${opt ? '<div class="tiny faint">Only an idea. Nothing is cancelled unless you do it.</div>' : ''}</div>${amt ? `<b class="num">${fmt(amt)}</b>` : ''}</div>`; };
    const groups = SB_URG.map(([u, label]) => { const g = list.filter(x => sbUrg(x) === u); return g.length ? `<div class="sb-sug-g" data-urgency="${u}"><div class="eyebrow sb-sug-h">${label}</div>${g.map(item).join('')}</div>` : ''; }).join('');
    return `<section class="section">${sectionH('Suggestions', list.length ? list.length + ' idea' + (list.length === 1 ? '' : 's') : '')}
      ${list.length ? `<div class="sb-sug">${groups}</div>` : `<p class="small muted" style="margin:10px 0 0">Nothing to change right now. Nice work.</p>`}
    </section>`;
  }
  function sbHistory(st) {
    const hist = (Array.isArray(st.cfg.history) ? st.cfg.history : []).filter(h => h && /^\d{4}-\d{2}$/.test(h.month || '') && sbValid(h)).slice().reverse();
    return `<section class="section">${sectionH('History', hist.length ? hist.length + ' month' + (hist.length === 1 ? '' : 's') : '')}
      ${hist.length ? `<div class="sb-hist">${hist.map(h => { const ci = h.rollover && typeof h.rollover === 'object' ? sbSum(h.rollover) : 0; return `<div class="sb-h" data-month="${h.month}"><div class="row between"><span><b>${W.monthLabel(h.month)}</b>${h.month === curMonth() ? ' <span class="pill">This month</span>' : ''}</span><b class="num">${fmt(+h.income || 0)}</b></div>
        <div class="tiny faint">${esc(SB_NAMES[h.strategyId] || 'Budget')}${h.savedAt ? ' · saved ' + W.shortDate(h.savedAt) : ''}${ci > 0 ? ' · ' + fmt(ci) + ' carried in' : ''}</div>${sbStack(h.pct)}
        <div class="sb-mini">${SB_BUCKETS.map(([k, n, c]) => `<span><i class="dot" style="background:${c}"></i>${n} <b class="num">${sbPct(h.pct[k])}</b> <span class="faint">${fmt0(+h.amounts[k] || 0)}</span></span>`).join('')}</div></div>`; }).join('')}</div>` : `<p class="small muted" style="margin:10px 0 0">Each month you save a budget, it's kept here so you can look back.</p>`}
    </section>`;
  }
  // Needs vs wants: flip a category between essential and optional (settings.smartBudget.essentialOverrides)
  function sbCatsHtml() {
    const E = sbEngine(); const a = E ? sbTry(() => E.analyze(curMonth()), null) : null;
    const ov = sbCfg().essentialOverrides || {};
    const fn = E && typeof E.essentialCategory === 'function' ? E.essentialCategory : a && typeof a.essentialCategory === 'function' ? a.essentialCategory : null;
    // automatic rule: unknown categories count as needs for bills and wants for purchases
    const auto = id => { if (!fn) return null; const b = sbTry(() => !!fn(id, 'bill'), null), x = sbTry(() => !!fn(id, 'expense'), null); return b === x ? b : null; };
    return W.categories().map(c => { const mine = Object.prototype.hasOwnProperty.call(ov, c.id) && typeof ov[c.id] === 'boolean'; const e = mine ? ov[c.id] : auto(c.id);
      return `<div class="sb-cat" data-cat="${esc(c.id)}"><span class="grow" style="min-width:0"><span class="row" style="gap:8px;min-width:0"><i class="dot" style="background:${W.catColor(c.id)}"></i><span class="sb-cat-n">${esc(c.name)}</span></span><span class="tiny faint">${mine ? 'Set by you' : e == null ? 'Auto: need as a bill, want as a purchase' : 'Automatic'}</span></span>
        <div class="seg boxed" role="group" aria-label="${esc(c.name)}"><button type="button" class="${e === true ? 'on' : ''}" aria-pressed="${e === true}" data-act="sbEss" data-id="${esc(c.id)}" data-v="1">Need</button><button type="button" class="${e === false ? 'on' : ''}" aria-pressed="${e === false}" data-act="sbEss" data-id="${esc(c.id)}" data-v="0">Want</button></div></div>`; }).join('') || '<p class="muted">No categories yet.</p>';
  }
  function sbCatsModal() {
    modal({ title: 'Needs vs wants', footer: `<button type="button" class="btn" data-act="sbEssReset">Reset to automatic</button><button type="button" class="btn primary" data-close>Done</button>`,
      body: `<p class="small muted" style="margin:0 0 10px">Smart Budget counts <b>needs</b> (rent, utilities, groceries, insurance) separately from <b>wants</b> (subscriptions, eating out, shopping). Tap to change how a category is counted. Your bills and expenses stay the same.</p><div class="sb-cats">${sbCatsHtml()}</div>` });
  }
  function sbSetEss(id, v) {
    const cfg = sbCfg(); const ov = Object.assign({}, cfg.essentialOverrides || {});
    if (v == null) Object.keys(ov).forEach(k => delete ov[k]); else ov[id] = v;
    W.saveSettings({ smartBudget: Object.assign({}, cfg, { essentialOverrides: ov }) });
    const box = $('.sb-cats'); if (box) box.innerHTML = sbCatsHtml();
    if (ui.route === 'smart') refresh();
  }
  function dashSmart() {
    const head = sectionH('Smart Budget', 'Open', 'href="#/smart"');
    let st = null; try { st = sbState(); } catch (e) { console.error(e); }
    if (!st || !st.a || !(st.a.income > 0) || !st.eff) return `<section class="section">${head}<p class="small muted" style="margin:10px 0 0">See how to split your take-home pay between needs, debt, savings and wants.</p></section>`;
    const s = st.eff;
    return `<section class="section">${head}<div class="small muted" style="margin:10px 0 8px">${esc(sbName(st.chosen))} · ${fmt(st.a.income)} a month</div>${sbStack(s.pct)}
      <div style="margin-top:6px">${SB_BUCKETS.map(([k, n, c]) => `<div class="kv"><span><i class="dot" style="background:${c};margin-right:6px"></i>${n} <span class="faint tiny">${sbPct(s.pct[k])}</span></span><b>${fmt(s.amounts[k])}</b></div>`).join('')}</div></section>`;
  }

  // ------------------------------------------------------------ BUDGETS

  // ------------------------------------------------------------ CALENDAR
  function viewCalendar() {
    const mk = ui.calMonth; W.ensureGenerated(mk > curMonth() ? mk : undefined);
    const first = W.monthStart(mk); const start = W.addDays(first, -W.dow(first));
    const t = today(); const end = W.addDays(start, 41);
    const inst = W.instancesBetween(start, end); const pcs = W.paychecksBetween(start, end);
    const pays = W.list('payments').filter(p => !p.voided && p.date >= start && p.date <= end);
    const byDay = {}; const dueByDay = {};
    const push = (d, html) => (byDay[d] = byDay[d] || []).push(html);
    pcs.forEach(p => push(p.date, `<div class="ev income" title="${esc(p.income.name)} paycheck ${fmt(p.amountCents)}${p.received ? ' (received)' : ''}">${fmt0(p.amountCents)} payday</div>`));
    inst.forEach(i => {
      const s = W.instStatus(i); const cls = s.status === 'paid' ? 'paid' : s.overdue ? 'over' : s.status === 'partial' ? 'partial' : s.status === 'skipped' ? 'skip' : '';
      if (s.status !== 'skipped') dueByDay[i.dueDate] = (dueByDay[i.dueDate] || 0) + s.remaining;
      push(i.dueDate, `<div class="ev bill ${cls}${W.isAutopay(i) ? ' auto' : ''}" data-drag="${i.id}" title="${esc(i.name)} ${fmt(i.amountCents)} · ${STATUS[s.status][0]}${W.isAutopay(i) ? ' · auto-pay' : ''}">${esc(i.name)}</div>`);
    });
    let cells = '';
    for (let k = 0; k < 42; k++) {
      const d = W.addDays(start, k); const evs = byDay[d] || []; const pd = pays.filter(p => p.date === d).length;
      const owe = dueByDay[d] || 0; const oweTxt = fmt0(Math.round(owe / 100) * 100).replace(/\.\d\d$/, '');
      cells += `<div class="day ${W.monthOf(d) !== mk ? 'other' : ''} ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" data-day="${d}" role="button" tabindex="0" aria-label="${W.dateLabel(d, true)}${evs.length ? ', ' + evs.length + ' item' + (evs.length > 1 ? 's' : '') : ''}"><div class="day-top"><span class="dnum">${W.parts(d).d}</span>${owe ? `<span class="owe ${d < t ? 'neg' : ''}" title="${fmt(owe)} still due">${oweTxt}</span>` : pd ? `<span class="owe pos" title="${pd} payment${pd > 1 ? 's' : ''} recorded">✓</span>` : ''}</div>${evs.slice(0, 4).join('')}${evs.length > 4 ? `<div class="more">+${evs.length - 4} more</div>` : ''}</div>`;
    }
    const sm = W.billsSummary(mk);
    const mpcs = W.paychecksBetween(W.monthStart(mk), W.monthEnd(mk));
    return `<div class="topbar"><div><h1>Calendar</h1><div class="sub">Tap a day to pay or add bills. Drag a bill to another day to move it for this month only.</div></div>${monthSel('calMonth', mk)}</div>
      <div class="cal-sum">
        <span><b class="num">${fmt(sm.paid)}</b> paid of ${fmt(sm.total)}</span>
        ${sm.overdue ? `<span class="neg"><b class="num">${fmt(sm.overdue)}</b> overdue</span>` : ''}
        <span>${mpcs.length ? `Paydays ${mpcs.map(p => W.shortDate(p.date)).join(', ')}` : 'No paydays this month'}</span>
        <span class="cal-legend" aria-hidden="true"><i class="lg due"></i>Due <i class="lg paid"></i>Paid <i class="lg partial"></i>Partly paid <i class="lg over"></i>Overdue <i class="lg pay"></i>Payday</span>
      </div>
      <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>`;
  }
  function dayModal(d) {
    const inst = W.instancesBetween(d, d); const pcs = W.paychecksBetween(d, d);
    const pays = W.list('payments').filter(p => !p.voided && p.date === d);
    const exps = W.list('expenses').filter(e => e.date === d);
    const owe = inst.reduce((a, i) => a + (i.skipped ? 0 : W.instStatus(i).remaining), 0);
    const rel = W.diffDays(today(), d);
    const sub = rel === 0 ? 'Today' : rel === 1 ? 'Tomorrow' : rel === -1 ? 'Yesterday' : rel > 0 ? 'In ' + rel + ' days' : Math.abs(rel) + ' days ago';
    const m = modal({
      title: W.dateLabel(d, true), footer: false, wide: true,
      body: `<p class="small muted" style="margin:0 0 14px">${sub}${owe ? ` · <b class="${rel < 0 ? 'neg' : ''}">${fmt(owe)}</b> still due` : inst.length ? ' · everything due is handled' : ''}</p>
        ${pcs.map(p => `<div class="day-pay"><span class="pin-sm"></span><div class="grow"><b>${esc(p.income.name)} payday</b> <span class="muted">· ${fmt(p.amountCents)} ${p.received ? 'received' : 'expected'}</span></div><button class="btn sm" data-act="pickPcGo" data-key="${p.key}">Open plan</button></div>`).join('')}
        <div class="group-h"><span class="t">Bills due</span><span class="s">${inst.length ? `<b>${fmt(inst.reduce((a, i) => a + (i.skipped ? 0 : i.amountCents), 0))}</b>` : ''}</span></div>
        ${inst.length ? `<div class="list">${inst.map(i => billRow(i)).join('')}</div>` : '<p class="small muted" style="margin:10px 0 0">Nothing due on this day.</p>'}
        ${pays.length ? `<div class="group-h"><span class="t paid">Paid this day</span><span class="s"><b>${fmt(pays.reduce((a, p) => a + p.amountCents, 0))}</b></span></div>${pays.map(p => `<div class="kv"><span>${esc((W.D.instances[p.instanceId] || {}).name || 'Bill')}${p.auto ? ' <span class="faint tiny">· auto-pay</span>' : ''}</span><b class="pos">${fmt(p.amountCents)}</b></div>`).join('')}` : ''}
        ${exps.length ? `<div class="group-h"><span class="t">Purchases</span><span class="s"><b>${fmt(exps.reduce((a, e) => a + e.amountCents, 0))}</b></span></div>${exps.map(e => `<div class="kv"><span>${esc(e.description || W.catName(e.category))} <span class="faint tiny">· ${esc(W.catName(e.category))}</span></span><b>${fmt(e.amountCents)}</b></div>`).join('')}` : ''}
        <div class="row wrap" style="margin-top:20px;gap:8px"><button class="btn primary" data-act="addBillOn" data-date="${d}">${ic('plus')}Add a bill on this day</button><button class="btn" data-act="addExpenseOn" data-date="${d}">${ic('plus')}Log a purchase</button></div>`,
    });
    dayModal.close = m.close;
  }
  function calendarAfter() {
    const cal = $('.cal'); if (!cal) return;
    cal.addEventListener('keydown', e => { const day = e.target.closest && e.target.closest('.day'); if (day && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); dayModal(day.dataset.day); } });
    let drag = null, timer = null;
    cal.addEventListener('pointerdown', e => {
      const ev = e.target.closest('[data-drag]'); if (!ev) return;
      const start = { x: e.clientX, y: e.clientY, id: ev.dataset.drag, el: ev, pid: e.pointerId, touch: e.pointerType !== 'mouse' };
      drag = { start, active: false };
      if (start.touch) timer = setTimeout(() => begin(e), 280);
    });
    const begin = e => {
      if (!drag || drag.active) return; drag.active = true;
      const g = document.createElement('div'); g.className = 'drag-ghost'; g.textContent = drag.start.el.textContent; document.body.appendChild(g); drag.ghost = g;
      try { drag.start.el.setPointerCapture(drag.start.pid); } catch (x) { /* ignore */ }
      move(e); if (navigator.vibrate) navigator.vibrate(15);
    };
    const move = e => {
      if (!drag) return;
      if (!drag.active) { if (!drag.start.touch && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 6) begin(e); else if (drag.start.touch && Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 10) { clearTimeout(timer); drag = null; } return; }
      e.preventDefault();
      drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
      $$('.day.drop').forEach(x => x.classList.remove('drop'));
      const el = document.elementFromPoint(e.clientX, e.clientY); const day = el && el.closest('.day'); if (day) day.classList.add('drop');
      drag.over = day ? day.dataset.day : null;
    };
    cal.addEventListener('pointermove', move);
    const end = () => {
      clearTimeout(timer); if (!drag) return;
      const d = drag; drag = null; $$('.day.drop').forEach(x => x.classList.remove('drop')); if (d.ghost) d.ghost.remove();
      if (!d.active) return;
      calendarAfter.suppressClick = true; setTimeout(() => calendarAfter.suppressClick = false, 50);
      const i = W.D.instances[d.start.id];
      if (d.over && i && d.over !== i.dueDate) { const old = i.dueDate; W.moveInstanceDue(i.id, d.over); toast(`${i.name} moved to ${W.shortDate(d.over)} (this month only)`, { undo: () => { W.moveInstanceDue(i.id, old); refresh(); } }); refresh(); }
    };
    cal.addEventListener('pointerup', end); cal.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------------------ GOALS
  const GOAL_TYPES = { emergency: 'Emergency fund', vacation: 'Vacation', wedding: 'Wedding', vehicle: 'Vehicle repairs', debt: 'Debt payoff', custom: 'Custom' };
  function viewGoals() {
    const gs = W.list('goals').filter(g => !g.archived);
    const ps = gs.map(g => ({ g, p: W.goalProjection(g.id) }));
    const saved = ps.reduce((a, x) => a + x.p.saved, 0), target = ps.reduce((a, x) => a + x.g.targetCents, 0), pace = ps.reduce((a, x) => a + Math.max(0, x.p.perMonth), 0);
    return `<div class="topbar"><div><h1>Savings</h1><div class="sub">Money set aside for what's next. Moving money here is a transfer, never spending.</div></div><button class="btn primary" data-act="addGoal">${ic('plus')}New goal</button></div>
      ${gs.length ? `<div class="figures" style="--n:3">
        ${fig('Saved so far', fmt(saved), target ? Math.min(100, Math.floor(saved * 100 / target)) + '% of all targets' : '')}
        ${fig('Still to save', fmt(Math.max(0, target - saved)), gs.length + ' goal' + (gs.length === 1 ? '' : 's'))}
        ${fig('Recent pace', fmt(pace) + '<span class="unit">/mo</span>', 'average of the last 3 months')}
      </div>
      <div class="goal-list">${ps.map(({ g, p }) => {
        const proj = p.left === 0 ? '<span class="pos">Goal reached</span>' : p.date ? `On pace for <b>${W.monthLabel(W.monthOf(p.date), true)}</b> at ${fmt(p.perMonth)}/mo` : 'Add money to see a finish date';
        const late = g.targetDate && p.date && p.left > 0 && p.date > g.targetDate;
        return `<div class="goal-row">
          <div class="g-name"><b>${esc(g.name)}</b><div class="tiny muted">${[GOAL_TYPES[g.type] && GOAL_TYPES[g.type] !== g.name ? esc(GOAL_TYPES[g.type]) : '', g.accountId ? 'in ' + esc(W.sourceName(g.accountId)) : 'tracking only', g.targetDate ? 'by ' + W.monthLabel(W.monthOf(g.targetDate), true) : ''].filter(Boolean).join(' · ')}</div></div>
          <div class="g-prog"><div class="row between small"><span class="num"><b>${fmt(p.saved)}</b> <span class="faint">of ${fmt(g.targetCents)}</span></span><span class="num faint">${p.pct}%</span></div><div class="progress" style="margin-top:6px"><i style="width:${p.pct}%"></i></div>
            <div class="tiny ${late ? 'warn' : 'muted'}" style="margin-top:6px">${proj}${p.neededPerMonth ? ` · ${late ? 'need' : 'target needs'} ${fmt(p.neededPerMonth)}/mo` : ''}</div></div>
          <div class="g-act"><button class="btn sm" data-act="contribute" data-id="${g.id}">${ic('plus')}Add money</button><button class="btn sm ghost" data-act="withdraw" data-id="${g.id}">Withdraw</button><button class="btn sm icon ghost" data-act="goalMenu" data-id="${g.id}" aria-label="More for ${esc(g.name)}">${ic('dots')}</button></div>
        </div>`; }).join('')}</div>` : `<div class="empty" style="padding:56px 16px"><b>No savings goals yet</b>An emergency fund is a good first one. Even ${fmt0(2500)} a paycheck adds up to ${fmt0(65000)} in a year.<div style="margin-top:14px"><button class="btn primary" data-act="addGoal">Start a goal</button></div></div>`}`;
  }
  function goalModal(id) {
    const g = id ? W.D.goals[id] : null;
    modal({ title: g ? 'Edit goal' : 'New savings goal', submit: 'Save', body: `<div class="form-grid">${field('Goal type', `<select class="input" name="type">${Object.entries(GOAL_TYPES).map(([k, l]) => opt(k, l, g ? g.type : 'emergency')).join('')}</select>`)}${field('Name', `<input class="input" name="name" value="${esc(g ? g.name : '')}" placeholder="Emergency fund" autofocus>`)}${field('Target amount', moneyInput('target', g ? g.targetCents : null))}${field('Target date (optional)', `<input class="input" type="date" name="date" value="${g && g.targetDate ? g.targetDate : ''}">`)}${field('Already saved', moneyInput('start', g ? g.startCents : 0))}${field('Kept in account', `<select class="input" name="acc"><option value="">— (just tracking)</option>${W.accounts().map(a => opt(a.id, a.name, g ? g.accountId : 'acc_savings')).join('')}</select>`)}</div>`,
      onSubmit: f => { const d = { type: f.type, name: (f.name || GOAL_TYPES[f.type]).trim(), targetCents: needMoney(f.target, 'target'), targetDate: f.date || null, startCents: W.parseMoney(f.start) || 0, accountId: f.acc || null }; if (g) W.updateGoal(id, d); else W.addGoal(d); toast('Goal saved'); refresh(); } });
  }
  function contributeModal(id, withdraw) {
    const g = W.D.goals[id];
    modal({ title: (withdraw ? 'Withdraw from ' : 'Add money to ') + esc(g.name), submit: 'Save', body: `<div class="form-grid">${field('Amount', moneyInput('amount', null, 'autofocus'))}${field('Date', `<input class="input" type="date" name="date" value="${today()}">`)}${field(withdraw ? 'Move money to' : 'Move money from', `<select class="input" name="acc"><option value="">— (just tracking)</option>${W.accounts().filter(a => a.id !== g.accountId).map(a => opt(a.id, a.name, W.defaultAccountId())).join('')}</select>`)}</div><p class="tiny muted">${g.accountId ? 'Records a transfer between ' + esc(W.sourceName(g.accountId)) + ' and the account you pick. It is not an expense.' : ''}</p>`,
      onSubmit: f => { const c = needMoney(f.amount); W.contributeGoal(id, withdraw ? -c : c, needDate(f.date), f.acc || null); toast('Saved'); refresh(); } });
  }

  // ------------------------------------------------------------ REPORTS
  function viewReports() {
    const mk = ui.repMonth; const prev = W.addMonthKey(mk, -1);
    const a = W.monthSummary(mk), b = W.monthSummary(prev);
    const cats = Array.from(new Set(Object.keys(a.spending).concat(Object.keys(b.spending)))).sort((x, y) => (a.spending[y] || 0) - (a.spending[x] || 0));
    const months = []; for (let k = 11; k >= 0; k--) months.push(W.addMonthKey(mk, -k));
    const sums = months.map(m => W.monthSummary(m));
    const debtSeries = months.map(m => W.totalDebt(W.monthEnd(m) < today() ? W.monthEnd(m) : today()));
    const pl = W.monthLabel(prev, true).slice(0, 3);
    // goodUp: whether an increase is good news (income) or bad news (spending)
    const delta = (x, y, goodUp) => { const d = x - y; if (d === 0) return `<span class="faint">same as ${pl}</span>`; const good = goodUp ? d > 0 : d < 0; return `<span class="${good ? 'pos' : 'neg'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}</span> <span class="faint">vs ${pl}</span>`; };
    const chg = (x, y) => { const d = x - y; return d === 0 ? '<span class="faint">—</span>' : `<span class="${d > 0 ? 'neg' : 'pos'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}</span>`; };
    const yr = mk.slice(0, 4); const yMonths = Array.from({ length: 12 }, (_, k) => yr + '-' + String(k + 1).padStart(2, '0')).map(m => W.monthSummary(m));
    const ml = months.map(m => W.monthLabel(m, true).slice(0, 3));
    const cmpMax = Math.max(1, ...cats.map(c => Math.max(a.spending[c] || 0, b.spending[c] || 0)));
    return `<div class="topbar"><div><h1>Reports</h1><div class="sub">How ${W.monthLabel(mk)} compares, and where the year is heading.</div></div><div class="row wrap">${monthSel('repMonth', mk)}<button class="btn" data-act="exportXlsx">${ic('download')}Export to Excel</button></div></div>
      <div class="figures" style="--n:4">
        ${fig('Income', fmt(a.income.total), delta(a.income.total, b.income.total, true))}
        ${fig('Bills', fmt(a.bills.total), delta(a.bills.total, b.bills.total, false))}
        ${fig('Spending', fmt(a.totalSpending), delta(a.totalSpending, b.totalSpending, false))}
        ${fig('Left after bills', fmt(a.leftAfterBills), delta(a.leftAfterBills, b.leftAfterBills, true), a.leftAfterBills < 0 ? 'neg' : '')}
      </div>
      <section class="section" style="margin-top:30px">
        <div class="section-h"><h2>Twelve months</h2><span class="meta">${ml[0]} ${months[0].slice(0, 4)} – ${ml[11]} ${months[11].slice(0, 4)}</span></div>
        <div style="margin-top:12px">${lineChart({ title: 'Income, bills and spending by month', width: 1000, height: 250, labels: ml, series: [{ name: 'Income', color: 'var(--s1)', values: sums.map(s => s.income.total) }, { name: 'Bills due', color: 'var(--s2)', values: sums.map(s => s.bills.total) }, { name: 'Spending', color: 'var(--s3)', values: sums.map(s => s.totalSpending) }], maxLabels: 12 })}</div>
      </section>
      <div class="split rep-split" style="margin-top:30px">
        <section class="section">
          <div class="section-h"><h2>By category</h2><span class="meta">${W.monthLabel(mk, true)} vs ${W.monthLabel(prev, true)}</span></div>
          ${cats.length ? `<table class="tbl cmp-tbl"><thead><tr><th>Category</th><th class="r">${W.monthLabel(mk, true).slice(0, 3)}</th><th class="r">${pl}</th><th class="r">Change</th></tr></thead><tbody>${cats.map(c => { const x = a.spending[c] || 0, y = b.spending[c] || 0; return `<tr><td><span class="c-name">${esc(W.catName(c))}</span><span class="c-bar"><i style="width:${x * 100 / cmpMax}%"></i></span></td><td class="r num"><b>${fmt(x)}</b></td><td class="r num faint">${fmt(y)}</td><td class="r num">${chg(x, y)}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty"><b>No spending in these months</b>Paid bills and expenses show up here.</div>'}
        </section>
        <section class="section">
          <div class="section-h"><h2>Debt</h2><span class="meta">${fmt(debtSeries[11])} now</span></div>
          <div style="margin-top:12px">${lineChart({ title: 'Total debt by month', width: 420, height: 240, labels: ml, series: [{ name: 'Total debt', color: 'var(--s1)', values: debtSeries, fill: true }], maxLabels: 6 })}</div>
          <p class="tiny faint" style="margin:8px 0 0">Month-end balances, including interest added and payments made.</p>
        </section>
      </div>
      <section class="section" style="margin-top:30px">
        <div class="section-h"><h2>${yr} month by month</h2><span class="meta">Tap a month to open its bills</span></div>
        <div class="scroll-hint">Swipe the table sideways to see every column →</div>
        <div class="tbl-wrap tbl-scroll"><table class="tbl year-tbl"><thead><tr><th>Month</th><th class="r">Income</th><th class="r">Bills</th><th class="r">Paid</th><th class="r">Spending</th><th class="r">Left after bills</th></tr></thead><tbody>
          ${yMonths.map(s => `<tr data-act="openMonth" data-month="${s.month}" class="${s.month === mk ? 'cur' : ''}"><td>${W.monthLabel(s.month, true)}</td><td class="r num">${fmt(s.income.total)}</td><td class="r num">${fmt(s.bills.total)}</td><td class="r num">${fmt(s.bills.paid)}</td><td class="r num">${fmt(s.totalSpending)}</td><td class="r num ${s.leftAfterBills < 0 ? 'neg' : ''}">${fmt(s.leftAfterBills)}</td></tr>`).join('')}
          </tbody><tfoot><tr><td>Total</td><td class="r num">${fmt(yMonths.reduce((x, s) => x + s.income.total, 0))}</td><td class="r num">${fmt(yMonths.reduce((x, s) => x + s.bills.total, 0))}</td><td class="r num">${fmt(yMonths.reduce((x, s) => x + s.bills.paid, 0))}</td><td class="r num">${fmt(yMonths.reduce((x, s) => x + s.totalSpending, 0))}</td><td class="r num">${fmt(yMonths.reduce((x, s) => x + s.leftAfterBills, 0))}</td></tr></tfoot></table></div>
      </section>`;
  }

  // ------------------------------------------------------------ HISTORY
  function viewHistory() {
    let tx = W.transactions();
    const q = ui.histSearch.trim().toLowerCase();
    if (q) tx = tx.filter(t => t.name.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q) || W.centsToStr(Math.abs(t.amountCents)).includes(q) || (t.category && W.catName(t.category).toLowerCase().includes(q)));
    if (ui.histKind) tx = tx.filter(t => ui.histKind === 'debt' ? t.kind.startsWith('debt') : t.kind === ui.histKind);
    if (ui.histFrom) tx = tx.filter(t => t.date >= ui.histFrom); if (ui.histTo) tx = tx.filter(t => t.date <= ui.histTo);
    const SORT = { 'date-desc': (a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0, 'date-asc': (a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0, 'amount-desc': (a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents) };
    tx.sort(SORT[ui.histSort] || SORT['date-desc']);
    const shown = tx.slice(0, 400);
    const KIND = { bill: ['Bill', 'due'], expense: ['Purchase', ''], income: ['Income', 'paid'], transfer: ['Transfer', 'partial'] };
    const live = tx.filter(t => !t.voided);
    const inSum = live.filter(t => t.kind === 'income').reduce((a, t) => a + t.amountCents, 0);
    const outSum = live.filter(t => t.kind === 'bill' || t.kind === 'expense').reduce((a, t) => a - t.amountCents, 0);
    const row = t => { const k = KIND[t.kind] || ['Debt', 'skip']; const pos = t.amountCents > 0 && t.kind === 'income';
      return `<div class="tx ${t.voided ? 'void' : ''}">
        <span class="tx-date num">${W.shortDate(t.date)}</span>
        <div class="tx-body"><div class="tx-name">${esc(t.name)}</div><div class="tiny muted"><span class="pill ${k[1]}">${k[0]}</span> ${[t.category && W.D.categories[t.category] ? esc(W.catName(t.category)) : '', t.source ? esc(W.sourceName(t.source)) : '', t.note ? esc(t.note) : '', t.voided ? 'voided' : ''].filter(Boolean).join(' · ')}</div></div>
        <span class="tx-amt num ${pos ? 'pos' : ''}">${t.amountCents > 0 ? '+' : '−'}${fmt(Math.abs(t.amountCents))}</span>
        <span class="tx-act">${t.kind === 'bill' && !t.voided ? `<button class="btn sm ghost" data-act="voidPay" data-id="${t.id}">Void</button>` : t.kind === 'expense' ? `<button class="btn sm icon ghost" data-act="editExpense" data-id="${t.id}" aria-label="Edit">${ic('edit')}</button>` : ''}</span>
      </div>`; };
    let body;
    if ((ui.histSort || 'date-desc').startsWith('date')) {
      const groups = []; const by = {};
      for (const t of shown) { const k = t.date.slice(0, 7); if (!by[k]) { by[k] = { k, items: [] }; groups.push(by[k]); } by[k].items.push(t); }
      body = groups.map(g => { const net = g.items.filter(t => !t.voided && t.kind !== 'transfer' && !t.kind.startsWith('debt')).reduce((a, t) => a + t.amountCents, 0); return `<div class="group-h"><span class="t">${W.monthLabel(g.k)}</span><span class="s">${g.items.length} item${g.items.length === 1 ? '' : 's'} · net <b class="${net < 0 ? '' : 'pos'}">${net < 0 ? '−' : '+'}${fmt(Math.abs(net))}</b></span></div>${g.items.map(row).join('')}`; }).join('');
    } else body = `<div class="group-h"><span class="t">Largest first</span></div>${shown.map(row).join('')}`;
    return `<div class="topbar"><div><h1>History</h1><div class="sub">Every payment, purchase, paycheck and transfer. Voided items stay, crossed out.</div></div><button class="btn" data-act="exportCsvMenu">${ic('download')}Export CSV</button></div>
      <div class="toolbar hist-tools" style="padding-top:0">
        <div class="search">${ic('search')}<input class="input" placeholder="Search name, note or amount" value="${esc(ui.histSearch)}" data-bind="histSearch" aria-label="Search history"></div>
        <select class="input" data-bind="histKind" aria-label="Type">${[['', 'All types'], ['bill', 'Bill payments'], ['expense', 'Purchases'], ['income', 'Income'], ['transfer', 'Transfers'], ['debt', 'Debt activity']].map(([v, l]) => opt(v, l, ui.histKind)).join('')}</select>
        <label class="inline">From <input class="input" type="date" data-bind="histFrom" value="${esc(ui.histFrom)}" aria-label="From"></label>
        <label class="inline">To <input class="input" type="date" data-bind="histTo" value="${esc(ui.histTo)}" aria-label="To"></label>
        <select class="input" data-bind="histSort" aria-label="Sort">${[['date-desc', 'Newest first'], ['date-asc', 'Oldest first'], ['amount-desc', 'Largest first']].map(([v, l]) => opt(v, l, ui.histSort)).join('')}</select>
      </div>
      <div class="hist-sum small muted">${tx.length} item${tx.length === 1 ? '' : 's'} · <span class="pos">+${fmt(inSum)}</span> in · −${fmt(outSum)} out${q || ui.histKind || ui.histFrom || ui.histTo ? ' · <button class="link" data-act="clearHist">Clear filters</button>' : ''}</div>
      <div class="tx-list">${shown.length ? body : `<div class="empty"><b>Nothing matches</b>Try a different search or date range.</div>`}</div>
      ${tx.length > shown.length ? `<div class="small muted" style="padding:12px 0">Showing the first 400 of ${tx.length}. Narrow the dates to see the rest.</div>` : ''}`;
  }
  // ------------------------------------------------------------ SETTINGS
  const CURRENCIES = { USD: ['$', 'US dollar'], CAD: ['$', 'Canadian dollar'], AUD: ['$', 'Australian dollar'], MXN: ['$', 'Mexican peso'], EUR: ['€', 'Euro'], GBP: ['£', 'British pound'], INR: ['₹', 'Indian rupee'], PHP: ['₱', 'Philippine peso'] };
  function applyDisplay() { const s = W.settings(); W.setDisplay({ symbol: (CURRENCIES[s.currency] || CURRENCIES.USD)[0], dateOrder: s.dateFormat === 'dm' ? 'dm' : 'md' }); }
  // name/email/address from Settings > Personal info. While signed in with Google, the email is the Google one (locked).
  function profile() {
    const s = W.settings(), p = s.profile || {};
    let first = p.first || '', last = p.last || '';
    if (!first && !last && p.name) { const parts = String(p.name).split(/\s+/).filter(Boolean); first = parts.shift() || ''; last = parts.join(' '); }
    const g = s.account && s.account.email;
    return { first, last, full: (first + ' ' + last).trim(), email: g || p.email || '', emailLocked: !!g, street: p.street || '', unit: p.unit || '', city: p.city || '', state: p.state || '', zip: p.zip || '', photo: p.photo || '' };
  }
  function avatar(size) {
    const s = W.settings(), p = s.profile || {};
    if (p.photo) return `<span class="avatar" style="width:${size}px;height:${size}px"><img src="${esc(p.photo)}" alt=""></span>`;
    const pf = profile();
    const ini = pf.full ? (pf.first.slice(0, 1) + pf.last.slice(0, 1)).toUpperCase() : pf.email ? pf.email[0].toUpperCase() : '';
    return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px">${ini ? esc(ini) : ic('user')}</span>`;
  }
  const SET_SECTIONS = [
    ['personal', 'Personal info', 'user', 'Name, email, address, photo'],
    ['security', 'Security', 'shield', 'PIN and fingerprint'],
    ['theme', 'App theme', 'palette', 'Colors and dashboard sections'],
    ['notifications', 'Notifications', 'bell', 'Bill reminders'],
    ['accounts', 'Accounts', 'wallet', 'Checking, savings and cash'],
    ['categories', 'Categories', 'tag', 'Categories and set-asides'],
    ['data', 'Your data', 'db', 'Export, backup, restore'],
    ['about', 'About', 'info', 'Version and privacy'],
  ];
  function viewSettings() {
    const s = W.settings(); const r = s.reminders;
    const lockOn = !!S.key;
    const dash = s.dashboard; const order = dash.order.filter(k => WIDGETS[k]).concat(Object.keys(WIDGETS).filter(k => !dash.order.includes(k)));
    const group = (id, title, desc, body) => `<section class="set-group" id="set-${id}"><div class="set-label"><p>${desc}</p></div><div class="set-body">${body}</div></section>`;
    const srow = (label, hint, control) => `<div class="set-row"><div class="set-k"><div>${label}</div>${hint ? `<div class="tiny muted">${hint}</div>` : ''}</div><div class="set-v">${control}</div></div>`;
    const email = s.account && s.account.email;
    const sum = {
      personal: profile().full || profile().email || 'Name, email, address, photo',
      security: !S.cryptoAvailable ? 'Needs the Android app or a secure page' : (lockOn ? 'PIN on' : 'No PIN') + (AUTH.bio() === 'enabled' ? ' · Fingerprint on' : AUTH.bio() === 'available' ? ' · Fingerprint off' : ''),
      theme: { system: 'System', light: 'Light', blue: 'Soft blue', dark: 'Dark', seasonal: 'Seasonal', random: 'Random monthly' }[s.theme] || 'System',
      notifications: r.enabled ? 'On · ' + ((r.hour % 12) || 12) + ':00 ' + (r.hour < 12 ? 'AM' : 'PM') : 'Off',
      accounts: W.accounts().length + ' account' + (W.accounts().length === 1 ? '' : 's'),
      categories: W.categories().length + ' categories',
      data: GD.on() ? 'Backing up to Google Drive' : s.lastBackup ? 'Last backup ' + W.dateLabel(s.lastBackup, true) : 'No backup yet',
      about: 'Version ' + APP_VERSION,
    };
    const sec = ui.setSec;
    if (!sec) {
      return `<div class="topbar"><div><h1>Settings</h1><div class="sub">Everything here is stored on this device only.</div></div></div>
      <div class="fade-in set-home">
        <a class="set-profile" href="#/settings/personal">${avatar(56)}<div class="grow"><b>${esc(profile().full || 'Add your name')}</b><span>${profile().email ? esc(profile().email) : s.guest ? 'Guest · not backed up' : 'Not signed in'}</span></div>${ic('chevR')}</a>
        <nav class="set-menu" aria-label="Settings sections">${SET_SECTIONS.map(([k, l, icon]) => `<a class="set-item" href="#/settings/${k}" data-sec="${k}"><span class="set-ic">${ic(icon)}</span><span class="grow"><b>${l}</b><span>${esc(sum[k])}</span></span>${ic('chevR')}</a>`).join('')}</nav>
      </div>`;
    }
    const title = SET_SECTIONS.find(x => x[0] === sec)[1];
    const head = `<div class="topbar set-top"><div><a class="set-back" href="#/settings">${ic('chevL')}Settings</a><h1>${title}</h1></div></div>`;
    const cur = s.currency || 'USD';
    const pages = {
      personal: () => group('personal', 'Personal info', 'Stays on this device (and in your backups).' + (Bridge && Bridge.addressSupported ? ' While you type a street address, the app looks it up on OpenStreetMap to suggest matches.' : ''),
        `<div class="set-row"><div class="set-k"><div>Photo</div><div class="tiny muted">Shown at the top of Settings. Initials are used if there's no photo.</div></div><div class="set-v">${avatar(48)}<label class="btn sm">${ic('upload')}${s.profile && s.profile.photo ? 'Change' : 'Add photo'}<input type="file" accept="image/*" data-act-change="profilePhoto" hidden></label>${s.profile && s.profile.photo ? '<button class="btn sm ghost" data-act="removePhoto">Remove</button>' : ''}</div></div>` +
        `<div class="set-row col pi-form" data-pi><div class="pi-grid">
          ${[['first', 'First name', 'given-name', 40], ['last', 'Last name', 'family-name', 40]].map(([k, l, ac, n]) => `<label class="field"><span>${l}</span><input class="input" name="${k}" maxlength="${n}" autocomplete="${ac}" value="${esc(profile()[k])}"></label>`).join('')}
          <label class="field span2"><span>Email address${profile().emailLocked ? ' <span class="pill">From Google</span>' : ''}</span><input class="input" type="email" name="email" maxlength="200" autocomplete="email" value="${esc(profile().email)}" ${profile().emailLocked ? 'readonly aria-readonly="true" title="Comes from your Google account. Sign out of Google to change it."' : ''}>${profile().emailLocked ? '<div class="tiny muted pi-note">Comes from your Google account. Sign out of Google to change it.</div>' : ''}</label>
          <label class="field span2 addr-field"><span>Street address</span><input class="input" name="street" maxlength="100" autocomplete="address-line1" role="combobox" aria-autocomplete="list" aria-controls="addrSug" aria-expanded="false" value="${esc(profile().street)}"></label>
          <label class="field span2"><span>Apt, suite or unit <span class="faint">(optional)</span></span><input class="input" name="unit" maxlength="30" autocomplete="address-line2" value="${esc(profile().unit)}"></label>
          <label class="field"><span>City</span><input class="input" name="city" maxlength="60" autocomplete="address-level2" value="${esc(profile().city)}"></label>
          <div class="pi-pair"><label class="field"><span>State</span><input class="input" name="state" maxlength="40" autocomplete="address-level1" value="${esc(profile().state)}"></label><label class="field"><span>ZIP code</span><input class="input" name="zip" maxlength="12" inputmode="numeric" autocomplete="postal-code" value="${esc(profile().zip)}"></label></div>
        </div><div class="row" style="justify-content:flex-end"><button type="button" class="btn primary" data-act="saveProfile">Save</button></div></div>` +
        (GD.supported() ? (GD.supported() ? srow('Google account', s.account && s.account.email ? 'Signed in as <b>' + esc(s.account.email) + '</b>' : s.guest ? '<span class="warn"><b>Guest: your data is not backed up.</b></span> It only exists on this phone. Sign in to back it up to Google Drive.' : '<span class="warn">Not signed in.</span> Sign in to back up to Google Drive.', s.account && s.account.email ? `<button class="btn sm" data-act="signOut">Sign out</button>` : `<button class="btn sm primary" data-act="gdSignIn">Sign in with Google</button>`) : '') : srow('Google account', 'Sign in with Google is in the Android app.', '<span class="faint small">Android app only</span>')) +
        srow('Currency', 'Changes the symbol shown on amounts. It doesn\'t convert anything.', `<select class="input" style="width:auto" data-act-change="currency" aria-label="Currency">${Object.entries(CURRENCIES).map(([k, [sym, n]]) => opt(k, sym + ' ' + n + ' (' + k + ')', cur)).join('')}</select>`) +
        srow('Date format', '', `<div class="seg boxed">${[['md', W.MONTHS[10].slice(0, 3) + ' 7'], ['dm', '7 ' + W.MONTHS[10].slice(0, 3)]].map(([k, l]) => `<button class="${(s.dateFormat || 'md') === k ? 'on' : ''}" data-act="dateFormat" data-v="${k}">${l}</button>`).join('')}</div>`)),
      security: () => group('security', 'Security', S.cryptoAvailable ? 'WealthTrack asks for your PIN' + (AUTH.bio() === 'enabled' ? ' or fingerprint' : '') + ' when you open it and after 2 minutes away. Your data is encrypted with the PIN (AES-256).' : 'Encryption needs the Android app or a secure (https) page.',
        (S.cryptoAvailable ? srow('PIN', lockOn ? '<span class="pos">On</span>. A forgotten PIN can\'t be recovered' + (GD.supported() ? ', but you can restore from your Drive backup.' : '; keep a backup.') : '<span class="warn">No PIN yet.</span>', lockOn ? `<button class="btn sm" data-act="changePin">${ic('lock')}Change PIN</button>` : `<button class="btn sm primary" data-act="setPinNow">${ic('lock')}Create PIN</button>`) : '') +
        (AUTH.bio() !== 'none' ? srow('Fingerprint', AUTH.bio() === 'enabled' ? '<span class="pos">On</span>. Unlock with a touch.' : 'Unlock with your fingerprint instead of typing your PIN.', AUTH.bio() === 'enabled' ? `<button class="btn sm" data-act="bioOff">Turn off</button>` : `<button class="btn sm" data-act="bioOn" ${lockOn ? '' : 'disabled'}>Turn on</button>`) : '') || '<div class="set-row"><div class="set-k muted">Nothing to set here.</div></div>'),
      theme: () => group('look', 'App theme', 'Colors and what the dashboard shows.',
        srow('Theme', s.theme === 'seasonal' ? 'Colors change with the month: icy blue in January, evergreen in December. Follows your phone\'s light or dark mode.' : s.theme === 'random' ? 'Each month gets a different color, never the same twice in a year. Follows your phone\'s light or dark mode.' : 'System follows your phone or computer. Seasonal and Random color the app by month.', `<div class="theme-pick"><div class="seg boxed">${[['system', 'System'], ['light', 'Light'], ['blue', 'Soft blue'], ['dark', 'Dark']].map(([k, l]) => `<button class="${s.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}">${l}</button>`).join('')}</div><div class="seg boxed">${[['seasonal', 'Seasonal'], ['random', 'Random monthly']].map(([k, l]) => `<button class="${s.theme === k ? 'on' : ''}" data-act="theme" data-v="${k}"><i class="swatch ${k}"></i>${l}</button>`).join('')}</div>${s.theme === 'random' ? `<button class="btn sm" data-act="shuffleMonthColors">${ic('repeat')}Shuffle colors</button>` : ''}</div>`) +
        `<div class="set-row col"><div class="set-k"><div>Dashboard sections</div><div class="tiny muted">Turn sections on or off and set their order.</div></div><div class="widget-list">${order.map((k, idx) => `<div class="widget-row"><label class="check grow"><input type="checkbox" data-act-change="widgetToggle" data-k="${k}" ${dash.hidden.includes(k) ? '' : 'checked'}> ${WIDGETS[k].name}</label><button class="btn sm icon ghost" data-act="widgetMove" data-k="${k}" data-n="-1" ${idx === 0 ? 'disabled' : ''} aria-label="Move up">${ic('up')}</button><button class="btn sm icon ghost" data-act="widgetMove" data-k="${k}" data-n="1" ${idx === order.length - 1 ? 'disabled' : ''} aria-label="Move down">${ic('down')}</button></div>`).join('')}</div></div>`),
      notifications: () => group('reminders', 'Notifications', Bridge ? 'Scheduled on your phone, even when the app is closed.' : 'Shown while WealthTrack is open. The Android app can remind you in the background.',
        srow('Bill reminders', 'Auto-pay bills are skipped. They pay themselves.', `<label class="switch"><input type="checkbox" data-act-change="remEnabled" ${r.enabled ? 'checked' : ''}><span></span></label>`) +
        srow('Remind me', '', `<div class="row wrap" style="gap:6px 14px">${[[7, '1 week before'], [3, '3 days before'], [1, 'The day before'], [0, 'On the day']].map(([d, l]) => `<label class="check small"><input type="checkbox" data-act-change="remDay" data-d="${d}" ${r.daysBefore.includes(d) ? 'checked' : ''}> ${l}</label>`).join('')}</div>`) +
        srow('At', '', `<select class="input" style="width:auto" data-act-change="remHour" aria-label="Reminder time">${Array.from({ length: 24 }, (_, h) => opt(h, (h % 12 || 12) + ':00 ' + (h < 12 ? 'AM' : 'PM'), r.hour)).join('')}</select>`) +
        srow('Notifications', '', `<button class="btn sm" data-act="notifPerm">${ic('bell')}${notifStatus()}</button>`) +
        srow('"Due soon" window', 'Bills due within this many days turn yellow.', `<label class="row" style="gap:8px"><input class="input" type="number" min="1" max="30" style="width:76px" value="${s.dueSoonDays}" data-act-change="dueSoon" aria-label="Due soon days"><span class="small muted">days</span></label>`)),
      accounts: () => group('accounts', 'Accounts', 'Where your money sits. "Available" accounts make up the balance on the dashboard.',
        W.accounts().map(a => `<div class="set-row"><div class="set-k"><div><b>${esc(a.name)}</b> <span class="faint tiny">${esc(a.type)}${a.inAvailable ? ' · counts as available' : ''}${W.defaultAccountId() === a.id ? ' · default' : ''}</span></div><div class="tiny muted">${a.needsBalance ? '<span class="warn">Balance not set yet</span>' : 'Balance today'}</div></div><div class="set-v"><b class="num">${fmt(W.accountBalance(a.id))}</b><button class="btn sm" data-act="setBalance" data-id="${a.id}">Set balance</button><button class="btn sm ghost" data-act="editAccount" data-id="${a.id}">Edit</button></div></div>`).join('') +
        `<div class="set-row actions"><button class="btn sm" data-act="addAccount">${ic('plus')}Add account</button><button class="btn sm ghost" data-act="addTransfer">${ic('move')}Move money between accounts</button></div>`),
      categories: () => group('categories', 'Categories', 'Used for bills, purchases and Smart Budget. Hiding one keeps it on past records.',
        `<div class="set-row col"><div class="cat-chips">${W.categories().map(c => `<button class="chip" data-act="editCat" data-id="${c.id}"><i class="dot" style="background:${W.catColor(c.id)};margin-right:6px;width:7px;height:7px"></i>${esc(c.name)}</button>`).join('')}<button class="chip add" data-act="addCat">${ic('plus').replace('<svg', '<svg style="width:13px;height:13px;vertical-align:-2px"')} New category</button></div></div>` +
        srow('Per-paycheck set-asides', (s.setAsides || []).length ? (s.setAsides || []).map(x => esc(x.name) + ' ' + fmt(x.amountCents)).join(' · ') : 'None yet', `<button class="btn sm" data-act="setAsides">Edit</button>`)),
      data: () => group('data', 'Your data', 'Exports open in Excel or Google Sheets. A backup holds everything, including receipts.',
        srow('Export', 'Bills, payments, purchases, income, debts, goals.', `<button class="btn sm" data-act="exportXlsx">${ic('download')}Excel</button><button class="btn sm" data-act="exportCsvMenu">${ic('download')}CSV</button>`) +
        srow('Backup', s.lastBackup ? 'Last backup ' + W.dateLabel(s.lastBackup, true) : '<span class="warn">No backup yet</span>', `<button class="btn sm primary" data-act="backup">${ic('download')}Back up now</button>`) +
        srow('Restore', 'Always asks before replacing anything.', `<label class="btn sm">${ic('upload')}Choose backup file<input type="file" accept="application/json,.json" data-act-change="restoreFile" hidden></label>`) +
        gdRow(srow) +
        srow('Check data', 'Looks for duplicate bills and broken links.', `<button class="btn sm ghost" data-act="integrity">Run check</button>`) +
        srow('Start over', 'Erases everything on this device. A backup downloads first.', `<button class="btn sm danger" data-act="startOver">Erase all data…</button>`)),
      about: () => group('about', 'About', 'WealthTrack keeps your money records on this device. There are no ads and no bank logins.',
        srow('Version', '', `<span class="small">${Bridge && Bridge.appVersion ? 'App ' + esc(Bridge.appVersion()) : 'Version ' + APP_VERSION + ' for web'}</span>`) +
        srow('Bills scheduled through', '', `<span class="small">${W.monthLabel(s.generatedThrough || curMonth())}</span>`) +
        srow('Your privacy', 'Your data is stored only on this device' + (GD.supported() ? ', plus your own Google Drive if you sign in with Google' : '') + '. WealthTrack has no servers and never sees your records.', '')),
    };
    return head + `<div class="fade-in">${pages[sec]()}</div>`;
  }
  function notifStatus() {
    if (Bridge && Bridge.notificationsEnabled) return Bridge.notificationsEnabled() ? 'Notifications on' : 'Allow notifications';
    if (!('Notification' in window)) return 'Notifications not supported';
    return Notification.permission === 'granted' ? 'Notifications on' : Notification.permission === 'denied' ? 'Notifications blocked' : 'Allow notifications';
  }
  function accountModal(id) {
    const a = id ? W.D.accounts[id] : null;
    modal({ title: a ? 'Edit account' : 'Add account', submit: 'Save', body: `<div class="form-grid">${field('Name', `<input class="input" name="name" value="${esc(a ? a.name : '')}" autofocus>`)}${field('Type', `<select class="input" name="type">${[['checking', 'Checking'], ['savings', 'Savings'], ['cash', 'Cash'], ['investment', 'Investment (retirement, brokerage)'], ['property', 'Property or vehicle (value)'], ['other', 'Other']].map(([t, l]) => opt(t, l, a ? a.type : 'checking')).join('')}</select>`)}${a ? '' : field('Current balance', moneyInput('bal', 0))}<label class="check full"><input type="checkbox" name="avail" ${!a || a.inAvailable ? 'checked' : ''}> Count in "available balance"</label>${a ? `<label class="check full"><input type="checkbox" name="def" ${W.defaultAccountId() === id ? 'checked' : ''}> Default account for payments</label>` : ''}</div>`,
      onSubmit: f => { if (!f.name.trim()) throw new UserError('Enter a name'); if (a) { Object.assign(a, { name: f.name.trim(), type: f.type, inAvailable: !!f.avail }); W.save('accounts', a); if (f.def) W.saveSettings({ defaultAccountId: id }); } else { W.save('accounts', { id: W.uid('acc'), name: f.name.trim(), type: f.type, openingCents: W.parseMoney(f.bal) || 0, openingDate: today(), inAvailable: !!f.avail, order: 9 }); } toast('Saved'); refresh(); } });
  }
  function balanceModal(id) {
    const a = W.D.accounts[id]; if (!a) return;
    modal({ title: 'Set ' + esc(a.name) + ' balance', submit: 'Save', body: `<p class="muted small" style="margin-top:0">Enter what your bank shows right now. Payments and deposits you record after today will update it.</p>${field('Balance today', moneyInput('bal', a.needsBalance ? null : W.accountBalance(id), 'autofocus'))}`,
      onSubmit: f => { const c = W.parseMoney(f.bal); if (c == null) throw new UserError('Enter a balance'); a.openingCents = c; a.openingDate = today(); a.openingIsEndOfDay = true; delete a.needsBalance;
        // flows dated today already happened before you checked, so balance = entered amount: shift opening to exclude today's flows
        const todays = W.accountFlows(id).filter(x => x.date === today()).reduce((s, x) => s + x.amountCents, 0); a.openingCents = c - todays;
        W.save('accounts', a); toast('Balance set to ' + fmt(c)); refresh(); } });
  }
  function transferModal() {
    modal({ title: 'Transfer between accounts', submit: 'Transfer', body: `<div class="form-grid">${field('From', `<select class="input" name="from">${W.accounts().map(a => opt(a.id, a.name, 'acc_checking')).join('')}</select>`)}${field('To', `<select class="input" name="to">${W.accounts().map(a => opt(a.id, a.name, 'acc_savings')).join('')}</select>`)}${field('Amount', moneyInput('amount', null, 'autofocus'))}${field('Date', `<input class="input" type="date" name="date" value="${today()}">`)}${field('Note', `<input class="input" name="note">`, 'full')}</div><p class="tiny muted">Transfers aren't counted as spending.</p>`,
      onSubmit: f => { if (f.from === f.to) throw new UserError('Pick two different accounts'); W.addTransfer({ fromId: f.from, toId: f.to, amountCents: needMoney(f.amount), date: needDate(f.date), note: f.note }); toast('Transfer saved'); refresh(); } });
  }
  function catModal(id) {
    const c = id ? W.D.categories[id] : null;
    modal({ title: c ? 'Edit category' : 'Add category', submit: 'Save', body: `<div class="form-grid">${field('Name', `<input class="input" name="name" value="${esc(c ? c.name : '')}" autofocus>`)}${field('Color', `<input class="input" type="color" name="color" value="${c ? W.catColor(c.id) : randomColor()}" style="padding:4px">`)}${c ? `<label class="check full"><input type="checkbox" name="archive"> Hide this category (past records keep it)</label>` : ''}</div>`,
      onSubmit: f => { if (!f.name.trim()) throw new UserError('Enter a name'); if (c) { c.name = f.name.trim(); c.color = f.color; if (f.archive) c.archived = true; W.save('categories', c); } else W.addCategory(f.name.trim(), f.color); toast('Saved'); refresh(); } });
  }

  // ------------------------------------------------------------ export / backup / restore
  function saveFile(name, mime, data) {
    if (Bridge && Bridge.saveFile) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const r = Bridge.saveFile(name, mime, S.b64(bytes));
      if (String(r).startsWith('ok')) toast('Saved to ' + String(r).slice(3)); else toast('Could not save: ' + String(r).replace(/^error:/, ''), { error: true });
      return;
    }
    const blob = new Blob([data], { type: mime }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); toast('Downloaded ' + name);
  }
  function datasets() {
    const inst = W.list('instances').sort((a, b) => a.dueDate < b.dueDate ? -1 : 1);
    return {
      bills: { name: 'Bills by month', columns: [{ header: 'Month', type: 'text', width: 10 }, { header: 'Due date', type: 'date' }, { header: 'Bill', width: 22 }, { header: 'Category' }, { header: 'Amount', type: 'money' }, { header: 'Paid', type: 'money' }, { header: 'Remaining', type: 'money' }, { header: 'Status' }, { header: 'Paycheck', type: 'date' }, { header: 'Note' }],
        rows: inst.map(i => { const s = W.instStatus(i); const pc = W.paycheckFor(i); return [W.monthOf(i.dueDate), i.dueDate, i.name, W.catName(i.category), i.amountCents, s.paid, s.remaining, STATUS[s.status][0], pc ? pc.date : '', i.note || '']; }) },
      payments: { name: 'Payments', columns: [{ header: 'Date paid', type: 'date' }, { header: 'Bill', width: 22 }, { header: 'For month', width: 10 }, { header: 'Amount', type: 'money' }, { header: 'Paid from' }, { header: 'Method' }, { header: 'Note' }, { header: 'Voided' }],
        rows: W.list('payments').sort((a, b) => a.date < b.date ? -1 : 1).map(p => { const i = W.D.instances[p.instanceId] || {}; return [p.date, i.name || '', i.periodMonth || '', p.amountCents, W.sourceName(p.sourceId), p.method || '', p.note || '', p.voided ? 'yes' : '']; }) },
      expenses: { name: 'Expenses', columns: [{ header: 'Date', type: 'date' }, { header: 'Description', width: 24 }, { header: 'Category' }, { header: 'Amount', type: 'money' }, { header: 'Paid with' }, { header: 'Notes' }, { header: 'Receipt' }],
        rows: W.list('expenses').sort((a, b) => a.date < b.date ? -1 : 1).map(e => [e.date, e.description || '', W.catName(e.category), e.amountCents, W.sourceName(e.sourceId), e.notes || '', e.receiptId ? 'yes' : '']) },
      income: { name: 'Income', columns: [{ header: 'Date', type: 'date' }, { header: 'Source', width: 22 }, { header: 'Type' }, { header: 'Amount', type: 'money' }, { header: 'Account' }, { header: 'Voided' }],
        rows: W.list('deposits').map(d => [d.date, (W.D.incomes[d.incomeId] || {}).name || '', 'paycheck', d.amountCents, W.sourceName(d.accountId), d.voided ? 'yes' : '']).concat(W.list('extraIncome').map(x => [x.date, x.note || '', x.type, x.amountCents, W.sourceName(x.accountId), x.voided ? 'yes' : ''])).sort((a, b) => a[0] < b[0] ? -1 : 1) },
      debts: { name: 'Debts', columns: [{ header: 'Debt', width: 20 }, { header: 'Type' }, { header: 'Balance', type: 'money' }, { header: 'APR %', type: 'text' }, { header: 'Minimum', type: 'money' }, { header: 'Due day', type: 'number' }, { header: 'Credit limit', type: 'money' }, { header: 'Utilization', type: 'text' }],
        rows: W.debts().map(d => { const b = W.debtBalance(d.id); return [d.name, DEBT_TYPES[d.type] || d.type, b, W.centsToStr(d.aprCenti || 0), d.minCents || 0, d.dueDay, d.limitCents, d.limitCents ? Math.round(b * 100 / d.limitCents) + '%' : '']; }) },
      debtActivity: { name: 'Debt activity', columns: [{ header: 'Date', type: 'date' }, { header: 'Debt', width: 18 }, { header: 'Type' }, { header: 'Description', width: 26 }, { header: 'Amount (+ raises balance)', type: 'money', width: 22 }],
        rows: W.debts().flatMap(d => W.debtCharges(d.id).map(x => [x.date, d.name, x.type, x.label, x.amountCents])).sort((a, b) => a[0] < b[0] ? -1 : 1) },
      recurring: { name: 'Recurring bills', columns: [{ header: 'Bill', width: 22 }, { header: 'Status' }, { header: 'Schedule', width: 26 }, { header: 'Amount', type: 'money' }, { header: 'Category' }, { header: 'Paid from' }, { header: 'Method' }, { header: 'Subscription' }, { header: 'Notes' }],
        rows: W.list('templates').map(t => { const r = W.currentRule(t); return [t.name, t.status, scheduleText(r), r.amountCents, W.catName(t.category), W.sourceName(t.accountId), t.method || '', t.subscription ? 'yes' : '', t.notes || '']; }) },
      goals: { name: 'Savings goals', columns: [{ header: 'Goal', width: 20 }, { header: 'Target', type: 'money' }, { header: 'Saved', type: 'money' }, { header: 'Progress %', type: 'number' }, { header: 'Target date', type: 'date' }],
        rows: W.list('goals').map(g => { const p = W.goalProjection(g.id); return [g.name, g.targetCents, p.saved, p.pct, g.targetDate || '']; }) },
    };
  }
  function exportXlsx() { const ds = datasets(); saveFile('WealthTrack-' + today() + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', WTXlsx.buildXlsx(Object.values(ds))); }
  function exportCsvMenu() {
    const ds = datasets();
    modal({ title: 'Export CSV', footer: false, body: `<p class="muted small" style="margin-top:0">Pick what to export. Each one is a separate CSV file.</p><div class="stack">${Object.entries(ds).map(([k, d]) => `<button type="button" class="btn" style="width:100%;justify-content:space-between" data-csv="${k}">${esc(d.name)} <span class="muted small">${d.rows.length} rows</span></button>`).join('')}</div>`,
      onMount: f => f.addEventListener('click', e => { const b = e.target.closest('[data-csv]'); if (b) { const d = ds[b.dataset.csv]; saveFile('WealthTrack-' + b.dataset.csv + '-' + today() + '.csv', 'text/csv', WTXlsx.buildCsv(d)); } }) });
  }
  function backupJson() { return JSON.stringify({ app: 'WealthTrack', format: 1, exportedAt: new Date().toISOString(), data: W.D }, null, 1); }
  function backup() {
    modal({ title: 'Back up all data', submit: 'Download backup', body: `<p class="muted small" style="margin-top:0">Downloads one file with everything. Add a password to encrypt it (recommended if you store it online).</p>${S.cryptoAvailable ? field('Password (optional)', `<input class="input" type="password" name="pw" autocomplete="new-password">`) : ''}`,
      onSubmit: async f => { let out = backupJson(); if (f.pw) out = await S.encryptBackup(out, f.pw); saveFile('WealthTrack-backup-' + today() + (f.pw ? '-encrypted' : '') + '.json', 'application/json', out); W.saveSettings({ lastBackup: today() }); } });
  }
  async function restoreFile(file) {
    if (!file) return;
    let text = await file.text(); let obj;
    try { obj = JSON.parse(text); } catch (e) { return toast('That file is not a WealthTrack backup', { error: true }); }
    if (obj.wealthtrackEncryptedBackup) {
      const pw = await askText('Backup password', 'This backup is encrypted. Enter its password.', 'password'); if (pw == null) return;
      try { text = await S.decryptBackup(obj, pw); obj = JSON.parse(text); } catch (e) { return toast('Wrong password', { error: true }); }
    }
    if (!obj || typeof obj !== 'object' || obj.app !== 'WealthTrack' || !obj.data || typeof obj.data !== 'object') return toast('That file is not a WealthTrack backup', { error: true });
    if (Number(obj.format) > S.BACKUP_FORMAT) return toast('This backup was made by a newer version of WealthTrack. Update the app, then restore it.', { error: true });
    // validate & clean the untrusted file before anything touches the database
    let clean;
    try { clean = S.sanitizeData(obj.data, W.COLLS); } catch (e) { return toast('That backup is damaged: ' + e.message, { error: true }); }
    const data = clean.data, rep = clean.report;
    const counts = ['templates', 'instances', 'payments', 'expenses', 'debts'].map(c => `${Object.keys(data[c] || {}).length} ${c === 'templates' ? 'bills' : c === 'instances' ? 'monthly bill entries' : c}`).join(', ');
    const repHtml = rep.dropped || rep.fixed ? `<div class="callout small" style="margin-top:10px">${ic('alert')}<div>${rep.dropped ? `<b>${rep.dropped}</b> damaged record${rep.dropped === 1 ? '' : 's'} will be skipped. ` : ''}${rep.fixed ? `${rep.fixed} value${rep.fixed === 1 ? ' was' : 's were'} repaired.` : ''}${rep.notes.length ? `<ul style="margin:6px 0 0;padding-left:18px">${rep.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div></div>` : '';
    modal({ title: 'Restore backup?', submit: 'Replace my data', body: `<p>Backup from <b>${esc(String(obj.exportedAt || '').slice(0, 10))}</b>: ${counts}.</p>${repHtml}<div class="callout red small" style="margin-top:10px">${ic('alert')}<div>This <b>replaces</b> all WealthTrack data on this device with the backup.</div></div><label class="check" style="margin-top:12px"><input type="checkbox" name="pre" checked> Download a backup of my current data first</label>`,
      onSubmit: async f => {
        if (f.pre) saveFile('WealthTrack-before-restore-' + today() + '.json', 'application/json', backupJson());
        const before = backupJson();
        try {
          DEMO.on = false; DEMO.real = null; if (DEMO.restoreSave) DEMO.restoreSave(); await S.replaceAll(data); W.init(data, S); W.runMaintenance(); applyTheme(); toast('Backup restored'); try { localStorage.removeItem('wt.restoreAfterReset'); } catch (e) { /* ignore */ } refresh();
        } catch (err) {
          console.error(err);
          // put the previous data back so a bad file can never leave the app empty or broken
          try { const prev = JSON.parse(before).data; await S.replaceAll(prev); W.init(prev, S); refresh(); } catch (e2) { console.error(e2); }
          toast('Restore failed, your previous data was kept: ' + (err.message || err), { error: true });
        }
      } });
  }
  function askText(title, msg, type) {
    return new Promise(res => { let v = null; const m = modal({ title, submit: 'OK', body: `<p class="muted small" style="margin-top:0">${msg}</p><input class="input" name="v" type="${type || 'text'}" autofocus>`, onSubmit: f => { v = f.v; res(v); } }); const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (v == null) res(null); } }); obs.observe(document.body, { childList: true }); });
  }


  // ------------------------------------------------------------ Google Drive backup (Android: Sign in with Google)
  // The Android app keeps one file, WealthTrack-backup.json, in the user's Google Drive (drive.file scope:
  // it can only see files it created). Backups run a minute after changes, when the app goes to the
  // background, and at least daily. Per-device status lives in localStorage so it never triggers a save.
  const GD = {
    supported: () => !!(Bridge && Bridge.googleDriveSupported && Bridge.googleDriveSupported()),
    on: () => !!(W.settings().gdrive && W.settings().gdrive.on),
    state() { try { return JSON.parse(localStorage.getItem('wt.gd') || '{}'); } catch (e) { return {}; } },
    setState(p) { try { localStorage.setItem('wt.gd', JSON.stringify(Object.assign(GD.state(), p))); } catch (e) { /* storage blocked */ } },
    dirty: false, timer: null, busy: false, manual: false,
    schedule(ms) { if (!GD.on() || !GD.supported()) return; clearTimeout(GD.timer); GD.timer = setTimeout(() => GD.backup(false), ms == null ? 60000 : ms); },
    backup(manual) {
      if (!GD.supported() || !GD.on() || GD.busy || DEMO.on) return; // demo data is never backed up
      if (AUTH.resetMode()) return; // never overwrite the Drive backup with a freshly reset phone before it's restored
      GD.busy = true; GD.manual = !!manual; GD.dirty = false;
      try { Bridge.googleBackup(backupJson()); } catch (e) { GD.busy = false; GD.setState({ err: e.message || String(e) }); }
    },
    onEvent(d) {
      if (!d || typeof d !== 'object') return;
      if (d.op === 'signin') {
        if (d.ok) {
          const email = String(d.email || '').slice(0, 200);
          W.saveSettings({ gdrive: { on: true, email }, account: { email }, guest: false }); GD.setState({ err: '', needsSignIn: false });
          if (AUTH.resetMode()) { toast('Signed in. Getting your backup from Google Drive…'); Bridge.googleRestore(); }
          else { toast('Signed in' + (email ? ' as ' + email : '') + '. Backing up now…'); GD.backup(true); }
        }
        else if (d.error !== 'cancelled') { GD.setState({ err: d.error }); if (!document.querySelector('.auth')) toast(d.error, { error: true }); } // the sign-in page shows it inline
      } else if (d.op === 'backup') {
        GD.busy = false;
        if (d.ok) { GD.setState({ last: d.time || Date.now(), err: '', needsSignIn: false }); if (GD.manual) toast('Backed up to Google Drive'); }
        else if (d.error === 'signin-required') { GD.setState({ needsSignIn: true }); if (GD.manual) toast('Sign in with Google again to keep backing up', { error: true }); }
        else { GD.setState({ err: d.error }); if (GD.manual) toast('Backup failed: ' + d.error, { error: true }); }
        GD.manual = false;
      } else if (d.op === 'restore') {
        if (d.ok) { const text = Bridge.googleRestoreData && Bridge.googleRestoreData(); if (text) restoreFile({ text: async () => text }); else toast('The backup came back empty', { error: true }); }
        else if (AUTH.resetMode() && /No WealthTrack backup/.test(d.error || '')) { try { localStorage.removeItem('wt.restoreAfterReset'); } catch (e) { /* ignore */ } toast('No backup in your Google Drive yet. WealthTrack will back up from now on.'); GD.backup(false); refresh(); }
        else if (d.error !== 'cancelled') toast(d.error, { error: true });
      }
      if (ui.route === 'settings') refresh();
    },
    lastText() { const s = GD.state(); if (!s.last) return 'No backup yet'; const d = new Date(s.last); return 'Last backup ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); },
  };
  window.addEventListener('googledrive', e => GD.onEvent(e.detail));
  function gdRow(srow) {
    if (!GD.supported()) return srow('Google Drive backup', 'Sign in with Google to back up automatically. Available in the Android app.', '<span class="faint small">Android app only</span>');
    const st = GD.state();
    if (!GD.on()) return srow('Google Drive backup', 'Sign in with Google and your data is backed up to your own Google Drive automatically. WealthTrack can only see the backup file it creates.', `<button class="btn sm primary" data-act="gdSignIn">${ic('upload')}Sign in with Google</button>`);
    const email = esc((W.settings().gdrive || {}).email || 'your Google account');
    if (AUTH.resetMode()) return srow('Google Drive backup', '<span class="warn">Waiting to restore your Drive backup.</span> Backups are paused so the old backup isn\'t replaced.', `<div class="row wrap" style="gap:6px"><button class="btn sm primary" data-act="gdRestore">${ic('download')}Restore from Drive</button><button class="btn sm ghost" data-act="gdFresh">Start fresh instead</button></div>`);
    const note = st.needsSignIn ? '<span class="warn">Google needs you to sign in again.</span>' : st.err ? '<span class="neg">' + esc(st.err) + '</span>' : esc(GD.lastText());
    return srow('Google Drive backup', `Backing up to ${email} automatically. ${note}`, st.needsSignIn ? `<button class="btn sm primary" data-act="gdSignIn">Sign in again</button>` : `<span class="pill paid">${ic('check')}On</span>`);
  }

  // ------------------------------------------------------------ reminders
  let remTimer = null;
  function scheduleReminders() {
    clearTimeout(remTimer);
    if (DEMO.on) return; // no reminders for demo bills
    remTimer = setTimeout(() => {
      const list = W.reminderList(today(), 45);
      if (Bridge && Bridge.setReminders) {
        const items = list.map(r => { const p = W.parts(r.date); return { id: r.id, at: new Date(p.y, p.m - 1, p.d, r.hour, 0, 0).getTime(), title: r.title, body: r.body }; }).filter(r => r.at > Date.now());
        try { Bridge.setReminders(JSON.stringify(items)); } catch (e) { console.warn(e); }
        return;
      }
      // browser: show reminders that are due now (once per reminder per device)
      let shown = {}; try { shown = JSON.parse(localStorage.getItem('wt.rem') || '{}'); } catch (e) { /* ignore */ }
      const now = new Date();
      const due = list.filter(r => r.date === today() && now.getHours() >= r.hour && !shown[r.id]);
      due.forEach(r => { shown[r.id] = 1; if ('Notification' in window && Notification.permission === 'granted') { try { new Notification(r.title, { body: r.body }); } catch (e) { /* ignore */ } } });
      if (due.length && !('Notification' in window && Notification.permission === 'granted')) toast(due.length === 1 ? due[0].title + ' · ' + due[0].body : due.length + ' bill reminders: ' + due.map(r => r.title.replace(/ is due today| due in .*/, '')).join(', '));
      try { localStorage.setItem('wt.rem', JSON.stringify(shown)); } catch (e) { /* ignore */ }
    }, 400);
  }

  // ------------------------------------------------------------ actions
  function withUndoPay(instId) {
    const p = W.markPaid(instId); if (!p) return;
    const i = W.D.instances[instId];
    toast(`${i.name} marked paid · ${fmt(p.amountCents)}`, { undo: () => { W.voidPayment(p.id, 'Undo'); refresh(); } });
    refresh();
    const row = $(`[data-inst="${instId}"]`); if (row) row.classList.add('flash');
  }
  const A = {
    demoExit: async () => { if (await confirmBox('Use your own data?', 'The demo bills and debts are removed and WealthTrack starts empty, ready for your own paychecks, bills and debts.', 'Start with my own data')) { leaveDemo(); refresh(); toast('Demo closed. Add your first paycheck or bill to get started.'); } },
    billMine: () => { setBillView('mine'); toast('My order is on. Hold a bill and drag it up or down.'); refresh(); },
    markPaid: d => { if (Date.now() - (A.markPaid.at || 0) < 700 && A.markPaid.id && A.markPaid.id !== d.id) return; A.markPaid.at = Date.now(); A.markPaid.id = d.id; if (W.isAutopay(W.D.instances[d.id])) return toast('This bill is on auto-pay. It\'s marked paid automatically on its due date.'); withUndoPay(d.id); },
    paidMenu: (d, el) => menu(el, [{ label: 'Payment details / add payment', icon: 'cash', run: () => paymentModal(d.id) }, { label: 'Mark unpaid', icon: 'undo', danger: true, run: async () => { if (await confirmBox('Mark unpaid?', 'The payment will be voided. It stays in your history and other months aren\'t affected.', 'Mark unpaid', true)) { W.markUnpaid(d.id); toast('Marked unpaid'); refresh(); } } }]),
    billMenu: (d, el) => {
      const i = W.D.instances[d.id]; const s = W.instStatus(i); const t = W.D.templates[i.templateId];
      const auto = W.isAutopay(i);
      menu(el, [
        auto ? { label: 'Payment history', icon: 'list', run: () => paymentModal(d.id) } : { label: s.paid ? 'Payments / partial payment' : 'Record partial or custom payment', icon: 'cash', run: () => paymentModal(d.id) },
        { label: 'Edit bill', icon: 'edit', run: () => editInstance(d.id) },
        { label: 'Change due date (this month only)', icon: 'cal', run: () => moveDateModal(d.id) },
        { label: 'Choose paycheck', icon: 'wallet', run: () => assignModal(d.id) },
        i.skipped ? { label: 'Unskip this month', icon: 'play', run: () => { W.setSkipped(d.id, false); refresh(); } } : { label: 'Skip this month', icon: 'skip', run: () => { W.setSkipped(d.id, true); toast(i.name + ' skipped for ' + W.monthLabel(W.monthOf(i.periodKey)), { undo: () => { W.setSkipped(d.id, false); refresh(); } }); refresh(); } },
        s.paid > 0 && !auto ? { label: 'Mark unpaid', icon: 'undo', run: () => A.paidMenu(d, el) } : null,
        '-',
        t && !t.deleted ? { label: t.status === 'paused' ? 'Resume recurring bill' : 'Pause recurring bill', icon: t.status === 'paused' ? 'play' : 'pause', run: () => A[t.status === 'paused' ? 'resumeTpl' : 'pauseTpl']({ id: t.id }) } : null,
        t && !t.deleted ? { label: 'Delete bill (keeps history)', icon: 'trash', danger: true, run: () => A.deleteTpl({ id: t.id }) } : null,
      ].filter(Boolean));
    },
    unskip: d => { W.setSkipped(d.id, false); refresh(); },
    voidPay: async d => { if (await confirmBox('Void this payment?', 'It stays in your history, crossed out, and stops counting toward the bill.', 'Void payment', true)) { W.voidPayment(d.id, 'Voided'); closeAllModals(); toast('Payment voided'); refresh(); } },
    tplMenu: (d, el) => {
      const t = W.D.templates[d.id];
      const items = [];
      if (!t.deleted) items.push({ label: 'Edit (this month onward)', icon: 'edit', run: () => editTemplate(d.id) });
      if (t.status === 'active') items.push({ label: 'Pause', icon: 'pause', run: () => A.pauseTpl(d) }, { label: 'Cancel', icon: 'ban', run: () => A.cancelTpl(d) });
      if (t.status === 'paused') items.push({ label: 'Resume', icon: 'play', run: () => A.resumeTpl(d) });
      if (t.status === 'cancelled') items.push({ label: 'Reactivate', icon: 'play', run: () => A.reactivateTpl(d) });
      if (!t.deleted) items.push('-', { label: 'Delete (keeps history)', icon: 'trash', danger: true, run: () => A.deleteTpl(d) });
      items.push({ label: 'View payment history', icon: 'list', run: () => { ui.histSearch = t.name; ui.histKind = 'bill'; go('history'); } });
      menu(el, items);
    },
    pauseTpl: async d => { const t = W.D.templates[d.id]; if (await confirmBox('Pause ' + esc(t.name) + '?', 'No new bills are created until you resume it. Unpaid upcoming months are removed. Paid months and history stay.', 'Pause')) { const n = W.pauseTemplate(d.id, today()); toast(t.name + ' paused' + (n ? ` · ${n} upcoming removed` : '')); refresh(); } },
    resumeTpl: d => { W.resumeTemplate(d.id); toast('Resumed'); refresh(); },
    cancelTpl: async d => { const t = W.D.templates[d.id]; if (await confirmBox('Cancel ' + esc(t.name) + '?', 'It stops repeating from today. Payment history is kept, and you can reactivate it later.', 'Cancel bill', true)) { W.cancelTemplate(d.id, today()); toast(t.name + ' cancelled'); refresh(); } },
    reactivateTpl: d => { W.reactivateTemplate(d.id); toast('Reactivated'); refresh(); },
    deleteTpl: async d => { const t = W.D.templates[d.id]; if (!t || t.deleted) return false; const kind = t.subscription ? 'subscription' : 'bill'; if (await confirmBox('Delete ' + esc(t.name) + '?', `It disappears from your bills from this month on and won't come back. <b>Every payment you already recorded is kept</b> in History and Reports.`, 'Delete ' + kind, true)) { W.deleteTemplate(d.id); toast(t.name + ' deleted · past payments kept'); refresh(); return true; } return false; },
    toggleDeleted: () => { ui.showDeleted = !ui.showDeleted; refresh(); },
    refreshMonth: async () => {
      const mk = ui.month; const ml = W.monthLabel(mk);
      if (!(await confirmBox('Refresh due dates for ' + ml + '?', `Bills you moved into another month will stay in that month for good, and any bill that's missing from ${ml} is added back on its normal due date. <b>Payments are kept</b> with the bill you paid.`, 'Refresh'))) return;
      const r = W.refreshMonth(mk);
      toast(r.moved || r.created ? `${r.moved ? r.moved + ' moved bill' + (r.moved > 1 ? 's' : '') + ' kept in its new month' : ''}${r.moved && r.created ? ' · ' : ''}${r.created ? r.created + ' bill' + (r.created > 1 ? 's' : '') + ' added back' : ''}` : ml + ' is already up to date');
      refresh();
    },
    editTpl: d => { const t = W.D.templates[d.id]; if (t && !t.deleted) editTemplate(d.id); },
    addBill: () => addBill(), addBillOn: d => { closeAllModals(); addBill(d.date); },
    billsTab: d => { ui.billsTab = d.tab; refresh(); }, billFilter: d => { ui.billFilter = d.f; refresh(); },
    upRange: d => { const v = UP_RANGES.some(x => x[0] === d.r) ? d.r : 'month'; ui.upRange = v; saveUi(); if (W.settings().upRange !== v) W.saveSettings({ upRange: v }); refresh(); },
    billTools: () => { ui.billTools = !ui.billTools; refresh(); },
    openUpcoming: () => { ui.billsTab = 'upcoming'; go('bills'); },
    monthStep: d => setMonth(d.key, W.addMonthKey(ui[d.key], +d.n)), monthToday: d => setMonth(d.key, curMonth()),
    openMonth: d => { ui.month = d.month; ui.billsTab = 'month'; W.ensureGenerated(W.addMonthKey(d.month > curMonth() ? d.month : curMonth(), 1)); go('bills'); },
    catDrill: d => { ui.expCat = d.cat; if (ui.route === 'expenses') refresh(); else go('expenses'); },
    expAllCats: () => { ui.expCat = ''; refresh(); },
    genNext: () => { const next = W.addMonthKey(ui.month, 1); const n = W.ensureGenerated(next); toast(n ? `${n} bills created for ${W.monthLabel(next)}` : `${W.monthLabel(next)} bills already exist. Nothing duplicated.`); ui.month = next; refresh(); },
    resetMonth: () => {
      const mk = ui.month; const paid = W.instancesForMonth(mk).filter(i => !W.isAutopay(i) && W.paidFor(i.id) > 0);
      modal({ title: 'Reset ' + W.monthLabel(mk) + ' payment statuses?', submit: 'Reset ' + W.monthLabel(mk, true), body: `<p>This marks <b>${paid.length}</b> paid bill${paid.length === 1 ? '' : 's'} in ${W.monthLabel(mk)} as unpaid.</p><div class="callout small">${ic('alert')}<div>Nothing is erased. The payments are <b>voided</b> and stay in your history. Other months aren't changed.</div></div><label class="field" style="margin-top:12px"><span>Type RESET to confirm</span><input class="input" name="c" autocomplete="off"></label>`,
        onSubmit: f => { if ((f.c || '').trim().toUpperCase() !== 'RESET') throw new UserError('Type RESET to confirm'); const n = W.resetMonthStatuses(mk); toast(n + ' payment' + (n === 1 ? '' : 's') + ' voided for ' + W.monthLabel(mk)); refresh(); } });
    },
    pickPc: d => { ui.pcKey = d.key; refresh(); }, pickPcGo: d => { closeAllModals(); ui.pcKey = d.key; go('paychecks'); },
    assign: d => assignModal(d.id),
    receiveCheck: d => receiveModal(d.key), undoCheck: d => { W.undoDeposit(d.key); toast('Marked not received'); refresh(); },
    addIncome: () => incomeModal(), editIncome: d => incomeModal(d.id), addExtraIncome: () => extraIncomeModal(),
    voidExtra: async d => { if (await confirmBox('Remove this income?', 'It will be voided and stay in history.', 'Remove', true)) { const x = W.D.extraIncome[d.id]; x.voided = true; W.save('extraIncome', x); refresh(); } },
    setAsides: () => setAsidesModal(),
    addExpense: () => expenseModal(), addExpenseOn: d => { closeAllModals(); expenseModal(null, { date: d.date }); }, editExpense: d => expenseModal(d.id),
    deleteExpense: async d => { const e = W.D.expenses[d.id]; if (await confirmBox('Delete expense?', `${esc(e.description || W.catName(e.category))} · ${fmt(e.amountCents)} on ${W.dateLabel(e.date)}${e.sourceId && e.sourceId.startsWith('debt:') ? '. The charge is also removed from the card balance.' : ''}`, 'Delete', true)) { W.deleteExpense(d.id); toast('Expense deleted'); refresh(); } },
    viewReceipt: d => { const r = W.D.receipts[d.id]; const src = r && safeImg(r.dataUrl); if (src) modal({ title: 'Receipt', footer: false, body: `<img src="${src}" style="width:100%;border-radius:12px" alt="Receipt">` }); else toast('This receipt image is missing or damaged', { error: true }); },
    addDebt: () => debtModal(),
    debtMenu: (d, el) => menu(el, [{ label: 'Edit', icon: 'edit', run: () => debtModal(d.id) }, { label: 'Extra payment', icon: 'cash', run: () => debtTxnModal(d.id, 'pay') }, { label: 'Add charge / purchase', icon: 'plus', run: () => debtTxnModal(d.id, 'charge') }, { label: 'Update balance from statement', icon: 'edit', run: () => debtTxnModal(d.id, 'balance') }, { label: 'History', icon: 'list', run: () => debtHistory(d.id) }, '-', { label: 'Remove debt', icon: 'trash', danger: true, run: async () => { if (await confirmBox('Remove debt?', 'It is hidden from totals. Bills and payments are kept.', 'Remove', true)) { W.updateDebt(d.id, { deleted: true }); refresh(); } } }]),
    debtPay: d => debtTxnModal(d.id, 'pay'), debtCharge: d => debtTxnModal(d.id, 'charge'), debtBalance: d => debtTxnModal(d.id, 'balance'), debtHistory: d => debtHistory(d.id),
    voidDebtTxn: async d => { if (await confirmBox('Void this entry?', 'It stays in history but stops affecting the balance.', 'Void', true)) { const x = W.D.debtTxns[d.id]; x.voided = true; W.save('debtTxns', x); closeAllModals(); refresh(); } },
    payoffPreset: d => { ui.payoffExtra = +d.v; refresh(); },
    clearHist: () => { ui.histSearch = ''; ui.histKind = ''; ui.histFrom = ''; ui.histTo = ''; refresh(); },
    addGoal: () => goalModal(), contribute: d => contributeModal(d.id), withdraw: d => contributeModal(d.id, true),
    goalMenu: (d, el) => menu(el, [{ label: 'Edit goal', icon: 'edit', run: () => goalModal(d.id) }, { label: 'Archive goal', icon: 'trash', danger: true, run: () => { W.updateGoal(d.id, { archived: true }); refresh(); } }]),
    exportXlsx: () => exportXlsx(), exportCsvMenu: () => exportCsvMenu(), backup: () => backup(),
    gdSignIn: () => { if (!GD.supported()) return; toast('Opening Google sign-in…'); Bridge.googleSignIn(); },
    gdBackup: () => GD.backup(true),
    gdRestore: () => { if (!GD.supported()) return; toast('Getting your backup from Google Drive…'); Bridge.googleRestore(); },
    gdOff: async () => { if (await confirmBox('Turn off Google Drive backup?', 'New changes stop being backed up. The backup already in your Drive stays there. To remove WealthTrack\'s access completely, go to myaccount.google.com/permissions.', 'Turn off', true)) { W.saveSettings({ gdrive: { on: false, email: '' } }); GD.setState({ needsSignIn: false, err: '' }); toast('Google Drive backup is off'); refresh(); } },
    theme: d => { if (!['system', 'light', 'blue', 'dark', 'seasonal', 'random'].includes(d.v)) return; W.saveSettings({ theme: d.v }); applyTheme(); refresh(); },
    shuffleMonthColors: () => { W.saveSettings({ monthColorSeed: 1 + Math.floor(Math.random() * 2147483646) }); toast('Month colors shuffled'); refresh(); },
    widgetMove: d => { const s = W.settings().dashboard; const order = s.order.filter(k => WIDGETS[k]).concat(Object.keys(WIDGETS).filter(k => !s.order.includes(k))); const i = order.indexOf(d.k), j = i + +d.n; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; W.saveSettings({ dashboard: { order, hidden: s.hidden } }); refresh(); },
    customizeDash: () => go('settings'),
    addAccount: () => accountModal(), editAccount: d => accountModal(d.id), setBalance: d => balanceModal(d.id), addTransfer: () => transferModal(),
    addCat: () => catModal(), editCat: d => catModal(d.id),
    notifPerm: () => { if (Bridge && Bridge.requestNotificationPermission) { Bridge.requestNotificationPermission(); return; } if ('Notification' in window) Notification.requestPermission().then(() => refresh()); },
    signOut: async () => {
      if (!(await confirmBox('Sign out of Google?', 'Drive backup stops, and WealthTrack will ask you to sign in again. Your data stays on this phone, protected by your PIN.', 'Sign out', true))) return;
      W.saveSettings({ account: null, gdrive: { on: false, email: '' } }); refresh();
      const page = authPage({ overlay: true }); const ok = await stepGoogle(page, 'Not now'); page.close();
      toast(ok ? 'Signed in again' : 'You can sign in any time from Settings'); refresh();
    },
    setPinNow: async () => { const page = authPage({ overlay: true }); page.on('cancel', () => page.close()); await stepCreatePin(page, '<button type="button" class="link" data-auth="cancel">Cancel</button>'); page.close(); toast('PIN set. Your data is now encrypted.' + (AUTH.bio() === 'available' ? ' You can turn on fingerprint unlock below.' : '')); refresh(); },
    changePin: () => requirePinThen('Change PIN', async page => {
      const pin = await stepCreatePin(page, '');
      if (AUTH.bio() === 'enabled' && Bridge.biometricDisable) { Bridge.biometricDisable(); toast('PIN changed. Turn fingerprint on again in Settings.'); } else toast('PIN changed');
      page.close(); refresh();
    }),
    bioOn: () => requirePinThen('Turn on fingerprint', async (page, pin) => { await stepFingerprint(page, pin); page.close(); refresh(); }),
    bioOff: () => { if (Bridge && Bridge.biometricDisable) Bridge.biometricDisable(); toast('Fingerprint unlock is off'); refresh(); },
    saveProfile: () => {
      const f = $('[data-pi]'); if (!f) return;
      const v = n => String((f.querySelector('[name="' + n + '"]') || {}).value || '').replace(/[\u0000-\u001f<>]/g, '').trim();
      const pf = profile(), email = pf.emailLocked ? (W.settings().profile || {}).email || '' : v('email');
      if (!pf.emailLocked && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Check the email address', { error: true });
      const zip = v('zip'); if (zip && !/^[A-Za-z0-9 -]{3,12}$/.test(zip)) return toast('Check the ZIP code', { error: true });
      const p = Object.assign({}, W.settings().profile); delete p.name;
      Object.assign(p, { first: v('first').slice(0, 40), last: v('last').slice(0, 40), email: email.slice(0, 200), street: v('street').slice(0, 100), unit: v('unit').slice(0, 30), city: v('city').slice(0, 60), state: v('state').slice(0, 40), zip });
      Object.keys(p).forEach(k => { if (p[k] === '') delete p[k]; });
      W.saveSettings({ profile: p }); toast('Personal info saved'); refresh();
    },
    removePhoto: () => { const p = Object.assign({}, W.settings().profile); delete p.photo; W.saveSettings({ profile: p }); refresh(); },
    dateFormat: d => { W.saveSettings({ dateFormat: d.v === 'dm' ? 'dm' : 'md' }); applyDisplay(); refresh(); },
    gdFresh: async () => { if (await confirmBox('Start fresh?', 'Backups resume, and the next one replaces the old backup in your Google Drive with what\'s on this phone now.', 'Start fresh', true)) { try { localStorage.removeItem('wt.restoreAfterReset'); } catch (e) { /* ignore */ } GD.backup(true); refresh(); } },
    integrity: () => { const iss = W.integrity(); modal({ title: 'Data check', footer: false, body: iss.length ? `<ul>${iss.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<div class="callout green">${ic('check')}<div>No duplicates or problems found. ${Object.keys(W.D.instances).length} monthly bill entries, ${Object.keys(W.D.payments).length} payments.</div></div>` }); },
    startOver: () => {
      modal({ title: 'Erase everything?', submit: 'Erase and start blank', body: `<div class="callout red">${ic('alert')}<div>This deletes <b>all</b> WealthTrack data on this device, including payment history. A backup will be downloaded first.</div></div><label class="field" style="margin-top:12px"><span>Type ERASE to confirm</span><input class="input" name="c" autocomplete="off"></label>`,
        onSubmit: async f => { if ((f.c || '').trim().toUpperCase() !== 'ERASE') { toast('Type ERASE to confirm', { error: true }); return false; } saveFile('WealthTrack-before-erase-' + today() + '.json', 'application/json', backupJson()); const data = W.emptyData(); await S.replaceAll(data); W.init(data, S); WTSeed.seed(W, { blank: true }); await S.flush(); toast('Started fresh'); go('dashboard'); refresh(); } });
    },
    sbUse: d => sbCommit(d.id),
    sbSave: () => { sbSaveDraft(); },
    sbCancel: () => { const had = sbDraft && sbDraft.dirty; sbDraft = null; sbModeUi = null; if (sbLive) sbRedraw(); else refresh(); if (had) toast('Changes discarded'); },
    sbReset: async () => {
      if (!sbLive) return;
      const custom = sbLive.chosen.id === 'custom' || (sbDraft && sbDraft.dirty) || SB_KEYS.some(k => sbDraft && sbDraft.locks[k]);
      if (custom && !(await confirmBox('Reset your budget?', 'This puts the <b>Recommended</b> plan back in the editor and clears your locks. Nothing is saved until you tap Save, and Cancel brings your plan back.', 'Reset'))) return;
      if (sbLoad(sbLive.rec.id, true)) { sbRedraw(); toast('Recommended plan loaded. Tap Save to keep it.'); }
    },
    sbMode: d => { if (!sbLive || (d.v !== 'dollars' && d.v !== 'percent')) return; const dr = sbGetDraft(sbLive); sbModeUi = d.v; dr.mode = d.v; sbRedraw(`[data-act=sbMode][data-v=${d.v}]`); },
    sbLock: d => { if (!sbLive || !SB_KEYS.includes(d.k)) return; const dr = sbGetDraft(sbLive); dr.locks[d.k] = !dr.locks[d.k]; dr.dirty = true; sbRedraw(`[data-act=sbLock][data-k=${d.k}]`); },
    sbSpread: () => { if (!sbLive) return; const dr = sbGetDraft(sbLive); const nx = sbDistribute(sbLive.a, dr.dollars, dr.locks); SB_KEYS.forEach(k => { if (nx[k] !== dr.dollars[k]) delete dr.pctTyped[k]; }); dr.dollars = nx; dr.dirty = true; sbRedraw(); },
    sbCustomize: d => sbCustomize(d.id),
    sbCats: () => sbCatsModal(),
    sbEss: d => sbSetEss(d.id, d.v === '1'),
    sbEssReset: () => sbSetEss(null, null),
    moreMenu: (d, el) => menu(el, ROUTES.filter(r => !MOBILE.includes(r[0])).map(r => ({ label: r[1], icon: r[2], run: () => go(r[0]) }))),
    quickAdd: (d, el) => menu(el, [{ label: 'Add expense', icon: 'cash', run: () => expenseModal() }, { label: 'Add bill', icon: 'bills', run: () => addBill() }, { label: 'Bonus / extra income', icon: 'wallet', run: () => extraIncomeModal() }, { label: 'Transfer / savings', icon: 'move', run: () => transferModal() }]),
  };
  const CHANGE = {
    movePc: (el) => { W.assignInstance(el.dataset.id, el.value); toast('Moved to the ' + W.shortDate(el.value.split('|')[1]) + ' paycheck'); refresh(); },
    sbInto: el => { const k = el.value; el.value = ''; if (!sbLive || !SB_KEYS.includes(k)) return; const dr = sbGetDraft(sbLive); if (dr.locks[k]) return; const nx = sbDistribute(sbLive.a, dr.dollars, dr.locks, k); SB_KEYS.forEach(x => { if (nx[x] !== dr.dollars[x]) delete dr.pctTyped[x]; }); dr.dollars = nx; dr.dirty = true; sbRedraw(); },
    sbFrom: el => { const id = el.value; el.value = ''; if (id) sbCustomize(id); },
    sbRoll: el => { if (!sbLive || !SB_KEYS.includes(el.dataset.k) || !SB_ROLL.some(r => r[0] === el.value)) return; const dr = sbGetDraft(sbLive); dr.rollover[el.dataset.k] = el.value; dr.dirty = true; sbPaint(el); },
    payoffExtra: el => { const c = W.parseMoney(el.value); ui.payoffExtra = c > 0 ? c : 0; refresh(); },
    widgetToggle: el => { const s = W.settings().dashboard; const hidden = s.hidden.filter(k => k !== el.dataset.k); if (!el.checked) hidden.push(el.dataset.k); W.saveSettings({ dashboard: { order: s.order, hidden } }); },
    remEnabled: el => { const r = W.settings().reminders; r.enabled = el.checked; W.saveSettings({ reminders: r }); scheduleReminders(); },
    remDay: el => { const r = W.settings().reminders; const d = +el.dataset.d; r.daysBefore = r.daysBefore.filter(x => x !== d); if (el.checked) r.daysBefore.push(d); W.saveSettings({ reminders: r }); scheduleReminders(); },
    profilePhoto: async el => {
      const f = el.files && el.files[0]; if (!f) return;
      if (!/^image\//.test(f.type)) return toast('Choose a photo', { error: true });
      try { const url = await squareImage(f, 192); W.saveSettings({ profile: Object.assign({}, W.settings().profile, { photo: url }) }); toast('Photo saved'); refresh(); } catch (e) { toast('Couldn\'t read that photo', { error: true }); }
    },
    currency: el => { W.saveSettings({ currency: el.value }); applyDisplay(); toast('Currency set to ' + el.value); refresh(); },
    remHour: el => { const r = W.settings().reminders; r.hour = +el.value; W.saveSettings({ reminders: r }); scheduleReminders(); },
    dueSoon: el => { W.saveSettings({ dueSoonDays: Math.max(1, Math.min(30, +el.value || 7)) }); },
    restoreFile: el => { restoreFile(el.files[0]); el.value = ''; },
    upPaid: el => { ui.upPaid = el.checked; refresh(); },
  };
  function closeAllModals() { modalStack.slice().forEach(c => c()); }

  // ------------------------------------------------------------ global events
  // Extension modules (e.g. web/smartplan-ui.js) register in window.WTExt = { name: { act: { actionName: fn(dataset, el, event) } } }.
  // They render through window.WTUI helpers below and are called from viewSmart(); app.js actions always win on name clashes.
  // ------------------------------------------------------------ reorder bills: press and hold, then drag
  // Works on This month, Upcoming (inside each date group) and All bills. Saves settings.billOrder only;
  // bills themselves are never changed. Holding still for ~0.45s starts a drag; moving first scrolls as usual.
  function billDrag() {
    const HOLD = 450, SLOP = 8;
    let pend = null, drag = null, eatClick = 0;
    const rowOf = t => t && t.closest ? t.closest('#main .bill[data-tpl], #main tr[data-tpl]') : null;
    const rowsIn = parent => [...parent.children].filter(r => r.dataset && r.dataset.tpl);
    const idsIn = (parent, keep) => { const seen = new Set(), out = []; rowsIn(parent).forEach(r => { const id = r.dataset.tpl; if (keep && id === keep.dataset.tpl && r !== keep) return; if (!seen.has(id)) { seen.add(id); out.push(id); } }); return out; };
    const sib = (r, dir) => { let n = dir < 0 ? r.previousElementSibling : r.nextElementSibling; while (n && !(n.dataset && n.dataset.tpl)) n = dir < 0 ? n.previousElementSibling : n.nextElementSibling; return n; };
    const cancelPend = () => { if (pend) { clearTimeout(pend.timer); pend = null; } };
    const start = () => {
      const p = pend; pend = null;
      if (!p || !document.body.contains(p.row) || rowsIn(p.row.parentElement).length < 2) return;
      drag = { row: p.row, parent: p.row.parentElement, startY: p.y, y: p.y, before: idsIn(p.row.parentElement), scroll: window.scrollY };
      try { if (navigator.vibrate) navigator.vibrate(15); } catch (e) { /* no vibration */ }
      p.row.classList.add('dragging'); document.body.classList.add('reordering'); document.documentElement.style.overflowAnchor = 'none';
      if (window.getSelection) try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    };
    const move = y => {
      const r = drag.row; if (Math.abs(y - drag.y) > 2) drag.moved = true; drag.y = y;
      const ds = window.scrollY - drag.scroll; if (ds) { drag.startY -= ds; drag.scroll = window.scrollY; }
      let dy = y - drag.startY;
      const prev = sib(r, -1), next = sib(r, 1);
      if (prev && dy < -prev.offsetHeight / 2) { drag.parent.insertBefore(r, prev); drag.startY -= prev.offsetHeight; }
      else if (next && dy > next.offsetHeight / 2) { drag.parent.insertBefore(next, r); drag.startY += next.offsetHeight; }
      dy = y - drag.startY;
      r.style.transform = `translateY(${dy}px)`;
    };
    // Auto-scroll only while the finger is right at the screen edge, only if more of this list is hidden that way,
    // and never past the first/last bill of the group (so a bill never keeps travelling on its own).
    const edge = () => {
      if (!drag) return;
      const y = drag.y, h = window.innerHeight, nav = document.querySelector('.bottom-nav');
      const bottomLimit = h - (nav && nav.offsetParent ? nav.offsetHeight : 0);
      const box = drag.parent.getBoundingClientRect();
      let v = 0;
      if (drag.moved && y < 56 && box.top < 0 && sib(drag.row, -1)) v = -Math.max(2, Math.round((56 - y) / 8));
      else if (drag.moved && y > bottomLimit - 56 && box.bottom > bottomLimit && sib(drag.row, 1)) v = Math.max(2, Math.round((y - (bottomLimit - 56)) / 8));
      if (v) { if (!drag.edgeAt) drag.edgeAt = Date.now(); if (Date.now() - drag.edgeAt > 250) { window.scrollBy(0, Math.max(-8, Math.min(8, v))); move(y); } } else drag.edgeAt = 0;
      requestAnimationFrame(edge);
    };
    const finish = () => {
      if (!drag) return;
      const d = drag; drag = null; eatClick = Date.now();
      d.row.classList.remove('dragging'); d.row.style.transform = ''; document.body.classList.remove('reordering'); document.documentElement.style.overflowAnchor = '';
      const after = idsIn(d.parent, d.row);
      if (after.join() === d.before.join()) return;
      const exists = new Set(W.list('templates').map(t => t.id));
      let full = (W.settings().billOrder || []).filter(id => exists.has(id));
      if (!full.length) full = d.before.slice(); // first time: start from the order you were looking at
      W.list('templates').slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(t => { if (!full.includes(t.id)) full.push(t.id); });
      const set = new Set(after); let k = 0;
      full.forEach((id, n) => { if (set.has(id)) full[n] = after[k++]; });
      W.saveSettings({ billOrder: full }); try { S.flush(); } catch (e) { /* saved on the next flush */ }
      if (billView() !== 'mine') setBillView('mine');
      toast('Order saved. Bills are now in your order.');
      refresh();
    };
    document.addEventListener('pointerdown', e => {
      if (ui.route !== 'bills' || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const row = rowOf(e.target); if (!row || e.target.closest('input, select, textarea')) return;
      cancelPend();
      pend = { row, x: e.clientX, y: e.clientY, timer: setTimeout(() => { start(); if (drag) requestAnimationFrame(edge); }, HOLD) };
    });
    document.addEventListener('pointermove', e => {
      if (pend && (Math.abs(e.clientX - pend.x) > SLOP || Math.abs(e.clientY - pend.y) > SLOP)) { cancelPend(); return; }
      if (drag && e.pointerType === 'mouse') { e.preventDefault(); move(e.clientY); }
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (drag) { e.preventDefault(); const t = e.touches[0]; if (t) move(t.clientY); }
      else if (pend) { const t = e.touches[0]; if (t && (Math.abs(t.clientX - pend.x) > SLOP || Math.abs(t.clientY - pend.y) > SLOP)) cancelPend(); }
    }, { passive: false });
    ['pointerup', 'touchend', 'touchcancel'].forEach(ev => document.addEventListener(ev, () => { cancelPend(); finish(); }));
    document.addEventListener('pointercancel', () => { cancelPend(); if (drag && !('ontouchstart' in window)) finish(); });
    document.addEventListener('contextmenu', e => { if (pend || drag || (ui.route === 'bills' && rowOf(e.target))) e.preventDefault(); });
    document.addEventListener('click', e => { if (Date.now() - eatClick < 400) { e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { const d = drag; drag = null; d.row.classList.remove('dragging'); d.row.style.transform = ''; document.body.classList.remove('reordering'); document.documentElement.style.overflowAnchor = ''; refresh(); } });
  }
  // ------------------------------------------------------------ demo banner
  function demoBar() {
    if (!DEMO.on) return '';
    return `<div class="demo-bar" role="status"><span class="demo-tag">DEMO</span><span class="grow">Example data so you can look around. Nothing here is saved, backed up or counted as yours.</span><button class="btn sm" data-act="demoExit">Use my own data</button></div>`;
  }
  // back to the real (blank or restored) records; the demo is gone for good on this device
  function leaveDemo() {
    if (!DEMO.on) return;
    try { localStorage.setItem('wt.demoDone', '1'); } catch (e) { /* storage blocked */ }
    const real = DEMO.real; DEMO.on = false; DEMO.real = null; if (DEMO.restoreSave) DEMO.restoreSave();
    real.meta.settings.demoDone = true; S.put('meta', real.meta.settings); // remembered with your data, not just this browser
    W.init(real, S); S.flush(); W.runMaintenance(); applyTheme(); scheduleReminders();
  }
  const DEMO_ADD = ['addBill', 'addIncome', 'addExpense', 'addDebt', 'addGoal', 'addAccount', 'quickAdd', 'addTransfer'];
  async function demoGuard(name) {
    if (!DEMO.on || !DEMO_ADD.includes(name)) return true;
    const ok = await confirmBox('Leave the demo?', 'You\'re looking at example data. To add your own, WealthTrack switches to your real (empty) records. The demo bills and debts are not kept.', 'Start with my own data');
    if (!ok) return false;
    leaveDemo(); refresh(); toast('Demo closed. Everything you add now is yours.');
    return true;
  }
  function extAct(name) { const X = window.WTExt || {}; for (const k in X) { const f = X[k] && X[k].act && X[k].act[name]; if (typeof f === 'function') return f; } return null; }
  function bindGlobal() {
    document.addEventListener('click', e => {
      if (calendarAfter.suppressClick) return;
      const nav = e.target.closest('[data-nav-btn]'); if (nav && nav.dataset.navBtn !== 'more') { go(nav.dataset.navBtn); return; }
      const ng = e.target.closest('[data-nav-go]'); if (ng) { go(ng.dataset.navGo); return; }
      const a = e.target.closest('[data-act]');
      if (a && !(a.tagName === 'SELECT' || a.tagName === 'INPUT') && DEMO.on && DEMO_ADD.includes(a.dataset.act)) { e.preventDefault(); const nm = a.dataset.act, ds = Object.assign({}, a.dataset); demoGuard(nm).then(go2 => { if (go2 && A[nm]) A[nm](ds, a, e); }); return; }
      if (a && !(a.tagName === 'SELECT' || a.tagName === 'INPUT')) { const fn = A[a.dataset.act] || extAct(a.dataset.act); if (fn) { e.preventDefault(); try { fn(a.dataset, a, e); } catch (err) { console.error(err); toast(err.message, { error: true }); } } return; }
      const day = e.target.closest('.cal .day'); if (day) dayModal(day.dataset.day);
    });
    document.addEventListener('change', e => {
      const el = e.target;
      if (el.dataset.sbin) { try { sbBlur(el); } catch (err) { console.error(err); } return; }
      if (el.dataset.sb) return;
      if (el.dataset.actChange && !CHANGE[el.dataset.actChange] && extAct(el.dataset.actChange)) { try { extAct(el.dataset.actChange)(el.dataset, el, e); } catch (err) { console.error(err); toast(err.message, { error: true }); } return; }
      if (el.dataset.actChange && CHANGE[el.dataset.actChange]) { try { CHANGE[el.dataset.actChange](el); } catch (err) { toast(err.message, { error: true }); } return; }
      if (el.dataset.monthInput) { setMonth(el.dataset.monthInput, el.value); return; }
      if (el.dataset.bind === 'billView' && el.tagName === 'SELECT') { setBillView(el.value); refresh(); return; }
      if (el.dataset.bind && el.tagName === 'SELECT') { ui[el.dataset.bind] = el.value; refresh(); }
      if (el.dataset.bind && el.type === 'date') { ui[el.dataset.bind] = el.value; refresh(); }
    });
    let typing = null;
    document.addEventListener('input', e => {
      const el = e.target;
      if (el.dataset.sb || el.dataset.sbin) { try { sbInput(el); } catch (err) { console.error(err); } return; }
      if (el.dataset.actInput && extAct(el.dataset.actInput)) { try { extAct(el.dataset.actInput)(el.dataset, el, e); } catch (err) { console.error(err); } return; }
      if (!el.dataset.bind || el.tagName === 'SELECT' || el.type === 'date') return;
      ui[el.dataset.bind] = el.value; clearTimeout(typing);
      typing = setTimeout(() => { const pos = el.selectionStart; const key = el.dataset.bind; refresh(); const n = $(`[data-bind="${key}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignore */ } } }, 220);
    });
    // tooltips
    const tip = () => $('#tip');
    document.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); const el = tip(); if (!el) return; if (t) { el.textContent = t.dataset.tip; el.style.opacity = 1; } else el.style.opacity = 0; });
    document.addEventListener('mousemove', e => { const el = tip(); if (el && el.style.opacity === '1') { el.style.left = Math.min(window.innerWidth - el.offsetWidth - 8, e.clientX + 12) + 'px'; el.style.top = (e.clientY - 36) + 'px'; } });
    document.addEventListener('touchstart', e => { const t = e.target.closest && e.target.closest('[data-tip]'); const el = tip(); if (!el) return; if (t) { const r = t.getBoundingClientRect(); el.textContent = t.dataset.tip; el.style.opacity = 1; el.style.left = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, r.left)) + 'px'; el.style.top = (r.top - 38) + 'px'; clearTimeout(tip.t); tip.t = setTimeout(() => el.style.opacity = 0, 1800); } }, { passive: true });
    window.addEventListener('hashchange', () => { closeMenu(); render(); });
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.sbin) { e.preventDefault(); e.target.blur(); return; } if (e.key === 'Escape') { if (closeMenu.fn) closeMenu(); else if (modalStack.length) modalStack[modalStack.length - 1](); } });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && W.D) { const r = W.runMaintenance(); if (r.created || r.interest) refresh(); else scheduleReminders(); } else S.flush(); });
    window.addEventListener('pagehide', () => S.flush());
    window.addEventListener('androidpermission', () => refresh());
    window.onAndroidBack = () => { if (closeMenu.fn) { closeMenu(); return true; } if (modalStack.length) { modalStack[modalStack.length - 1](); return true; } if (ui.route !== 'dashboard') { go('dashboard'); return true; } return false; };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener && window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  }
  function applyTheme() {
    const t = W.settings().theme;
    try { localStorage.setItem('wt.theme', t || 'system'); } catch (e) { /* storage blocked */ }
    applyThemeValue(t);
  }
  function applyThemeValue(t) {
    if (t === 'light' || t === 'dark' || t === 'blue' || t === 'seasonal' || t === 'random') document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    const dark = t === 'dark' || ((t === 'system' || t === 'seasonal' || t === 'random') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    let m = $('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#0b1020' : t === 'blue' ? '#e8eff7' : '#f4f6fb');
  }

  const VIEWS = { dashboard: viewDashboard, bills: viewBills, paychecks: viewPaychecks, calendar: viewCalendar, expenses: viewExpenses, debts: viewDebts, smart: viewSmart, progress: viewProgress, goals: viewGoals, reports: viewReports, history: viewHistory, settings: viewSettings };
  const AFTER = { calendar: calendarAfter };


  // ------------------------------------------------------------ sign-in, PIN and fingerprint pages
  // Android: Sign in with Google once (turns on Drive backup), create a PIN (encrypts the data on the
  // phone), optionally turn on fingerprint. Every launch, and after 2 minutes away, the unlock page asks
  // for the PIN or a fingerprint. Browser: the same pages with a PIN only.
  const LOCK_AFTER_MS = 2 * 60 * 1000;
  const AUTH = {
    // Test hook only: skips first-run setup while no PIN exists yet. It can't open encrypted data.
    skip: () => { try { return localStorage.getItem('wt.skipOnboarding') === '1'; } catch (e) { return false; } },
    android: () => GD.supported(),
    bio: () => { try { return Bridge && Bridge.biometricStatus ? Bridge.biometricStatus() : 'none'; } catch (e) { return 'none'; } },
    resetMode: () => { try { return localStorage.getItem('wt.restoreAfterReset') === '1'; } catch (e) { return false; } },
    external: 0, // set while Google sign-in, the camera or a file picker is open (don't auto-lock on return)
  };
  const GOOGLE_G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.9-2.2 5.3-4.7 7l7.3 5.7c4.3-4 7.2-9.9 7.2-17.2z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';
  function authPage(opts) {
    opts = opts || {};
    const el = document.createElement('div');
    el.className = 'auth' + (opts.overlay ? ' over' : '');
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'WealthTrack sign-in');
    el.innerHTML = `<div class="auth-card"><div class="auth-brand"><div class="logo">${ic('trend')}</div><span>WealthTrack</span></div><div class="auth-body"></div><p class="auth-foot"><span>${ic('lock')}Your money data stays on your device, encrypted with your PIN.</span></p></div>`;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // Enter must not re-click the button behind
    document.body.appendChild(el);
    const body = el.querySelector('.auth-body');
    const handlers = {};
    el.addEventListener('click', e => { const b = e.target.closest('[data-auth]'); if (b && handlers[b.dataset.auth]) { e.preventDefault(); handlers[b.dataset.auth](b); } });
    return { el, body, on: (k, fn) => { handlers[k] = fn; }, set: html => { body.innerHTML = html; body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in'); }, close: () => el.remove() };
  }
  // PIN pad: dots, keypad (0-9, delete), keyboard typing, optional fingerprint key.
  function pinEntry(page, o) {
    let pin = ''; let locked = false;
    const max = 12, min = o.minLen || 6;
    page.set(`<h1>${o.title}</h1><p class="auth-sub">${o.sub}</p>
      <div class="pin-dots" aria-live="polite" aria-label="PIN digits entered"></div>
      <p class="auth-err" role="alert"></p>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button type="button" class="key" data-k="${k}">${k}</button>`).join('')}
        ${o.bio ? `<button type="button" class="key fn" data-k="bio" aria-label="Use fingerprint" title="Use fingerprint">${FINGERPRINT}</button>` : '<span></span>'}
        <button type="button" class="key" data-k="0">0</button>
        <button type="button" class="key fn" data-k="del" aria-label="Delete">${ic('chevL')}</button></div>
      <button type="button" class="btn primary auth-cta" data-k="ok" disabled>${o.cta}</button>
      ${o.links ? `<div class="auth-links">${o.links}</div>` : ''}`);
    const dots = page.body.querySelector('.pin-dots'), err = page.body.querySelector('.auth-err'), cta = page.body.querySelector('[data-k=ok]');
    const draw = () => { dots.innerHTML = Array.from({ length: Math.max(min, pin.length) }, (_, k) => `<i class="${k < pin.length ? 'on' : ''}"></i>`).join(''); cta.disabled = pin.length < min || locked; };
    const submit = async () => {
      if (pin.length < min || locked) return;
      locked = true; cta.disabled = true; cta.textContent = o.busy || 'Checking…';
      const r = await o.onSubmit(pin);
      locked = false; cta.textContent = o.cta;
      if (r !== true) { pin = ''; draw(); if (r) { err.textContent = r; dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake'); } }
    };
    const press = k => {
      if (k === 'ok') return submit();
      if (k === 'bio') return o.onBio && o.onBio();
      if (locked) return;
      err.textContent = '';
      if (k === 'del') pin = pin.slice(0, -1); else if (/^\d$/.test(k) && pin.length < max) pin += k;
      draw();
    };
    page.body.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    const onKey = e => { if (!document.body.contains(page.el) || !page.body.contains(dots)) return document.removeEventListener('keydown', onKey); const all = document.querySelectorAll('.auth'); if (page.el !== all[all.length - 1] || document.querySelector('.overlay')) return; const k = /^\d$/.test(e.key) ? e.key : e.key === 'Backspace' ? 'del' : e.key === 'Enter' ? 'ok' : null; if (!k || (e.target.closest && e.target.closest('input, textarea, select'))) return; e.preventDefault(); press(k); };
    document.addEventListener('keydown', onKey);
    draw();
    return { error: m => { err.textContent = m; }, reset: () => { pin = ''; draw(); } };
  }
  const FINGERPRINT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 11c0 3.5-.6 6.5-2 9"/><path d="M8.5 7.6A5 5 0 0 1 17 11c0 2.4-.2 4.6-.7 6.6"/><path d="M5.6 9.4A8 8 0 0 1 12 3a8 8 0 0 1 8 8c0 1-.1 2-.2 3"/><path d="M7 12c0 2-.4 4-1.2 5.5"/><path d="M12 15c-.1 2-.6 4-1.4 5.6"/><path d="M14.5 13c0 2.6-.4 5-1.1 7"/></svg>';
  function waitEvent(name, op) { return new Promise(res => { const h = e => { const d = e.detail || {}; if (d.op !== op) return; window.removeEventListener(name, h); res(d); }; window.addEventListener(name, h); }); }

  // Every launch while a PIN exists: unlock with PIN or fingerprint (before any data is read).
  function unlockFlow() {
    return new Promise(res => {
      const page = authPage();
      const bioOn = AUTH.android() && AUTH.bio() === 'enabled';
      let tries = 0;
      const done = () => { window.removeEventListener('biometric', onBio); page.close(); res(); };
      const tryBio = () => { AUTH.external = Date.now(); try { Bridge.biometricUnlock(); } catch (e) { /* PIN still works */ } };
      const onBio = async e => {
        const d = e.detail || {}; if (d.op !== 'unlock') return;
        if (d.ok) { const p = Bridge.biometricTakePin && Bridge.biometricTakePin(); if (p && await S.unlock(p)) done(); else pad.error('Use your PIN this time.'); }
        else if (d.error && d.error !== 'cancelled') pad.error(d.error);
      };
      window.addEventListener('biometric', onBio);
      const pad = pinEntry(page, {
        title: 'Welcome back', sub: bioOn ? 'Use your fingerprint or enter your PIN' : 'Enter your PIN to open WealthTrack', cta: 'Unlock', minLen: 4, bio: bioOn, onBio: tryBio,
        links: '<button type="button" class="link" data-auth="forgot">Forgot PIN?</button>',
        onSubmit: async p => {
          if (await S.unlock(p)) { done(); return true; }
          tries++;
          if (tries >= 5) { const wait = Math.min(300, 30 * Math.pow(2, tries - 5)); await new Promise(r => setTimeout(r, wait * 1000)); return `Wrong PIN. ${tries} tries; waited ${wait} seconds.`; }
          return 'Wrong PIN. Try again.';
        },
      });
      page.on('forgot', () => forgotPin(page));
      if (bioOn) setTimeout(tryBio, 400);
    });
  }
  function forgotPin(page) {
    const android = AUTH.android();
    page.set(`<h1>Forgot your PIN?</h1><p class="auth-sub">Your data on this ${android ? 'phone' : 'browser'} is encrypted with your PIN, so it can't be opened without it.</p>
      ${android ? `<div class="auth-option"><b>Restore from Google Drive</b><span>Erase this phone's copy, sign in with Google and bring back your latest Drive backup. Then pick a new PIN.</span><button type="button" class="btn primary" data-auth="reset-restore">Erase &amp; restore from Drive</button></div>` : ''}
      <div class="auth-option"><b>Start over</b><span>${android ? 'Erase everything on this phone and set WealthTrack up again.' : 'Erase everything in this browser. You can restore from a backup file afterwards.'}</span><button type="button" class="btn danger" data-auth="reset-fresh">Erase &amp; start over</button></div>
      <div class="auth-links"><button type="button" class="link" data-auth="back">I remember it</button></div>`);
    const go = async restore => {
      if (!confirm('Erase all WealthTrack data on this device? This can\'t be undone.')) return;
      try { if (restore) localStorage.setItem('wt.restoreAfterReset', '1'); else localStorage.removeItem('wt.restoreAfterReset'); } catch (e) { /* ignore */ }
      if (Bridge && Bridge.biometricDisable) { try { Bridge.biometricDisable(); } catch (e) { /* ignore */ } }
      await S.eraseAll(); location.reload();
    };
    page.on('reset-restore', () => go(true));
    page.on('reset-fresh', () => go(false));
    page.on('back', () => location.reload());
  }

  // First run (and after Sign out): Google sign-in on Android, then create a PIN, then fingerprint.
  async function onboarding() {
    if (S.key || AUTH.skip() || W.settings().guest || await S.lockInfo()) return;
    const page = authPage({ overlay: true });
    if (!S.cryptoAvailable) {
      page.set(`<h1>Almost there</h1><p class="auth-sub">This browser can't encrypt your data, so a PIN isn't available here. Use the Android app, or open WealthTrack in Chrome, Edge or Safari.</p><button type="button" class="btn primary auth-cta" data-auth="go">Continue</button>`);
      await new Promise(r => page.on('go', r)); page.close(); return;
    }
    if (AUTH.android()) {
      // PIN is the default; Google (for Drive backup) and guest are options under the keypad
      const signedIn = () => !!(W.settings().account && W.settings().account.email);
      for (;;) {
        const links = signedIn()
          ? `<span class="auth-ok">${ic('check')}Signed in. Backing up to Google Drive.</span>`
          : `<button type="button" class="link" data-auth="to-google">${GOOGLE_G}${AUTH.resetMode() ? 'Sign in with Google to back up or restore' : 'Sign in with Google to back up'}</button><button type="button" class="link quiet" data-auth="to-guest">Continue as guest</button>`;
        const pick = new Promise(r => { page.on('to-google', () => r('google')); page.on('to-guest', () => r('guest')); });
        const r = await Promise.race([stepCreatePin(page, links).then(pin => ({ pin })), pick]);
        if (r.pin) break;
        if (r === 'google') { await stepGoogle(page, 'Back to PIN'); continue; }
        if (r === 'guest' && await guestConfirm(page)) {
          W.saveSettings({ guest: true }); page.close();
          toast('You\'re using WealthTrack as a guest. Your data is not backed up.');
          refresh(); return;
        }
      }
    } else {
      await stepCreatePin(page, `<label class="link">Restore from a backup file<input type="file" accept="application/json,.json" data-act-change="restoreFile" hidden></label>`);
    }
    page.close();
    toast('You\'re all set. WealthTrack will ask for your PIN when you open it.' + (AUTH.bio() === 'available' ? ' You can turn on fingerprint unlock in Settings.' : ''));
    refresh();
  }
  // Google sign-in page; resolves true when signed in, false on the skip/back link
  function stepGoogle(page, skipLabel) {
    return new Promise(res => {
      page.set(`<h1>Sign in with Google</h1><p class="auth-sub">Your data is backed up to your own Google Drive, so a new phone or a forgotten PIN never costs you your records.</p>
        <button type="button" class="btn google auth-cta" data-auth="google">${GOOGLE_G}Sign in with Google</button>
        <p class="auth-err" role="alert"></p>
        <ul class="auth-points"><li>${ic('check')}Automatic backup to your Google Drive</li><li>${ic('check')}WealthTrack only sees the backup file it creates</li><li>${ic('check')}No bank logins, no ads</li></ul>
        ${skipLabel ? `<div class="auth-links"><button type="button" class="link" data-auth="skip">${esc(skipLabel)}</button></div>` : ''}`);
      const err = page.body.querySelector('.auth-err'), btn = page.body.querySelector('[data-auth=google]');
      const done = v => { window.removeEventListener('googledrive', onSignIn); res(v); };
      const onSignIn = e => {
        const d = e.detail || {}; if (d.op !== 'signin') return;
        btn.disabled = false; btn.innerHTML = GOOGLE_G + 'Sign in with Google';
        if (d.ok) done(true); else if (d.error !== 'cancelled') err.textContent = d.error;
      };
      window.addEventListener('googledrive', onSignIn);
      page.on('google', () => { err.textContent = ''; btn.disabled = true; btn.innerHTML = GOOGLE_G + 'Opening Google…'; AUTH.external = Date.now(); Bridge.googleSignIn(); });
      page.on('skip', () => done(false));
    });
  }
  function guestConfirm(page) {
    return new Promise(res => {
      const foot = page.el.querySelector('.auth-foot'); foot.hidden = true;
      page.set(`<div class="auth-icon warn">${ic('alert')}</div><h1>Continue as a guest?</h1><p class="auth-sub">You can use everything in WealthTrack without a PIN, but:</p>
        <ul class="auth-points warn"><li>${ic('alert')}<span><b>Your data is not backed up.</b> If this phone is lost, reset, or WealthTrack is uninstalled, your records are gone for good.</span></li><li>${ic('alert')}<span><b>No PIN or fingerprint lock.</b> Anyone with your phone can open the app and see your finances.</span></li><li>${ic('check')}<span>You can add a PIN or sign in with Google any time in Settings.</span></li></ul>
        <button type="button" class="btn primary auth-cta" data-auth="guest-ok">I understand, continue as guest</button>
        <div class="auth-links"><button type="button" class="link" data-auth="guest-back">Back to PIN</button></div>`);
      page.on('guest-back', () => { foot.hidden = false; res(false); });
      page.on('guest-ok', () => { foot.hidden = false; res(true); });
    });
  }
  function stepCreatePin(page, extraLinks) {
    return new Promise(res => {
      const first = msg => {
        const pad = pinEntry(page, { title: 'Create a PIN', sub: '6 or more digits. You\'ll use it to open WealthTrack.', cta: 'Continue', minLen: 6, links: extraLinks, onSubmit: async p => { confirmPin(p); return true; } });
        if (msg) pad.error(msg);
      };
      const confirmPin = p1 => pinEntry(page, {
        title: 'Confirm your PIN', sub: 'Enter the same PIN again.', cta: 'Set PIN', busy: 'Securing your data…', minLen: 6,
        links: '<button type="button" class="link" data-auth="restart">Start again</button>',
        onSubmit: async p2 => {
          if (p2 !== p1) { setTimeout(() => first('Those PINs didn\'t match. Try again.'), 0); return true; }
          await S.changeLock(p1, DEMO.on ? DEMO.real : W.D);
          res(p1); return true;
        },
      });
      page.on('restart', () => first());
      first();
    });
  }
  function stepFingerprint(page, pin) {
    return new Promise(res => {
      page.set(`<div class="auth-icon">${FINGERPRINT}</div><h1>Unlock with your fingerprint?</h1><p class="auth-sub">Open WealthTrack with a touch instead of typing your PIN. Your PIN still works too.</p>
        <button type="button" class="btn primary auth-cta" data-auth="bio">Turn on fingerprint</button><p class="auth-err" role="alert"></p>
        <div class="auth-links"><button type="button" class="link" data-auth="later">Not now</button></div>`);
      const err = page.body.querySelector('.auth-err');
      page.on('bio', async () => {
        AUTH.external = Date.now(); Bridge.biometricEnable(pin);
        const d = await waitEvent('biometric', 'enable');
        if (d.ok) res(true); else if (d.error !== 'cancelled') err.textContent = d.error;
      });
      page.on('later', () => res(false));
    });
  }
  // Settings actions that reuse the pages
  async function requirePinThen(title, fn) {
    const page = authPage({ overlay: true });
    pinEntry(page, { title, sub: 'Enter your current PIN.', cta: 'Continue', minLen: 4, links: '<button type="button" class="link" data-auth="cancel">Cancel</button>',
      onSubmit: async p => { if (!(await S.unlock(p))) return 'Wrong PIN. Try again.'; await fn(page, p); return true; } });
    page.on('cancel', () => page.close());
  }

  // ------------------------------------------------------------ address suggestions (OpenStreetMap, Android app)
  // Typing in Personal info > Street address asks OpenStreetMap (through the app, see AddressLookup.java) for
  // matching addresses; picking one fills street, city, state and ZIP. Offline, you just type.
  const US_STATES = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR' };
  function addressAutocomplete() {
    const on = () => { try { return !!(Bridge && Bridge.addressSupported && Bridge.addressSupported()); } catch (e) { return false; } };
    let seq = 0, want = '', timer = 0, items = [], active = -1, lastQ = '';
    const input = () => document.querySelector('[data-pi] input[name=street]');
    const box = () => document.getElementById('addrSug');
    const close = () => { const b = box(); if (b) b.remove(); items = []; active = -1; const i = input(); if (i) i.setAttribute('aria-expanded', 'false'); };
    const draw = (msg) => {
      const i = input(); if (!i) return;
      let b = box();
      if (!b) { b = document.createElement('div'); b.id = 'addrSug'; b.className = 'addr-sug'; b.setAttribute('role', 'listbox'); i.closest('label').appendChild(b); }
      b.innerHTML = msg ? `<div class="addr-msg">${esc(msg)}</div>` : items.map((x, n) => `<button type="button" role="option" class="addr-it${n === active ? ' on' : ''}" data-n="${n}" aria-selected="${n === active}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg><span><b>${esc(x.main)}</b><small>${esc(x.secondary)}</small></span></button>`).join('') + '<div class="addr-attr">© OpenStreetMap contributors</div>';
      i.setAttribute('aria-expanded', 'true');
    };
    const pick = n => {
      const x = items[n]; if (!x) return;
      close();
      const f = document.querySelector('[data-pi]'); if (!f) return;
      const us = String(x.countrycode || '').toUpperCase() === 'US';
      const state = us ? (US_STATES[String(x.state || '').toLowerCase()] || x.state) : x.state;
      const set = (name, v) => { const el = f.querySelector(`[name="${name}"]`); if (el && typeof v === 'string') el.value = v.slice(0, +el.maxLength > 0 ? +el.maxLength : 100); };
      set('street', x.street); set('city', x.city || ''); set('state', state || ''); set('zip', x.zip || '');
      lastQ = x.street;
      toast(x.zip ? 'Address filled in. Tap Save to keep it.' : 'Address filled in. Add the ZIP code, then tap Save.');
    };
    document.addEventListener('input', e => {
      if (e.target !== input() || !on()) return;
      clearTimeout(timer);
      const q = e.target.value.trim();
      if (q.length < 4) { close(); return; }
      timer = setTimeout(() => {
        if (q === lastQ) return; lastQ = q;
        want = String(++seq);
        try { Bridge.addressSearch(q, want); } catch (err) { /* typing still works */ }
      }, 400);
    });
    document.addEventListener('keydown', e => {
      if (e.target !== input() || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; draw(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(active); }
      else if (e.key === 'Escape') close();
    });
    document.addEventListener('mousedown', e => { const b = e.target.closest('.addr-it'); if (b) { e.preventDefault(); pick(+b.dataset.n); } else if (!e.target.closest('#addrSug') && e.target !== input()) close(); });
    document.addEventListener('focusout', e => { if (e.target === input()) setTimeout(() => { if (document.activeElement !== input()) close(); }, 150); });
    window.addEventListener('address', e => {
      const d = e.detail || {}; if (d.op !== 'search' || String(d.seq) !== want) return;
      if (!d.ok) { draw(d.error || 'Address suggestions aren\'t available right now'); return; }
      let data = null; try { data = JSON.parse(Bridge.addressTake(want) || 'null'); } catch (err) { data = null; }
      items = Array.isArray(data) ? data.filter(x => x && typeof x.street === 'string' && x.street).slice(0, 5) : []; active = -1;
      if (items.length) draw(); else close();
    });
  }

  // ------------------------------------------------------------ boot
  async function boot() {
    try {
      await S.open(W.COLLS);
      try { applyThemeValue(localStorage.getItem('wt.theme') || 'system'); } catch (e) { /* storage blocked */ }
      if (await S.lockInfo()) await unlockFlow();
      const empty = await S.isEmpty();
      const data = empty ? null : await S.loadAll();
      W.init(data, S);
      // colors end up in style="" attributes: only ever emit #rrggbb
      const rawCatColor = W.catColor; W.catColor = id => { const c = rawCatColor(id); return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#8a94a6'; };
      S.onError = err => { if ($('#toasts')) toast('Could not save: ' + (err && err.message || err), { error: true }); else console.error(err); };
      if (empty) {
        // new installs start blank; the tests inject made-up sample data via window.WTSampleSeed (never shipped)
        if (window.WTSampleSeed && typeof window.WTSampleSeed.seed === 'function') window.WTSampleSeed.seed(W); else WTSeed.seed(W, { blank: true });
        await S.flush();
        // fresh install on a phone: check Google Drive for a backup before anything is backed up over it
        if (AUTH.android()) { try { localStorage.setItem('wt.restoreAfterReset', '1'); } catch (e) { /* ignore */ } }
      }
      // New user with nothing entered yet: show the demo (memory only). Real records are never touched.
      const realBlank = () => !Object.keys(W.D.templates).length && !Object.keys(W.D.incomes).length && !Object.keys(W.D.debts).length && !Object.keys(W.D.expenses).length && !Object.keys(W.D.payments).length;
      let demoDone = !!W.settings().demoDone; try { demoDone = demoDone || localStorage.getItem('wt.demoDone') === '1'; } catch (e) { /* storage blocked */ }
      if (!demoDone && !S.key && window.WTDemo && realBlank()) {
        DEMO.real = W.D; DEMO.on = true;
        W.init(null, { put() { }, del() { } }); // in-memory only: nothing the demo does is saved or backed up
        WTSeed.seed(W, { blank: true }); WTDemo.load(W);
        // device/account choices made while the demo is showing (sign-in, guest, PIN-free choice, name, theme...)
        // are real: save them to the real settings too. Budget and plan settings stay demo-only.
        const DEVICE_KEYS = ['guest', 'account', 'gdrive', 'profile', 'theme', 'monthColors', 'monthColorSeed', 'currency', 'dateFormat', 'reminders', 'dueSoonDays', 'achievementsNotify', 'tips', 'billView', 'upRange'];
        const demoSave = W.saveSettings;
        W.saveSettings = patch => {
          demoSave(patch);
          if (!DEMO.on || !DEMO.real) return;
          const keep = {}; DEVICE_KEYS.forEach(k => { if (patch && k in patch) keep[k] = patch[k]; });
          if (Object.keys(keep).length) { Object.assign(DEMO.real.meta.settings, keep); S.put('meta', DEMO.real.meta.settings); }
        };
        DEMO.restoreSave = () => { W.saveSettings = demoSave; };
      }
      S.onSaved = () => { const el = $('#saveState'); if (el) el.textContent = 'All changes saved · ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); GD.dirty = true; GD.schedule(); };
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && GD.dirty) GD.backup(false); });
      if (GD.on() && GD.supported() && Date.now() - (GD.state().last || 0) > 24 * 3600 * 1000) GD.schedule(5000);
      // another tab saved changes: reload from the database so this tab never writes stale records over them
      S.onRemoteChange = async () => { try { for (let k = 0; k < 3; k++) { if (S.hasUnsaved()) await S.flush(); const d = await S.loadAll(); if (S.hasUnsaved()) continue; W.init(d, S); refresh(); return; } } catch (e) { console.error(e); } };
      W.runMaintenance();
      { const st = W.settings(); if (!(st.account && st.account.email) && st.gdrive && st.gdrive.on && st.gdrive.email) W.saveSettings({ account: { email: st.gdrive.email } }); } // signed in on 1.2.1
      if (W.settings().monthColors === 'random' && !['seasonal', 'random'].includes(W.settings().theme)) W.saveSettings({ theme: 'random', monthColors: null });
      applyTheme(); shell(); bindGlobal(); billDrag(); render(); scheduleReminders(); addressAutocomplete();
      onboarding().catch(err => { console.error(err); toast(err.message || String(err), { error: true }); });
      // lock again after 2 minutes away (reload drops the decrypted data from memory)
      let hiddenAt = 0;
      document.addEventListener('click', e => { if (e.target.closest('input[type=file], label')) { const l = e.target.closest('label'); if (!l || l.querySelector('input[type=file]')) AUTH.external = Date.now(); } }, true);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
        if (S.key && hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && Date.now() - AUTH.external > 10 * 60 * 1000) S.flush().then(() => location.reload());
      });
      let lastGreet = greeting();
      setInterval(() => { const g = greeting(); if (g !== lastGreet) { lastGreet = g; if (ui.route === 'dashboard' && document.visibilityState === 'visible') refresh(); } }, 60000);
      let lastDay = today();
      setInterval(() => { if (today() !== lastDay && document.visibilityState === 'visible') { lastDay = today(); W.runMaintenance(); refresh(); } }, 60000);
      window.__wtReady = true;
    } catch (e) {
      console.error(e);
      bootFailed(e);
    }
  }
  // Recovery screen: the data stays untouched; you can download it raw or (after that) start over.
  function bootFailed(e) {
    document.body.innerHTML = `<div style="padding:30px;font-family:system-ui;max-width:560px;margin:auto;line-height:1.5"><h2>WealthTrack couldn't start</h2><p>${esc(e && e.message || e)}</p>
      <p>Private/incognito windows can block storage; if that's the case, open it in a normal window. Your saved data has not been changed.</p>
      <p><button id="rcDump" style="padding:10px 14px;border-radius:10px;border:1px solid #ccc;font-weight:600">Download my raw data</button></p>
      <p><button id="rcReload" style="padding:10px 14px;border-radius:10px;border:1px solid #ccc">Try again</button></p>
      <details style="margin-top:20px"><summary>Start over</summary><p>Erases all WealthTrack data on this device. Download your raw data first; it can be sent for recovery.</p><button id="rcErase" style="padding:10px 14px;border-radius:10px;border:1px solid #dc2626;color:#dc2626">Erase everything</button></details></div>`;
    const dump = document.getElementById('rcDump'), erase = document.getElementById('rcErase');
    let dumped = false;
    dump.onclick = async () => { try { const raw = await S.rawDump(); saveFile('WealthTrack-raw-' + today() + '.json', 'application/json', JSON.stringify({ app: 'WealthTrack', raw: true, exportedAt: new Date().toISOString(), stores: raw })); dumped = true; } catch (err) { alert('Could not read the data: ' + (err.message || err)); } };
    document.getElementById('rcReload').onclick = () => location.reload();
    erase.onclick = async () => {
      if (!dumped && !confirm('You have not downloaded your data. Erase anyway?')) return;
      if (prompt('Type ERASE to delete all WealthTrack data on this device') !== 'ERASE') return;
      try { await S.eraseAll(); location.reload(); } catch (err) { alert('Could not erase: ' + (err.message || err)); }
    };
  }
  window.WTApp = { refresh, ui };
  // helper bag for extension modules (read-only use; never mutate)
  window.WTUI = { fmt, fmt0, esc, ic, sectionH, toast, refresh, modal, confirmBox, askText, field, opt, needMoney, ui, W, S, Bridge, go, today, curMonth };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
