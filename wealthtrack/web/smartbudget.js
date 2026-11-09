/* WealthTrack Smart Budget — calculation engine (no DOM).
 *
 * Read-only over WT's data: it never creates, changes or deletes bills, payments,
 * incomes, expenses, debts or goals, and it never calls a WT function that saves.
 * Money is integer cents (rounded to the nearest cent, half away from zero).
 *
 * Buckets (fixed order): needs, debt, savings, wants.
 *  - needs  = essential bills + everyday necessities (groceries, gas, transport)
 *  - debt   = required minimum payments + optional extra (always reported separately)
 *  - savings = starter emergency fund, upcoming one-time bills, goals
 *  - wants  = optional bills (subscriptions) + spending money
 *
 * Preset/personalized strategies: percentages have 1 decimal and sum to 100, amounts sum
 * to exactly the take-home income. The dollar/percent editor helpers (fromDollars,
 * fromPct, distribute) do NOT force 100%: they report unallocated / over instead.
 *
 * Named strategies (v3, ids stable): avalanche, snowball, 50-30-20, zero, pay-first, aggressive, balanced,
 * custom. Old saved ids still resolve: debt -> aggressive, savings -> pay-first, 60-20-20 -> balanced.
 * Each starts from what is required (living costs + debt minimums, counted once) and applies its own
 * priorities to the money that is left; the owner's example percentages are only a starting point and
 * every difference is listed in `modifications`. 'recommended' is a copy of the named plan that
 * recommend() scores best for this user's numbers (`basedOn`), never a fixed favorite.
 * When income can't cover living costs + minimums, every plan keeps home, bills, food and gas funded
 * first, explains the exact shortfall and lists realistic options; no plan is called best.
 * Forecasts are estimates: savings grow at 0% unless the user entered a rate; missing inputs are listed,
 * never invented. WTPlan (debt schedules, paycheck timing) and WTWealth (net worth) are optional.
 */
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f(require('./core.js'));
  else root.WTSmart = f(root.WT);
})(this, function (WT) {
  'use strict';

  const BUCKETS = ['needs', 'debt', 'savings', 'wants'];
  const NAMES = { recommended: 'Recommended for you', '50-30-20': '50/30/20', '60-20-20': '60/20/20', debt: 'Debt-focused', savings: 'Savings-focused', zero: 'Zero-based', custom: 'Custom' };
  const KINDS = { recommended: 'Personalized', '50-30-20': 'Balanced', '60-20-20': 'High cost of living', debt: 'Debt payoff', savings: 'Savings builder', zero: 'Every dollar assigned', custom: 'Your own plan' };
  const ROLLOVER_RULES = ['carry', 'savings', 'debt', 'reset'];
  const ESSENTIAL_RE = /housing|rent|mortgage|utilit|electric|water|gas|internet|phone|insurance|grocer|food|medical|health|transport|car|auto|fuel|child|loan|tax/i;
  const OPTIONAL_RE = /subscript|stream|entertain|dining|restaurant|shopping|hobby|gift|travel|fun|personal/i;
  const HIGH_APR = 1500;          // 15.00% in hundredths of a percent
  const STARTER_CAP = 100000;     // starter emergency fund: min(1 month of living costs, $1,000)
  const UPCOMING_DAYS = 60;
  const UPCOMING_MIN = 10000;     // "large" = $100 or more
  const URGENCY = { now: 0, soon: 1, later: 2 };

  // ---------------------------------------------------------------- small helpers
  const money = c => WT.fmt(WT.divRound(c, 100) * 100, { noCents: true }); // "$1,234" (rounded to the dollar)
  const cents = c => WT.fmt(c);                                               // "$1,234.56" (exact)
  const pctOf = (part, whole) => whole > 0 ? Math.round(part * 100 / whole) : 0;
  const zero = () => ({ needs: 0, debt: 0, savings: 0, wants: 0 });
  const sum4 = o => BUCKETS.reduce((a, b) => a + ((o && o[b]) || 0), 0);
  const clone = o => JSON.parse(JSON.stringify(o));
  const num = v => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };
  const toCents = v => { const n = Number(v); return isFinite(n) && n > 0 ? Math.round(n) : 0; };
  const round1 = x => Math.round(x * 10) / 10;
  const sb = () => { const s = (WT.D && WT.settings && WT.settings()) || {}; return (s.smartBudget && typeof s.smartBudget === 'object') ? s.smartBudget : {}; };
  const today = () => WT.todayStr();
  const curMonth = () => WT.monthOf(today());
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const aprStr = a => WT.pctStr(a || 0);
  const listNames = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

  // Largest-remainder split of `total` (integer) by non-negative weights; result sums to total exactly.
  function splitInt(total, weights) {
    const keys = Object.keys(weights);
    const W = keys.reduce((a, k) => a + num(weights[k]), 0);
    const out = {}; keys.forEach(k => out[k] = 0);
    if (total <= 0 || W <= 0) return out;
    let used = 0;
    const rem = keys.map(k => { const exact = total * num(weights[k]) / W; const fl = Math.floor(exact); out[k] = fl; used += fl; return { k, r: exact - fl }; });
    rem.sort((a, b) => b.r - a.r || keys.indexOf(a.k) - keys.indexOf(b.k));
    for (let i = 0; used < total; i++, used++) out[rem[i % rem.length].k] += 1;
    return out;
  }
  // Any pct-like object -> 4 percentages with 1 decimal summing to exactly 100.
  function normPct(p) {
    p = p || {};
    let w = {}; BUCKETS.forEach(b => w[b] = num(p[b]));
    if (sum4(w) <= 0) w = { needs: 1, debt: 1, savings: 1, wants: 1 };
    const t = splitInt(1000, w);
    const out = {}; BUCKETS.forEach(b => out[b] = t[b] / 10);
    return out;
  }
  // pct -> cents summing to income; rounding difference goes to the largest bucket.
  function centsFromPct(income, pct) {
    const out = zero();
    if (income <= 0) return out;
    let used = 0;
    BUCKETS.forEach(b => { out[b] = WT.divRound(income * Math.round(pct[b] * 10), 1000); used += out[b]; });
    const big = BUCKETS.reduce((a, b) => (out[b] > out[a] ? b : a), 'needs');
    out[big] += income - used;
    return out;
  }
  // cents -> pct (1 decimal, sums to 100)
  function pctFromCents(amounts, income, fallback) {
    if (!(income > 0) || sum4(amounts) <= 0) return normPct(fallback || { needs: 50, debt: 0, savings: 20, wants: 30 });
    return normPct(amounts);
  }
  // cents -> pct of income, NOT normalized (editor math)
  function rawPct(amounts, income) { const o = {}; BUCKETS.forEach(b => o[b] = income > 0 ? round1((amounts[b] || 0) * 100 / income) : 0); return o; }
  function cleanDollars(d) { const o = {}; d = d || {}; BUCKETS.forEach(b => o[b] = toCents(d[b])); return o; }

  // ---------------------------------------------------------------- classification
  function essentialCategory(catId, kind) {
    const ov = sb().essentialOverrides;
    if (ov && typeof ov === 'object' && Object.prototype.hasOwnProperty.call(ov, catId) && typeof ov[catId] === 'boolean') return ov[catId];
    const name = String(WT.catName(catId) || '');
    if (ESSENTIAL_RE.test(name)) return true;
    if (OPTIONAL_RE.test(name)) return false;
    return kind !== 'expense'; // unknown: bills are essential, everyday spending is optional
  }
  const billBucket = i => i.debtId ? 'debt' : (essentialCategory(i.category, 'bill') ? 'needs' : 'wants');

  // monthly-normalized amount of a bill template (12-month average from month mk; one-time bills only in mk)
  function templateMonthly(t, mk) {
    if (!t || t.deleted || !Array.isArray(t.versions) || !t.versions.length) return 0;
    const from = WT.monthStart(mk);
    const rule = WT.ruleAt(t, from) || t.versions[0];
    if (rule.frequency === 'once') {
      return WT.templateOccurrences(t, from, WT.monthEnd(mk)).reduce((a, o) => a + (o.v.amountCents || 0), 0);
    }
    const occ = WT.templateOccurrences(t, from, WT.monthEnd(WT.addMonthKey(mk, 11)));
    const total = occ.reduce((a, o) => a + (o.v.amountCents || 0), 0);
    return total > 0 ? WT.divRound(total, 12) : 0;
  }
  // bills that don't come every month (one-time, quarterly, yearly...)
  function bigCadence(v) {
    const f = v && v.frequency;
    if (f === 'once' || f === 'quarterly' || f === 'yearly') return true;
    if (f === 'custom') return (v.unit === 'month' && (parseInt(v.interval, 10) || 1) > 1) || v.unit === 'year';
    return false;
  }

  function paychecksPerMonthFor(inc) {
    return { weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1 }[inc.schedule] || 1;
  }

  function balancesNow() {
    let checking = 0, acc = 0;
    for (const a of WT.accounts()) {
      if (a.type === 'savings') acc += Math.max(0, WT.accountBalance(a.id));
      else if (a.type === 'checking') checking += WT.accountBalance(a.id);
    }
    let ef = 0;
    for (const g of Object.values(WT.D.goals || {})) if (g && !g.archived && g.type === 'emergency') ef += Math.max(0, WT.goalSaved(g.id));
    // goals usually live inside a savings account: take the larger, never the sum (no double counting)
    return { checking, savings: Math.max(acc, ef), available: WT.availableBalance() };
  }

  // ---------------------------------------------------------------- v3 analysis helpers
  // Optional engines, guarded: WTPlan (paycheck plan, debt schedules) and WTWealth (net worth).
  function ext(globalName, file, fn) {
    try {
      const g = typeof globalThis !== 'undefined' ? globalThis[globalName] : undefined;
      if (g && typeof g[fn] === 'function' && (globalName !== 'WTPlan' || g.ready)) return g;
    } catch (e) { /* ignore */ }
    try {
      if (typeof module === 'object' && module.exports && typeof require === 'function') { const m = require(file); if (m && typeof m[fn] === 'function') return m; }
    } catch (e) { /* not available */ }
    return null;
  }
  const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  function cvOf(xs) { const m = mean(xs); if (!(m > 0) || xs.length < 2) return 0; const v = mean(xs.map(x => (x - m) * (x - m))); return Math.sqrt(v) / m; }
  // How steady income is: recorded deposits per source (last ~6 months) and extra income by month.
  function incomeVariability(td, mk) {
    const since = WT.addDays(td, -182);
    const bySource = {};
    const deps = Object.values(WT.D.deposits || {}).filter(x => x && !x.voided && x.date >= since && x.date <= td && Number.isInteger(x.amountCents));
    for (const x of deps) (bySource[x.incomeId] = bySource[x.incomeId] || { amounts: [] }).amounts.push(x.amountCents);
    let irregular = false;
    for (const [id, v] of Object.entries(bySource)) {
      const inc = WT.D.incomes[id]; const expected = inc ? WT.expectedNet(inc) : 0;
      v.count = v.amounts.length; v.average = Math.round(mean(v.amounts)); v.low = Math.min.apply(null, v.amounts); v.high = Math.max.apply(null, v.amounts);
      v.cv = Math.round(cvOf(v.amounts) * 100) / 100; v.expected = expected;
      v.irregular = v.count >= 3 && v.cv > 0.15;
      if (v.irregular) irregular = true;
      delete v.amounts;
    }
    const months = []; for (let k = 6; k >= 1; k--) months.push(WT.addMonthKey(mk, -k));
    const extraBy = {}; months.forEach(m => extraBy[m] = 0);
    for (const x of Object.values(WT.D.extraIncome || {})) if (x && !x.voided && Number.isInteger(x.amountCents) && x.date && Object.prototype.hasOwnProperty.call(extraBy, WT.monthOf(x.date))) extraBy[WT.monthOf(x.date)] += x.amountCents;
    const ex = months.map(m => extraBy[m]);
    const extraMonthly = Math.round(mean(ex));
    const extraMonths = ex.filter(v => v > 0).length;
    const extraCv = Math.round(cvOf(ex) * 100) / 100;
    if (extraMonths > 0 && extraCv > 0.5 && extraMonthly > 0) irregular = true;
    return { irregular, bySource, extraMonthly, extraMonths, extraCv, extraByMonth: extraBy, extraCounted: false };
  }
  // income that starts or ends in the next 6 months (expected changes)
  function incomeChanges(td) {
    const to = WT.addDays(td, 183); const out = [];
    for (const inc of Object.values(WT.D.incomes || {})) {
      if (!inc || inc.deleted) continue;
      const monthly = Math.round(WT.expectedNet(inc) * paychecksPerMonthFor(inc));
      if (inc.startDate && inc.startDate > td && inc.startDate <= to) out.push({ id: inc.id, name: inc.name, type: 'starts', date: inc.startDate, monthly });
      if (inc.endDate && inc.endDate >= td && inc.endDate <= to) out.push({ id: inc.id, name: inc.name, type: 'ends', date: inc.endDate, monthly });
    }
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }
  // due dates and cadence of a bill template (for breakdowns and sinking funds)
  function billInfo(t, mk, td) {
    const rule = WT.ruleAt(t, WT.monthStart(mk)) || t.versions[0];
    const irregular = bigCadence(rule);
    const thisMonth = WT.templateOccurrences(t, WT.monthStart(mk), WT.monthEnd(mk))[0] || null;
    const next = WT.templateOccurrences(t, td, WT.addDays(td, 400))[0] || null;
    const ref = thisMonth || next;
    return { frequency: rule.frequency, irregular, oneTime: rule.frequency === 'once', amountEach: rule.amountCents || 0, dueDay: ref ? +ref.date.slice(8) : null, dueDate: thisMonth ? thisMonth.date : null, nextDue: next ? next.date : null };
  }
  const REVOLVING = { credit_card: true, line: true, heloc: true };
  // per debt: type (revolving cards vs installment loans), due day, linked bill, interest now, payments left at the minimum
  function debtDetail(d, billIds) {
    const r = WT.D.debts[d.id] || {};
    const type = r.type || 'other';
    const revolving = !!REVOLVING[type];
    const out = { id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti, minCents: d.minCents, type, revolving, dueDay: r.dueDay || 1, billId: (billIds && billIds[0]) || null, limitCents: r.limitCents || null, interestMonthly: WT.monthlyInterest(d.balanceCents, d.aprCenti) };
    out.termMonths = termAtMinimum(out);
    return out;
  }
  // months to pay off at the minimum. Installment loans keep a fixed payment; a credit card's minimum
  // usually falls as the balance falls (here: interest + 1% of the balance, at least $25, never above the set minimum).
  function termAtMinimum(d) {
    if (!(d.balanceCents > 0) || !(d.minCents > 0)) return null;
    let bal = d.balanceCents;
    for (let m = 1; m <= 600; m++) {
      const it = WT.monthlyInterest(bal, d.aprCenti);
      const pay = d.revolving ? Math.min(d.minCents, Math.max(2500, it + Math.ceil(bal / 100))) : d.minCents;
      if (pay <= it) return null;
      bal = bal + it - pay;
      if (bal <= 0) return m;
    }
    return null;
  }
  function netWorthNow() {
    const NW = ext('WTWealth', './wealth.js', 'netWorth');
    if (NW) { try { const n = NW.netWorth(); if (n && Number.isFinite(n.netWorth)) return { assets: n.totalAssets, liabilities: n.totalLiabilities, netWorth: n.netWorth, estimate: !!n.estimate, demo: !!n.demo, source: 'WTWealth' }; } catch (e) { /* fall back */ } }
    let assets = 0;
    for (const a of WT.accounts()) assets += WT.accountBalance(a.id);
    const liabilities = WT.totalDebt();
    return { assets, liabilities, netWorth: assets - liabilities, estimate: WT.accounts().some(a => a.needsBalance), demo: !!(WT.settings() || {}).demo, source: 'basic' };
  }
  // savings growth: 0% unless the user entered a rate (settings.smartBudget.savingsAprCenti, hundredths of a percent)
  function savingsRate() { const r = sb().savingsAprCenti; return Number.isInteger(r) && r > 0 && r <= 2000 ? r : 0; }
  // what the engine needs but doesn't have. key/critical drive the recommendation's confidence.
  function missingInputs(A) {
    const m = [];
    if (!(A.income > 0)) m.push({ key: 'income', critical: true, label: 'Take-home pay', detail: 'Add your job or paycheck (amount and how often you are paid).' });
    if (!(A.essentials > 0)) m.push({ key: 'bills', critical: true, label: 'Essential bills', detail: 'Add your rent or mortgage, utilities, insurance and other required bills.' });
    if (!(A.everyday > 0)) m.push({ key: 'everyday', critical: false, label: 'Groceries and gas', detail: 'Add a per-paycheck set-aside for groceries and gas, or record a few expenses, so everyday costs are counted.' });
    for (const d of A.debts) {
      const f = [];
      if (!d.aprCenti) f.push('interest rate (APR)');
      if (!d.minCents) f.push('minimum payment');
      if (f.length) m.push({ key: 'debt:' + d.id, critical: false, label: d.name + ' details', detail: `${d.name} has no ${f.join(' or ')}.` });
    }
    const accs = WT.accounts();
    if (!accs.length || accs.some(a => a.needsBalance)) m.push({ key: 'balances', critical: false, label: 'Account balances', detail: 'Enter your current account balances so savings and net worth are accurate.' });
    return m;
  }

  // debts used for payoff math: open, balance > 0; minimum = max(debt minimum, linked monthly bill)
  function debtModel(mk, linkedByDebt) {
    return WT.debtInputs().filter(d => d.balanceCents > 0).map(d => ({
      id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti || 0,
      minCents: Math.max(d.minCents || 0, linkedByDebt[d.id] || 0), setMin: d.minCents || 0,
    }));
  }

  // ---------------------------------------------------------------- analyze
  function analyze(mk) {
    mk = mk || curMonth();
    const td = today();
    const notes = [];

    // income
    const winFrom = WT.monthStart(mk), winTo = WT.monthEnd(WT.addMonthKey(mk, 2));
    const pcs = WT.paychecksBetween(winFrom, winTo);
    const byInc = new Map();
    for (const pc of pcs) { if (!byInc.has(pc.incomeId)) byInc.set(pc.incomeId, []); byInc.get(pc.incomeId).push(pc); }
    let income = 0, ppm = 0;
    const sources = [];
    const variability = incomeVariability(td, mk);
    for (const [, list] of byInc) {
      const inc = list[0].income;
      let avg = WT.divRound(list.reduce((a, p) => a + (p.expectedCents || 0), 0), list.length);
      // irregular pay (recorded deposits vary a lot and average less than expected): plan on what really came in
      const v = variability.bySource[inc.id];
      let basis = 'expected';
      if (v && v.irregular && v.average < avg) { avg = v.average; basis = 'recorded-average'; }
      let per = paychecksPerMonthFor(inc);
      if ((inc.endDate && inc.endDate < winTo) || (inc.startDate && inc.startDate > winFrom)) per = Math.min(per, list.length / 3);
      const monthly = Math.round(avg * per);
      income += monthly; ppm += per;
      sources.push({ id: inc.id, name: inc.name || 'Paycheck', schedule: inc.schedule || null, perPaycheck: avg, paychecksPerMonth: Math.round(per * 100) / 100, monthly, basis, startDate: inc.startDate || null, endDate: inc.endDate || null });
    }
    if (!byInc.size) { const f = WT.incomeForMonth(mk); income = Math.max(0, f.total || 0); if (income > 0) sources.push({ id: null, name: 'Recorded income', schedule: null, perPaycheck: 0, paychecksPerMonth: 0, monthly: income, basis: 'recorded', startDate: null, endDate: null }); }
    income = Math.max(0, income);
    const incomeDetail = { paychecksPerMonth: Math.round(ppm * 100) / 100, perPaycheck: ppm > 0 ? Math.round(income / ppm) : 0, sources, irregular: variability.irregular, variability, changes: incomeChanges(td) };

    // bills
    let essentials = 0, optionalBills = 0;
    const linkedByDebt = {}; const billsByDebt = {}; const orphanDebtBills = []; const subscriptions = []; const essentialBills = [];
    const openDebtIds = new Set(WT.debtInputs().map(d => d.id));
    for (const t of Object.values(WT.D.templates || {})) {
      const m = templateMonthly(t, mk);
      if (m <= 0) continue;
      if (t.debtId) {
        if (openDebtIds.has(t.debtId)) { linkedByDebt[t.debtId] = (linkedByDebt[t.debtId] || 0) + m; (billsByDebt[t.debtId] = billsByDebt[t.debtId] || []).push(t.id); }
        else if (!WT.D.debts[t.debtId] || WT.D.debts[t.debtId].deleted || WT.D.debts[t.debtId].closed) orphanDebtBills.push(Object.assign({ id: t.id, name: t.name, monthly: m }, billInfo(t, mk, td)));
        continue;
      }
      const info = billInfo(t, mk, td);
      if (essentialCategory(t.category, 'bill')) { essentials += m; essentialBills.push(Object.assign({ id: t.id, name: t.name, monthly: m, category: t.category }, info)); }
      else { optionalBills += m; subscriptions.push(Object.assign({ id: t.id, name: t.name, monthly: m, category: t.category, subscription: !!t.subscription }, info)); }
    }
    const debts = debtModel(mk, linkedByDebt);
    const debtMinimums = debts.reduce((a, d) => a + d.minCents, 0) + orphanDebtBills.reduce((a, b) => a + b.monthly, 0);
    const debtTotal = WT.totalDebt();
    debts.forEach(d => {
      if (!d.minCents) notes.push(d.name + ' has no minimum payment set. Add one so this plan can count it.');
      if (!d.aprCenti) notes.push(d.name + ' has no interest rate (APR) set. Add it so payoff dates are accurate.');
    });
    const highAprDebts = debts.filter(d => d.aprCenti >= HIGH_APR).sort((a, b) => b.aprCenti - a.aprCenti || a.balanceCents - b.balanceCents);

    // set-asides (per paycheck): essential-sounding ones (food, gas...) are needs spending, the rest is saving
    let saNeeds = 0, saSave = 0; const saNames = [];
    for (const sa of (WT.settings().setAsides || [])) {
      if (!(sa && sa.amountCents > 0)) continue;
      const m = Math.round(sa.amountCents * (ppm || 0));
      if (ESSENTIAL_RE.test(sa.name || '')) { saNeeds += m; saNames.push(sa.name); } else saSave += m;
    }

    // everyday spending (expenses only: bills are counted above)
    const end = WT.monthEnd(mk) < td ? WT.monthEnd(mk) : td;
    let start = WT.monthStart(WT.addMonthKey(mk, -3));
    const exps = Object.values(WT.D.expenses || {}).filter(e => e && e.date && Number.isInteger(e.amountCents) && e.date <= end);
    const firstExp = exps.reduce((a, e) => (a && a < e.date ? a : e.date), null);
    const created = (WT.settings().createdAt || WT.settings().seededAt || null);
    const dataStart = [firstExp, created].filter(Boolean).sort()[0];
    if (dataStart && dataStart > start) start = dataStart;
    const days = Math.max(30, WT.diffDays(start, end) + 1);
    const raw = {};
    for (const e of exps) if (e.date >= start) raw[e.category] = (raw[e.category] || 0) + e.amountCents;
    const byCategory = {}; let spNeeds = 0, spWants = 0;
    for (const [c, v] of Object.entries(raw)) {
      const m = WT.divRound(v * 3044, days * 100); if (!m) continue;
      byCategory[c] = m;
      if (essentialCategory(c, 'expense')) spNeeds += m; else spWants += m;
    }
    const needsSpending = Math.max(spNeeds, saNeeds);

    // current saving
    const since = WT.addDays(td, -90);
    const goalRecent = Object.values(WT.D.goalTxns || {}).filter(x => x && !x.voided && x.date >= since && x.date <= td).reduce((a, x) => a + (x.amountCents || 0), 0);
    const savingsNow = saSave + Math.max(0, WT.divRound(goalRecent, 3));
    const extraRecent = Object.values(WT.D.debtTxns || {}).filter(x => x && !x.voided && x.type === 'payment' && x.sourceId && x.date >= since && x.date <= td).reduce((a, x) => a - x.amountCents, 0);

    const committed = essentials + debtMinimums;
    const leftover = income - essentials - optionalBills - debtMinimums - needsSpending - spWants - savingsNow;
    const balances = balancesNow();
    const sav = balances.savings;

    // v2: living costs, starter emergency fund, upcoming large bills, goals
    const everyday = needsSpending;
    const living = essentials + everyday;
    const required = living + debtMinimums;
    const free = income - required;
    const shortfall = Math.max(0, -free);
    const starterTarget = Math.min(living, STARTER_CAP);
    const starter = { target: starterTarget, saved: Math.min(sav, starterTarget), gap: Math.max(0, starterTarget - sav) };

    const upcoming = []; let upcomingSetAside = 0;
    const upTo = WT.addDays(td, UPCOMING_DAYS);
    for (const t of Object.values(WT.D.templates || {})) {
      if (!t || t.deleted || !Array.isArray(t.versions) || !t.versions.length) continue;
      for (const o of WT.templateOccurrences(t, td, upTo)) {
        if (!bigCadence(o.v)) continue;
        const inst = WT.D.instances['i_' + t.id + '_' + o.date];
        if (inst && inst.skipped) continue;
        const amount = inst ? WT.instStatus(inst, td).remaining : (o.v.amountCents || 0);
        if (amount < UPCOMING_MIN) continue;
        const oneTime = o.v.frequency === 'once';
        // one-time bills only count in the month they're due, so save toward later ones a little each month
        const monthlySetAside = (oneTime && !t.debtId && WT.monthOf(o.date) > mk) ? Math.ceil(amount / (WT.monthsBetween(mk, WT.monthOf(o.date)) + 1)) : 0;
        upcoming.push({ name: t.name, date: o.date, amount, templateId: t.id, oneTime, debt: !!t.debtId, monthlySetAside });
        upcomingSetAside += monthlySetAside;
      }
    }
    upcoming.sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : y.amount - x.amount);

    const goals = Object.values(WT.D.goals || {}).filter(g => g && !g.archived).map(g => {
      const p = WT.goalProjection(g.id, td);
      return { id: g.id, name: g.name, type: g.type || 'custom', target: g.targetCents || 0, saved: p.saved, left: p.left, targetDate: g.targetDate || null, neededPerMonth: p.neededPerMonth || 0 };
    }).sort((x, y) => (x.targetDate || '9999') < (y.targetDate || '9999') ? -1 : (x.targetDate || '9999') > (y.targetDate || '9999') ? 1 : x.name.localeCompare(y.name));
    const goalsNeeded = goals.filter(g => g.type !== 'emergency').reduce((a, g) => a + g.neededPerMonth, 0);

    const a = {
      month: mk, income, incomeDetail, essentials, optionalBills, debtMinimums, debtTotal, savingsNow,
      spending: { needs: needsSpending, wants: spWants, byCategory, fromExpenses: spNeeds, setAsideNeeds: saNeeds },
      actual: { needs: essentials + needsSpending, debt: debtMinimums + Math.max(0, WT.divRound(extraRecent, 3)), savings: savingsNow, wants: optionalBills + spWants },
      committed, leftover,
      // v2
      everyday, living, required, free, shortfall, feasible: income > 0 && free >= 0,
      balances, starter, upcoming, upcomingSetAside, goals, goalsNeeded,
      paycheckSetAside: incomeDetail.paychecksPerMonth > 0 ? Math.ceil(required / incomeDetail.paychecksPerMonth) : 0,
      // extras (serializable) used by strategies/suggestions
      savingsBalance: sav, emergencySmall: sav < Math.max(essentials, 1),
      highApr: highAprDebts.length > 0, highAprDebts: highAprDebts.map(d => ({ id: d.id, name: d.name, aprCenti: d.aprCenti, balanceCents: d.balanceCents })),
      debts: debts.map(d => debtDetail(d, billsByDebt[d.id])),
      orphanDebtBills,
      debtDataMissing: debts.some(d => !d.minCents || !d.aprCenti),
      optionalList: subscriptions.sort((x, y) => y.monthly - x.monthly), essentialList: essentialBills.sort((x, y) => y.monthly - x.monthly),
      setAsideNames: saNames, notes,
    };
    // v3: set-asides for less-than-monthly bills, emergency fund depth, net worth, missing inputs
    a.annualSetAside = essentialBills.filter(b => b.irregular && !b.oneTime).reduce((t, b) => t + b.monthly, 0);
    a.emergency = { balance: sav, monthsCovered: living > 0 ? Math.round(sav * 10 / living) / 10 : 0, target3: living * 3, target6: living * 6, starterTarget, starterGap: starter.gap };
    a.netWorth = netWorthNow();
    a.savingsAprCenti = savingsRate();
    a.obligationsPct = income > 0 ? Math.round(required * 1000 / income) / 10 : 0;
    a.missing = missingInputs(a);
    a.options = shortfallOptions(a);
    Object.defineProperty(a, 'essentialCategory', { value: (catId, kind) => essentialCategory(catId, kind), enumerable: false });
    return a;
  }

  // Realistic choices when income can't cover living costs + minimums (phrased as options, never assumptions).
  function shortfallOptions(A) {
    if (!(A.shortfall > 0)) return [];
    const o = [];
    const gap = A.shortfall;
    const bigMins = A.debts.slice().sort((x, y) => y.minCents - x.minCents).filter(d => d.minCents > 0).slice(0, 3);
    if (bigMins.length) o.push(`Call your lenders and ask about a hardship plan or a lower minimum payment. Your largest minimums are ${listNames(bigMins.map(d => `${d.name} (${money(d.minCents)})`))}.`);
    if (A.highAprDebts.length) o.push(`Ask your card companies for a lower interest rate. ${A.highAprDebts[0].name} charges ${aprStr(A.highAprDebts[0].aprCenti)} APR.`);
    const bigBills = A.essentialList.slice(0, 3);
    if (bigBills.length) o.push(`Look at your largest bills: ${listNames(bigBills.map(b => `${b.name} (${money(b.monthly)})`))}. Shopping around for insurance or phone plans can lower them.`);
    const ppm = A.incomeDetail.paychecksPerMonth;
    o.push(`Extra income of ${cents(gap)} a month${ppm > 1 ? ` (about ${money(Math.ceil(gap / ppm))} per paycheck)` : ''} would close the gap, for example extra shifts or selling things you don't use.`);
    if (A.optionalBills > 0) {
      const names = A.optionalList.slice(0, 4).map(b => b.name);
      o.push(`If you paused optional bills like ${listNames(names)} (${cents(A.optionalBills)} a month), that would cover ${A.optionalBills >= gap ? 'the whole gap' : cents(A.optionalBills) + ' of it'}. Only if you want to.`);
    }
    if (A.everyday > 0) o.push(`Groceries and gas (${money(A.everyday)} a month) are funded first. If you can spend a little less there, every $50 helps.`);
    if (A.balances && A.balances.savings > 0) o.push(`You have ${cents(A.balances.savings)} in savings. Using some of it for a month is an option, but it isn't a long-term fix.`);
    return o;
  }

  // ---------------------------------------------------------------- feasibility & adjustment
  // feasible (v1 meaning): essential bills and minimums are covered.
  function feasibleOf(A, amounts) { return A.income > 0 && amounts.needs >= A.essentials && amounts.debt >= A.debtMinimums; }
  // realistic (v2): living costs (bills + groceries/gas) and minimums are covered, and the plan fits the income.
  function realisticOf(A, amounts) { return A.income > 0 && amounts.needs >= A.living && amounts.debt >= A.debtMinimums && sum4(amounts) <= A.income; }
  // income below living costs + minimums: keep home, bills, food and gas funded, the rest goes to minimums
  function floorAmounts(A) {
    const needs = Math.min(A.living, A.income);
    return { needs, debt: Math.max(0, A.income - needs), savings: 0, wants: 0 };
  }
  function adjust(A, amounts) {
    if (A.income < A.required) return floorAmounts(A);
    const o = Object.assign({}, amounts);
    let short = 0;
    if (o.needs < A.living) { short += A.living - o.needs; o.needs = A.living; }
    if (o.debt < A.debtMinimums) { short += A.debtMinimums - o.debt; o.debt = A.debtMinimums; }
    short += Math.max(0, sum4(o) - short - A.income); // amounts that were already over income
    // give the shortfall back from what's optional first; never dip below the living/minimum floors
    const room = { wants: () => o.wants, needs: () => o.needs - A.living, savings: () => o.savings, debt: () => o.debt - A.debtMinimums };
    for (const b of ['wants', 'needs', 'savings', 'debt']) { const t = Math.max(0, Math.min(room[b](), short)); o[b] -= t; short -= t; }
    const diff = A.income - sum4(o); if (diff > 0) o.savings += diff; // anything left unassigned is saved
    return o;
  }
  function floorWarnings(A, pct, amounts) {
    const w = [];
    if (A.income <= 0) { w.push('Add your income (a job or paycheck) so Smart Budget can split your take-home pay.'); return w; }
    if (amounts.needs < A.essentials) w.push(`Your essential bills are ${pctOf(A.essentials, A.income)}% of take-home pay (${money(A.essentials)} a month), so ${pct.needs}% for needs isn't realistic.`);
    else if (amounts.needs < A.living) w.push(`Bills plus groceries and gas cost ${money(A.living)} a month, so ${money(amounts.needs)} for needs leaves ${money(A.living - amounts.needs)} of everyday necessities unfunded.`);
    if (amounts.debt < A.debtMinimums) w.push(`Your minimum debt payments are ${money(A.debtMinimums)} a month (${pctOf(A.debtMinimums, A.income)}% of take-home pay), so ${pct.debt}% for debt would miss payments.`);
    return w;
  }
  function shortfallWarning(A) {
    if (A.income <= 0) return 'Add your income (a job or paycheck) so Smart Budget can split your take-home pay.';
    return `Your take-home pay (${cents(A.income)} a month) is ${cents(A.shortfall)} short of your essential bills, groceries and gas (${cents(A.living)}) plus minimum debt payments (${cents(A.debtMinimums)}). This plan funds your home, bills, food and gas first. See the options below.`;
  }

  function allocate(A, pct) {
    const p = normPct(pct);
    const amounts = centsFromPct(A.income, p);
    const feasible = feasibleOf(A, amounts);
    const realistic = realisticOf(A, amounts);
    const warnings = realistic ? [] : floorWarnings(A, p, amounts);
    if (A.income > 0 && A.shortfall > 0) warnings.push(shortfallWarning(A));
    const out = { pct: p, amounts, feasible, realistic, warnings };
    if (!realistic && A.income > 0) { const adj = adjust(A, amounts); out.adjusted = { pct: pctFromCents(adj, A.income), amounts: adj, realistic: realisticOf(A, adj) }; }
    return out;
  }

  // ---------------------------------------------------------------- dollar / percent editor math (no forced 100%)
  function editorResult(A, dollars, pct) {
    const income = Math.max(0, A.income || 0);
    const total = sum4(dollars);
    const unallocated = income - total;
    const warnings = [];
    if (income <= 0) warnings.push('Add your income so Smart Budget can check this plan.');
    else {
      if (total > income) warnings.push(`This plan is ${cents(total - income)} over your take-home pay of ${cents(income)}.`);
      if (dollars.needs < A.living) warnings.push(`Needs is ${cents(A.living - dollars.needs)} below your bills plus groceries and gas (${cents(A.living)}).`);
      if (dollars.debt < A.debtMinimums) warnings.push(`Debt is ${cents(A.debtMinimums - dollars.debt)} below your required minimum payments (${cents(A.debtMinimums)}).`);
    }
    return {
      dollars, pct: pct || rawPct(dollars, income), total, unallocated, over: Math.max(0, -unallocated), warnings,
      realistic: realisticOf(A, dollars), feasible: feasibleOf(A, dollars),
      debtSplit: { minimum: Math.min(dollars.debt, A.debtMinimums || 0), extra: Math.max(0, dollars.debt - (A.debtMinimums || 0)) },
    };
  }
  function fromDollars(A, dollars) { return editorResult(A, cleanDollars(dollars)); }
  function fromPct(A, pct) {
    pct = pct || {};
    const p = {}; const d = {};
    BUCKETS.forEach(b => {
      p[b] = Math.round(num(pct[b]) * 100) / 100;
      d[b] = A.income > 0 ? WT.divRound(A.income * Math.round(p[b] * 1000), 100000) : 0;
    });
    return editorResult(A, d, p);
  }
  // Put the unallocated amount (positive or negative) into one bucket, or spread it over unlocked buckets.
  // Locked buckets are never changed; no bucket goes below $0.
  function distribute(A, dollars, locks, intoKey) {
    const d = cleanDollars(dollars); locks = locks || {};
    let left = Math.max(0, A.income || 0) - sum4(d);
    if (!left) return d;
    if (intoKey && BUCKETS.includes(intoKey)) {
      if (locks[intoKey]) return d;
      d[intoKey] = Math.max(0, d[intoKey] + left);
      return d;
    }
    const open = BUCKETS.filter(b => !locks[b]);
    if (!open.length) return d;
    const w = {}; open.forEach(b => w[b] = d[b]);
    if (left > 0) {
      if (!open.some(b => d[b] > 0)) open.forEach(b => w[b] = 1);
      const add = splitInt(left, w); open.forEach(b => d[b] += add[b]);
    } else {
      const over = Math.min(-left, open.reduce((a, b) => a + d[b], 0));
      const cut = splitInt(over, w); open.forEach(b => d[b] = Math.max(0, d[b] - cut[b]));
    }
    return d;
  }

  // Fill to exactly 100%: the unlocked buckets absorb the difference (in proportion to their amounts) so the
  // total is exactly take-home pay to the cent. Locked buckets never change; nothing goes below $0.
  function fillExactly(A, dollars, locks) {
    const d = cleanDollars(dollars); locks = locks || {};
    const income = Math.max(0, (A && A.income) || 0);
    const open = BUCKETS.filter(b => !locks[b]);
    const diff = income - sum4(d);
    if (diff > 0 && open.length) {
      const w = {}; open.forEach(b => w[b] = d[b]);
      if (!open.some(b => d[b] > 0)) open.forEach(b => w[b] = 1);
      const add = splitInt(diff, w); open.forEach(b => d[b] += add[b]);
    } else if (diff < 0 && open.length) {
      let over = -diff;
      for (let g = 0; g < 8 && over > 0; g++) {
        const live = open.filter(b => d[b] > 0); if (!live.length) break;
        const w = {}; live.forEach(b => w[b] = d[b]);
        const cut = splitInt(Math.min(over, live.reduce((t, b) => t + d[b], 0)), w);
        live.forEach(b => { const c = Math.min(d[b], cut[b]); d[b] -= c; over -= c; });
      }
    }
    const r = editorResult(A || { income: 0 }, d);
    r.exact = income > 0 && sum4(d) === income;
    if (r.exact) r.pct = normPct(d);
    r.locked = BUCKETS.filter(b => !!locks[b]);
    if (!r.exact && income > 0) r.warnings.push(open.length ? 'Locked categories add up to more than your take-home pay, so the plan can\'t total exactly 100%. Unlock a category or lower a locked amount.' : 'Every category is locked. Unlock one so the remaining money has somewhere to go.');
    return r;
  }

  // ---------------------------------------------------------------- personalized plans (amount based)
  // A spending-money floor: about 10% of what's free (enough for subscriptions if that's a bit more), never $0.
  function wantsFloor(A, R) {
    if (R <= 0) return 0;
    return Math.min(R, Math.max(1, Math.round(R * 0.10), Math.min(A.optionalBills, Math.round(R * 0.20))));
  }
  function planner(A) {
    const o = { needs: A.living, debt: A.debtMinimums, savings: 0, wants: 0 };
    const lines = [];
    if (A.essentials) lines.push({ bucket: 'needs', label: 'Essential bills', amount: A.essentials, required: true });
    if (A.everyday) lines.push({ bucket: 'needs', label: 'Everyday needs (groceries, gas)', amount: A.everyday, required: true });
    if (A.debtMinimums) lines.push({ bucket: 'debt', label: 'Required minimum payments', amount: A.debtMinimums, required: true });
    let R = A.free;
    const take = (b, label, c) => { c = Math.max(0, Math.min(R, Math.round(c))); if (c > 0) { o[b] += c; R -= c; const l = lines.find(x => x.label === label && x.bucket === b); if (l) l.amount += c; else lines.push({ bucket: b, label, amount: c }); } return c; };
    return { o, lines, take, left: () => R };
  }
  const L = { fun: 'Spending money', ef: 'Starter emergency fund', up: 'Upcoming one-time bills', goals: 'Savings goals', extra: 'Extra debt payment', save: 'Savings', fullEf: 'Emergency fund (3 months)' };
  function planAmounts(A, kind) {
    if (A.income <= 0) return { amounts: zero(), lines: [] };
    if (A.free < 0) {
      const a = floorAmounts(A); const lines = [];
      const ess = Math.min(A.essentials, a.needs);
      if (ess) lines.push({ bucket: 'needs', label: 'Essential bills', amount: ess, required: true });
      if (a.needs - ess) lines.push({ bucket: 'needs', label: 'Everyday needs (groceries, gas)', amount: a.needs - ess, required: true });
      if (a.debt) lines.push({ bucket: 'debt', label: `Minimum payments (${cents(A.debtMinimums - a.debt)} short)`, amount: a.debt, required: true });
      return { amounts: a, lines };
    }
    const P = planner(A); const { take } = P;
    const hasDebt = A.debts.some(d => d.balanceCents > 0) || A.debtMinimums > 0;
    const R0 = A.free;
    if (kind === 'zero') {
      take('wants', L.fun, wantsFloor(A, R0)); // optional bills are bills too: they get their dollars
      take('savings', L.ef, A.starter.gap);
      take('savings', L.up, A.upcomingSetAside);
      take('savings', L.goals, A.goalsNeeded);
      if (hasDebt) take('debt', L.extra, Math.round(P.left() * (A.highApr ? 0.5 : 0.25)));
      take('savings', L.fullEf, Math.max(0, A.living * 3 - A.balances.savings - A.starter.gap));
      const X = P.left(); const half = Math.round(X / 2);
      take('savings', L.save, half); take('wants', L.fun, X - half);
    }
    const R = P.left(); if (R > 0) take('savings', L.save, R); // every dollar assigned
    return { amounts: P.o, lines: P.lines };
  }

  // ---------------------------------------------------------------- projection
  function makeSim(A) {
    const inputs = A.debts.map(d => ({ id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti, minCents: d.minCents }));
    const cache = new Map();
    return (extra, method) => {
      extra = Math.max(0, extra | 0); method = method === 'snowball' ? 'snowball' : 'avalanche';
      const k = method + ':' + extra;
      if (!cache.has(k)) cache.set(k, WT.simulatePayoff(inputs, extra, method));
      return cache.get(k);
    };
  }
  function projection(A, eff, sim, method) {
    const extra = Math.max(0, eff.debt - A.debtMinimums);
    const out = { savings12: eff.savings * 12, debtPaid12: 0, debtFreeMonths: A.debts.length ? null : 0, debtFreeEstimate: false, interest: 0, spendingMonthly: eff.wants, interestSaved: 0, extraDebt: extra };
    if (!A.debts.length) return out;
    const s = sim(extra, method), base = sim(0);
    const tl = s.timeline; const at12 = tl[Math.min(12, tl.length - 1)];
    out.debtPaid12 = Math.max(0, tl[0] - at12);
    out.debtFreeMonths = s.stuck ? null : s.months;
    out.interest = s.stuck ? null : s.totalInterest;
    out.interestSaved = (!s.stuck && !base.stuck) ? Math.max(0, base.totalInterest - s.totalInterest) : 0;
    // approximate when a debt is missing its APR/minimum, or when this plan can't even cover the minimums
    out.debtFreeEstimate = !!A.debtDataMissing || eff.debt < A.debtMinimums;
    if (eff.debt < A.debtMinimums) out.debtPaid12 = Math.max(0, Math.min(out.debtPaid12, eff.debt * 12));
    return out;
  }
  function fitScore(A, effPct, idealPct, realistic) {
    const l1 = BUCKETS.reduce((a, b) => a + Math.abs((effPct[b] || 0) - (idealPct[b] || 0)), 0); // 0..200
    return Math.max(0, Math.min(100, Math.round(100 - l1 / 2 - (realistic ? 0 : 25))));
  }

  // plain-English risks for a set of amounts
  function risksOf(A, a, proj) {
    const r = [];
    if (A.income <= 0) return ['No income added yet, so this plan can\'t be checked.'];
    const total = sum4(a);
    if (total > A.income) r.push(`Plans ${money(total - A.income)} more than your take-home pay.`);
    if (a.needs < A.essentials) r.push(`Leaves ${money(A.essentials - a.needs)} of essential bills unpaid.`);
    else if (a.needs < A.living) r.push(`Leaves ${money(A.living - a.needs)} short for groceries, gas and other everyday needs.`);
    if (a.debt < A.debtMinimums) r.push(`Misses ${money(A.debtMinimums - a.debt)} of required minimum payments. That can mean late fees and credit damage.`);
    if (A.starter.gap > 0 && a.savings === 0) r.push('No emergency savings. A surprise bill could end up on a credit card.');
    if (A.highApr && a.debt <= A.debtMinimums) {
      const top = A.highAprDebts[0];
      r.push(`${top.name} (${aprStr(top.aprCenti)} APR) keeps charging about ${money(WT.monthlyInterest(top.balanceCents, top.aprCenti))} a month in interest.`);
    }
    if (a.debt > A.debtMinimums && A.starter.gap > 0 && a.savings < A.starter.gap) r.push('Puts extra toward debt before your starter emergency fund is built.');
    if (A.optionalBills > 0 && a.wants < A.optionalBills) r.push(`Your subscriptions and optional bills (${money(A.optionalBills)}) cost more than the ${money(a.wants)} for wants.`);
    else if (a.wants === 0 && A.free > 0) r.push('No spending money at all is hard to stick to.');
    if (A.goalsNeeded > 0 && a.savings < A.goalsNeeded) r.push(`Your goals need about ${money(A.goalsNeeded)} a month to finish on time.`);
    if (proj && A.debts.length && proj.debtFreeMonths == null) r.push('At this pace your debt may never be paid off.');
    return r;
  }

  // ---------------------------------------------------------------- explanations
  function whyZero(A, s) {
    if (A.income <= 0) return 'Gives every dollar of your pay a job. Add your income to see it.';
    if (A.free < 0) return `Every dollar is already needed: you're ${cents(A.shortfall)} short of bills, groceries, gas and minimums.`;
    return `Every dollar of your ${money(A.income)} has a job: ${s.lines.map(l => `${l.label.toLowerCase()} ${money(l.amount)}`).join(', ')}. Nothing is left unassigned.`;
  }
  function whyNamed(A, st) {
    if (st.id === 'zero') return whyZero(A, st);
    if (A.income <= 0) return st.summary + ' Add your take-home pay to see it in dollars.';
    if (A.free < 0) return `${st.summary} Right now your pay is ${cents(A.shortfall)} short of bills, groceries, gas and minimums, so every plan funds those first and nothing is left for extra debt, savings or spending.`;
    const a = st.amounts; const extra = Math.max(0, a.debt - A.debtMinimums);
    return `${st.summary} For you: ${money(a.needs)} essentials, ${money(a.debt)} debt (${money(Math.min(a.debt, A.debtMinimums))} minimums${extra ? ` + ${money(extra)} extra` : ''}), ${money(a.savings)} savings and ${money(a.wants)} spending money.`;
  }

  // ---------------------------------------------------------------- named strategies (v3)
  // Ids are stable. Old saved ids keep working: debt -> aggressive, savings -> pay-first, 60-20-20 -> balanced.
  const STRATEGY_IDS = ['avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced', 'custom'];
  const NAMED = STRATEGY_IDS.filter(x => x !== 'custom');
  const ALIASES = { debt: 'aggressive', savings: 'pay-first', '60-20-20': 'balanced' };
  const HORIZONS = [6, 12, 36, 60];
  function resolveId(id) { const k = String(id == null ? '' : id); return Object.prototype.hasOwnProperty.call(ALIASES, k) ? ALIASES[k] : k; }
  // Example percentages are the owner's illustrative table: never mandatory, always personalized below.
  const DEFS = {
    avalanche: {
      example: { needs: 50, debt: 30, savings: 15, wants: 5 }, debtOrder: 'avalanche', ef: 0.5, priority: ['debt', 'savings', 'wants'], leftover: 'debt',
      summary: 'Pay every minimum, then put extra debt money on the highest interest rate first.',
      benefits: ['Usually the lowest total interest of any payoff order.', 'Every extra dollar goes where it is charged the most.', 'Keeps building a small emergency reserve while you pay down debt.'],
      drawbacks: ['The first payoff can take a while when the highest-rate debt is large.', 'Less money for savings and spending while debts remain.'],
    },
    snowball: {
      example: { needs: 50, debt: 30, savings: 15, wants: 5 }, debtOrder: 'snowball', ef: 0.5, priority: ['debt', 'savings', 'wants'], leftover: 'debt',
      summary: 'Pay every minimum, then put extra debt money on the smallest balance first.',
      benefits: ['Quick wins: small balances disappear first, which keeps many people motivated.', 'Each paid-off debt frees its payment for the next one.', 'Keeps building a small emergency reserve while you pay down debt.'],
      drawbacks: ['Often costs more interest than Avalanche when a large balance has a high rate.', 'Less money for savings and spending while debts remain.'],
    },
    '50-30-20': {
      example: { needs: 40, debt: 20, savings: 10, wants: 30 }, debtOrder: null,
      summary: 'Half of your pay for needs and minimum payments, 30% for wants, and 20% for savings and extra debt payments.',
      benefits: ['Simple and well known.', 'Leaves real spending money, which makes it easier to stick to.', 'Builds savings and pays down debt at the same time.'],
      drawbacks: ['Hard to follow when needs and minimums take more than half of your pay.', 'Pays off debt more slowly than a debt-focused plan.'],
    },
    zero: {
      example: { needs: 55, debt: 20, savings: 15, wants: 10 }, debtOrder: null, noFixedPct: true,
      summary: 'Give every dollar of your pay a job until nothing is left unassigned. There are no fixed percentages.',
      benefits: ['Nothing is left unplanned, so it is easy to see where money goes.', 'Follows your real bills, goals and upcoming expenses each month.', 'Works well with irregular income: plan the money you actually have.'],
      drawbacks: ['Takes more time to plan each month.', 'A surprise expense means moving money between categories.'],
    },
    'pay-first': {
      example: { needs: 50, debt: 10, savings: 30, wants: 10 }, debtOrder: null, ef: 1, priority: ['savings', 'wants', 'debt'], leftover: 'savings',
      summary: 'Move money to savings as soon as you are paid, then budget the rest.',
      benefits: ['Savings grow first, before spending can eat into them.', 'Builds an emergency fund quickly.', 'A good fit when income is steady and debt is low.'],
      drawbacks: ['High-interest debt can cost more than savings earn.', 'Less flexible spending money.'],
    },
    aggressive: {
      example: { needs: 50, debt: 35, savings: 10, wants: 5 }, debtOrder: null, ef: 0.2, priority: ['debt', 'savings', 'wants'], leftover: 'debt',
      summary: 'Put as much as possible toward debt after essentials, keeping only a thin cushion for savings and spending.',
      benefits: ['The fastest way to become debt-free.', 'Saves the most interest.', 'Frees up your minimum payments sooner.'],
      drawbacks: ['Very little spending money, which can be hard to keep up.', 'A thin emergency cushion: a surprise bill may end up on a card.'],
    },
    balanced: {
      example: { needs: 50, debt: 20, savings: 20, wants: 10 }, debtOrder: null, ef: 0.5, proportional: true, leftover: 'even',
      summary: 'Split what is left after essentials between paying down debt and building savings, with some spending money.',
      benefits: ['Progress on debt and savings at the same time.', 'Builds a cushion while interest costs go down.', 'A steady plan that is easy to keep.'],
      drawbacks: ['Pays off debt more slowly than Avalanche or Aggressive.', 'Savings grow more slowly than Pay Yourself First.'],
    },
    custom: {
      example: null, debtOrder: null,
      summary: 'Your own amounts for each category. Start from any plan and change the dollars or percentages.',
      benefits: ['Fits exactly how you want to spend and save.', 'You can lock categories you don\'t want changed.'],
      drawbacks: ['Nothing balances it for you: keep essentials and minimum payments covered.'],
    },
  };
  const EXAMPLES = {}; STRATEGY_IDS.forEach(id => EXAMPLES[id] = DEFS[id].example ? clone(DEFS[id].example) : null);
  Object.assign(NAMES, { avalanche: 'Debt Avalanche', snowball: 'Debt Snowball', '50-30-20': '50/30/20', zero: 'Zero-Based', 'pay-first': 'Pay Yourself First', aggressive: 'Aggressive Debt Payoff', balanced: 'Balanced Wealth Building' });
  Object.assign(KINDS, { avalanche: 'Highest interest first', snowball: 'Smallest balance first', 'pay-first': 'Savings first', aggressive: 'Debt payoff', balanced: 'Debt and savings' });

  // per-analysis cache (A objects are fresh for each analyze() call)
  const CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function cacheOf(A) { if (!CACHE || !A || typeof A !== 'object') return {}; let c = CACHE.get(A); if (!c) { c = {}; CACHE.set(A, c); } return c; }

  // Strategy with example percentages: required costs first, then the strategy's priorities on the free money.
  // Needs never gets more than real living costs (no padding); a missing debt sends its share to savings.
  function examplePlan(A, def) {
    const P = planner(A); const { take } = P; const I = A.income; const R0 = A.free;
    const hasDebt = A.debts.length > 0;
    const tgt = b => Math.round(I * def.example[b] / 100);
    take('wants', L.fun, wantsFloor(A, R0));
    take('savings', L.up, A.upcomingSetAside);
    take('savings', L.ef, hasDebt ? Math.min(A.starter.gap, Math.round(P.left() * def.ef)) : A.starter.gap);
    const into = b => (b === 'debt' && !hasDebt) ? 'savings' : b;
    const give = (b, c) => {
      b = into(b);
      if (b === 'savings') { const g = Math.max(0, Math.min(c, A.goalsNeeded - (P.lines.find(l => l.label === L.goals) || { amount: 0 }).amount)); take('savings', L.goals, g); take('savings', L.save, c - g); }
      else take(b, b === 'debt' ? L.extra : L.fun, c);
    };
    const wantOf = b => Math.max(0, tgt(b) - P.o[b]);
    if (def.proportional) {
      const w = {}; ['debt', 'savings', 'wants'].forEach(b => w[b] = wantOf(b));
      const tot = w.debt + w.savings + w.wants;
      const sp = splitInt(Math.min(P.left(), tot), w);
      ['debt', 'savings', 'wants'].forEach(b => give(b, sp[b]));
    } else for (const b of def.priority) give(b, wantOf(b));
    const X = P.left();
    if (X > 0) {
      if (def.leftover === 'even') { if (hasDebt) { const h = Math.round(X / 2); take('debt', L.extra, h); take('savings', L.save, X - h); } else take('savings', L.save, X); }
      else give(def.leftover, X);
    }
    return { amounts: P.o, lines: P.lines };
  }
  // 50/30/20 on real numbers: needs + minimums are "the 50%" (counted once), wants up to 30%, the rest
  // (the 20% plus anything the 50% didn't need) is split between savings and extra debt.
  function plan503020(A) {
    const P = planner(A); const { take } = P; const I = A.income; const F = A.free;
    const hasDebt = A.debts.length > 0;
    const half = Math.round(I * 0.5), wantsT = Math.round(I * 0.3);
    const slack = half - A.required;
    let wants = Math.min(wantsT, F);
    if (slack < 0) wants = Math.min(F, Math.max(wantsFloor(A, F), wantsT + slack));
    take('wants', L.fun, Math.max(0, wants));
    const pot = P.left();
    const debtShare = hasDebt ? Math.floor(pot / 2) : 0;
    take('debt', L.extra, debtShare);
    take('savings', L.up, A.upcomingSetAside);
    take('savings', L.ef, A.starter.gap);
    take('savings', L.goals, A.goalsNeeded);
    take('savings', L.save, P.left());
    return { amounts: P.o, lines: P.lines };
  }

  function leftoverWord(id, A) {
    const hasDebt = A.debts.length > 0;
    const def = DEFS[id];
    if (!def || !def.leftover) return 'savings';
    if (def.leftover === 'even') return hasDebt ? 'savings and extra debt payments' : 'savings';
    return def.leftover === 'debt' && hasDebt ? 'extra debt payments' : 'savings';
  }
  // what changed vs the example percentages, and why (only real differences of 1 point or more)
  function modificationsOf(A, id, def, a) {
    const m = []; const I = A.income;
    if (!(I > 0) || !def.example) return m;
    const pc = c => Math.round(c * 1000 / I) / 10;
    if (A.free < 0) { m.push(`Your take-home pay is ${cents(A.shortfall)} short of essentials and minimum payments, so every dollar goes to them first and nothing is left for the rest of this plan.`); return m; }
    const ex = def.example;
    if (!A.debts.length && ex.debt > 0 && id !== 'zero') m.push(`You have no debt, so the example's ${ex.debt}% for debt goes to savings.`);
    if (def.noFixedPct) return m;
    if (id === '50-30-20') {
      const req = pc(A.required);
      if (req > 50.5) m.push(`Your needs and minimum payments take ${req}% of your pay, more than 50%, so wants and savings are smaller than 30% and 20%.`);
      else if (req < 49.5) m.push(`Your needs and minimum payments take ${req}%, less than 50%. The other ${round1(50 - req)}% goes to savings${A.debts.length ? ' and extra debt payments' : ''} instead of padding Essentials.`);
      if (A.debts.length && pc(A.debtMinimums) > 10.5) m.push(`Your required minimum payments alone are ${pc(A.debtMinimums)}% of your pay (the example assumes 10%).`);
    } else {
      const liv = pc(A.living);
      if (liv > ex.needs + 0.5) m.push(`Your essentials and everyday costs take ${liv}% of your pay, more than the example's ${ex.needs}%, so other categories get less.`);
      else if (liv < ex.needs - 0.5) m.push(`Your essentials and everyday costs take ${liv}%, less than the example's ${ex.needs}%. The difference goes to ${leftoverWord(id, A)} instead of padding Essentials.`);
      if (A.debts.length && pc(A.debtMinimums) > ex.debt + 0.5) m.push(`Your required minimum payments alone are ${pc(A.debtMinimums)}% of your pay, more than the example's ${ex.debt}% for debt.`);
    }
    if (pc(a.wants) < ex.wants - 1) m.push(`Spending money is ${pc(a.wants)}% instead of ${ex.wants}% so your required costs fit.`);
    if (pc(a.savings) < ex.savings - 1) m.push(`Savings is ${pc(a.savings)}% instead of ${ex.savings}%.`);
    return m;
  }

  function topApr(A) { return A.debts.slice().sort((x, y) => y.aprCenti - x.aprCenti || x.balanceCents - y.balanceCents)[0] || null; }
  function smallest(A) { return A.debts.slice().sort((x, y) => x.balanceCents - y.balanceCents || y.aprCenti - x.aprCenti)[0] || null; }
  // why this plan may or may not work for THIS user
  function fitOf(A, st) {
    if (A.income <= 0) return 'Add your take-home pay to see how this plan fits you.';
    if (A.free < 0) return `Not workable yet: your pay is ${cents(A.shortfall)} short of essentials and minimum payments. Every plan has to cover those first.`;
    const a = st.amounts; const extra = Math.max(0, a.debt - A.debtMinimums); const hasDebt = A.debts.length > 0;
    const sav = A.balances.savings; const months = A.emergency.monthsCovered;
    const top = topApr(A), small = smallest(A);
    switch (st.id) {
      case 'avalanche': {
        if (!hasDebt) return 'You have no debts, so there is nothing to put in order. This works like a savings plan.';
        let s = top.aprCenti ? `Your highest rate is ${top.name} at ${aprStr(top.aprCenti)} APR, so extra payments there save the most interest.` : 'None of your debts has an interest rate entered, so the order can\'t be based on interest yet.';
        if (A.debtDataMissing) s += ' Some debts are missing details, so the order is partly a guess.';
        if (A.starter.gap > 0) s += ` It keeps building your starter emergency fund (${money(A.starter.gap)} to go) at the same time.`;
        return s;
      }
      case 'snowball': {
        if (!hasDebt) return 'You have no debts, so there is nothing to put in order. This works like a savings plan.';
        const pay = extra + (small.minCents || 0);
        const n = pay > 0 ? Math.ceil(small.balanceCents / pay) : null;
        return `Your smallest balance is ${small.name} (${cents(small.balanceCents)}).` + (extra > 0 && n ? ` With ${money(extra)} extra a month it could be gone in about ${plural(n, 'month')}.` : ' With no extra money it is paid at the minimum only.');
      }
      case '50-30-20': {
        const req = A.obligationsPct;
        return `Your needs and minimum payments are ${req}% of your pay` + (req > 50 ? ', above the 50% this rule expects, so it only works in a reduced form.' : ', within the 50% this rule expects.');
      }
      case 'zero': return `Every dollar of your ${money(A.income)} gets a job.` + (A.incomeDetail.irregular ? ' That helps because your income changes from month to month.' : '') + (A.obligationsPct >= 75 ? ` With ${A.obligationsPct}% of your pay already committed, planning every dollar keeps bills covered first.` : '');
      case 'pay-first': {
        let s = `Saves ${money(a.savings)} a month first. You have ${cents(sav)} saved, about ${months} months of essentials.`;
        if (A.highApr) s += ` Your ${A.highAprDebts[0].name} charges ${aprStr(A.highAprDebts[0].aprCenti)} APR, likely more than savings earn.`;
        return s;
      }
      case 'aggressive': {
        if (!hasDebt) return 'You have no debt, so this works like Pay Yourself First.';
        let s = `Puts ${money(extra)} extra a month toward debt on top of your minimums.`;
        if (months < 1) s += ` Your emergency savings are ${cents(sav)}, so a surprise bill could set you back.`;
        return s;
      }
      case 'balanced':
        return hasDebt ? `Puts ${money(extra)} toward extra debt payments and ${money(a.savings)} toward savings each month.` : `Saves ${money(a.savings)} a month and keeps ${money(a.wants)} for spending.`;
      default: return '';
    }
  }

  // payoff order and schedule from WTPlan.debtPlans (avalanche/snowball differ only here)
  function payoffOf(A, extra, method) {
    if (!A.debts.length) return null;
    const C = cacheOf(A); C.payoff = C.payoff || {};
    method = method === 'snowball' ? 'snowball' : 'avalanche';
    const k = method + ':' + extra;
    if (C.payoff[k] !== undefined) return C.payoff[k];
    let out = null;
    const PL = ext('WTPlan', './smartplan.js', 'debtPlans');
    if (PL) {
      try {
        const r = PL.debtPlans({ extra: Math.max(0, extra | 0), method });
        const m = r && r.methods && r.methods[method];
        if (m) out = { method, source: 'WTPlan', months: m.months, payoffDate: m.payoffDate, totalInterest: m.totalInterest, interestSaved: m.interestSaved, neverPaysOff: !!m.neverPaysOff, estimate: !!m.estimate, order: m.order.map(x => ({ id: x.id, name: x.name, balance: x.balance, apr: x.apr, payoffMonth: x.payoffMonth, payoffDate: x.payoffDate })) };
      } catch (e) { out = null; }
    }
    if (!out) {
      const s = WT.simulatePayoff(A.debts.map(d => ({ id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti, minCents: d.minCents })), extra, method);
      out = { method, source: 'core', months: s.months, payoffDate: null, totalInterest: s.totalInterest, interestSaved: null, neverPaysOff: !!s.stuck, estimate: true, order: s.debts.slice().sort((x, y) => (x.paidOffMonth || 1e9) - (y.paidOffMonth || 1e9)).map(x => ({ id: x.id, name: x.name, balance: null, apr: x.apr, payoffMonth: x.paidOffMonth, payoffDate: null })) };
    }
    C.payoff[k] = out;
    return out;
  }

  // shared fields for every strategy (old v2 fields + v3)
  function finish(A, st, sim) {
    const eff = st.adjusted ? st.adjusted : st;
    st.realistic = realisticOf(A, st.amounts);
    st.feasible = feasibleOf(A, st.amounts);
    st.projection = projection(A, eff.amounts, sim, st.debtOrder);
    st.debtSplit = { minimum: Math.min(eff.amounts.debt, A.debtMinimums), extra: Math.max(0, eff.amounts.debt - A.debtMinimums) };
    st.disposable = Math.max(0, eff.amounts.wants - A.optionalBills);
    st.annualSavings = eff.amounts.savings * 12;
    st.risks = risksOf(A, st.amounts, st.projection);
    if (st.adjusted) st.adjusted.risks = risksOf(A, st.adjusted.amounts, st.projection);
    if (st.unallocated == null) st.unallocated = A.income - sum4(st.amounts);
    st.payoff = A.debts.length ? payoffOf(A, st.debtSplit.extra, st.debtOrder) : null;
    st.base = base(A);
    return st;
  }
  function namedStrategy(A, id) {
    const def = DEFS[id];
    const pa = (A.income <= 0 || A.free < 0 || id === 'zero') ? planAmounts(A, 'zero') : id === '50-30-20' ? plan503020(A) : examplePlan(A, def);
    const amounts = pa.amounts;
    const st = {
      id, name: NAMES[id], kind: KINDS[id], summary: def.summary, example: clone(def.example), exampleAmounts: centsFromPct(A.income, def.example),
      noFixedPct: !!def.noFixedPct, amounts, pct: pctFromCents(amounts, A.income, def.example), lines: pa.lines, debtOrder: def.debtOrder || null,
      aliases: Object.keys(ALIASES).filter(k => ALIASES[k] === id), warnings: [],
    };
    if (A.income > 0 && A.shortfall > 0) { st.warnings.push(shortfallWarning(A)); st.options = A.options.slice(); }
    if (A.income > 0 && !A.debts.length && (id === 'avalanche' || id === 'snowball' || id === 'aggressive')) st.warnings.push(`You have no debts to pay off, so this plan works like ${id === 'aggressive' ? 'Pay Yourself First' : 'a savings plan'}.`);
    if (id === 'zero') st.unallocated = A.income - sum4(amounts);
    st.modifications = modificationsOf(A, id, def, amounts);
    st.modified = st.modifications.length > 0;
    st.benefits = def.benefits.slice(); st.drawbacks = def.drawbacks.slice();
    st.why = whyNamed(A, st);
    st.fit = fitOf(A, st);
    return st;
  }
  function namedCore(A) {
    const C = cacheOf(A); if (C.named) return C.named;
    const sim = makeSim(A);
    const list = NAMED.map(id => finish(A, namedStrategy(A, id), sim));
    const av = list.find(s => s.id === 'avalanche'), sn = list.find(s => s.id === 'snowball');
    if (av.payoff && sn.payoff && !av.payoff.neverPaysOff && !sn.payoff.neverPaysOff && A.free >= 0) {
      const diff = sn.payoff.totalInterest - av.payoff.totalInterest;
      sn.interestVsAvalanche = diff;
      if (diff > 0) sn.fit += ` For you it costs about ${money(diff)} more interest than Avalanche.`;
      else if (A.debts.length > 1) sn.fit += ' For you it costs no more interest than Avalanche.';
      av.interestVsSnowball = -diff;
    }
    C.named = list;
    return list;
  }

  // ---------------------------------------------------------------- recommendation engine
  // tie-break: lower interest / more stability first
  const PICK_ORDER = ['avalanche', 'balanced', 'pay-first', 'zero', 'snowball', 'aggressive', '50-30-20'];
  function cashTiming(A, st) {
    const PL = ext('WTPlan', './smartplan.js', 'paycheckPlan');
    if (!PL || !st || A.income <= 0) return [];
    try {
      const p = PL.paycheckPlan({ count: 4, strategy: st, analysis: A });
      return ((p && p.paychecks) || []).filter(x => x && (x.shortfall > 0 || x.reserveIn > 0)).map(x => ({ date: x.date, shortfall: x.shortfall || 0, reserveIn: x.reserveIn || 0 }));
    } catch (e) { return []; }
  }
  function recommend(A) {
    A = A || analyze();
    const C = cacheOf(A); if (C.rec) return clone(C.rec);
    const named = namedCore(A);
    const by = id => named.find(s => s.id === id);
    const I = A.income; const hasDebt = A.debts.length > 0;
    const score = {}; NAMED.forEach(id => score[id] = 50);
    const factors = [];
    const add = (label, value, effect, deltas) => { factors.push({ label, value, effect }); Object.keys(deltas || {}).forEach(k => score[k] += deltas[k]); };
    const sav = A.balances.savings, months = A.emergency.monthsCovered;

    // A. income
    if (I > 0) {
      const src = A.incomeDetail.sources;
      add('Take-home pay', `${cents(I)} a month`, src.length > 1 ? `From ${src.length} income sources, converted to a monthly amount.` : 'Converted to a monthly amount from your pay schedule.');
      if (A.incomeDetail.irregular) add('Income changes month to month', A.incomeDetail.variability.extraMonthly > 0 ? `about ${money(A.incomeDetail.variability.extraMonthly)} a month of extra income on average` : 'recorded paychecks vary', 'Favors Zero-Based and Pay Yourself First: plan the money you actually have and keep a buffer. Extra income is not counted until it arrives.', { zero: 10, 'pay-first': 10, aggressive: -10 });
      A.incomeDetail.changes.forEach(c => factors.push({ label: c.type === 'ends' ? 'Income ending' : 'New income', value: `${c.name} ${c.type} ${WT.shortDate(c.date)} (${money(c.monthly)} a month)`, effect: c.type === 'ends' ? 'Plan for less income after that date.' : 'Not counted until it starts.' }));
    } else add('Take-home pay', 'not added yet', 'Without income no plan can be checked or recommended.');
    // B. essentials and obligations
    if (I > 0) {
      const obl = A.obligationsPct;
      if (A.free < 0) add('Expenses are more than income', `${cents(A.shortfall)} short each month`, 'Stability first: essentials and minimums are funded before anything else. Zero-Based assigns every dollar.', { zero: 30 });
      else if (obl >= 75) add('Essentials and minimum payments', `${obl}% of your pay`, 'High fixed costs: stability first. Favors Zero-Based, which plans every dollar; less room for aggressive goals.', { zero: 20, 'pay-first': -10, aggressive: -10, '50-30-20': -5 });
      else factors.push({ label: 'Essentials and minimum payments', value: `${obl}% of your pay`, effect: obl <= 50 ? 'Leaves plenty of room for savings, debt and goals.' : 'Leaves a moderate amount for savings, debt and spending.' });
    }
    if (A.annualSetAside > 0) factors.push({ label: 'Bills that are not monthly', value: `${cents(A.annualSetAside)} a month set aside`, effect: 'Counted in Essentials as a monthly set-aside so the full bill is ready when it is due.' });
    // C. debt
    if (!hasDebt) add('Debt', 'No open debts', 'Favors saving and wealth building: Pay Yourself First and Balanced.', { avalanche: -60, snowball: -60, aggressive: -60, 'pay-first': 20 + (A.incomeDetail.irregular ? 0 : 5), balanced: 15, '50-30-20': 5 });
    else {
      const top = topApr(A);
      const total = A.debts.reduce((t, d) => t + d.balanceCents, 0);
      factors.push({ label: 'Debt balances', value: `${cents(total)} across ${plural(A.debts.length, 'debt')}`, effect: `Minimum payments are ${cents(A.debtMinimums)} a month.` });
      if (A.highApr) add('Highest interest rate', `${top.name}: ${aprStr(top.aprCenti)} APR`, 'High-interest debt usually costs more than savings earn. Favors Debt Avalanche (highest rate first).', { avalanche: 30, aggressive: 15, snowball: 10, 'pay-first': -10, '50-30-20': -5 });
      else add('Interest rates', top && top.aprCenti ? `highest ${aprStr(top.aprCenti)} APR` : 'no rates entered', 'No high-interest debt: a mix of saving and paying down debt works well.', { balanced: 20, '50-30-20': 10, avalanche: 10, 'pay-first': 5 });
      const av = by('avalanche').payoff, sn = by('snowball').payoff;
      if (A.debts.length >= 3 && av && sn && !av.neverPaysOff && !sn.neverPaysOff && A.free >= 0) {
        const diff = sn.totalInterest - av.totalInterest;
        if (diff <= Math.max(10000, Math.round(av.totalInterest * 0.02))) add('Avalanche vs Snowball', `Snowball costs ${cents(Math.max(0, diff))} more interest`, 'The difference is small, so Snowball\'s quick wins may be worth it.', { snowball: 20 });
        else factors.push({ label: 'Avalanche vs Snowball', value: `Snowball would cost ${cents(diff)} more interest`, effect: 'Avalanche saves noticeably more, so it ranks higher.' });
      }
      const revolving = A.debts.filter(d => d.revolving).length;
      if (revolving) factors.push({ label: 'Credit cards', value: plural(revolving, 'card'), effect: 'Card balances revolve: the minimum falls as the balance falls, so paying only the minimum takes much longer. Loans keep a fixed payment.' });
      if (A.debtDataMissing) factors.push({ label: 'Missing debt details', value: plural(A.debts.filter(d => !d.aprCenti || !d.minCents).length, 'debt'), effect: 'Payoff dates and interest are estimates until the APR and minimum are added.' });
    }
    // D. savings
    if (A.starter.gap > 0) add('Emergency savings', `${cents(sav)} saved (${months} months of essentials)`, hasDebt ? 'Low savings: keep building a small reserve while paying debt. Aggressive Payoff leaves too thin a cushion.' : 'Low savings: build the emergency fund first.', hasDebt ? { aggressive: -15, avalanche: 5, snowball: 5, 'pay-first': A.highApr ? 0 : 15 } : { 'pay-first': 15 });
    else if (months >= 3 && hasDebt && A.highApr) add('Emergency savings', `${cents(sav)} saved (${months} months of essentials)`, 'A solid emergency fund means extra money can go to high-interest debt.', { aggressive: 20 });
    else factors.push({ label: 'Emergency savings', value: `${cents(sav)} saved (${months} months of essentials)`, effect: months >= 3 ? 'A healthy cushion.' : 'The starter fund is covered; building toward 3 months of essentials is a good next step.' });
    const upc = A.upcoming.filter(u => !u.debt);
    if (upc.length) add('Upcoming large bills', `${plural(upc.length, 'bill')} in the next ${UPCOMING_DAYS} days (${cents(upc.reduce((t, u) => t + u.amount, 0))})`, 'Money is set aside for them first.', { zero: 5, 'pay-first': 5 });
    if (A.goals.some(g => g.type !== 'emergency' && g.left > 0)) factors.push({ label: 'Savings goals', value: `${cents(A.goalsNeeded)} a month needed to finish on time`, effect: 'Included in savings where the plan has room.' });
    // E. net worth
    if (A.netWorth) factors.push({ label: 'Net worth', value: `${cents(A.netWorth.netWorth)}${A.netWorth.estimate ? ' (estimate)' : ''}${A.netWorth.demo ? ' (demo)' : ''}`, effect: 'Savings added and debt paid down both raise it.' });
    // plans that had to change a lot from their example rank lower
    named.forEach(s => { if (s.modified && !s.noFixedPct) score[s.id] -= Math.min(12, 4 * s.modifications.length); });

    const ranking = named.map(s => ({ id: s.id, score: score[s.id], realistic: !!s.realistic })).sort((a, b) => (b.realistic - a.realistic) || b.score - a.score || PICK_ORDER.indexOf(a.id) - PICK_ORDER.indexOf(b.id));
    const candidates = ranking.filter(r => r.realistic);
    const pick = by(candidates.length ? candidates[0].id : 'zero');

    // F. cash-flow timing for the picked plan
    const timing = cashTiming(A, pick);
    timing.filter(t => t.shortfall > 0).forEach(t => factors.push({ label: 'Paycheck timing', value: `${WT.shortDate(t.date)} paycheck ${cents(t.shortfall)} short`, effect: 'Bills due on that paycheck are more than it brings in. Hold money back from an earlier paycheck.' }));

    const missing = A.missing.slice();
    let confidence = missing.some(m => m.critical) ? 'low' : missing.length ? 'medium' : 'high';
    if (confidence === 'high' && candidates.length > 1 && candidates[0].score - candidates[1].score < 5) confidence = 'medium';
    const showBadge = confidence !== 'low' && !!pick.realistic;

    const rec = {
      id: pick.id, name: pick.name, reason: reasonFor(A, pick, confidence, by), factors, howCalculated: howCalc(A, pick),
      benefits: benefitsFor(A, pick), drawbacks: pick.drawbacks.concat(pick.risks.slice(0, 2)), improve: improveFor(A, pick, timing),
      confidence, missing: missing.map(m => m.detail), missingInputs: missing, showBadge, realistic: !!pick.realistic,
      scores: score, ranking, cashflow: timing, shortfall: A.shortfall, demo: !!(A.netWorth && A.netWorth.demo),
    };
    C.rec = rec;
    return clone(rec);
  }
  function reasonFor(A, s, confidence, by) {
    const I = A.income;
    if (I <= 0) return 'Not enough information yet: add your take-home pay to get a recommendation. Until then no plan is called best.';
    if (A.free < 0) return `Your take-home pay (${cents(I)} a month) is ${cents(A.shortfall)} short of your essentials (${cents(A.living)}) and minimum payments (${cents(A.debtMinimums)}). ${s.name} is suggested because every dollar has to be planned: fund your home, bills, food and gas first, then as much of the minimums as possible. No plan can be called best until the gap is closed.`;
    const a = s.amounts; const extra = Math.max(0, a.debt - A.debtMinimums);
    const top = topApr(A), small = smallest(A);
    const total = A.debts.reduce((t, d) => t + d.balanceCents, 0);
    let r;
    switch (s.id) {
      case 'avalanche': r = `Recommended Strategy: Debt Avalanche. Based on your recorded debt balances (${cents(total)}), interest rates (highest: ${top.name} at ${aprStr(top.aprCenti)} APR), income (${cents(I)} a month) and essential expenses (${cents(A.living)}), this method may help reduce interest costs while keeping every required monthly payment.` + (A.starter.gap > 0 && a.savings > 0 ? ` It also keeps ${money(a.savings)} a month going to savings while your emergency fund is small.` : ''); break;
      case 'snowball': { const d = by('snowball').interestVsAvalanche; r = `Recommended Strategy: Debt Snowball. You have ${plural(A.debts.length, 'debt')} and paying the smallest first (${small.name}, ${cents(small.balanceCents)}) costs only about ${cents(Math.max(0, d || 0))} more interest than Avalanche, while giving you quicker wins.`; break; }
      case 'pay-first': r = `Recommended Strategy: Pay Yourself First. With ${A.debts.length ? 'no high-interest debt' : 'no debt'} and ${cents(A.balances.savings)} in savings (${A.emergency.monthsCovered} months of essentials), saving ${money(a.savings)} a month first builds your safety net.`; break;
      case 'balanced': r = `Recommended Strategy: Balanced Wealth Building. ${A.debts.length ? `Your debts have moderate interest rates (highest ${aprStr(top.aprCenti)} APR), so splitting the ${money(A.free)} left after essentials between extra payments (${money(extra)}) and savings (${money(a.savings)}) makes progress on both.` : `With no debt, the ${money(A.free)} left after essentials goes to savings (${money(a.savings)}) with ${money(a.wants)} for spending.`}`; break;
      case 'zero': r = `Recommended Strategy: Zero-Based. ${A.incomeDetail.irregular ? 'Your income changes from month to month, so planning every dollar you actually receive keeps bills covered.' : `Your essentials and minimum payments take ${A.obligationsPct}% of your ${cents(I)} take-home pay, so planning every dollar keeps bills covered first.`}`; break;
      case 'aggressive': r = `Recommended Strategy: Aggressive Debt Payoff. You already have ${A.emergency.monthsCovered} months of essentials saved, so ${money(extra)} extra a month can go to debt, starting with ${top.name} (${aprStr(top.aprCenti)} APR).`; break;
      case '50-30-20': r = `Recommended Strategy: 50/30/20. Your needs and minimum payments take ${A.obligationsPct}% of your pay, so the classic split fits with ${money(a.wants)} for wants and ${money(a.savings + extra)} for savings and extra debt payments.`; break;
      default: r = `Recommended Strategy: ${s.name}.`;
    }
    if (confidence === 'low') r = 'Starting point only, because key information is missing. ' + r;
    else if (confidence === 'medium' && A.missing.length) r += ' Some details are missing, so treat the numbers as estimates.';
    return r;
  }
  function howCalc(A, s) {
    const I = A.income; const pc = c => (I > 0 ? round1(c * 100 / I) : 0) + '%';
    if (I <= 0) return ['Add your take-home pay. Percentages are each category\'s dollars divided by your take-home pay.'];
    const out = [];
    const src = A.incomeDetail.sources;
    out.push(`Take-home pay: ${cents(I)} a month${src.length > 1 ? ` from ${src.length} sources` : ''}${src.some(x => x.basis === 'recorded-average') ? ' (planned on what actually arrived, because it varies)' : ''}. Extra income isn't counted until it arrives.`);
    out.push(`Essentials: ${cents(A.essentials)} in bills${A.annualSetAside ? ` (including ${cents(A.annualSetAside)} set aside each month for bills that aren't monthly)` : ''}${A.everyday ? ` plus ${cents(A.everyday)} for groceries and gas` : ''} = ${cents(A.living)} (${pc(A.living)}).`);
    if (A.debtMinimums) out.push(`Minimum debt payments: ${cents(A.debtMinimums)} (${pc(A.debtMinimums)}). Bills that pay a debt are counted here once, not in Essentials.`);
    out.push(A.free >= 0 ? `Left after required costs: ${cents(A.free)} (${pc(A.free)}).` : `Short after required costs: ${cents(A.shortfall)}.`);
    const opt = s.lines.filter(l => !l.required);
    if (opt.length) out.push(`${s.name} assigns it: ${opt.map(l => `${l.label.toLowerCase()} ${cents(l.amount)}`).join(', ')}.`);
    out.push('Each percentage is that category\'s dollars divided by your take-home pay, rounded to 0.1% so they add up to 100%.');
    return out;
  }
  function benefitsFor(A, s) {
    const b = s.benefits.slice();
    const p = s.projection;
    if (p && p.interestSaved > 0) b.unshift(`About ${money(p.interestSaved)} less interest than paying minimums only (estimate).`);
    if (s.amounts.savings > 0 && A.free >= 0) b.push(`About ${money(s.amounts.savings * 12)} saved over a year at ${money(s.amounts.savings)} a month (0% growth assumed).`);
    return b;
  }
  function improveFor(A, s, timing) {
    const o = [];
    A.missing.forEach(m => o.push(m.detail));
    if (A.shortfall > 0) A.options.forEach(x => o.push(x));
    if (A.highApr) { const t = A.highAprDebts[0]; o.push(`Ask about a lower rate on ${t.name}. At ${aprStr(t.aprCenti)} APR it costs about ${money(WT.monthlyInterest(t.balanceCents, t.aprCenti))} a month in interest.`); }
    if (A.starter.gap > 0 && A.shortfall === 0) o.push(`Finish your starter emergency fund: ${money(A.starter.gap)} to go.`);
    else if (A.emergency.monthsCovered < 3 && A.shortfall === 0 && A.living > 0) o.push(`Build toward 3 months of essentials (${money(A.emergency.target3)}). You have ${A.emergency.monthsCovered} months now.`);
    if (A.optionalBills > 0 && A.shortfall === 0) o.push(`Optional bills and subscriptions cost ${money(A.optionalBills)} a month. Trimming any you rarely use frees money for your goals.`);
    if (A.incomeDetail.irregular) o.push(`Plan on a typical low month and send extra income${A.incomeDetail.variability.extraMonthly ? ` (about ${money(A.incomeDetail.variability.extraMonthly)} a month on average)` : ''} to ${leftoverWord(s.id, A)} when it arrives.`);
    (timing || []).filter(t => t.shortfall > 0).forEach(t => o.push(`The ${WT.shortDate(t.date)} paycheck is ${money(t.shortfall)} short: hold money back from the paycheck before it or move a bill.`));
    A.incomeDetail.changes.filter(c => c.type === 'ends').forEach(c => o.push(`${c.name} ends ${WT.shortDate(c.date)}: plan for about ${money(c.monthly)} less a month after that.`));
    return o.filter((x, i) => o.indexOf(x) === i);
  }

  // ---------------------------------------------------------------- strategies list
  function base(A) { return { month: A.month, income: A.income, essentials: A.essentials, debtMinimums: A.debtMinimums, committed: A.committed, living: A.living, required: A.required }; }
  function decorateCustom(A, st) {
    const def = DEFS.custom;
    const order = sb().debt && sb().debt.method === 'snowball' ? 'snowball' : null;
    Object.assign(st, { summary: def.summary, example: null, exampleAmounts: null, noFixedPct: false, debtOrder: st.debtOrder || order, aliases: [], modified: false, modifications: [], benefits: def.benefits.slice(), drawbacks: def.drawbacks.slice() });
    if (!st.fit) st.fit = A.income <= 0 ? 'Add your take-home pay to check this plan.' : realisticOf(A, st.amounts) ? 'Covers your essentials and minimum payments.' : 'Doesn\'t cover your essentials and minimum payments yet. See the warnings.';
    return st;
  }
  function customStrategy(A) {
    const cfg = sb();
    const cd = cfg.customDollars;
    let st = null;
    if (cd && typeof cd === 'object' && BUCKETS.some(b => toCents(cd[b]) > 0)) {
      const r = fromDollars(A, cd);
      st = { id: 'custom', name: NAMES.custom, kind: KINDS.custom, source: 'dollars', pct: r.pct, amounts: r.dollars, unallocated: r.unallocated, over: r.over, feasible: r.feasible, warnings: r.warnings.slice() };
      st.why = A.income > 0 ? `Your own plan: ${money(r.dollars.needs)} needs, ${money(r.dollars.debt)} debt, ${money(r.dollars.savings)} savings and ${money(r.dollars.wants)} wants${r.unallocated > 0 ? `, with ${money(r.unallocated)} not assigned yet` : r.over > 0 ? `, ${money(r.over)} over your pay` : ''}.` : 'Your own plan. Add your income to check it.';
    } else {
      const cust = cfg.custom;
      if (cust && typeof cust === 'object' && BUCKETS.some(b => num(cust[b]) > 0)) {
        const al = allocate(A, cust);
        st = { id: 'custom', name: NAMES.custom, kind: KINDS.custom, source: 'percent', pct: al.pct, amounts: al.amounts, feasible: al.feasible, warnings: al.warnings.slice() };
        if (al.adjusted) st.adjusted = al.adjusted;
        st.why = A.income > 0 ? `Your own split: ${money(al.amounts.needs)} needs, ${money(al.amounts.debt)} debt, ${money(al.amounts.savings)} savings and ${money(al.amounts.wants)} wants.` : 'Your own split. Add your income to see dollar amounts.';
      }
    }
    return st ? decorateCustom(A, st) : null;
  }
  // a strategy-shaped plan for any dollar amounts (saved custom strategies, previews)
  function customFrom(A, dollars, opts) {
    A = A || analyze(); opts = opts || {};
    const r = fromDollars(A, dollars);
    const st = { id: opts.id || 'custom', name: opts.name || NAMES.custom, kind: KINDS.custom, source: 'dollars', pct: r.pct, amounts: r.dollars, unallocated: r.unallocated, over: r.over, feasible: r.feasible, warnings: r.warnings.slice(), debtOrder: opts.debtOrder === 'snowball' || opts.debtOrder === 'avalanche' ? opts.debtOrder : null };
    st.why = A.income > 0 ? `${st.name}: ${money(r.dollars.needs)} needs, ${money(r.dollars.debt)} debt, ${money(r.dollars.savings)} savings and ${money(r.dollars.wants)} wants.` : 'Add your income to check this plan.';
    decorateCustom(A, st);
    return finish(A, st, makeSim(A));
  }
  function recommendedEntry(A, named, rec) {
    const src = named.find(s => s.id === rec.id) || named[0];
    const st = clone(src);
    Object.assign(st, { id: 'recommended', name: NAMES.recommended, kind: KINDS.recommended, basedOn: src.id, basedOnName: src.name, aliases: [], why: rec.reason, recommendation: rec, confidence: rec.confidence, showBadge: rec.showBadge });
    return st;
  }
  // [recommended (points at a named plan via basedOn), the 7 named plans, custom when saved]
  function strategies(A) {
    A = A || analyze();
    const named = clone(namedCore(A));
    const rec = recommend(A);
    const list = [recommendedEntry(A, named, rec)].concat(named);
    const cust = customStrategy(A);
    if (cust) list.push(finish(A, cust, makeSim(A)));
    const ideal = list[0].pct;
    for (const st of list) st.fitScore = st.id === 'recommended' ? fitScore(A, ideal, ideal, st.realistic) : fitScore(A, effective(st).pct, ideal, st.realistic);
    return list;
  }
  // all 8 named strategies for the cards; Custom starts from the recommended plan until one is saved
  function named(A) {
    A = A || analyze();
    const list = strategies(A);
    const out = list.filter(s => NAMED.includes(s.id));
    let cust = list.find(s => s.id === 'custom');
    if (!cust) {
      cust = clone(list[0]);
      Object.assign(cust, { id: 'custom', name: NAMES.custom, kind: KINDS.custom, isDefault: true, source: 'recommended', recommendation: undefined, showBadge: false, confidence: undefined });
      delete cust.recommendation; delete cust.showBadge; delete cust.confidence; delete cust.basedOnName;
      decorateCustom(A, cust);
      cust.fit = 'Starts from your recommended plan. Change any amount; locked categories stay as you set them.';
      cust.why = 'Your own plan. It starts from the recommended amounts until you change and save it.';
    }
    out.push(cust);
    const rec = list[0].recommendation;
    out.forEach(s => { s.recommended = s.id === rec.id && rec.showBadge; });
    return out;
  }
  function findStrategy(list, id) { const k = resolveId(id); return (list || []).find(s => s && s.id === k) || null; }

  // ---------------------------------------------------------------- compare
  function compare(A, list) {
    list = list || strategies(A);
    const rows = list.map(s => ({
      id: s.id, name: s.name, savings12: s.projection.savings12, annualSavings: s.projection.savings12, debtPaid12: s.projection.debtPaid12,
      debtFreeMonths: s.projection.debtFreeMonths, debtFreeEstimate: !!s.projection.debtFreeEstimate, interest: s.projection.interest, interestSaved: s.projection.interestSaved,
      spendingMonthly: s.projection.spendingMonthly, disposable: s.disposable, debtSplit: s.debtSplit, risks: s.risks || [],
      feasible: s.feasible, realistic: !!s.realistic, fitScore: s.fitScore,
    }));
    // "Best fit" only ever goes to a plan that funds living costs and minimums, and never when key info is missing
    const rec = list.find(s => s.id === 'recommended');
    if (rec && rec.recommendation && rec.recommendation.confidence === 'low') return { bestId: null, rows };
    let best = null;
    for (const s of list) if (s.realistic && (!best || s.fitScore > best.fitScore)) best = s;
    return { bestId: best ? best.id : null, rows };
  }

  const effective = s => (s && s.adjusted ? s.adjusted : s) || { amounts: zero(), pct: normPct() };
  // a strategy, a {dollars} editor result, or a plain {needs,debt,savings,wants} object -> planned cents
  function plannedOf(x) {
    if (!x || typeof x !== 'object') return zero();
    if (x.amounts && typeof x.amounts === 'object') return cleanDollars(effective(x).amounts);
    if (x.dollars && typeof x.dollars === 'object') return cleanDollars(x.dollars);
    return cleanDollars(x);
  }
  function resolveStrategy(A, x) {
    if (x == null) x = 'recommended';
    if (typeof x === 'string') return findStrategy(strategies(A), x);
    if (x && typeof x === 'object') {
      if (x.amounts || x.dollars) return x;
      if (BUCKETS.some(b => b in x)) return { id: 'custom', amounts: cleanDollars(x), debtOrder: null };
    }
    return null;
  }

  // ---------------------------------------------------------------- breakdown (expandable plan cards)
  // Per bucket: planned, pct, recommendedPct, items (each bill once; debt-linked bills under Debt), committed, remaining.
  function breakdown(A, x) {
    A = A || analyze();
    const s = resolveStrategy(A, x);
    const planned = plannedOf(s);
    const I = A.income;
    const recPct = (findStrategy(strategies(A), 'recommended') || {}).pct || normPct();
    const td = today();
    const inst = {};
    for (const i of WT.instancesForMonth(A.month)) if (i && !i.skipped && i.templateId && !inst[i.templateId]) inst[i.templateId] = i;
    const billItem = (b, kind, extra) => {
      const i = inst[b.id]; const st = i ? WT.instStatus(i, td) : null;
      const it = Object.assign({ kind, name: b.name, amount: b.monthly, templateId: b.id, dueDay: b.dueDay, dueDate: i ? i.dueDate : b.dueDate }, extra || {});
      if (kind === 'setaside') { it.frequency = b.frequency; it.fullAmount = b.amountEach; it.nextDue = b.nextDue; }
      if (i) { it.thisMonth = i.amountCents || 0; it.paid = Math.min(st.paid, i.amountCents || 0); it.left = st.remaining; it.status = st.status; }
      return it;
    };
    const items = { needs: [], debt: [], savings: [], wants: [] };
    A.essentialList.forEach(b => items.needs.push(billItem(b, b.irregular ? 'setaside' : 'bill')));
    if (A.everyday > 0) items.needs.push({ kind: 'spending', name: A.setAsideNames.length ? A.setAsideNames.join(', ') : 'Everyday needs (groceries, gas)', amount: A.everyday });
    A.debts.forEach(d => {
      const it = { kind: 'minimum', name: d.name, amount: d.minCents, debtId: d.id, dueDay: d.dueDay, dueDate: WT.dateInMonthClamped(A.month, d.dueDay), balance: d.balanceCents, aprCenti: d.aprCenti, revolving: d.revolving };
      if (d.billId) { it.templateId = d.billId; const i = inst[d.billId]; if (i) { const st = WT.instStatus(i, td); it.dueDate = i.dueDate; it.paid = Math.min(st.paid, i.amountCents || 0); it.left = st.remaining; it.status = st.status; } }
      items.debt.push(it);
    });
    (A.orphanDebtBills || []).forEach(b => items.debt.push(billItem(b, 'bill')));
    const extra = Math.max(0, planned.debt - A.debtMinimums);
    if (extra > 0 && A.debts.length) {
      const order = s && s.debtOrder === 'snowball' ? smallest(A) : topApr(A);
      items.debt.push({ kind: 'extra', name: `Extra payment: ${order.name}`, amount: extra, debtId: order.id });
    }
    let sLeft = planned.savings;
    const takeS = (it) => { const c = Math.min(sLeft, it.amount); if (c > 0) { items.savings.push(Object.assign(it, { amount: c })); sLeft -= c; } };
    A.upcoming.filter(u => u.monthlySetAside > 0).forEach(u => takeS({ kind: 'setaside', name: `${u.name} (one-time)`, amount: u.monthlySetAside, templateId: u.templateId, dueDate: u.date, fullAmount: u.amount }));
    if (A.starter.gap > 0) takeS({ kind: 'emergency', name: 'Starter emergency fund', amount: A.starter.gap, target: A.starter.target });
    A.goals.filter(g => g.type !== 'emergency' && g.neededPerMonth > 0).forEach(g => takeS({ kind: 'goal', name: g.name, amount: g.neededPerMonth, goalId: g.id, dueDate: g.targetDate }));
    A.optionalList.forEach(b => items.wants.push(billItem(b, b.irregular ? 'setaside' : 'bill', { subscription: !!b.subscription })));
    const byDue = (x, y) => {
      const last = it => (it.kind === 'spending' || it.kind === 'extra') ? 1 : 0;
      const dx = x.dueDate || '9999', dy = y.dueDate || '9999';
      return last(x) - last(y) || (dx < dy ? -1 : dx > dy ? 1 : 0) || x.name.localeCompare(y.name);
    };
    ['needs', 'debt', 'wants'].forEach(b => items[b].sort(byDue));
    const out = { month: A.month, income: I, order: BUCKETS.slice(), total: sum4(planned), unallocated: I - sum4(planned) };
    BUCKETS.forEach(b => {
      const committed = items[b].reduce((t, it) => t + it.amount, 0);
      out[b] = { planned: planned[b], pct: I > 0 ? round1(planned[b] * 100 / I) : 0, recommendedPct: recPct[b], items: items[b], committed, remaining: planned[b] - committed, short: Math.max(0, committed - planned[b]) };
    });
    return out;
  }

  // ---------------------------------------------------------------- forecast (estimates, never guarantees)
  const AV_ORDER = (a, b) => b.apr - a.apr || a.balance - b.balance || a.name.localeCompare(b.name);
  const SN_ORDER = (a, b) => a.balance - b.balance || b.apr - a.apr || a.name.localeCompare(b.name);
  function payoffDateFor(dueDay, months) {
    const td = today(); const mk = WT.monthOf(td);
    const off = WT.dateInMonthClamped(mk, dueDay) >= td ? 0 : 1;
    return WT.dateInMonthClamped(WT.addMonthKey(mk, months - 1 + off), dueDay);
  }
  function forecastAssumptions(A, method, reserved, months) {
    const r = A.savingsAprCenti || 0;
    const a = ['This is an estimate, not a guarantee.'];
    a.push(`Your take-home pay (${cents(A.income)} a month), bills and plan amounts stay the same for ${plural(months, 'month')}. Extra income isn't counted.`);
    a.push(r ? `Savings earn ${aprStr(r)} a year, the rate you entered. Rates can change.` : 'Savings earn 0% because no savings interest rate was entered. Any interest you earn would be extra.');
    a.push('Debt interest is charged monthly at each debt\'s APR, and no new charges are added to cards.');
    a.push(`Extra debt money goes to the ${method === 'snowball' ? 'smallest balance' : 'highest interest rate'} first. When a debt is paid off its payment moves to the next one; once all are paid off, that money is added to savings.`);
    a.push('Spending money is assumed to be spent.');
    if (reserved > 0) a.push(`${cents(reserved)} a month set aside for upcoming one-time bills is spent when they're due, so it isn't counted as savings.`);
    if (A.incomeDetail.irregular) a.push('Your income varies, so real results may differ more than usual.');
    if (A.netWorth) a.push(`Net worth starts at ${cents(A.netWorth.netWorth)}${A.netWorth.estimate ? ' (an estimate)' : ''} and changes only by money saved and debt paid down.${A.netWorth.demo ? ' Demo data, not your real net worth.' : ''}`);
    if (A.debtDataMissing) a.push('Some debts are missing an interest rate or minimum payment, so payoff dates are estimates.');
    return a;
  }
  function forecast(A, strategy, months) {
    A = A || analyze();
    months = Math.max(1, Math.min(600, parseInt(months, 10) || 12));
    const s = resolveStrategy(A, strategy) || { id: null, amounts: zero(), debtOrder: null };
    const eff = plannedOf(s);
    const method = s.debtOrder === 'snowball' ? 'snowball' : 'avalanche';
    const ds = A.debts.map(d => ({ id: d.id, name: d.name, balance: d.balanceCents, apr: d.aprCenti || 0, min: d.minCents || 0, dueDay: d.dueDay || 1, bal: d.balanceCents, month: null }));
    const prio = ds.slice().sort(method === 'snowball' ? SN_ORDER : AV_ORDER);
    const budget = eff.debt;
    const rate = A.savingsAprCenti || 0;
    const sav0 = A.balances.savings; let sav = sav0;
    const debt0 = ds.reduce((t, x) => t + x.bal, 0);
    const nw0 = A.netWorth ? A.netWorth.netWorth : 0;
    const ups = A.upcoming.filter(u => u.oneTime && !u.debt && u.monthlySetAside > 0);
    const upMonths = ups.reduce((m, u) => Math.max(m, WT.monthsBetween(A.month, WT.monthOf(u.date))), 0);
    const reserved = Math.min(eff.savings, A.upcomingSetAside);
    let interest = 0, payments = 0, debtFreeMonth = ds.length ? null : 0, stuck = false, debtEnd = debt0;
    const tl = [debt0]; const monthly = [];
    for (let m = 1; m <= 600; m++) {
      let freed = 0;
      if (ds.some(x => x.bal > 0)) {
        for (const x of ds) if (x.bal > 0) { const it = WT.monthlyInterest(x.bal, x.apr); x.bal += it; if (m <= months) interest += it; }
        let pool = budget;
        for (const x of ds) if (x.bal > 0) { const p = Math.min(x.min, x.bal, pool); x.bal -= p; pool -= p; }
        for (const x of prio) { if (pool <= 0) break; if (x.bal > 0) { const p = Math.min(pool, x.bal); x.bal -= p; pool -= p; } }
        for (const x of ds) if (x.bal <= 0 && x.month == null) x.month = m;
        if (m <= months) payments += budget - pool;
        if (!ds.some(x => x.bal > 0)) { debtFreeMonth = m; freed = pool; }
      } else freed = budget;
      const debt = ds.reduce((t, x) => t + Math.max(0, x.bal), 0);
      tl.push(debt);
      if (debt > 0 && m > 24 && tl[m] >= tl[m - 12]) stuck = true;
      if (m <= months) {
        const contrib = eff.savings - (m <= upMonths ? reserved : 0) + freed;
        sav = sav + WT.monthlyInterest(Math.max(0, sav), rate) + contrib;
        debtEnd = debt;
        monthly.push({ m, month: WT.addMonthKey(A.month, m - 1), debt, savings: sav, netWorth: nw0 + (sav - sav0) - (debt - debt0) });
      }
      if (m >= months && (debtFreeMonth != null || stuck)) break;
    }
    if (debtFreeMonth == null) stuck = ds.length > 0;
    const debtFreeDate = ds.length && !stuck && debtFreeMonth != null ? ds.reduce((d, x) => { const pd = payoffDateFor(x.dueDay, x.month); return pd > d ? pd : d; }, '') : null;
    const last = monthly[monthly.length - 1];
    return {
      months, strategyId: s.id || null, debtOrder: method, monthlyDebt: eff.debt, debtSplit: { minimum: Math.min(eff.debt, A.debtMinimums), extra: Math.max(0, eff.debt - A.debtMinimums) },
      debtStart: debt0, debtEnd, debtPaid: Math.max(0, debt0 - debtEnd), payments, interest,
      debtFree: !ds.length || (debtFreeMonth != null && debtFreeMonth <= months), debtFreeMonths: stuck ? null : debtFreeMonth, debtFreeDate, debtFreeWithin: debtFreeMonth != null && debtFreeMonth <= months,
      debtFreeEstimate: !!A.debtDataMissing || eff.debt < A.debtMinimums, neverPaysOff: stuck,
      savingsStart: sav0, savingsEnd: last.savings, savingsAdded: last.savings - sav0, savingsMonthly: eff.savings, savingsRateCenti: rate, savingsGrowth: rate ? 'entered' : 'none',
      spendingMonthly: eff.wants, spending: eff.wants * months,
      netWorthStart: nw0, netWorthEnd: last.netWorth, netWorthChange: last.netWorth - nw0, netWorthEstimate: true, demo: !!(A.netWorth && A.netWorth.demo),
      monthly, estimate: true, assumptions: forecastAssumptions(A, method, reserved, months), missing: A.missing.map(x => x.detail),
    };
  }
  function compareAll(A, months) {
    A = A || analyze();
    months = Math.max(1, Math.min(600, parseInt(months, 10) || 12));
    const list = strategies(A);
    const rec = list[0].recommendation;
    const rows = list.map(s => {
      const f = forecast(A, s, months);
      return {
        id: s.id, name: s.name, basedOn: s.basedOn || null, pct: effective(s).pct, amounts: plannedOf(s), example: s.example || null,
        monthlyDebt: f.monthlyDebt, debtSplit: f.debtSplit, debtPaid: f.debtPaid, payments: f.payments, interest: f.interest,
        debtFreeMonths: f.debtFreeMonths, debtFreeDate: f.debtFreeDate, debtFreeWithin: f.debtFreeWithin, debtFreeEstimate: f.debtFreeEstimate, neverPaysOff: f.neverPaysOff,
        savingsMonthly: f.savingsMonthly, savingsEnd: f.savingsEnd, savingsAdded: f.savingsAdded,
        netWorthStart: f.netWorthStart, netWorthEnd: f.netWorthEnd, netWorthChange: f.netWorthChange,
        spendingMonthly: f.spendingMonthly, spending: f.spending, realistic: !!s.realistic, modified: !!s.modified, risks: s.risks || [],
        benefits: s.benefits || [], drawbacks: s.drawbacks || [], recommended: s.id === rec.id && rec.showBadge,
      };
    });
    const bestId = rec.showBadge && rows.some(r => r.id === rec.id && r.realistic) ? rec.id : null;
    return { months, horizons: HORIZONS.slice(), rows, bestId, recommendedId: rec.id, confidence: rec.confidence, assumptions: forecastAssumptions(A, 'avalanche', 0, months).filter(x => !/Extra debt money goes/.test(x)), missing: A.missing.map(x => x.detail) };
  }
  // forecast of a draft vs the current plan, before saving
  function previewImpact(A, next, current, months) {
    A = A || analyze(); months = months || 12;
    const fNext = forecast(A, next, months), fCur = forecast(A, current == null ? 'recommended' : current, months);
    const delta = {};
    ['debtPaid', 'interest', 'savingsEnd', 'netWorthEnd', 'spending'].forEach(k => delta[k] = fNext[k] - fCur[k]);
    delta.debtFreeMonths = fNext.debtFreeMonths != null && fCur.debtFreeMonths != null ? fNext.debtFreeMonths - fCur.debtFreeMonths : null;
    const parts = [];
    if (delta.savingsEnd) parts.push(`${delta.savingsEnd > 0 ? 'about ' + money(delta.savingsEnd) + ' more' : 'about ' + money(-delta.savingsEnd) + ' less'} in savings`);
    if (delta.debtPaid) parts.push(`${delta.debtPaid > 0 ? money(delta.debtPaid) + ' more' : money(-delta.debtPaid) + ' less'} debt paid down`);
    if (delta.interest) parts.push(`${delta.interest > 0 ? money(delta.interest) + ' more' : money(-delta.interest) + ' less'} interest`);
    const summary = parts.length ? `Over ${plural(months, 'month')}: ${parts.join(', ')} (estimate).` : `Over ${plural(months, 'month')} this change makes no difference to savings or debt (estimate).`;
    return { months, current: fCur, next: fNext, delta, summary };
  }

  // ---------------------------------------------------------------- planned vs actual
  // paid = bill payments made this month (up to today); spent = expenses; extra = extra debt payments;
  // saved = goal contributions + transfers into savings accounts; scheduled = unpaid bills still due this
  // month (+ anything dated after today). Future payments are never counted as spending, and a
  // debt-linked bill payment counts once (in debt), never again through debt transactions.
  function vsActual(A, chosen, mk) {
    mk = mk || (A && A.month) || curMonth();
    const td = today();
    const planned = plannedOf(chosen);
    const f = {}; BUCKETS.forEach(b => f[b] = { paid: 0, spent: 0, extra: 0, saved: 0, scheduled: 0 });
    const inM = d => d && WT.monthOf(d) === mk;
    for (const p of Object.values(WT.D.payments || {})) {
      if (!p || p.voided || !inM(p.date)) continue;
      const i = WT.D.instances[p.instanceId]; if (!i) continue;
      const k = billBucket(i);
      if (p.date > td) f[k].scheduled += p.amountCents || 0; else f[k].paid += p.amountCents || 0;
    }
    for (const i of WT.instancesForMonth(mk)) {
      if (!i || i.skipped) continue;
      const t = WT.D.templates[i.templateId]; if (t && t.deleted) continue;
      const rem = WT.instStatus(i, td).remaining;
      if (rem > 0) f[billBucket(i)].scheduled += rem;
    }
    for (const e of Object.values(WT.D.expenses || {})) {
      if (!e || !inM(e.date) || !Number.isInteger(e.amountCents)) continue;
      const k = essentialCategory(e.category, 'expense') ? 'needs' : 'wants';
      if (e.date > td) f[k].scheduled += e.amountCents; else f[k].spent += e.amountCents;
    }
    for (const x of Object.values(WT.D.debtTxns || {})) {
      if (!x || x.voided || x.type !== 'payment' || !x.sourceId || !inM(x.date)) continue;
      if (x.date > td) f.debt.scheduled += -(x.amountCents || 0); else f.debt.extra += -(x.amountCents || 0);
    }
    const goalTransfers = new Set();
    for (const x of Object.values(WT.D.goalTxns || {})) {
      if (!x || x.voided) continue;
      if (x.transferId) goalTransfers.add(x.transferId);
      if (inM(x.date) && x.date <= td) f.savings.saved += x.amountCents || 0;
    }
    const savAcc = new Set(Object.values(WT.D.accounts || {}).filter(a => a && a.type === 'savings').map(a => a.id));
    for (const t of Object.values(WT.D.transfers || {})) {
      if (!t || t.voided || !inM(t.date) || t.date > td || goalTransfers.has(t.id)) continue;
      const into = savAcc.has(t.toId), out = savAcc.has(t.fromId);
      if (into && !out) f.savings.saved += t.amountCents || 0; else if (out && !into) f.savings.saved -= t.amountCents || 0;
    }
    const out = { month: mk };
    const totals = { planned: 0, paid: 0, spent: 0, actual: 0, scheduled: 0, reserved: 0, remaining: 0, freeAfterScheduled: 0 };
    BUCKETS.forEach(k => {
      const x = f[k]; const pl = planned[k] || 0;
      const actual = x.paid + x.spent + x.extra + Math.max(0, x.saved);
      const remaining = pl - actual;
      const pctUsed = pl > 0 ? Math.round(actual * 100 / pl) : (actual > 0 ? 100 : 0);
      const status = actual > pl ? 'over' : (actual + x.scheduled > pl || (pl > 0 && actual * 10 >= pl * 9)) ? 'near' : 'under';
      out[k] = { planned: pl, paid: x.paid, spent: x.spent, extra: x.extra, saved: x.saved, actual, scheduled: x.scheduled, reserved: x.scheduled, remaining, freeAfterScheduled: remaining - x.scheduled, pctUsed, status };
      for (const key of Object.keys(totals)) totals[key] += out[k][key];
    });
    out.totals = totals;
    return out;
  }

  // ---------------------------------------------------------------- rollover
  function rolloverRules() {
    const r = sb().rollover; const o = {};
    BUCKETS.forEach(b => o[b] = r && typeof r === 'object' && ROLLOVER_RULES.includes(r[b]) ? r[b] : 'reset');
    return o;
  }
  // Leftover from last month's saved budget, moved per settings.smartBudget.rollover. Read-only.
  function rollover(mk) {
    mk = mk || curMonth();
    const from = WT.addMonthKey(mk, -1);
    const carryIn = zero(); const moved = { toSavings: 0, toDebt: 0 }; const details = [];
    const hist = Array.isArray(sb().history) ? sb().history : [];
    const snap = hist.filter(h => h && h.month === from).pop();
    const rules = rolloverRules();
    if (!snap) return { from, month: mk, carryIn, moved, details, total: 0, rules, note: `No budget was saved for ${WT.monthLabel(from)}, so nothing carries over.` };
    const plan = plannedOf(snap.dollars ? { dollars: snap.dollars } : snap);
    if (snap.rollover && typeof snap.rollover === 'object') BUCKETS.forEach(b => plan[b] += toCents(snap.rollover[b]));
    const va = vsActual(null, plan, from);
    BUCKETS.forEach(b => {
      const leftover = Math.max(0, plan[b] - va[b].actual);
      const rule = rules[b];
      let to = null;
      if (leftover > 0) {
        if (rule === 'carry') to = b;
        else if (rule === 'savings') { to = 'savings'; if (b !== 'savings') moved.toSavings += leftover; }
        else if (rule === 'debt') { to = 'debt'; if (b !== 'debt') moved.toDebt += leftover; }
        if (to) carryIn[to] += leftover;
      }
      details.push({ bucket: b, planned: plan[b], actual: va[b].actual, leftover, rule, to, amount: to ? leftover : 0 });
    });
    const total = sum4(carryIn);
    return { from, month: mk, carryIn, moved, details, total, rules, note: total > 0 ? `${cents(total)} carries over from ${WT.monthLabel(from)}.` : `Nothing carries over from ${WT.monthLabel(from)}.` };
  }

  // ---------------------------------------------------------------- suggestions
  // One affordability calculation (the personalized plan) drives every suggestion, so they never contradict.
  function suggestions(A, chosen) {
    A = A || analyze();
    chosen = chosen || strategies(A)[0];
    const out = [];
    const add = (x) => { if (!out.some(y => y.kind === x.kind && y.title === x.title)) out.push(Object.assign({ impact: 0 }, x)); };
    const eff = plannedOf(chosen);
    const I = A.income;
    const recId = recommend(A).id;
    const rec = (namedCore(A).find(s => s.id === recId) || { amounts: zero() }).amounts;
    const recExtra = Math.max(0, rec.debt - A.debtMinimums);
    const chosenExtra = Math.max(0, eff.debt - A.debtMinimums);

    if (I <= 0) {
      add({ kind: 'warning', urgency: 'now', title: 'Add your income', detail: 'Smart Budget needs your take-home pay. Add a job or paycheck to see your plan.' });
    }
    if (I > 0 && A.shortfall > 0) {
      add({ kind: 'shortfall', urgency: 'now', impact: A.shortfall, amount: A.shortfall, title: `You're ${cents(A.shortfall)} short each month`, detail: shortfallWarning(A), options: A.options.slice() });
    }
    // which bills to fund first
    if (A.committed > 0) {
      const top = A.essentialList.slice(0, 3).map(b => `${b.name} (${money(b.monthly)})`);
      add({ kind: 'fund-first', urgency: 'now', impact: A.required, amount: A.required, title: 'Fund these first', detail: `Pay your essential bills first${top.length ? ' (biggest: ' + top.join(', ') + ')' : ''}${A.everyday ? `, then set aside ${money(A.everyday)} for groceries and gas` : ''}${A.debtMinimums ? `, then the required minimum payments (${money(A.debtMinimums)})` : ''}. Extra payments and wants come after.` });
    }
    // per paycheck
    if (A.paycheckSetAside > 0 && A.incomeDetail.paychecksPerMonth > 0) {
      const per = A.paycheckSetAside, pay = A.incomeDetail.perPaycheck;
      const what = `bills${A.everyday ? ', groceries, gas' : ''}${A.debtMinimums ? ' and minimum payments' : ''}`;
      add(per > pay
        ? { kind: 'paycheck-setaside', urgency: 'now', impact: per, amount: per, title: `Your ${what} need ${money(per)} per paycheck`, detail: `That's more than your ${money(pay)} paycheck, so set aside the whole check for them and use the options above to close the gap.` }
        : { kind: 'paycheck-setaside', urgency: 'soon', impact: per, amount: per, title: `Set aside ${money(per)} from each paycheck`, detail: `That covers ${what} (${money(A.required)} a month over about ${A.incomeDetail.paychecksPerMonth} paychecks). The other ${money(pay - per)} of each paycheck is for savings${A.debts.length ? ', extra debt' : ''} and spending money.` });
    }
    // upcoming cash flow
    const cash = cashflowNotes(A, chosen);
    cash.forEach(add);
    A.upcoming.slice(0, 2).forEach(u => add({ kind: 'cashflow', urgency: 'soon', impact: u.amount, amount: u.amount, title: `${u.name} is due ${WT.shortDate(u.date)}`, detail: `A ${u.oneTime ? 'one-time' : 'less-than-monthly'} bill of ${cents(u.amount)}. Set some aside before then so it doesn't squeeze that paycheck.` }));
    // emergency fund
    if (I > 0 && A.starter.target > 0 && A.starter.gap > 0) {
      const per = Math.min(eff.savings, A.starter.gap);
      const months = per > 0 ? Math.ceil(A.starter.gap / per) : null;
      add({ kind: 'emergency', urgency: A.shortfall > 0 ? 'later' : 'soon', impact: A.starter.gap, amount: A.starter.gap, title: 'Build a starter emergency fund', detail: `Aim for ${money(A.starter.target)} (one month of living costs, up to $1,000). You have ${money(A.balances.savings)}, so you need ${money(A.starter.gap)} more.` + (A.shortfall > 0 ? ' Start once your bills and minimums are covered. Even $10 a paycheck helps.' : months ? ` At ${money(per)} a month you'll get there in about ${plural(months, 'month')}.` : ' Even $25 a paycheck is a good start.') });
    }
    // reduce: categories above their 3-month average
    const mk = A.month;
    const cur = WT.spendingByCategory(mk);
    const hist = [1, 2, 3].map(k => WT.spendingByCategory(WT.addMonthKey(mk, -k)));
    const histTotal = hist.reduce((a, h) => a + Object.values(h).reduce((x, y) => x + y, 0), 0);
    if (histTotal > 0) {
      for (const [c, v] of Object.entries(cur)) {
        const avg = WT.divRound(hist.reduce((a, h) => a + (h[c] || 0), 0), 3);
        if (v > avg * 1.2 && v - avg >= 2500) {
          add({ kind: 'reduce', urgency: 'soon', catId: c, impact: v - avg, amount: v - avg, title: `${WT.catName(c)} is higher than usual`, detail: avg > 0 ? `You've spent ${money(v)} on ${WT.catName(c)} this month. Your 3-month average is ${money(avg)}, so that's ${money(v - avg)} more.` : `You've spent ${money(v)} on ${WT.catName(c)} this month, and nothing in the 3 months before.` });
        }
      }
    }
    // extra debt: only when affordable after living costs + the starter emergency fund
    if (A.debts.length) {
      const sim = makeSim(A); const baseSim = sim(0);
      const target = A.highAprDebts[0] || A.debts.slice().sort((x, y) => y.aprCenti - x.aprCenti || x.balanceCents - y.balanceCents)[0];
      if (recExtra > 0) {
        const amt = chosenExtra > 0 ? chosenExtra : recExtra;
        const s = sim(amt); const saved = (!s.stuck && !baseSim.stuck) ? Math.max(0, baseSim.totalInterest - s.totalInterest) : 0;
        add({ kind: 'extra-debt', urgency: 'soon', affordable: true, impact: saved, amount: amt, title: `Put ${money(amt)} extra a month toward ${target.name}`, detail: `${target.name} has the highest rate (${aprStr(target.aprCenti)} APR). Pay it first, then move to the next highest.` + (s.months && baseSim.months ? ` You'd be debt-free in about ${plural(s.months, 'month')} instead of ${baseSim.months}` + (saved > 0 ? ` and save about ${money(saved)} in interest.` : '.') : '') + (A.debtDataMissing ? ' This is an estimate because some debts are missing details.' : '') });
      } else {
        const why = I <= 0 ? 'add your income first' : A.shortfall > 0 ? 'your bills, groceries, gas and minimum payments aren\'t fully covered yet' : A.starter.gap > 0 ? `build your ${money(A.starter.target)} starter emergency fund first` : 'there is no money left after your living costs';
        add({ kind: 'extra-debt', urgency: 'later', affordable: false, impact: 0, title: 'Hold off on extra debt payments for now', detail: `Pay the required minimums only: ${why}.` + (chosenExtra > 0 ? ` Your chosen plan puts ${money(chosenExtra)} extra toward debt. It's safer to use that for necessities and savings first.` : '') });
      }
      A.notes.forEach(n => add({ kind: 'warning', urgency: 'later', title: 'Missing debt details', detail: n }));
    }
    // safe to spend this month
    if (I > 0) {
      const va = vsActual(A, eff, mk);
      const safe = Math.max(0, va.wants.freeAfterScheduled);
      add({ kind: 'safe-to-spend', urgency: 'soon', impact: safe, amount: safe, title: safe > 0 ? `${money(safe)} is safe to spend this month` : 'No spending money left this month', detail: safe > 0 ? `That's what's left for wants after what you've spent (${money(va.wants.actual)}) and the optional bills still due (${money(va.wants.scheduled)}).` : `Wants planned ${money(va.wants.planned)}, already used or scheduled ${money(va.wants.actual + va.wants.scheduled)}.` });
    }
    // goal / debt-free ETAs
    const goalsLeft = A.goals.filter(g => g.type !== 'emergency' && g.left > 0);
    if (goalsLeft.length && I > 0) {
      const forGoals = Math.max(0, eff.savings - Math.min(eff.savings, A.starter.gap));
      const left = goalsLeft.reduce((a, g) => a + g.left, 0);
      const m = forGoals > 0 ? Math.ceil(left / forGoals) : null;
      add({ kind: 'goal-eta', urgency: 'later', impact: left, amount: left, title: m ? `Your goals could be reached in about ${plural(m, 'month')}` : 'Your goals need savings money', detail: m ? `${money(left)} left on ${listNames(goalsLeft.map(g => g.name))}. At ${money(forGoals)} a month that's around ${WT.monthLabel(WT.monthOf(WT.addMonthsClamp(today(), m)))}.` : `${money(left)} left on ${listNames(goalsLeft.map(g => g.name))}. Once the emergency fund is built, put part of savings toward them.` });
    }
    const proj = chosen && chosen.projection;
    if (A.debts.length && proj && proj.debtFreeMonths) {
      const when = WT.monthOf(WT.addMonthsClamp(today(), proj.debtFreeMonths));
      add({ kind: 'goal-eta', urgency: 'later', impact: 1, title: `Debt-free around ${WT.monthLabel(when)}`, detail: `With this plan, about ${plural(proj.debtFreeMonths, 'month')}${proj.debtFreeEstimate ? ' (an estimate: some debt details are missing or minimums aren\'t fully covered)' : ''}.` });
    }
    // optional scenario: pausing subscriptions (never assumed)
    const subs = A.optionalList.filter(b => b.subscription);
    if (subs.length && I > 0) {
      const tot = subs.reduce((a, b) => a + b.monthly, 0);
      add({ kind: 'scenario', urgency: 'later', optional: true, impact: tot, amount: tot, title: `Optional: pausing ${plural(subs.length, 'subscription')} would free ${money(tot)} a month`, detail: `${listNames(subs.map(b => b.name))} cost ${money(tot)} a month (${money(tot * 12)} a year). Only if you don't use them much. Nothing is changed unless you cancel them yourself.` });
    }
    (chosen && chosen.warnings || []).forEach(w => { if (!out.some(x => x.detail === w || (x.detail || '').indexOf(w) === 0)) add({ kind: 'warning', urgency: 'soon', title: chosen.realistic ? 'Heads up' : 'This plan is not realistic', detail: w }); });

    const first = x => x.kind === 'shortfall' ? 0 : 1; // the shortfall explanation always leads
    return out.map((x, i) => [x, i]).sort((a, b) => URGENCY[a[0].urgency] - URGENCY[b[0].urgency] || first(a[0]) - first(b[0]) || (b[0].impact || 0) - (a[0].impact || 0) || a[1] - b[1]).map(x => x[0]);
  }

  // upcoming cash shortages per paycheck (WTPlan when available, else this file's paycheckPlan)
  function cashflowNotes(A, chosen) {
    const out = [];
    try {
      if (typeof WTPlan !== 'undefined' && WTPlan && WTPlan.ready && typeof WTPlan.paycheckPlan === 'function') {
        const plan = WTPlan.paycheckPlan({ count: 4, strategy: chosen });
        const pcs = (plan && Array.isArray(plan.paychecks)) ? plan.paychecks : [];
        for (const p of pcs) {
          if (p.shortfall > 0) out.push({ kind: 'cashflow', urgency: 'now', impact: p.shortfall, amount: p.shortfall, title: `The ${WT.shortDate(p.date)} paycheck is ${money(p.shortfall)} short`, detail: `Bills and plans for that paycheck are more than it brings in, even after holding money back from earlier paychecks.` });
          else if (p.reserveIn > 0) out.push({ kind: 'cashflow', urgency: 'soon', impact: p.reserveIn, amount: p.reserveIn, title: `Hold back ${money(p.reserveIn)} for the ${WT.shortDate(p.date)} paycheck`, detail: `Bills on that paycheck are more than it brings in. Set the money aside from the paycheck before it.` });
        }
        return out;
      }
    } catch (e) { /* fall back below */ }
    for (const p of paycheckPlan(chosen, 4)) {
      const due = p.bills.filter(b => !b.paid).reduce((a, b) => a + b.amountCents, 0);
      if (due > p.net) out.push({ kind: 'cashflow', urgency: 'now', impact: due - p.net, amount: due - p.net, title: `Hold back ${money(due - p.net)} for the ${WT.shortDate(p.date)} paycheck`, detail: `Unpaid bills on that paycheck (${money(due)}) are more than it brings in (${money(p.net)}). Set the difference aside from the paycheck before it.` });
    }
    return out;
  }

  // ---------------------------------------------------------------- paycheck plan (v1; WTPlan has the full one)
  function paycheckPlan(chosen, count) {
    count = count == null ? 3 : Math.max(0, count | 0);
    const b = (chosen && chosen.base) || base(analyze());
    const eff = effective(chosen).amounts;
    const td = today();
    const pcs = WT.paychecksBetween(td, WT.addDays(td, 32 * Math.max(1, count) + 31)).slice(0, count);
    const w = { needs: Math.max(0, eff.needs - b.essentials), debt: Math.max(0, eff.debt - b.debtMinimums), savings: Math.max(0, eff.savings), wants: Math.max(0, eff.wants) };
    if (sum4(w) <= 0) w.savings = 1;
    return pcs.map(pc => {
      const net = Math.max(0, pc.amountCents || 0);
      const bills = WT.billsForPaycheck(pc.key).map(i => {
        const kind = billBucket(i);
        const st = WT.instStatus(i);
        return { instId: i.id, name: i.name, dueDate: i.dueDate, amountCents: i.amountCents || 0, essential: kind !== 'wants', kind, paid: st.status === 'paid' };
      });
      const billsTotal = bills.reduce((a, x) => a + x.amountCents, 0);
      const reserve = zero();
      let left = net;
      for (const k of ['needs', 'debt', 'wants']) { const due = bills.filter(x => x.kind === k).reduce((a, x) => a + x.amountCents, 0); const c = Math.min(left, due); reserve[k] += c; left -= c; }
      const extra = splitInt(left, w);
      BUCKETS.forEach(k => reserve[k] += extra[k] || 0);
      return { key: pc.key, date: pc.date, incomeName: (pc.income && pc.income.name) || 'Paycheck', net, bills, billsTotal, reserve, shortfall: Math.max(0, billsTotal - net) };
    });
  }

  // ---------------------------------------------------------------- history snapshot
  // opts.rollover: carry-in applied this month (defaults to rollover(mk).carryIn)
  function snapshot(mk, s, opts) {
    s = s || {}; opts = opts || {};
    mk = mk || curMonth();
    const amounts = clone(s.amounts || zero());
    const snap = { month: mk, strategyId: s.id || 'recommended', pct: clone(s.pct || normPct()), amounts, income: (s.base && s.base.income != null) ? s.base.income : sum4(amounts), savedAt: today() };
    if (s.adjusted) snap.adjusted = clone({ pct: s.adjusted.pct, amounts: s.adjusted.amounts });
    snap.dollars = plannedOf(s);
    const ro = opts.rollover && typeof opts.rollover === 'object' ? opts.rollover : rollover(mk).carryIn;
    snap.rollover = cleanDollars(ro);
    return snap;
  }

  return {
    BUCKETS, NAMES, KINDS, ROLLOVER_RULES,
    analyze, strategies, allocate, compare, suggestions, paycheckPlan, vsActual, snapshot, essentialCategory, normPct,
    fromDollars, fromPct, distribute, rollover,
    // v3
    STRATEGY_IDS, ALIASES, EXAMPLES, HORIZONS, resolveId, findStrategy, named, recommend, breakdown, forecast, compareAll,
    fillExactly, customFrom, previewImpact,
  };
});
