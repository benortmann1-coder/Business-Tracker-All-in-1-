/* WealthTrack wealth engine — net worth, monthly history and achievements (WTWealth). No DOM.
 *
 * Read-only over WT's data: it never creates, changes or deletes records and never calls a WT
 * function that saves. Achievement dates are persisted by the caller:
 *   const ids = WTWealth.check(); if (ids.length) WT.saveSettings({ achievements: WTWealth.recordPatch(ids) });
 * Money is integer cents.
 *
 * Net worth = assets - liabilities.
 *  - Assets: the balance of every (non-archived) account (WT.accountBalance). An overdrawn account
 *    counts as a negative asset. Savings goals are earmarks on money already inside accounts, so
 *    they are never added again.
 *  - Liabilities: what is still owed on each debt (WT.debtBalance > 0). Ordinary bills (rent,
 *    utilities...) are expenses, not liabilities. Debt payments made from an account lower both
 *    sides, so they are never double counted.
 *  - Estimates: a balance that hasn't been entered yet (needsBalance) or a date before an account's
 *    balance / a debt's start was recorded is an estimate and is labeled as such.
 *  - Demo mode (settings.demo === true): results are flagged `demo: true` and no achievement is
 *    ever earned.
 *
 * Achievements unlock only when verified from recorded data (payments, balances, deposits,
 * transfers, goal contributions); estimates never unlock anything.
 */
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f(require('./core.js'));
  else root.WTWealth = f(root.WT);
})(this, function (WT) {
  'use strict';

  const ESSENTIAL_RE = /housing|rent|mortgage|utilit|electric|water|gas|internet|phone|insurance|grocer|food|medical|health|transport|car|auto|fuel|child|loan|tax|homeowner|property|hoa|pmi|escrow|maintenance|repair/i;
  const OPTIONAL_RE = /subscript|stream|entertain|dining|restaurant|shopping|hobby|gift|travel|fun|personal/i;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const fmt = c => WT.fmt(c);
  const today = () => WT.todayStr();
  const settings = () => (WT.D && WT.D.meta && WT.D.meta.settings) || {};
  const isDemo = () => settings().demo === true;
  const clamp01 = x => (x > 1 ? 1 : x > 0 ? x : 0);
  const vals = c => Object.values((WT.D && WT.D[c]) || {}).filter(Boolean);
  const pctTxt = x => Math.floor(x * 100) + '%';

  // ------------------------------------------------------------------ net worth
  // balance of one account on a date; before its balance was entered we work backwards (estimate)
  function accountAt(a, asOf) {
    const open = a.openingDate || '0000-01-01';
    if (asOf >= open) return { amount: WT.accountBalance(a.id, asOf), estimate: !!a.needsBalance };
    let b = a.openingCents || 0;
    for (const x of WT.accountFlows(a.id)) if (x.date > asOf && x.date < open) b -= x.amountCents;
    return { amount: b, estimate: true };
  }

  function netWorth(asOf) {
    asOf = asOf && DATE_RE.test(asOf) ? asOf : today();
    const assets = [], liabilities = [], notes = [];
    let estimate = false;
    for (const a of WT.accounts()) {
      const r = accountAt(a, asOf);
      if (r.estimate) estimate = true;
      if (a.needsBalance) notes.push(`${a.name} balance hasn't been entered yet, so it counts as ${fmt(r.amount)}.`);
      else if (asOf < (a.openingDate || '0000-01-01')) notes.push(`${a.name} balance before ${WT.dateLabel ? WT.dateLabel(a.openingDate, true) : a.openingDate} is estimated from recorded activity.`);
      if (r.amount < 0) notes.push(`${a.name} is overdrawn by ${fmt(-r.amount)}.`);
      assets.push({ id: a.id, name: a.name, type: a.type || 'other', amount: r.amount, estimate: r.estimate });
    }
    for (const d of WT.debts()) {
      const bal = WT.debtBalance(d.id, asOf);
      const est = !!(d.startDate && asOf < d.startDate);
      if (bal <= 0) continue;
      if (est) { estimate = true; notes.push(`${d.name} was added on ${d.startDate}; its earlier balance is estimated.`); }
      liabilities.push({ id: d.id, name: d.name, type: d.type || 'other', amount: bal, aprCenti: d.aprCenti || 0, closed: !!d.closed, estimate: est });
    }
    const goals = vals('goals').filter(g => !g.archived && !g.deleted);
    if (goals.length) {
      notes.push('Savings goals are money set aside inside your accounts, so they are not added again.');
      const loose = goals.filter(g => !(g.accountId && WT.D.accounts[g.accountId]) && WT.goalSaved(g.id) > 0);
      if (loose.length) notes.push(`${loose.map(g => g.name).join(', ')} ${loose.length === 1 ? 'isn\'t' : 'aren\'t'} linked to an account, so ${loose.length === 1 ? 'it isn\'t' : 'they aren\'t'} counted. Link the account that holds the money.`);
    }
    const totalAssets = assets.reduce((s, x) => s + x.amount, 0);
    const totalLiabilities = liabilities.reduce((s, x) => s + x.amount, 0);
    const demo = isDemo();
    if (demo) notes.unshift('Demo data — not your real net worth.');
    return {
      asOf, assets, liabilities, totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities,
      estimate, demo, notes,
      verified: !estimate && !demo && (totalAssets !== 0 || totalLiabilities !== 0),
    };
  }

  // monthly points, oldest first; the current month is "as of today"
  function history(months) {
    months = Math.max(1, Math.min(120, parseInt(months, 10) || 12));
    const td = today(); const cur = WT.monthOf(td);
    const out = [];
    for (let k = months - 1; k >= 0; k--) {
      const mk = WT.addMonthKey(cur, -k);
      const date = k === 0 ? td : WT.monthEnd(mk);
      const n = netWorth(date);
      out.push({ month: mk, date, label: WT.monthLabel(mk, true), assets: n.totalAssets, liabilities: n.totalLiabilities, netWorth: n.netWorth, estimate: n.estimate, demo: n.demo, change: null });
    }
    for (let i = 1; i < out.length; i++) out[i].change = out[i].netWorth - out[i - 1].netWorth;
    return out;
  }

  // change since the end of last month
  function change() {
    const h = history(2); const prev = h[0], now = h[1];
    return { current: now.netWorth, previous: prev.netWorth, previousDate: prev.date, amount: now.netWorth - prev.netWorth, estimate: prev.estimate || now.estimate, demo: now.demo };
  }

  // ------------------------------------------------------------------ helpers for achievements
  function essentialCategory(catId) {
    const sb = settings().smartBudget; const ov = sb && sb.essentialOverrides;
    if (ov && typeof ov === 'object' && Object.prototype.hasOwnProperty.call(ov, catId) && typeof ov[catId] === 'boolean') return ov[catId];
    const name = String(WT.catName(catId) || '');
    if (ESSENTIAL_RE.test(name)) return true;
    if (OPTIONAL_RE.test(name)) return false;
    return true; // unknown bill categories count as essential (same rule as Smart Budget)
  }
  // monthly-normalized amount of a recurring bill over the next 12 months (one-time bills excluded)
  function templateMonthly(t, mk) {
    if (!t || t.deleted || !Array.isArray(t.versions) || !t.versions.length) return 0;
    const from = WT.monthStart(mk);
    const rule = WT.ruleAt(t, from) || t.versions[0];
    if (rule.frequency === 'once') return 0;
    const occ = WT.templateOccurrences(t, from, WT.monthEnd(WT.addMonthKey(mk, 11)));
    const total = occ.reduce((a, o) => a + (o.v.amountCents || 0), 0);
    return total > 0 ? WT.divRound(total, 12) : 0;
  }
  // essential monthly costs: essential bills (not debt-linked) + minimum payments on open debts
  function essentialsMonthly() {
    const mk = WT.monthOf(today());
    let bills = 0; const linked = {};
    for (const t of vals('templates')) {
      const m = templateMonthly(t, mk); if (m <= 0) continue;
      if (t.debtId) { linked[t.debtId] = (linked[t.debtId] || 0) + m; continue; }
      if (essentialCategory(t.category)) bills += m;
    }
    let minimums = 0;
    for (const d of WT.debts()) {
      if (d.closed || WT.debtBalance(d.id) <= 0) continue;
      minimums += Math.max(d.minCents || 0, linked[d.id] || 0);
    }
    return { bills, minimums, total: bills + minimums };
  }

  // walk dated events in order; snapshot(date) is called after all events of that date are applied
  function walk(events, apply, snapshot) {
    const td = today();
    events = events.filter(e => e.date && e.date <= td).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order || 0) - (b.order || 0)));
    for (let i = 0; i < events.length; i++) {
      apply(events[i]);
      if (i + 1 === events.length || events[i + 1].date !== events[i].date) { if (snapshot(events[i].date) === false) return; }
    }
  }

  // ------------------------------------------------------------------ milestone definitions
  const NW = [[0, 'nw_0', '$0'], [100000, 'nw_1k', '$1,000'], [500000, 'nw_5k', '$5,000'], [1000000, 'nw_10k', '$10,000'], [2500000, 'nw_25k', '$25,000'],
    [5000000, 'nw_50k', '$50,000'], [10000000, 'nw_100k', '$100,000'], [25000000, 'nw_250k', '$250,000'], [50000000, 'nw_500k', '$500,000'], [100000000, 'nw_1m', '$1,000,000']];
  const MILESTONES = [
    { id: 'debt_first_payment', group: 'debt', title: 'First debt payment recorded' },
    { id: 'debt_first_payoff', group: 'debt', title: 'First debt paid off' },
    { id: 'debt_25', group: 'debt', title: '25% of debt eliminated', pct: 25 },
    { id: 'debt_50', group: 'debt', title: '50% of debt eliminated', pct: 50 },
    { id: 'debt_75', group: 'debt', title: '75% of debt eliminated', pct: 75 },
    { id: 'debt_free', group: 'debt', title: 'Completely debt-free' },
  ].concat(NW.map(([cents, id, label]) => ({ id, group: 'networth', title: cents === 0 ? 'Net worth reached $0' : 'Net worth reached ' + label, cents })))
    .concat([
      { id: 'save_500', group: 'savings', title: 'First $500 saved', cents: 50000 },
      { id: 'save_ef_1000', group: 'savings', title: '$1,000 emergency fund', cents: 100000 },
      { id: 'save_1_month', group: 'savings', title: '1 month of essential expenses saved', months: 1 },
      { id: 'save_3_months', group: 'savings', title: '3 months of essential expenses saved', months: 3 },
      { id: 'save_6_months', group: 'savings', title: '6 months of essential expenses saved', months: 6 },
      { id: 'save_goal_done', group: 'savings', title: 'First savings goal completed' },
    ]);
  const BY_ID = {}; MILESTONES.forEach(m => { BY_ID[m.id] = m; });
  const GROUPS = { debt: 'Debt', networth: 'Net worth', savings: 'Savings' };

  // ------------------------------------------------------------------ evaluation (pure)
  function evalDebt(R) {
    const debts = WT.debts();
    const events = []; const per = {};
    let firstPay = null;
    for (const d of debts) {
      per[d.id] = { name: d.name, run: 0, peak: 0, paid: false, offDate: null };
      const start = d.startDate || '0000-01-01';
      events.push({ date: start, order: 0, debtId: d.id, delta: d.startBalanceCents || 0 });
      for (const x of WT.debtCharges(d.id)) {
        const pay = x.type === 'payment' && x.amountCents < 0;
        // anything dated before the debt was added is treated as happening on its start date
        events.push({ date: x.date < start ? start : x.date, order: 1, debtId: d.id, delta: x.amountCents, pay });
      }
    }
    let total = 0, peak = 0, payDate = null;
    const hit = { 25: null, 50: null, 75: null, free: null };
    walk(events, e => {
      const p = per[e.debtId];
      p.run += e.delta;
      if (e.pay) { p.paid = true; if (!payDate) payDate = e.date; }
      if (p.run > p.peak) p.peak = p.run;
    }, date => {
      total = 0;
      for (const id in per) {
        const p = per[id]; total += Math.max(0, p.run);
        if (!p.offDate && p.paid && p.peak > 0 && p.run <= 0) p.offDate = date;
      }
      if (total > peak) peak = total;
      if (payDate && peak > 0) {
        for (const q of [25, 50, 75]) if (!hit[q] && total * 100 <= peak * (100 - q)) hit[q] = date;
        if (!hit.free && total <= 0) hit.free = date;
      }
    });
    firstPay = payDate;
    const cur = debts.reduce((s, d) => s + Math.max(0, WT.debtBalance(d.id)), 0);
    if (cur > peak) peak = cur;
    const elim = peak > 0 ? (peak - cur) / peak : 0;
    const none = peak === 0;
    const noneTxt = 'No debts recorded yet.';

    R.debt_first_payment = firstPay ? { earned: true, date: firstPay, progress: 1, detail: 'First payment recorded on ' + firstPay + '.' }
      : { earned: false, date: null, progress: 0, detail: none ? noneTxt : 'Record a payment on any debt.' };

    const offs = Object.values(per).filter(p => p.offDate).sort((a, b) => (a.offDate < b.offDate ? -1 : 1));
    if (offs.length) R.debt_first_payoff = { earned: true, date: offs[0].offDate, progress: 1, detail: offs[0].name + ' paid off.' };
    else {
      let best = null;
      for (const d of debts) {
        const p = per[d.id]; const bal = Math.max(0, WT.debtBalance(d.id));
        if (!(p.peak > 0) || bal <= 0) continue;
        const f = (p.peak - bal) / p.peak;
        if (!best || f > best.f || (f === best.f && bal < best.bal)) best = { f, bal, name: d.name };
      }
      R.debt_first_payoff = { earned: false, date: null, progress: best ? clamp01(best.f) : 0, detail: best ? `Closest: ${best.name}, ${fmt(best.bal)} left.` : noneTxt };
    }
    const elimTxt = none ? noneTxt : `${fmt(peak - cur)} of your highest recorded debt (${fmt(peak)}) paid off (${pctTxt(elim)}).`;
    for (const q of [25, 50, 75]) {
      R['debt_' + q] = hit[q] ? { earned: true, date: hit[q], progress: 1, detail: elimTxt }
        : { earned: false, date: null, progress: none ? 0 : clamp01(elim / (q / 100)), detail: elimTxt + (firstPay || none ? '' : ' Record a payment to count it.') };
    }
    R.debt_free = hit.free ? { earned: true, date: hit.free, progress: 1, detail: 'Every recorded debt paid off.' }
      : { earned: false, date: null, progress: none ? 0 : clamp01(elim), detail: none ? noneTxt : `${fmt(cur)} of debt left.` };
  }

  function evalNetWorth(R) {
    const n = netWorth(today());
    const verified = !n.estimate && (n.totalAssets !== 0 || n.totalLiabilities !== 0);
    const why = n.estimate ? ' Enter your account balances so this can be verified.' : (!verified ? ' Enter your account balances or debts to start tracking.' : '');
    // "Net worth reached $0" means climbing out of the red, so it needs a recorded debt;
    // otherwise any new install with a balance would earn it straight away.
    const hadDebt = WT.debts().length > 0;
    let prev = null;
    for (const [cents, id, label] of NW) {
      const ok = verified && n.netWorth >= cents && (cents !== 0 || hadDebt);
      let progress;
      if (ok) progress = 1;
      else if (cents === 0) progress = n.totalLiabilities > 0 ? clamp01(n.totalAssets / n.totalLiabilities) : 0;
      else progress = clamp01((n.netWorth - (prev || 0)) / (cents - (prev || 0)));
      if (!verified) progress = Math.min(progress, 0.99);
      R[id] = { earned: ok, date: ok ? n.asOf : null, progress, detail: `Net worth ${fmt(n.netWorth)} of ${label}.` + why };
      prev = cents;
    }
  }

  function evalSavings(R) {
    const events = [];
    const accs = WT.accounts().filter(a => a.type === 'savings' && !a.needsBalance);
    for (const a of accs) {
      const open = a.openingDate || '0000-01-01';
      events.push({ date: open, order: 0, key: 'a:' + a.id, kind: 'acc', delta: a.openingCents || 0 });
      for (const x of WT.accountFlows(a.id)) if (x.date >= open) events.push({ date: x.date, order: 1, key: 'a:' + a.id, kind: 'acc', delta: x.amountCents });
    }
    const goals = vals('goals').filter(g => !g.deleted);
    const gtx = {}; for (const x of vals('goalTxns')) if (!x.voided) (gtx[x.goalId] = gtx[x.goalId] || []).push(x);
    for (const g of goals) {
      const active = !g.archived;
      events.push({ date: g.createdAt || '0000-01-01', order: 0, key: 'g:' + g.id, kind: 'goal', goal: g, active, delta: g.startCents || 0 });
      for (const x of gtx[g.id] || []) events.push({ date: x.date, order: 1, key: 'g:' + g.id, kind: 'goal', goal: g, active, delta: x.amountCents || 0, contrib: (x.amountCents || 0) > 0 });
    }
    const ess = essentialsMonthly();
    const run = {}; const meta = {};
    const firsts = { save: null, ef: null, m1: null, m3: null, m6: null, goal: null };
    let goalName = null;
    const contributed = {};
    const measure = () => {
      let acc = 0, goalsAll = 0, goalsEf = 0;
      for (const k in run) {
        const v = Math.max(0, run[k]); const m = meta[k];
        if (m.kind === 'acc') acc += v;
        else if (m.active) { goalsAll += v; if (m.goal.type === 'emergency') goalsEf += v; }
      }
      // goals usually live inside a savings account: take the larger, never the sum
      return { saved: Math.max(acc, goalsAll), ef: Math.max(acc, goalsEf) };
    };
    walk(events, e => {
      run[e.key] = (run[e.key] || 0) + e.delta; meta[e.key] = e;
      if (e.contrib) contributed[e.key] = true;
    }, date => {
      const m = measure();
      if (!firsts.save && m.saved >= 50000) firsts.save = date;
      if (!firsts.ef && m.ef >= 100000) firsts.ef = date;
      if (ess.total > 0) {
        if (!firsts.m1 && m.ef >= ess.total) firsts.m1 = date;
        if (!firsts.m3 && m.ef >= ess.total * 3) firsts.m3 = date;
        if (!firsts.m6 && m.ef >= ess.total * 6) firsts.m6 = date;
      }
      if (!firsts.goal) for (const k in run) {
        const mm = meta[k];
        if (mm.kind === 'goal' && contributed[k] && mm.goal.targetCents > 0 && run[k] >= mm.goal.targetCents) { firsts.goal = date; goalName = mm.goal.name; break; }
      }
    });
    // current values (as of today)
    let acc = 0, goalsAll = 0, goalsEf = 0;
    for (const a of accs) acc += Math.max(0, WT.accountBalance(a.id));
    for (const g of goals) if (!g.archived) { const v = Math.max(0, WT.goalSaved(g.id)); goalsAll += v; if (g.type === 'emergency') goalsEf += v; }
    const saved = Math.max(acc, goalsAll), ef = Math.max(acc, goalsEf);
    const unverified = WT.accounts().some(a => a.type === 'savings' && a.needsBalance) ? ' Enter your savings balance so it can be counted.' : '';

    const amt = (key, id, target, value, what) => {
      R[id] = firsts[key] ? { earned: true, date: firsts[key], progress: 1, detail: `${what} reached ${fmt(target)}.` }
        : { earned: false, date: null, progress: clamp01(value / target), detail: `${fmt(value)} of ${fmt(target)} ${what.toLowerCase()}.` + unverified };
    };
    amt('save', 'save_500', 50000, saved, 'Savings');
    amt('ef', 'save_ef_1000', 100000, ef, 'Emergency fund');
    for (const [key, id, n] of [['m1', 'save_1_month', 1], ['m3', 'save_3_months', 3], ['m6', 'save_6_months', 6]]) {
      const target = ess.total * n;
      if (firsts[key]) R[id] = { earned: true, date: firsts[key], progress: 1, detail: `Savings covered ${n} month${n > 1 ? 's' : ''} of essentials (${fmt(target)}, based on ${fmt(ess.total)} a month).` };
      else if (!(ess.total > 0)) R[id] = { earned: false, date: null, progress: 0, detail: 'Add your essential bills so this can be measured.' };
      else R[id] = { earned: false, date: null, progress: clamp01(ef / target), detail: `${fmt(ef)} of ${fmt(target)} (${n} × ${fmt(ess.total)} a month of essential bills and minimum debt payments).` + unverified };
    }
    if (firsts.goal) R.save_goal_done = { earned: true, date: firsts.goal, progress: 1, detail: (goalName || 'A goal') + ' reached its target.' };
    else {
      let best = null;
      for (const g of goals) { if (!(g.targetCents > 0)) continue; const f = WT.goalSaved(g.id) / g.targetCents; if (!best || f > best.f) best = { f, g }; }
      R.save_goal_done = { earned: false, date: null, progress: best ? Math.min(clamp01(best.f), 0.99) : 0, detail: best ? `Closest: ${best.g.name}, ${fmt(WT.goalSaved(best.g.id))} of ${fmt(best.g.targetCents)}.` + (best.f >= 1 ? ' Record a contribution toward it to count it.' : '') : 'Create a savings goal to start.' };
    }
  }

  function evaluate() {
    const R = {};
    evalDebt(R); evalNetWorth(R); evalSavings(R);
    return R;
  }

  function persisted() {
    const a = settings().achievements; const out = {};
    if (a && typeof a === 'object') for (const k of Object.keys(a)) if (BY_ID[k] && typeof a[k] === 'string' && DATE_RE.test(a[k])) out[k] = a[k];
    return out;
  }

  // ------------------------------------------------------------------ public achievements API
  function achievements() {
    const demo = isDemo();
    const P = demo ? {} : persisted();
    const R = demo ? null : evaluate();
    const list = MILESTONES.map(m => {
      if (demo) return { id: m.id, group: m.group, title: m.title, earned: false, earnedOn: null, progress: 0, detail: 'Demo data — achievements only count your real records.', next: false, demo: true };
      const r = R[m.id]; const p = P[m.id] || null;
      const earned = !!p || r.earned;
      return { id: m.id, group: m.group, title: m.title, earned, earnedOn: p || (r.earned ? r.date : null), progress: earned ? 1 : r.progress, detail: r.detail, next: false, demo: false };
    });
    for (const g of Object.keys(GROUPS)) { const n = list.find(x => x.group === g && !x.earned); if (n) n.next = true; }
    return list;
  }

  // ids verified as earned that aren't recorded yet (never in demo mode)
  function check() {
    if (isDemo()) return [];
    const P = persisted(); const R = evaluate();
    return MILESTONES.filter(m => R[m.id].earned && !P[m.id]).map(m => m.id);
  }

  // merged settings.achievements object (existing dates are never changed)
  function recordPatch(newIds) {
    const out = persisted();
    if (isDemo()) return out;
    const ids = Array.from(new Set((newIds || []).filter(id => BY_ID[id] && !out[id])));
    if (!ids.length) return out;
    const R = evaluate();
    for (const id of ids) if (R[id].earned) out[id] = R[id].date || today();
    return out;
  }

  function summary() {
    const list = achievements();
    const next = {}; for (const g of Object.keys(GROUPS)) next[g] = list.find(x => x.group === g && x.next) || null;
    return { earned: list.filter(x => x.earned).length, total: list.length, next, demo: isDemo() };
  }

  const notifyEnabled = () => settings().achievementsNotify !== false;

  return { ready: true, netWorth, history, change, achievements, check, recordPatch, summary, notifyEnabled, essentialsMonthly, MILESTONES, GROUPS };
});
