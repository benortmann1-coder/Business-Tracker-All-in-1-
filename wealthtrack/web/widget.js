/* Home-screen widget data (WTWidget). Android only.
 * The widgets can't read the WebView's IndexedDB, so after each change the page builds a small snapshot
 * (amounts already formatted) and hands it to AndroidBridge.updateWidgets(json). The Java side keeps it in
 * private SharedPreferences (excluded from cloud backup and device transfer by data_extraction_rules.xml).
 *
 * States: 'ok' (amounts), 'pin' (PIN lock is on: no amounts ever leave the page), 'pro' (not WealthTrack Pro),
 * 'empty' (demo or nothing entered yet). snapshot() is pure over the WT data model and runs under Node for tests.
 */
(function (root) {
  'use strict';

  const MAX_NAME = 40;
  const clip = s => { s = String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim(); return s.length > MAX_NAME ? s.slice(0, MAX_NAME - 1) + '…' : s; };

  // PRO-GATE: the one place widgets check for WealthTrack Pro. Until Pro is merged every install counts as Pro.
  const widgetsPro = () => (typeof root.WT_isPro === 'function' ? !!root.WT_isPro() : true);

  // opts: { today, demo, pin, pro }
  function snapshot(WT, opts) {
    opts = opts || {};
    const today = opts.today || WT.todayStr();
    const base = { v: 1, asOf: today, asOfText: 'Updated ' + WT.shortDate(today) };
    if (opts.pin) return Object.assign(base, { state: 'pin' });
    if (opts.pro === false) return Object.assign(base, { state: 'pro' });
    if (opts.demo) return Object.assign(base, { state: 'empty' });

    const liveTpl = i => { const t = WT.D.templates[i.templateId]; return !(t && t.deleted); };
    const overdue = WT.overdue(today).filter(x => liveTpl(x.i));
    const upcoming = WT.instancesBetween(today, WT.addDays(today, 45))
      .filter(i => !i.skipped && liveTpl(i)).map(i => ({ i, s: WT.instStatus(i, today) })).filter(x => x.s.remaining > 0);
    const unpaid = overdue.concat(upcoming);
    // dueDate is raw so the widget can say Today / Tomorrow / Overdue against the phone's clock; dueShort is the display date
    const bills = unpaid.slice(0, 3).map(x => ({ name: clip(x.i.name), amount: WT.fmt(x.s.remaining), dueDate: x.i.dueDate, dueShort: WT.shortDate(x.i.dueDate), overdue: x.i.dueDate < today }));

    let leftLabel, leftCents;
    const cur = WT.currentPaycheck(today);
    const plan = cur ? WT.paycheckPlan(cur.key) : null;
    if (plan) { leftLabel = 'Left from this paycheck'; leftCents = plan.remainingAfterSetAsides; }
    else { leftLabel = 'Left after bills this month'; leftCents = WT.monthSummary(WT.monthOf(today)).leftAfterBills; }

    const hasAnything = unpaid.length || plan || WT.list('templates').some(t => !t.deleted);
    if (!hasAnything) return Object.assign(base, { state: 'empty' });

    const nxt = WT.nextPaycheck(WT.addDays(today, 1));
    return Object.assign(base, {
      state: 'ok',
      leftLabel, leftText: WT.fmt(leftCents), leftNeg: leftCents < 0,
      bills,
      overdueCount: overdue.length,
      overdueText: overdue.length ? overdue.length + ' overdue' : '',
      payText: nxt ? 'Payday ' + (WT.diffDays(today, nxt.date) === 1 ? 'tomorrow' : WT.shortDate(nxt.date)) : '',
    });
  }

  // ------------------------------------------------------------ browser glue (Android WebView only)
  let timer = null; let last = '';
  function bridge() { const b = root.AndroidBridge; return b && typeof b.updateWidgets === 'function' ? b : null; }
  function schedule(state) {
    if (!bridge()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const json = JSON.stringify(snapshot(root.WT, { demo: !!(state && state.demo), pin: !!(state && state.pin), pro: widgetsPro() }));
        if (json === last) return;
        last = json; bridge().updateWidgets(json);
      } catch (e) { console.warn('widget update failed', e); }
    }, 600);
  }
  function clear() { clearTimeout(timer); last = ''; const b = bridge(); if (b && typeof b.clearWidgets === 'function') { try { b.clearWidgets(); } catch (e) { /* ignore */ } } }

  // Tapping a Pro-locked widget opens #/settings?upgrade=widgets: show the upgrade dialog once the app is ready.
  function checkUpgradeLink() {
    if (typeof location === 'undefined' || !/^#\/settings\?upgrade=widgets$/.test(location.hash || '')) return;
    try { history.replaceState(null, '', '#/settings'); } catch (e) { /* ignore */ }
    if (typeof root.WT_proDialog === 'function') root.WT_proDialog('widgets');
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('hashchange', () => { if (window.__wtReady) checkUpgradeLink(); });
    const wait = setInterval(() => { if (window.__wtReady) { clearInterval(wait); checkUpgradeLink(); } }, 200);
  }

  const api = { snapshot, schedule, clear, widgetsPro, checkUpgradeLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WTWidget = api;
})(typeof window !== 'undefined' ? window : globalThis);
