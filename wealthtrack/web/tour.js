/* WealthTrack quick tour: a short guided walk through every part of the app for new users.
 *
 * A card at the bottom of the screen moves page by page (it opens each page for you), with a spotlight on
 * where to find the feature. About a minute; Back / Next / Skip tour, arrow keys and Esc work too.
 * It starts once per account, the first time the app is ready (over the demo data, so every page has
 * something to show), or after the setup wizard closes. Settings → Your data → App tour replays it.
 * It never changes any data.
 */
(function () {
  'use strict';
  const U = () => window.WTUI || {};
  const ACC = () => window.WTAccounts;
  const isPro = () => (typeof window.WT_isPro === 'function' ? !!window.WT_isPro() : true);
  const lsKey = () => (ACC() ? ACC().key('wt.tourDone') : 'wt.tourDone');
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
  };
  // test hooks, like the setup wizard's: wt.skipOnboarding turns the tour off unless wt.tour=1; wt.tour=0 turns it off
  const testSkip = () => { const f = ls.get('wt.tour'); return f === '0' || (ls.get('wt.skipOnboarding') === '1' && f !== '1'); };
  const isDone = () => ls.get(lsKey()) === '1';
  const markDone = () => ls.set(lsKey(), '1');

  // [route or null, where to point (first visible wins), title, text, pro feature?]
  const STEPS = [
    [null, [], 'Welcome to WealthTrack', 'Here\'s a one-minute tour of everything the app does. You can skip it now and replay it any time from Settings.'],
    ['dashboard', ['[data-hub=home]', '[data-nav=dashboard]'], 'Home', 'Your money at a glance: what\'s left after bills, income, bills paid and unpaid, what\'s coming up and a 60-day cash forecast. Choose and reorder its sections in Settings.'],
    ['dashboard', ['.fab'], 'The + button', 'Add an expense, a bill or extra income from any page. It\'s the quickest way to keep things up to date.'],
    ['bills', ['[data-hub=bills]', '[data-nav=bills]'], 'Bills', 'Add bills once and they repeat: weekly, monthly, yearly or your own schedule. Tap Mark paid when you pay, make partial payments, skip or move a month, and sort or group the list. The tabs at the top switch between the overview, calendar, all bills and subscriptions.'],
    ['calendar', ['.hub-tabs [data-nav-go=calendar]', '[data-nav=calendar]'], 'Calendar', 'Bills, paydays and payments by day. Tap a day to pay or add a bill, or drag a bill to another day to move it for that month.'],
    ['smart', ['[data-hub=plan]', '[data-nav=smart]'], 'Plan: Smart Budget', 'A plan for needs, debt, savings and fun money built from your own numbers, with strategies to compare and a split you can customize.', 'smart'],
    ['paychecks', ['.hub-tabs [data-nav-go=paychecks]', '[data-nav=paychecks]'], 'Plan: Paychecks', 'Each bill is assigned to the paycheck before it\'s due, so you see what every check has to cover and what\'s left. Add set-asides like gas and groceries; it warns you when a check will come up short.'],
    ['expenses', ['[data-hub=spend]', '[data-nav=expenses]'], 'Spending', 'Everyday spending by category, with receipt photos, search and filters.'],
    ['reports', ['.hub-tabs [data-nav-go=reports]', '[data-nav=reports]'], 'Reports and History', 'Month-to-month comparisons, 12-month trends and a yearly table. History lists every payment and purchase, and you can export to Excel.', 'reports'],
    ['progress', ['[data-hub=wealth]', '[data-nav=progress]'], 'Wealth: Net worth', 'Your net worth over time and milestones you earn from what you record, like your first debt paid off or a $1,000 emergency fund.'],
    ['debts', ['.hub-tabs [data-nav-go=debts]', '[data-nav=debts]'], 'Wealth: Debt', 'Credit cards and loans with APR, minimum payment and utilization. Interest is added each month, and paying a linked bill lowers the balance. The payoff planner compares snowball and avalanche.', 'payoff'],
    ['goals', ['.hub-tabs [data-nav-go=goals]', '[data-nav=goals]'], 'Wealth: Savings goals', 'Set a target and watch your progress and projected finish date. Moving money to a goal isn\'t counted as spending.'],
    ['settings', ['.quick-set', '[data-nav=settings]'], 'Settings', 'The gear at the top right of every page opens Settings: bill reminders, PIN and fingerprint lock, color themes, backups to a file or Google Drive, and accounts. On Android you can also add WealthTrack widgets to your home screen.', 'themes'],
    [null, [], 'You\'re all set', 'Start by adding a paycheck and a few bills, or run Setup in Settings → Your data. Replay this tour any time from Settings → Your data → App tour.'],
  ];

  const CSS = `
.tour-block { position: fixed; inset: 0; z-index: 80; background: transparent; }
.tour-spot { position: fixed; z-index: 81; border-radius: 12px; box-shadow: 0 0 0 3px var(--brand), 0 0 0 9999px rgba(10, 14, 12, .55); pointer-events: none; transition: top .2s ease, left .2s ease, width .2s ease, height .2s ease; }
.tour-spot.none { box-shadow: 0 0 0 9999px rgba(10, 14, 12, .55); width: 0 !important; height: 0 !important; top: 50% !important; left: 50% !important; }
.tour-card { position: fixed; z-index: 82; left: 50%; transform: translateX(-50%); bottom: 24px; width: min(440px, calc(100vw - 24px)); background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.28); padding: 16px 16px 12px; animation: fade .16s ease; }
.tour-card.top { bottom: auto; top: calc(16px + env(safe-area-inset-top)); }
.tour-card h2 { margin: 0 0 6px; font-size: 18px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tour-card p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink-2); }
.tour-card .tour-pro { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 99px; background: var(--brand-soft); color: var(--brand-ink); }
.tour-dots { display: flex; gap: 5px; margin: 12px 0 10px; flex-wrap: wrap; }
.tour-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--line-2); }
.tour-dots i.on { background: var(--brand); width: 18px; border-radius: 4px; }
.tour-btns { display: flex; gap: 8px; align-items: center; }
.tour-btns .grow { flex: 1; }
.tour-btns .btn { min-height: 44px; min-width: 44px; }
@media (max-width: 900px) { .tour-card { bottom: calc(var(--nav-h, 64px) + 12px + env(safe-area-inset-bottom)); } }
`;
  let open = null;

  function css() { if (document.getElementById('tour-css')) return; const st = document.createElement('style'); st.id = 'tour-css'; st.textContent = CSS; document.head.appendChild(st); }
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const pick = sels => { for (const s of sels) { const el = document.querySelector(s); if (visible(el)) return el; } return null; };

  function start(o) {
    o = o || {};
    if (open) return false;
    css();
    const esc = U().esc || (s => String(s));
    const block = document.createElement('div'); block.className = 'tour-block'; block.setAttribute('aria-hidden', 'true');
    const spot = document.createElement('div'); spot.className = 'tour-spot none';
    const card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'tourTitle');
    document.body.append(block, spot, card);
    const startRoute = (location.hash || '#/dashboard');
    let i = 0;
    const place = () => {
      const st = STEPS[i]; const el = pick(st[1] || []);
      if (!el) { spot.className = 'tour-spot none'; card.classList.remove('top'); return; }
      const r = el.getBoundingClientRect(); const pad = 6;
      spot.className = 'tour-spot';
      Object.assign(spot.style, { top: (r.top - pad) + 'px', left: (r.left - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
      // keep the card clear of what it points at: move it to the top when the target is in the lower half
      const cardBottomZone = window.innerHeight - card.offsetHeight - 120;
      card.classList.toggle('top', r.top > cardBottomZone);
    };
    const draw = () => {
      const st = STEPS[i]; const last = i === STEPS.length - 1;
      const pro = st[4] && !isPro();
      card.innerHTML = `<h2 id="tourTitle">${esc(st[2])}${pro ? '<span class="tour-pro">Pro</span>' : ''}</h2>
        <p>${esc(st[3])}${pro ? ' <b>Part of WealthTrack Pro.</b>' : ''}</p>
        <div class="tour-dots" aria-label="Step ${i + 1} of ${STEPS.length}">${STEPS.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="tour-btns">${!last ? '<button type="button" class="btn ghost" data-tour="skip">Skip tour</button>' : ''}<span class="grow"></span>
          ${i > 0 ? '<button type="button" class="btn" data-tour="back" aria-label="Back">Back</button>' : ''}
          <button type="button" class="btn primary" data-tour="next">${i === 0 ? 'Start' : last ? 'Done' : 'Next'}</button></div>`;
      const nav = st[0];
      const after = () => { place(); const b = card.querySelector('[data-tour=next]'); if (b && !o.noFocus) b.focus({ preventScroll: true }); };
      if (nav && !location.hash.startsWith('#/' + nav)) { (U().go || (r => { location.hash = '#/' + r; }))(nav); window.scrollTo(0, 0); setTimeout(after, 260); }
      else { window.scrollTo(0, 0); setTimeout(after, 30); }
    };
    const close = finished => {
      markDone();
      block.remove(); spot.remove(); card.remove();
      document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', place);
      open = null;
      if (o.returnTo !== false) { try { if (location.hash !== startRoute) location.hash = startRoute; } catch (e) { /* ignore */ } }
      if (!finished && U().toast) U().toast('Tour skipped. Replay it from Settings → Your data → App tour.');
    };
    const next = () => { if (i < STEPS.length - 1) { i++; draw(); } else close(true); };
    const back = () => { if (i > 0) { i--; draw(); } };
    card.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; e.preventDefault(); const k = b.dataset.tour; if (k === 'next') next(); else if (k === 'back') back(); else if (k === 'skip') close(false); });
    const onKey = e => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(i === STEPS.length - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', place);
    open = { close, step: () => i };
    draw();
    return true;
  }

  /** Starts the tour once per account, when nothing else (PIN page, setup wizard, a dialog) is on screen. */
  function maybeStart() {
    try {
      if (open || isDone() || testSkip()) return false;
      if (document.querySelector('.overlay, .auth, .wz-overlay')) return false;
      if (window.WTSetupUI && window.WTSetupUI.isOpen && window.WTSetupUI.isOpen()) return false;
      if (!window.__wtReady && !document.querySelector('#main')) return false;
      return start();
    } catch (e) { console.error(e); return false; }
  }

  window.WTTour = { start, maybeStart, isOpen: () => !!open, isDone, STEPS };
})();
