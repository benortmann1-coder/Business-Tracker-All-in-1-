/* First-run setup wizard (WTSetup + WTSetupUI).
 * A new install starts blank (built-in categories and an empty Checking account). This walks a new user
 * through their checking balance, paychecks, bills and debts, step by step. Every step can be skipped.
 *
 * WTSetup is plain logic over the existing WT data model (core.js): it only calls WT.addIncome,
 * WT.addTemplate, WT.addDebt and WT.save('accounts'), the same calls the app's own forms make.
 * It also runs under Node, for tests/setup-wizard.test.js.
 * WTSetupUI (browser only) draws the steps with the app's own modal (window.WTUI).
 *
 * When it shows: only while the data is effectively empty (no bills, paychecks, debts, purchases or
 * payments), never in the demo, and never again once finished or closed (settings.setupWizard).
 * Settings → Your data → Setup wizard runs it again on purpose.
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ logic (no DOM)
  class SetupError extends Error { }
  const PRESETS = [
    { key: 'rent', name: 'Rent', category: 'cat_housing' },
    { key: 'mortgage', name: 'Mortgage', category: 'cat_mortgage', fallback: 'cat_housing' },
    { key: 'electric', name: 'Electric', category: 'cat_utilities' },
    { key: 'phone', name: 'Phone', category: 'cat_phone' },
    { key: 'internet', name: 'Internet', category: 'cat_phone' },
    { key: 'car', name: 'Car payment', category: 'cat_vehicle' },
    { key: 'insurance', name: 'Insurance', category: 'cat_insurance' },
    { key: 'streaming', name: 'Streaming', category: 'cat_subscriptions', subscription: true },
  ];
  const BILL_FREQS = { monthly: 'Monthly', biweekly: 'Every 2 weeks', weekly: 'Weekly', quarterly: 'Every 3 months', yearly: 'Yearly' };
  const PAY_FREQS = { weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly' };
  const DEBT_TYPES = { credit_card: 'Credit card', auto: 'Auto loan', personal: 'Personal loan', student: 'Student loan', mortgage: 'Mortgage', medical: 'Medical', other: 'Other loan' };
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const live = (WT, c) => WT.list(c).filter(r => r && !r.deleted);
  // "Effectively empty": nothing the user entered. Built-in categories and the empty Checking account don't count.
  function isBlank(WT) {
    if (!WT || !WT.D) return false;
    return !live(WT, 'templates').length && !live(WT, 'incomes').length && !live(WT, 'debts').length &&
      !WT.list('expenses').length && !WT.list('payments').length && !WT.list('deposits').length;
  }
  function shouldOffer(WT) {
    const s = WT.settings() || {};
    if (s.demo === true) return false; // never over the demo's example data
    if (s.setupWizard === 'done' || s.setupWizard === 'dismissed') return false;
    return isBlank(WT);
  }
  function markDone(WT, how) { WT.saveSettings({ setupWizard: how === 'done' ? 'done' : 'dismissed' }); }

  function money(WT, v, label, o) {
    o = o || {};
    const s = String(v == null ? '' : v).trim();
    if (!s) { if (o.optional) return null; throw new SetupError('Enter ' + label); }
    const c = WT.parseMoney(s);
    if (c == null) throw new SetupError('Enter ' + label + ' as a number, like 1250.00');
    if (c < 0 && !o.negative) throw new SetupError('Enter ' + label + ' as a positive number');
    if (c === 0 && !o.zero) throw new SetupError('Enter ' + label + ' above 0');
    return c;
  }
  function dayNum(v, label) {
    const n = Number(String(v == null ? '' : v).trim());
    if (!Number.isInteger(n) || n < 1 || n > 31) throw new SetupError('Enter ' + label + ' from 1 to 31');
    return n;
  }
  function dateVal(WT, v, label) {
    const s = String(v == null ? '' : v).trim();
    if (!DATE_RE.test(s)) throw new SetupError('Pick ' + label);
    const p = WT.parts(s);
    if (p.m < 1 || p.m > 12 || p.d < 1 || p.d > WT.dim(p.y, p.m)) throw new SetupError('Pick ' + label);
    return s;
  }
  const catOr = (WT, id, fallback) => (WT.D.categories[id] && !WT.D.categories[id].archived ? id : (fallback && WT.D.categories[fallback] ? fallback : 'cat_other'));

  // Next date on or after today that falls on day `day` of a month. A day the month doesn't have (the 30th in
  // February) moves to the next month that has it, so the schedule keeps the real day from then on.
  function nextDueOnDay(WT, today, day) {
    let mk = WT.monthOf(today);
    for (let k = 0; k < 14; k++, mk = WT.addMonthKey(mk, 1)) {
      if (WT.dim(+mk.slice(0, 4), +mk.slice(5, 7)) < day) continue;
      const d = mk + '-' + String(day).padStart(2, '0');
      if (d >= today) return d;
    }
    return WT.dateInMonthClamped(WT.addMonthKey(WT.monthOf(today), 1), day);
  }

  function setBalance(WT, input) {
    const s = String(input == null ? '' : input).trim(); if (!s) return null;
    const c = money(WT, s, 'your checking balance', { zero: true, negative: true });
    const id = WT.defaultAccountId(); const a = id && WT.D.accounts[id]; if (!a) return null;
    const today = WT.todayStr();
    // same as Settings → Set balance: what the bank shows right now, today's flows already included
    const todays = WT.accountFlows(id).filter(x => x.date === today).reduce((t, x) => t + x.amountCents, 0);
    a.openingCents = c - todays; a.openingDate = today; a.openingIsEndOfDay = true; delete a.needsBalance;
    WT.save('accounts', a);
    return a;
  }

  function addPaycheck(WT, f) {
    const net = money(WT, f.amount, 'your take-home pay');
    const schedule = Object.prototype.hasOwnProperty.call(PAY_FREQS, f.schedule) ? f.schedule : 'biweekly';
    const anchor = dateVal(WT, f.date, 'your next or most recent payday');
    const n = live(WT, 'incomes').length;
    const name = String(f.name || '').trim().slice(0, 80) || (n ? 'Paycheck ' + (n + 1) : 'Paycheck');
    const d = { name, employer: '', netCents: net, grossCents: null, kind: 'net', schedule, anchor, startDate: anchor, day1: 1, day2: 15, accountId: WT.defaultAccountId() };
    if (schedule === 'monthly') d.day1 = WT.parts(anchor).d;
    if (schedule === 'semimonthly') {
      d.day1 = dayNum(f.day1 == null || f.day1 === '' ? 1 : f.day1, 'the first payday');
      d.day2 = dayNum(f.day2 == null || f.day2 === '' ? 15 : f.day2, 'the second payday');
      if (d.day1 === d.day2) throw new SetupError('The two paydays must be different days');
      if (d.day1 > d.day2) { const t = d.day1; d.day1 = d.day2; d.day2 = t; }
    }
    return WT.addIncome(d);
  }

  function addBill(WT, f) {
    const name = String(f.name || '').trim().slice(0, 80);
    if (!name) throw new SetupError('Enter a bill name');
    const amountCents = money(WT, f.amount, 'the bill amount');
    const frequency = Object.prototype.hasOwnProperty.call(BILL_FREQS, f.frequency) ? f.frequency : 'monthly';
    const today = WT.todayStr();
    let anchor, eom = false;
    if (frequency === 'weekly' || frequency === 'biweekly') anchor = dateVal(WT, f.date || today, 'the next due date');
    else {
      const day = dayNum(f.day, 'the due day');
      if (day === 31) { eom = true; anchor = WT.monthEnd(WT.monthOf(today)); if (anchor < today) anchor = WT.monthEnd(WT.addMonthKey(WT.monthOf(today), 1)); }
      else anchor = nextDueOnDay(WT, today, day);
    }
    const preset = PRESETS.find(p => p.key === f.preset) || null;
    const category = catOr(WT, f.category || (preset && preset.category) || 'cat_other', preset && preset.fallback);
    const subscription = !!(f.subscription || (preset && preset.subscription));
    return WT.addTemplate({ name, amountCents, anchor, frequency, eom, category, subscription, autopay: false });
  }

  function addDebt(WT, f) {
    const name = String(f.name || '').trim().slice(0, 80);
    if (!name) throw new SetupError('Enter a name for the card or loan');
    const type = Object.prototype.hasOwnProperty.call(DEBT_TYPES, f.type) ? f.type : 'credit_card';
    const bal = money(WT, f.balance, 'the balance you owe', { zero: true });
    const aprS = String(f.apr == null ? '' : f.apr).trim().replace(/%$/, '');
    const apr = aprS ? WT.parsePct(aprS) : 0;
    if (apr == null || apr < 0 || apr > 10000) throw new SetupError('Enter the interest rate (APR) as a number, like 24.99');
    const minCents = money(WT, f.min, 'the minimum payment', { optional: true, zero: true }) || 0;
    const dueDay = dayNum(f.day == null || f.day === '' ? 1 : f.day, 'the payment due day');
    const today = WT.todayStr();
    const d = WT.addDebt({ name, type, startBalanceCents: bal, startDate: today, aprCenti: apr, minCents, dueDay, limitCents: null, autoInterest: true });
    let bill = null;
    // same as the app's Add debt form: a monthly bill for the minimum, linked so paying it lowers the balance
    if (f.mkBill !== false && f.mkBill !== '' && minCents > 0) {
      const mk = WT.dateInMonthClamped(WT.monthOf(today), dueDay);
      const category = type === 'credit_card' ? 'cat_credit_cards' : type === 'mortgage' ? catOr(WT, 'cat_mortgage', 'cat_housing') : 'cat_loans';
      bill = WT.addTemplate({ name, amountCents: minCents, anchor: mk >= today ? mk : WT.addMonthsClamp(mk, 1), frequency: 'monthly', category: catOr(WT, category), debtId: d.id });
    }
    return { debt: d, bill };
  }

  function summary(WT) {
    const today = WT.todayStr();
    const accId = WT.defaultAccountId();
    const pc = WT.nextPaycheck(today) || WT.currentPaycheck(today);
    const plan = pc ? WT.paycheckPlan(pc.key) : null;
    return {
      balanceCents: accId ? WT.accountBalance(accId) : 0,
      incomes: live(WT, 'incomes').filter(i => !i.endDate || i.endDate >= today),
      bills: live(WT, 'templates').filter(t => t.status !== 'cancelled'),
      debts: WT.debts().filter(d => !d.closed),
      plan,
    };
  }

  const WTSetup = { SetupError, PRESETS, BILL_FREQS, PAY_FREQS, DEBT_TYPES, isBlank, shouldOffer, markDone, nextDueOnDay, setBalance, addPaycheck, addBill, addDebt, summary };
  if (typeof module !== 'undefined' && module.exports) { module.exports = WTSetup; return; }
  root.WTSetup = WTSetup;
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ UI (browser)
  const U = () => window.WTUI || {};
  const W = () => (window.WTUI && window.WTUI.W) || window.WT;
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmt = c => (U().fmt ? U().fmt(c) : (c / 100).toFixed(2));
  const ic = n => (U().ic ? U().ic(n) : '');
  const opt = (v, l, sel) => `<option value="${esc(v)}"${String(v) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`;
  const fld = (label, inner, cls) => `<label class="field${cls ? ' ' + cls : ''}"><span>${label}</span>${inner}</label>`;
  const moneyIn = (name, val, extra) => `<input class="input money-in" name="${name}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${esc(val == null ? '' : val)}" ${extra || ''}>`;
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const testSkip = () => { try { return localStorage.getItem('wt.skipOnboarding') === '1' && localStorage.getItem('wt.setupWizard') !== '1'; } catch (e) { return false; } };

  const CSS = `
.wz-top { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
.wz-dots { display: flex; gap: 6px; }
.wz-dots i { width: 8px; height: 8px; border-radius: 999px; background: var(--line-2); }
.wz-dots i.on { background: var(--brand); width: 20px; }
.wz-dots i.done { background: var(--brand); opacity: .45; }
.wz-count { font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.wz-lead { margin: 0 0 16px; color: var(--ink-2); line-height: 1.5; }
.wz-points { list-style: none; padding: 0; margin: 0 0 4px; display: grid; gap: 10px; }
.wz-points li { display: flex; gap: 10px; align-items: flex-start; line-height: 1.45; }
.wz-points svg { width: 18px; height: 18px; flex: none; color: var(--brand); margin-top: 1px; }
.wz-list { display: grid; gap: 6px; margin: 0 0 14px; }
.wz-item { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--sunken); }
.wz-item b { font-weight: 650; } .wz-item .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.wz-item .wz-ok { width: 18px; height: 18px; color: var(--brand); flex: none; }
.wz-presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.wz-presets .chip { min-height: 40px; display: inline-flex; align-items: center; padding: 4px 13px; font-size: 14px; }
.wz-presets .chip.on { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
.wz-add { min-height: 44px; margin-top: 12px; }
.wz-err { color: var(--neg, #c0392b); font-size: 14px; margin: 10px 0 0; min-height: 0; }
.wz-err:empty { display: none; }
.wz-sum { display: grid; gap: 8px; margin: 0 0 16px; }
.wz-sum .wz-item { background: var(--surface); }
.wz-peek { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; background: var(--sunken); }
.wz-peek h3 { margin: 0 0 4px; font-size: 15px; }
.wz-peek .wz-row { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; }
.wz-peek .wz-row.tot { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 9px; font-weight: 700; }
.wz-modal .modal-f .wz-back { margin-right: auto; }
.wz-modal .modal-f .btn { min-height: 44px; }
.wz-modal .input { font-size: 16px; min-height: 44px; }
.wz-modal .check { min-height: 44px; }
.wz-hint { font-size: 13px; color: var(--ink-3); margin: 6px 0 0; line-height: 1.45; }
`;
  let cssDone = false;
  function css() { if (cssDone) return; cssDone = true; const st = document.createElement('style'); st.id = 'wz-css'; st.textContent = CSS; document.head.appendChild(st); }

  const STEPS = ['welcome', 'balance', 'pay', 'bills', 'debts', 'done'];
  const TITLES = { welcome: 'Welcome to WealthTrack', balance: 'Your checking balance', pay: 'Your paychecks', bills: 'Your bills', debts: 'Credit cards and loans', done: 'You\'re all set' };
  let open = null; // the running wizard, if any

  function maybeStart() {
    try {
      if (open || testSkip() || !shouldOffer(W())) return false;
      if (document.querySelector('.overlay, .auth-page')) return false; // another dialog or the PIN screen is up
      start({ auto: true }); return true;
    } catch (e) { console.error(e); return false; }
  }

  function start(o) {
    o = o || {};
    const w = W();
    if ((w.settings() || {}).demo === true) { U().toast && U().toast('You\'re looking at the demo. Tap "Use my own data" first, then run setup.'); return; }
    if (open) return;
    css();
    const st = { step: 0, bill: { preset: '', name: '', category: '' }, finished: false };
    const m = U().modal({
      title: esc(TITLES.welcome),
      body: '<div class="wz-body"></div><p class="wz-err" role="alert" aria-live="assertive"></p>',
      footer: `<button type="button" class="btn ghost wz-back" data-wz="back">Back</button><button type="button" class="btn" data-wz="skip">Skip</button><button class="btn primary" type="submit" data-wz="next">Next</button>`,
      onSubmit: (f, form) => { next(f); return false; },
    });
    const form = m.el; form.closest('.overlay').classList.add('wz-overlay'); form.classList.add('wz-modal');
    form.setAttribute('aria-label', 'Setup wizard');
    open = { m, st };
    // closing (× or tapping outside) keeps everything saved so far, and it doesn't come back on its own
    const obs = new MutationObserver(() => {
      if (document.body.contains(form)) return;
      obs.disconnect(); open = null;
      try { if (!st.finished && (W().settings() || {}).setupWizard !== 'done') markDone(W(), 'dismissed'); } catch (e) { console.error(e); }
      try { U().refresh && U().refresh(); } catch (e) { console.error(e); }
    });
    obs.observe(document.body, { childList: true });
    form.querySelector('[data-wz=back]').onclick = () => { err(''); if (st.step > 0) { st.step--; draw(); } };
    form.querySelector('[data-wz=skip]').onclick = () => {
      err('');
      if (STEPS[st.step] === 'welcome') { m.close(); U().toast && U().toast('No problem. Settings → Your data → Setup wizard runs it any time.'); return; }
      st.step = Math.min(STEPS.length - 1, st.step + 1); draw();
    };

    function err(msg) { const e = form.querySelector('.wz-err'); if (e) e.textContent = msg || ''; }
    function done() { U().refresh && U().refresh(); }
    function next(f) {
      err('');
      const s = STEPS[st.step];
      try {
        if (s === 'balance') { if (setBalance(W(), f.bal)) done(); }
        else if (s === 'pay') { if (filled(f.amount)) { addPaycheck(W(), f); done(); } else if (filled(f.name)) throw new SetupError('Enter your take-home pay, or tap Skip'); }
        else if (s === 'bills') { if (filled(f.amount)) { addBill(W(), billFields(f)); done(); st.bill = { preset: '', name: '', category: '' }; } else if (filled(f.name)) throw new SetupError('Enter the bill amount, or tap Skip'); }
        else if (s === 'debts') { if (filled(f.balance)) { addDebt(W(), Object.assign({}, f, { mkBill: !!f.mkBill })); done(); } else if (filled(f.name)) throw new SetupError('Enter the balance you owe, or tap Skip'); }
        else if (s === 'done') { st.finished = true; markDone(W(), 'done'); m.close(); try { U().go && U().go('dashboard'); } catch (e) { /* ignore */ } U().toast && U().toast('Setup done. Your plan is on the dashboard.'); return; }
      } catch (e) { if (!(e instanceof SetupError)) console.error(e); err(e.message || String(e)); return; }
      st.step = Math.min(STEPS.length - 1, st.step + 1); draw();
    }
    function billFields(f) { return { name: f.name, amount: f.amount, frequency: f.frequency, day: f.day, date: f.date, preset: st.bill.preset && st.bill.name === String(f.name || '').trim() ? st.bill.preset : '', category: st.bill.preset && st.bill.name === String(f.name || '').trim() ? st.bill.category : '' }; }
    // "Add another" buttons: save what's in the form, stay on the step with an empty form
    function addAnother(kind) {
      err('');
      const f = Object.fromEntries(new FormData(form));
      try {
        if (kind === 'pay') addPaycheck(W(), f);
        else if (kind === 'bill') { addBill(W(), billFields(f)); st.bill = { preset: '', name: '', category: '' }; }
        else if (kind === 'debt') addDebt(W(), Object.assign({}, f, { mkBill: !!f.mkBill }));
        done(); draw(true);
        U().toast && U().toast('Added. Add another, or tap Next.');
      } catch (e) { if (!(e instanceof SetupError)) console.error(e); err(e.message || String(e)); }
    }

    function draw(keepScroll) {
      const s = STEPS[st.step], w = W();
      form.querySelector('.modal-h h2').textContent = TITLES[s];
      const dots = STEPS.map((x, k) => `<i class="${k === st.step ? 'on' : k < st.step ? 'done' : ''}"></i>`).join('');
      const top = `<div class="wz-top" aria-hidden="${s === 'welcome' ? 'true' : 'false'}"><div class="wz-dots">${dots}</div><span class="wz-count">Step ${st.step + 1} of ${STEPS.length}</span></div>`;
      const body = form.querySelector('.wz-body');
      body.innerHTML = top + VIEWS[s](w);
      const back = form.querySelector('[data-wz=back]'), skip = form.querySelector('[data-wz=skip]'), nx = form.querySelector('[data-wz=next]');
      show(back, st.step > 0 && s !== 'done');
      show(skip, s !== 'done');
      skip.textContent = s === 'welcome' ? 'Not now' : 'Skip';
      nx.textContent = s === 'welcome' ? 'Get started' : s === 'done' ? 'Go to my dashboard' : 'Next';
      MOUNT[s] && MOUNT[s](body, w);
      const mb = form.querySelector('.modal-b'); if (mb && !keepScroll) mb.scrollTop = 0;
      const first = body.querySelector('[data-wz-focus]'); if (first && window.matchMedia('(min-width: 641px)').matches) setTimeout(() => first.focus(), 30);
    }

    const VIEWS = {
      welcome: () => `<p class="wz-lead">A few quick steps and WealthTrack shows what each paycheck has to cover, and what's left. It takes about two minutes. You can skip anything and add it later.</p>
        <ul class="wz-points"><li>${ic('lock')}<span><b>Private.</b> Everything stays on this device. WealthTrack has no servers and never sees your records.</span></li>
        <li>${ic('check')}<span><b>No bank login.</b> You type in what you want to track. Nothing connects to your bank.</span></li>
        <li>${ic('wallet')}<span><b>Paycheck first.</b> Each bill is matched to the paycheck before it's due, so you know what each check has to cover.</span></li></ul>`,
      balance: w => {
        const id = w.defaultAccountId(), a = id && w.D.accounts[id];
        const cur = a ? w.accountBalance(id) : 0;
        return `<p class="wz-lead">How much is in your checking account right now? Use what your bank app shows today.</p>
          ${fld('Checking balance today', moneyIn('bal', cur ? w.centsToStr(cur) : '', 'data-wz-focus'))}
          <p class="wz-hint">Skip it if you'd rather not. Your bills and paychecks still work without it.</p>`;
      },
      pay: w => {
        const incs = live(w, 'incomes');
        return `<p class="wz-lead">Add your take-home pay (after taxes). Have more than one job? Add each one.</p>
          ${incs.length ? `<div class="wz-list" aria-label="Paychecks added">${incs.map(i => `<div class="wz-item"><svg class="wz-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><span class="grow"><b>${esc(i.name)}</b> · ${esc(PAY_FREQS[i.schedule] || i.schedule)}</span><b class="num">${fmt(w.expectedNet(i))}</b></div>`).join('')}</div>` : ''}
          <div class="form-grid">
            ${fld('Job or paycheck name', `<input class="input" name="name" maxlength="80" placeholder="${incs.length ? 'Second job' : 'Day job'}" autocomplete="off" data-wz-focus>`)}
            ${fld('Take-home pay per check', moneyIn('amount', ''))}
            ${fld('How often you\'re paid', `<select class="input" name="schedule">${Object.entries(PAY_FREQS).map(([k, l]) => opt(k, l, 'biweekly')).join('')}</select>`)}
            ${fld('Next or most recent payday', `<input class="input" type="date" name="date" value="${esc(w.todayStr())}">`, 'wz-date')}
            ${fld('1st payday of the month', `<input class="input" type="number" inputmode="numeric" min="1" max="31" name="day1" value="1">`, 'wz-semi')}
            ${fld('2nd payday (31 = last day)', `<input class="input" type="number" inputmode="numeric" min="1" max="31" name="day2" value="15">`, 'wz-semi')}
          </div>
          <button type="button" class="btn wz-add" data-wz-add="pay">${ic('plus')}Save and add another paycheck</button>`;
      },
      bills: w => {
        const bills = live(w, 'templates').filter(t => t.status !== 'cancelled');
        const day = +w.todayStr().slice(8, 10);
        return `<p class="wz-lead">Add the bills you pay every month or so. Tap one to start, or type your own.</p>
          ${bills.length ? `<div class="wz-list" aria-label="Bills added">${bills.map(t => { const v = w.currentRule(t) || t.versions[0]; return `<div class="wz-item"><svg class="wz-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><span class="grow"><b>${esc(t.name)}</b> · ${esc(BILL_FREQS[v.frequency] || w.FREQS[v.frequency] || v.frequency)}</span><b class="num">${fmt(v.amountCents)}</b></div>`; }).join('')}</div>` : ''}
          <div class="wz-presets" role="group" aria-label="Common bills">${PRESETS.map(p => `<button type="button" class="chip${st.bill.preset === p.key ? ' on' : ''}" data-wz-preset="${p.key}" aria-pressed="${st.bill.preset === p.key}">${esc(p.name)}</button>`).join('')}</div>
          <div class="form-grid">
            ${fld('Bill name', `<input class="input" name="name" maxlength="80" placeholder="Electric" autocomplete="off" value="${esc(st.bill.name)}" data-wz-focus>`)}
            ${fld('Amount', moneyIn('amount', ''))}
            ${fld('How often', `<select class="input" name="frequency">${Object.entries(BILL_FREQS).map(([k, l]) => opt(k, l, 'monthly')).join('')}</select>`)}
            ${fld('Due day of the month', `<input class="input" type="number" inputmode="numeric" min="1" max="31" name="day" value="${Math.min(28, day)}">`, 'wz-day')}
            ${fld('Next due date', `<input class="input" type="date" name="date" value="${esc(w.todayStr())}">`, 'wz-date')}
          </div>
          <p class="wz-hint wz-day">Use 31 for "last day of the month". Paying a card or loan? Add it on the next step instead, so the payment also lowers what you owe.</p>
          <button type="button" class="btn wz-add" data-wz-add="bill">${ic('plus')}Save and add another bill</button>`;
      },
      debts: w => {
        const ds = w.debts().filter(d => !d.closed);
        return `<p class="wz-lead">Optional. Add credit cards and loans to see what they cost and the fastest way to pay them off.</p>
          ${ds.length ? `<div class="wz-list" aria-label="Debts added">${ds.map(d => `<div class="wz-item"><svg class="wz-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><span class="grow"><b>${esc(d.name)}</b> · ${esc(DEBT_TYPES[d.type] || d.type)}</span><b class="num">${fmt(Math.max(0, w.debtBalance(d.id)))}</b></div>`).join('')}</div>` : ''}
          <div class="form-grid">
            ${fld('Name', `<input class="input" name="name" maxlength="80" placeholder="Visa card" autocomplete="off" data-wz-focus>`)}
            ${fld('Type', `<select class="input" name="type">${Object.entries(DEBT_TYPES).map(([k, l]) => opt(k, l, 'credit_card')).join('')}</select>`)}
            ${fld('Balance you owe', moneyIn('balance', ''))}
            ${fld('Interest rate (APR %)', `<input class="input" name="apr" inputmode="decimal" autocomplete="off" placeholder="24.99">`)}
            ${fld('Minimum monthly payment', moneyIn('min', ''))}
            ${fld('Payment due day', `<input class="input" type="number" inputmode="numeric" min="1" max="31" name="day" value="1">`)}
            <label class="check full"><input type="checkbox" name="mkBill" checked> Also add a monthly bill for the minimum payment</label>
          </div>
          <button type="button" class="btn wz-add" data-wz-add="debt">${ic('plus')}Save and add another</button>`;
      },
      done: w => {
        const s = summary(w);
        const pl = s.plan;
        const row = (k, v, cls) => `<div class="wz-row${cls ? ' ' + cls : ''}"><span>${k}</span><b class="num">${v}</b></div>`;
        const peek = pl ? `<div class="wz-peek" aria-label="Your next paycheck">
            <h3>${pl.pc.date >= w.todayStr() ? 'Next paycheck' : 'This paycheck'}: ${esc(w.dateLabel(pl.pc.date, true))}</h3>
            <p class="wz-hint" style="margin:0 0 6px">${esc(pl.pc.income.name)}</p>
            ${row('Take-home pay', fmt(pl.pc.amountCents))}
            ${row(pl.bills.length + (pl.bills.length === 1 ? ' bill' : ' bills') + ' to pay from it', '−' + fmt(pl.billTotal))}
            ${pl.setAsideTotal ? row('Set-asides', '−' + fmt(pl.setAsideTotal)) : ''}
            ${row('Left over', `<span class="${pl.remainingAfterSetAsides < 0 ? 'neg' : 'pos'}">${fmt(pl.remainingAfterSetAsides)}</span>`, 'tot')}
            ${pl.remainingAfterSetAsides < 0 ? '<p class="wz-hint warn" style="margin-top:8px">This check comes up short. The Paychecks page lets you move a bill to another check.</p>' : ''}
          </div>` : `<div class="wz-peek"><h3>No paycheck yet</h3><p class="wz-hint" style="margin:0">Add your income on the Paychecks page and WealthTrack matches each bill to the check that pays it.</p></div>`;
        const item = (label, val) => `<div class="wz-item"><svg class="wz-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg><span class="grow">${label}</span><b class="num">${val}</b></div>`;
        return `<p class="wz-lead">Here's what you set up. You can change any of it later.</p>
          <div class="wz-sum">${item('Checking balance', fmt(s.balanceCents))}${item('Paychecks', s.incomes.length)}${item('Bills', s.bills.length)}${item('Cards and loans', s.debts.length)}</div>
          ${peek}`;
      },
    };
    const MOUNT = {
      pay: b => {
        const sel = b.querySelector('[name=schedule]');
        const sync = () => { const semi = sel.value === 'semimonthly'; b.querySelectorAll('.wz-semi').forEach(x => { show(x, semi); }); show(b.querySelector('.wz-date'), !semi); if (semi) { const d = b.querySelector('[name=date]'); if (!d.value) d.value = W().todayStr(); } };
        sel.onchange = sync; sync();
        b.querySelector('[data-wz-add=pay]').onclick = () => addAnother('pay');
      },
      bills: b => {
        const sel = b.querySelector('[name=frequency]');
        const sync = () => { const wk = sel.value === 'weekly' || sel.value === 'biweekly'; b.querySelectorAll('.wz-day').forEach(x => { show(x, !wk); }); show(b.querySelector('.wz-date'), wk); };
        sel.onchange = sync; sync();
        const nameIn = b.querySelector('[name=name]');
        b.querySelectorAll('[data-wz-preset]').forEach(btn => btn.onclick = () => {
          const p = PRESETS.find(x => x.key === btn.dataset.wzPreset); if (!p) return;
          st.bill = { preset: p.key, name: p.name, category: p.category };
          nameIn.value = p.name;
          b.querySelectorAll('[data-wz-preset]').forEach(x => { const on = x === btn; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
          const amt = b.querySelector('[name=amount]'); amt.focus();
        });
        b.querySelector('[data-wz-add=bill]').onclick = () => addAnother('bill');
      },
      debts: b => { b.querySelector('[data-wz-add=debt]').onclick = () => addAnother('debt'); },
    };
    try { draw(); } catch (e) { m.close(); throw e; }
  }
  // label.field is display:block in styles.css, which beats the hidden attribute
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
  const filled = v => String(v == null ? '' : v).trim() !== '';

  window.WTSetupUI = { start, maybeStart, isOpen: () => !!open };
  // Settings → Your data → Setup wizard (data-act="setupWizard")
  window.WTExt = window.WTExt || {};
  window.WTExt.setup = { act: { setupWizard: () => start({ manual: true }) } };
})(typeof window !== 'undefined' ? window : globalThis);
