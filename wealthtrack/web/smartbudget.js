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
 * Recommendation ("Personalized", id 'recommended') is stability first:
 *   essential bills -> debt minimums -> everyday necessities -> starter emergency fund
 *   -> a spending-money floor -> upcoming one-time bills -> extra debt (high APR tilt) -> savings/goals.
 * Extra debt is never recommended while necessities or the starter emergency fund are unfunded.
 * When income can't cover living costs + minimums, the plan keeps home, bills, food and gas
 * funded first, explains the exact shortfall and lists realistic options.
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
    for (const [, list] of byInc) {
      const inc = list[0].income;
      const avg = WT.divRound(list.reduce((a, p) => a + (p.expectedCents || 0), 0), list.length);
      let per = paychecksPerMonthFor(inc);
      if ((inc.endDate && inc.endDate < winTo) || (inc.startDate && inc.startDate > winFrom)) per = Math.min(per, list.length / 3);
      income += Math.round(avg * per); ppm += per;
    }
    if (!byInc.size) { const f = WT.incomeForMonth(mk); income = Math.max(0, f.total || 0); }
    income = Math.max(0, income);
    const incomeDetail = { paychecksPerMonth: Math.round(ppm * 100) / 100, perPaycheck: ppm > 0 ? Math.round(income / ppm) : 0 };

    // bills
    let essentials = 0, optionalBills = 0;
    const linkedByDebt = {}; const orphanDebtBills = []; const subscriptions = []; const essentialBills = [];
    const openDebtIds = new Set(WT.debtInputs().map(d => d.id));
    for (const t of Object.values(WT.D.templates || {})) {
      const m = templateMonthly(t, mk);
      if (m <= 0) continue;
      if (t.debtId) {
        if (openDebtIds.has(t.debtId)) linkedByDebt[t.debtId] = (linkedByDebt[t.debtId] || 0) + m;
        else if (!WT.D.debts[t.debtId] || WT.D.debts[t.debtId].deleted || WT.D.debts[t.debtId].closed) orphanDebtBills.push({ id: t.id, name: t.name, monthly: m });
        continue;
      }
      if (essentialCategory(t.category, 'bill')) { essentials += m; essentialBills.push({ id: t.id, name: t.name, monthly: m, category: t.category }); }
      else { optionalBills += m; subscriptions.push({ id: t.id, name: t.name, monthly: m, category: t.category, subscription: !!t.subscription }); }
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
        upcoming.push({ name: t.name, date: o.date, amount, templateId: t.id, oneTime, debt: !!t.debtId });
        // one-time bills only count in the month they're due, so save toward later ones a little each month
        if (oneTime && !t.debtId && WT.monthOf(o.date) > mk) upcomingSetAside += Math.ceil(amount / (WT.monthsBetween(mk, WT.monthOf(o.date)) + 1));
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
      debts: debts.map(d => ({ id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti, minCents: d.minCents })),
      debtDataMissing: debts.some(d => !d.minCents || !d.aprCenti),
      optionalList: subscriptions.sort((x, y) => y.monthly - x.monthly), essentialList: essentialBills.sort((x, y) => y.monthly - x.monthly),
      setAsideNames: saNames, notes,
    };
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
    if (kind === 'recommended') {
      take('wants', L.fun, wantsFloor(A, R0));
      take('savings', L.ef, A.starter.gap);
      take('savings', L.up, A.upcomingSetAside);
      const X = P.left();
      if (X > 0) {
        const w = A.highApr ? { debt: 60, savings: 20, wants: 20 } : hasDebt ? { debt: 30, savings: 40, wants: 30 } : { debt: 0, savings: 60, wants: 40 };
        const s = splitInt(X, w);
        take('debt', L.extra, s.debt); take('savings', L.save, s.savings); take('wants', L.fun, s.wants);
      }
    } else if (kind === 'zero') {
      take('wants', L.fun, Math.max(1, Math.round(R0 * 0.10)));
      take('savings', L.ef, A.starter.gap);
      take('savings', L.up, A.upcomingSetAside);
      take('savings', L.goals, A.goalsNeeded);
      if (hasDebt) take('debt', L.extra, Math.round(P.left() * (A.highApr ? 0.5 : 0.25)));
      take('savings', L.fullEf, Math.max(0, A.living * 3 - A.balances.savings - A.starter.gap));
      const X = P.left(); const half = Math.round(X / 2);
      take('savings', L.save, half); take('wants', L.fun, X - half);
    } else if (kind === 'debt') {
      take('wants', L.fun, Math.round(R0 * 0.10));
      take('savings', L.ef, Math.min(A.starter.gap, Math.round(R0 * 0.20)));
      if (hasDebt) take('debt', L.extra, P.left()); else take('savings', L.save, P.left());
    } else { // savings
      take('wants', L.fun, Math.round(R0 * 0.15));
      take('savings', L.ef, A.starter.gap);
      take('savings', L.up, A.upcomingSetAside);
      take('savings', L.goals, A.goalsNeeded);
      if (A.highApr) take('debt', L.extra, Math.round(P.left() * 0.10));
      take('savings', L.save, P.left());
    }
    const R = P.left(); if (R > 0) take('savings', L.save, R); // every dollar assigned
    return { amounts: P.o, lines: P.lines };
  }

  // ---------------------------------------------------------------- projection
  function makeSim(A) {
    const inputs = A.debts.map(d => ({ id: d.id, name: d.name, balanceCents: d.balanceCents, aprCenti: d.aprCenti, minCents: d.minCents }));
    const cache = new Map();
    return extra => { extra = Math.max(0, extra | 0); if (!cache.has(extra)) cache.set(extra, WT.simulatePayoff(inputs, extra, 'avalanche')); return cache.get(extra); };
  }
  function projection(A, eff, sim) {
    const extra = Math.max(0, eff.debt - A.debtMinimums);
    const out = { savings12: eff.savings * 12, debtPaid12: 0, debtFreeMonths: A.debts.length ? null : 0, debtFreeEstimate: false, interest: 0, spendingMonthly: eff.wants, interestSaved: 0, extraDebt: extra };
    if (!A.debts.length) return out;
    const s = sim(extra), base = sim(0);
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
  function whyRecommended(A, s) {
    if (A.income <= 0) return 'Add your take-home pay to get a personalized plan. Until then these are starting percentages.';
    if (A.free < 0) {
      return `Your take-home pay is ${money(A.income)} a month. Bills, groceries and gas cost ${cents(A.living)} and minimum debt payments are ${cents(A.debtMinimums)}, so you're ${cents(A.shortfall)} short each month. `
        + `This plan keeps your home, bills, food and gas funded first and puts the remaining ${cents(s.amounts.debt)} toward minimums.`;
    }
    const a = s.amounts; const extra = a.debt - A.debtMinimums; const fun = a.wants;
    const parts = [`Your ${money(A.income)} take-home pay covers essential bills (${money(A.essentials)})${A.everyday ? `, groceries and gas (${money(A.everyday)})` : ''}${A.debtMinimums ? ` and minimum debt payments (${money(A.debtMinimums)})` : ''}, which leaves ${money(A.free)} a month.`];
    if (A.starter.gap > 0) parts.push(`${money(Math.min(A.starter.gap, a.savings))} goes to a starter emergency fund first.`);
    if (extra > 0 && A.highApr) parts.push(`${money(extra)} extra goes to ${A.highAprDebts[0].name} (${aprStr(A.highAprDebts[0].aprCenti)} APR).`);
    else if (extra > 0) parts.push(`${money(extra)} extra goes to debt.`);
    else if (A.debts.length && A.starter.gap > 0) parts.push('Extra debt payments wait until that fund is built.');
    parts.push(`${money(a.savings)} goes to savings and ${money(fun)} is spending money.`);
    return parts.join(' ');
  }
  function whyPreset(A, id, s) {
    const txt = { '50-30-20': 'A classic split: 50% for needs and debt payments, 30% for wants and 20% for savings.', '60-20-20': 'A split for higher costs: 60% for needs and debt payments, 20% for wants and 20% for savings.' }[id];
    if (A.income <= 0) return txt;
    if (s.realistic) return txt + ` For you that is ${money(s.amounts.needs + s.amounts.debt)} for needs and debt, ${money(s.amounts.wants)} for wants and ${money(s.amounts.savings)} for savings.`;
    return txt + ` Your bills, groceries, gas and minimums already take ${pctOf(A.required, A.income)}% of your pay, so the adjusted version keeps them paid and cuts wants and savings.`;
  }
  function whyTilt(A, id, s) {
    if (A.income <= 0) return id === 'debt' ? 'Puts every spare dollar toward debt after bills.' : 'Puts every spare dollar toward savings after bills.';
    if (A.free < 0) return `There isn't enough income for bills, groceries, gas and minimums (${cents(A.shortfall)} short), so there is nothing extra for ${id === 'debt' ? 'debt' : 'savings'} yet.`;
    const extra = s.amounts.debt - A.debtMinimums;
    if (id === 'debt') {
      if (!A.debts.length) return `You have no debts, so this plan saves ${money(s.amounts.savings)} a month instead.`;
      const target = A.highAprDebts[0] || A.debts.slice().sort((x, y) => y.aprCenti - x.aprCenti)[0];
      return `Pays your minimums plus ${money(extra)} extra a month, starting with ${target.name} (${aprStr(target.aprCenti)} APR). You keep ${money(s.amounts.savings)} for savings and ${money(s.amounts.wants)} for wants.`;
    }
    return `Saves ${money(s.amounts.savings)} a month (${s.pct.savings}% of your pay) after bills${A.debtMinimums ? ' and minimum payments' : ''}. That's ${money(s.amounts.savings * 12)} in a year.`;
  }
  function whyZero(A, s) {
    if (A.income <= 0) return 'Gives every dollar of your pay a job. Add your income to see it.';
    if (A.free < 0) return `Every dollar is already needed: you're ${cents(A.shortfall)} short of bills, groceries, gas and minimums.`;
    return `Every dollar of your ${money(A.income)} has a job: ${s.lines.map(l => `${l.label.toLowerCase()} ${money(l.amount)}`).join(', ')}. Nothing is left unassigned.`;
  }

  // ---------------------------------------------------------------- strategies
  function base(A) { return { month: A.month, income: A.income, essentials: A.essentials, debtMinimums: A.debtMinimums, committed: A.committed, living: A.living, required: A.required }; }
  function presetPct(A, needsDebt, wants, savings) {
    // the preset's "needs" share covers living costs and debt minimums; split it in their proportion
    const nd = needsDebt * 10; let debt10 = 0;
    const req = A.living + A.debtMinimums;
    if (A.debtMinimums > 0 && req > 0) debt10 = Math.round(nd * A.debtMinimums / req);
    return { needs: (nd - debt10) / 10, debt: debt10 / 10, savings, wants };
  }
  function personalized(A, id) {
    const pa = planAmounts(A, id);
    const fb = { recommended: { needs: 50, debt: 0, savings: 20, wants: 30 }, zero: { needs: 50, debt: 0, savings: 30, wants: 20 }, debt: { needs: 50, debt: 30, savings: 10, wants: 10 }, savings: { needs: 50, debt: 5, savings: 35, wants: 10 } }[id];
    const st = { id, name: NAMES[id], kind: KINDS[id], amounts: pa.amounts, pct: pctFromCents(pa.amounts, A.income, fb), lines: pa.lines, feasible: feasibleOf(A, pa.amounts), warnings: [] };
    if (A.income > 0 && A.shortfall > 0) { st.warnings.push(shortfallWarning(A)); st.options = A.options.slice(); }
    return st;
  }
  function customStrategy(A) {
    const cfg = sb();
    const cd = cfg.customDollars;
    if (cd && typeof cd === 'object' && BUCKETS.some(b => toCents(cd[b]) > 0)) {
      const r = fromDollars(A, cd);
      const st = { id: 'custom', name: NAMES.custom, kind: KINDS.custom, source: 'dollars', pct: r.pct, amounts: r.dollars, unallocated: r.unallocated, over: r.over, feasible: r.feasible, warnings: r.warnings.slice() };
      st.why = A.income > 0 ? `Your own plan: ${money(r.dollars.needs)} needs, ${money(r.dollars.debt)} debt, ${money(r.dollars.savings)} savings and ${money(r.dollars.wants)} wants${r.unallocated > 0 ? `, with ${money(r.unallocated)} not assigned yet` : r.over > 0 ? `, ${money(r.over)} over your pay` : ''}.` : 'Your own plan. Add your income to check it.';
      return st;
    }
    const cust = cfg.custom;
    if (cust && typeof cust === 'object' && BUCKETS.some(b => num(cust[b]) > 0)) {
      const al = allocate(A, cust);
      const st = { id: 'custom', name: NAMES.custom, kind: KINDS.custom, source: 'percent', pct: al.pct, amounts: al.amounts, feasible: al.feasible, warnings: al.warnings.slice() };
      if (al.adjusted) st.adjusted = al.adjusted;
      st.why = A.income > 0 ? `Your own split: ${money(al.amounts.needs)} needs, ${money(al.amounts.debt)} debt, ${money(al.amounts.savings)} savings and ${money(al.amounts.wants)} wants.` : 'Your own split. Add your income to see dollar amounts.';
      return st;
    }
    return null;
  }

  function strategies(A) {
    A = A || analyze();
    const sim = makeSim(A);
    const list = [];

    const rec = personalized(A, 'recommended');
    if (A.free >= 0 && A.optionalBills > 0 && rec.amounts.wants < A.optionalBills) rec.warnings.push(`Your optional bills and subscriptions cost ${money(A.optionalBills)} a month but this plan has ${money(rec.amounts.wants)} for wants.`);
    rec.why = whyRecommended(A, rec);
    list.push(rec);

    [['50-30-20', 50, 30, 20], ['60-20-20', 60, 20, 20]].forEach(([id, nd, w, s]) => {
      const al = allocate(A, presetPct(A, nd, w, s));
      const st = { id, name: NAMES[id], kind: KINDS[id], pct: al.pct, amounts: al.amounts, feasible: al.feasible, warnings: al.warnings.slice() };
      if (al.adjusted) st.adjusted = al.adjusted;
      st.realistic = al.realistic;
      st.why = whyPreset(A, id, st);
      list.push(st);
    });

    ['debt', 'savings'].forEach(id => {
      const st = personalized(A, id);
      if (id === 'debt' && !A.debts.length && A.income > 0) st.warnings.push('You have no debts to pay off, so this plan works like Savings-focused.');
      st.why = whyTilt(A, id, st);
      list.push(st);
    });

    const z = personalized(A, 'zero');
    z.unallocated = A.income - sum4(z.amounts);
    z.why = whyZero(A, z);
    list.push(z);

    const cust = customStrategy(A);
    if (cust) list.push(cust);

    const ideal = rec.pct;
    for (const st of list) {
      const eff = st.adjusted ? st.adjusted : st;
      st.realistic = realisticOf(A, st.amounts);
      st.projection = projection(A, eff.amounts, sim);
      st.debtSplit = { minimum: Math.min(eff.amounts.debt, A.debtMinimums), extra: Math.max(0, eff.amounts.debt - A.debtMinimums) };
      st.disposable = Math.max(0, eff.amounts.wants - A.optionalBills);
      st.annualSavings = eff.amounts.savings * 12;
      st.risks = risksOf(A, st.amounts, st.projection);
      if (st.adjusted) st.adjusted.risks = risksOf(A, st.adjusted.amounts, st.projection);
      if (st.unallocated == null) st.unallocated = A.income - sum4(st.amounts);
      st.fitScore = st.id === 'recommended' ? fitScore(A, ideal, ideal, st.realistic) : fitScore(A, eff.pct, ideal, st.realistic);
      st.base = base(A);
    }
    return list;
  }

  // ---------------------------------------------------------------- compare
  function compare(A, list) {
    list = list || strategies(A);
    const rows = list.map(s => ({
      id: s.id, name: s.name, savings12: s.projection.savings12, annualSavings: s.projection.savings12, debtPaid12: s.projection.debtPaid12,
      debtFreeMonths: s.projection.debtFreeMonths, debtFreeEstimate: !!s.projection.debtFreeEstimate, interest: s.projection.interest, interestSaved: s.projection.interestSaved,
      spendingMonthly: s.projection.spendingMonthly, disposable: s.disposable, debtSplit: s.debtSplit, risks: s.risks || [],
      feasible: s.feasible, realistic: !!s.realistic, fitScore: s.fitScore,
    }));
    // "Best fit" only ever goes to a plan that funds living costs and minimums
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
    const rec = planAmounts(A, 'recommended').amounts;
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
  };
});
