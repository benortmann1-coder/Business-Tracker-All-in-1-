/* WealthTrack Smart Budget — paycheck planner + debt payoff engine (WTPlan). No DOM.
 *
 * Read-only over WT's data: it never creates, changes or deletes bills, payments, incomes,
 * debts or settings, and never calls a WT function that saves. Unsaved edits (bill moves,
 * income and allocation overrides) are previewed from the options passed in; the UI applies
 * them on Save (WT.assignInstance for moves, settings.smartBudget for overrides).
 * Money is integer cents.
 *
 * paycheckPlan: the next paychecks across every income source, each bill funded by exactly one
 * paycheck (the existing assignment), allocations (everyday / savings / extra debt / spending),
 * carry-forward of what's left, and exact reserves from earlier paychecks for short ones.
 * debtPlans: avalanche / snowball / custom / minimum-only payoff comparisons over real debts only.
 */
(function (root, f) {
  if (typeof module === 'object' && module.exports) module.exports = f(require('./core.js'), function () { try { return require('./smartbudget.js'); } catch (e) { return null; } });
  else root.WTPlan = f(root.WT, function () { return root.WTSmart || null; });
})(this, function (WT, getSmart) {
  'use strict';

  const ALLOC = ['everyday', 'savings', 'extraDebt', 'wants'];
  const ALLOC_NAMES = { everyday: 'Everyday', savings: 'Savings', extraDebt: 'Extra debt', wants: 'Spending' };
  const ESSENTIAL_RE = /housing|rent|mortgage|utilit|electric|water|gas|internet|phone|insurance|grocer|food|medical|health|transport|car|auto|fuel|child|loan|tax|homeowner|property|hoa|pmi|escrow|maintenance|repair/i;
  const TIGHT = 2500; // warn when less than $25 is left after bills and allocations
  const fmt = c => WT.fmt(c);
  const today = () => WT.todayStr();
  const isCents = v => typeof v === 'number' && Number.isInteger(v) && v >= 0;
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const sb = () => { const s = (WT.D && WT.settings && WT.settings()) || {}; return (s.smartBudget && typeof s.smartBudget === 'object') ? s.smartBudget : {}; };
  const smart = () => { try { const S = getSmart(); return S && typeof S.analyze === 'function' ? S : null; } catch (e) { return null; } };
  const zeroAlloc = () => ({ everyday: 0, savings: 0, extraDebt: 0, wants: 0 });
  const sumAlloc = a => ALLOC.reduce((t, k) => t + (a[k] || 0), 0);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const short = d => WT.shortDate(d);

  function essential(catId) {
    const S = smart();
    if (S && typeof S.essentialCategory === 'function') { try { return !!S.essentialCategory(catId, 'bill'); } catch (e) { /* fall through */ } }
    const ov = sb().essentialOverrides; if (ov && has(ov, catId)) return !!ov[catId];
    const c = (WT.D.categories || {})[catId];
    return ESSENTIAL_RE.test(((c && c.name) || '') + ' ' + (catId || '')) || !/subscript|stream|entertain|dining|restaurant|shopping|hobby|gift|travel|fun/i.test(((c && c.name) || '') + ' ' + (catId || ''));
  }

  // ---------------------------------------------------------------- strategy -> monthly allocation amounts
  function pickStrategy(opts) {
    if (opts.strategy && typeof opts.strategy === 'object') return { s: opts.strategy, A: opts.analysis || null };
    const S = smart(); if (!S) return { s: null, A: null };
    try {
      const A = opts.analysis || S.analyze();
      const list = S.strategies(A) || [];
      const id = typeof opts.strategy === 'string' ? opts.strategy : (sb().strategyId || 'recommended');
      return { s: list.find(x => x.id === id) || list[0] || null, A };
    } catch (e) { return { s: null, A: null }; }
  }
  // Monthly money for the four paycheck allocations. Bills are NOT in here (they're counted per paycheck),
  // so needs/debt/wants have essential bills, debt minimums and optional bills taken out.
  function monthlyAlloc(s, A) {
    if (!s) return null;
    const eff = (s.adjusted && s.adjusted.amounts) ? s.adjusted : s;
    const am = eff.amounts || eff.dollars || s.dollars; if (!am) return null;
    const b = s.base || A || {};
    const essentials = b.essentials != null ? b.essentials : (A && A.essentials) || 0;
    const mins = b.debtMinimums != null ? b.debtMinimums : (A && A.debtMinimums) || 0;
    const optional = (A && A.optionalBills) || 0;
    const income = b.income || (A && A.income) || 0;
    const extra = s.debtSplit && isCents(s.debtSplit.extra) ? s.debtSplit.extra : Math.max(0, (am.debt || 0) - mins);
    return {
      income,
      amounts: { everyday: Math.max(0, (am.needs || 0) - essentials), savings: Math.max(0, am.savings || 0), extraDebt: extra, wants: Math.max(0, (am.wants || 0) - optional) },
    };
  }

  // ---------------------------------------------------------------- bills
  function billOf(i, moved, td) {
    const st = WT.instStatus(i, td);
    // a mortgage bill is housing (needs), even though it pays down a debt
    const mortgage = !!(i.debtId && WT.D.debts[i.debtId] && WT.D.debts[i.debtId].type === 'mortgage');
    const kind = i.debtId && !mortgage ? 'debt' : (mortgage || essential(i.category) ? 'needs' : 'wants');
    return {
      instId: i.id, templateId: i.templateId, name: i.name, dueDate: i.dueDate, amount: i.amountCents || 0, remaining: st.remaining,
      paidAmount: Math.min(st.paid, i.amountCents || 0), paid: st.remaining === 0, status: st.status, kind, essential: kind !== 'wants',
      debtId: i.debtId || null, mortgage, manual: !!i.paycheckKey || moved, moved,
    };
  }
  // the paycheck that would fund this bill with no manual assignment (the automatic rule in WT.paycheckFor)
  function autoKey(i) { const pc = WT.paycheckFor(Object.assign({}, i, { paycheckKey: null })); return pc ? pc.key : null; }
  function targetKey(i, moves) {
    if (has(moves, i.id)) { const k = moves[i.id]; if (k && WT.paycheck(k)) return k; return autoKey(i); }
    const pc = WT.paycheckFor(i); return pc ? pc.key : null;
  }

  function windowPaychecks(count) {
    const td = today();
    const cur = WT.currentPaycheck(td);
    const start = cur && cur.date <= td ? cur.date : td;
    let pcs = []; let span = 62;
    for (let g = 0; g < 8 && pcs.length < count; g++, span *= 2) pcs = WT.paychecksBetween(start, WT.addDays(start, span));
    return pcs.slice(0, count);
  }

  // ---------------------------------------------------------------- paycheck plan
  function paycheckPlan(opts) {
    opts = opts || {};
    const count = opts.count == null ? 4 : Math.max(0, Math.min(60, opts.count | 0));
    const moves = opts.moves || {};
    const set = sb();
    const savedIncome = set.paycheckIncome || {}, savedAlloc = set.paycheckAlloc || {};
    const draftIncome = opts.income || {}, draftAlloc = opts.alloc || {};
    const td = today();
    const pcs = windowPaychecks(count);
    const keys = new Set(pcs.map(p => p.key));
    const warnings = [];

    // every bill in exactly one paycheck
    const byKey = new Map(pcs.map(p => [p.key, []]));
    const seen = new Set();
    const consider = (i, moved) => {
      if (!i || seen.has(i.id) || i.skipped) return; seen.add(i.id);
      const k = targetKey(i, moves);
      if (k && keys.has(k)) byKey.get(k).push(billOf(i, moved, td));
    };
    for (const id of Object.keys(moves)) consider(WT.D.instances[id], true);
    for (const pc of pcs) for (const i of WT.billsForPaycheck(pc.key)) consider(i, false);

    // monthly allocations from the chosen strategy
    const { s: strat, A } = pickStrategy(opts);
    const mAlloc = monthlyAlloc(strat, A);
    const setAsideEveryday = (WT.settings().setAsides || []).filter(x => x && x.amountCents > 0).reduce((t, x) => t + x.amountCents, 0);

    const rows = pcs.map(pc => {
      const inc = pc.income || {};
      const expected = pc.expectedCents || 0;
      const base = pc.received ? pc.amountCents : expected;
      let net = base, overridden = false;
      const ov = has(draftIncome, pc.key) ? draftIncome[pc.key] : savedIncome[pc.key];
      if (isCents(ov)) { net = ov; overridden = true; }
      const bills = byKey.get(pc.key).sort((a, b) => a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.name.localeCompare(b.name));
      const billsDue = bills.reduce((t, b) => t + b.remaining, 0);
      const billsPaid = bills.reduce((t, b) => t + b.paidAmount, 0);

      // default allocations: monthly strategy amounts pro-rated by this paycheck's share of monthly income
      const def = zeroAlloc();
      if (mAlloc && mAlloc.income > 0) ALLOC.forEach(k => { def[k] = WT.divRound(mAlloc.amounts[k] * net, mAlloc.income); });
      else def.everyday = setAsideEveryday;
      // stability first: savings / extra debt / spending defaults never push a paycheck short by themselves
      let room = Math.max(0, net - billsDue - def.everyday), trimmed = false;
      for (const k of ['savings', 'extraDebt', 'wants']) { if (def[k] > room) { def[k] = room; trimmed = true; } room -= def[k]; }

      const alloc = Object.assign({}, def); const allocOverridden = {};
      const sv = savedAlloc[pc.key], dv = has(draftAlloc, pc.key) ? draftAlloc[pc.key] : undefined;
      ALLOC.forEach(k => {
        let v;
        if (dv && has(dv, k)) v = dv[k]; else if (dv === null) v = undefined; else if (sv && isCents(sv[k])) v = sv[k];
        if (isCents(v)) { alloc[k] = v; allocOverridden[k] = true; }
      });
      return {
        key: pc.key, date: pc.date, incomeId: pc.incomeId, incomeName: inc.name || 'Paycheck', schedule: inc.schedule || null,
        expected, net, received: !!pc.received, incomeOverridden: overridden, current: pc.date <= td,
        bills, billsDue, billsPaid, billsTotal: billsDue + billsPaid,
        alloc, allocDefault: def, allocOverridden, allocTrimmed: trimmed, allocTotal: sumAlloc(alloc),
        carryIn: 0, reserveIn: 0, reserveOut: 0, reserveFrom: [], reserveFor: [], available: 0, remaining: 0,
        overallocated: false, shortfall: 0, warnings: [],
      };
    });

    // reserves: a short paycheck takes the exact gap from the closest earlier paycheck that has money to spare
    const gap = rows.map(r => r.net - r.billsDue - r.allocTotal);
    const spare = gap.map(g => Math.max(0, g));
    rows.forEach((r, j) => {
      if (gap[j] >= 0) return;
      let need = -gap[j];
      for (let k = j - 1; k >= 0 && need > 0; k--) {
        const take = Math.min(spare[k], need); if (take <= 0) continue;
        spare[k] -= take; need -= take;
        rows[k].reserveOut += take; rows[k].reserveFor.push({ key: r.key, date: r.date, amount: take });
        r.reserveIn += take; r.reserveFrom.push({ key: rows[k].key, date: rows[k].date, amount: take });
      }
      r.shortfall = need;
    });
    // carry-forward: what's left (after bills, allocations and reserves) rolls into the next paycheck
    let carry = 0;
    rows.forEach(r => {
      r.carryIn = carry;
      r.available = r.net + r.carryIn + r.reserveIn;
      r.remaining = r.available - r.billsDue - r.allocTotal - r.reserveOut;
      r.overallocated = r.remaining < 0;
      carry = Math.max(0, r.remaining);
    });

    // plain-English warnings
    const cash = (() => { try { return WT.availableBalance(); } catch (e) { return 0; } })();
    rows.forEach(r => {
      const w = r.warnings; const d = short(r.date);
      if (r.incomeOverridden && r.net !== r.expected) w.push(`Using your amount for this paycheck (${fmt(r.net)}) instead of the usual ${fmt(r.expected)}.`);
      if (r.billsDue > r.net) w.push(`Bills on this paycheck (${fmt(r.billsDue)}) are more than the paycheck itself (${fmt(r.net)}).`);
      if (r.reserveIn > 0) w.push(r.reserveFrom.map(x => `Set aside ${fmt(x.amount)} from the ${short(x.date)} paycheck`).join('. ') + ` to cover this paycheck's bills and allocations.`);
      if (r.reserveOut > 0) w.push(r.reserveFor.map(x => `Keep ${fmt(x.amount)} of this paycheck for the ${short(x.date)} paycheck`).join('. ') + '.');
      if (r.shortfall > 0) {
        const parts = [`This paycheck is ${fmt(r.shortfall)} short`];
        if (r.reserveIn > 0) parts[0] += ' even after setting money aside from earlier paychecks';
        const optional = r.alloc.savings + r.alloc.extraDebt + r.alloc.wants;
        const fixes = [];
        if (optional > 0) fixes.push(`lower Savings, Extra debt or Spending (${fmt(optional)} planned)`);
        fixes.push('fund a bill from another paycheck');
        if (cash > 0) fixes.push(`use your available balance (${fmt(cash)})`);
        w.push(parts[0] + '. You could ' + fixes.join(', or ') + '.');
      } else if (r.allocTotal > 0 && r.billsDue <= r.net && r.billsDue + r.allocTotal > r.net) {
        w.push(`Bills and allocations (${fmt(r.billsDue + r.allocTotal)}) are ${fmt(r.billsDue + r.allocTotal - r.net)} more than this paycheck (${fmt(r.net)}).`);
      } else if (r.remaining >= 0 && r.remaining < TIGHT && r.net > 0) {
        w.push(`Only ${fmt(r.remaining)} is left after bills and allocations.`);
      }
      if (r.allocTrimmed) w.push(`Savings, Extra debt and Spending were lowered on this paycheck so the bills and everyday money are covered first.`);
      if (r.shortfall > 0) warnings.push(`The ${d} paycheck (${r.incomeName}) is ${fmt(r.shortfall)} short of its bills and allocations.`);
      else if (r.reserveIn > 0) warnings.push(`The ${d} paycheck can't cover its bills by itself: ` + r.reserveFrom.map(x => `set aside ${fmt(x.amount)} from the ${short(x.date)} paycheck`).join(' and ') + '.');
    });
    if (!pcs.length) warnings.push('Add your income (a job and its pay schedule) to plan paycheck by paycheck.');

    // overdue bills that no upcoming paycheck funds
    const unassigned = [];
    for (const { i, s } of WT.overdue(td)) {
      if (seen.has(i.id)) continue;
      const k = targetKey(i, moves);
      if (k && keys.has(k)) continue;
      unassigned.push({ instId: i.id, name: i.name, dueDate: i.dueDate, remaining: s.remaining });
    }
    if (unassigned.length) warnings.push(`${plural(unassigned.length, 'overdue bill')} (${fmt(unassigned.reduce((t, x) => t + x.remaining, 0))}) ${unassigned.length === 1 ? 'is' : 'are'} not in any upcoming paycheck: ${unassigned.map(x => x.name).join(', ')}. Use "Fund from…" to pick a paycheck.`);

    const totals = { net: 0, expected: 0, billsDue: 0, billsPaid: 0, alloc: zeroAlloc(), allocTotal: 0, reserve: 0, shortfall: 0, remaining: rows.length ? rows[rows.length - 1].remaining : 0 };
    rows.forEach(r => { totals.net += r.net; totals.expected += r.expected; totals.billsDue += r.billsDue; totals.billsPaid += r.billsPaid; ALLOC.forEach(k => totals.alloc[k] += r.alloc[k]); totals.allocTotal += r.allocTotal; totals.reserve += r.reserveOut; totals.shortfall += r.shortfall; });
    return { paychecks: rows, totals, warnings, unassigned, strategyId: strat ? strat.id || null : null, monthly: mAlloc };
  }

  // paychecks that can fund a bill: from the plan window start up to its due date, plus the one funding it now
  function moveTargets(instId, opts) {
    opts = opts || {};
    const i = WT.D.instances[instId]; if (!i) return [];
    const moves = opts.moves || {};
    const curKey = targetKey(i, moves);
    const first = windowPaychecks(1)[0];
    const start = first ? first.date : today();
    const list = start <= i.dueDate ? WT.paychecksBetween(start, i.dueDate) : [];
    if (curKey && !list.some(p => p.key === curKey)) { const pc = WT.paycheck(curKey); if (pc) list.push(pc); }
    const auto = autoKey(i);
    return list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0).map(pc => ({
      key: pc.key, date: pc.date, incomeName: (pc.income && pc.income.name) || 'Paycheck',
      label: WT.dateLabel(pc.date) + ' · ' + ((pc.income && pc.income.name) || 'Paycheck'), current: pc.key === curKey, automatic: pc.key === auto,
    }));
  }

  // ---------------------------------------------------------------- debt payoff
  function templateMonthly(t) {
    if (!t || t.deleted || t.status === 'cancelled' || t.status === 'paused') return 0;
    const td = today(); if (t.endDate && t.endDate < td) return 0;
    const r = WT.currentRule(t); if (!r) return 0;
    const a = r.amountCents || 0;
    switch (r.frequency) {
      case 'weekly': return Math.round(a * 52 / 12);
      case 'biweekly': return Math.round(a * 26 / 12);
      case 'monthly': return a;
      case 'quarterly': return Math.round(a / 3);
      case 'yearly': return Math.round(a / 12);
      case 'custom': { const n = Math.max(1, parseInt(r.interval, 10) || 1); if (r.unit === 'day') return Math.round(a * 365 / 12 / n); if (r.unit === 'week') return Math.round(a * 52 / 12 / n); if (r.unit === 'year') return Math.round(a / 12 / n); return Math.round(a / n); }
      default: return 0;
    }
  }
  function debtList() {
    const linked = {};
    for (const t of Object.values(WT.D.templates || {})) if (t && t.debtId) linked[t.debtId] = (linked[t.debtId] || 0) + templateMonthly(t);
    const out = [], missing = [];
    for (const d of WT.debts()) {
      if (d.closed) continue;
      const bal = WT.debtBalance(d.id);
      const hist = WT.debtCharges(d.id).length > 0;
      const noBalance = !Number.isFinite(bal) || d.startBalanceCents == null || (bal <= 0 && !hist && d.needsBalance);
      const fields = [];
      if (noBalance) fields.push('balance');
      else if (bal <= 0) continue; // paid off
      const aprSet = Number.isInteger(d.aprCenti) && (d.aprCenti > 0 || d.aprKnown === true);
      if (!aprSet) fields.push('apr');
      // a mortgage's escrow (property tax + insurance) is in the payment but doesn't pay down the loan: P&I only
      const esc = WT.debtEscrow ? WT.debtEscrow(d) : 0;
      const min = Math.max(0, Math.max(Number.isInteger(d.minCents) ? d.minCents : 0, linked[d.id] || 0) - esc);
      if (!(min > 0)) fields.push('minimum');
      if (fields.length) missing.push({ id: d.id, name: d.name, fields });
      if (noBalance) continue;
      const type = d.type || 'other';
      const row = { id: d.id, name: d.name, balance: bal, apr: aprSet ? d.aprCenti : 0, minimum: min, dueDay: d.dueDay || 1, aprMissing: !aprSet, minMissing: !(min > 0), billMinimum: linked[d.id] || 0, type, revolving: !!REVOLVING[type] };
      if (type === 'mortgage') Object.assign(row, { housing: true, escrow: esc, payment: min + esc });
      out.push(row);
    }
    return { debts: out, missing };
  }
  // Same month-by-month math as WT.simulatePayoff, with any payoff order. prio(a, b) sorts debts for the extra money;
  // prio null = minimum payments only (a paid-off debt's payment is not rolled over).
  function simulate(debts, extra, prio) {
    const ds = debts.map(d => ({ d, bal: d.balance, interest: 0, month: null }));
    const budget = debts.reduce((t, d) => t + d.minimum, 0) + (prio ? extra : 0);
    const tl = [ds.reduce((t, x) => t + x.bal, 0)];
    let month = 0, interest = 0, stuck = false;
    while (ds.some(x => x.bal > 0) && month < 600) {
      month++;
      for (const x of ds) if (x.bal > 0) { const it = WT.monthlyInterest(x.bal, x.d.apr); x.bal += it; x.interest += it; interest += it; }
      let pool = budget;
      for (const x of ds) if (x.bal > 0) { const p = Math.min(x.d.minimum, x.bal, pool); x.bal -= p; pool -= p; }
      if (prio) for (const x of ds.filter(y => y.bal > 0).sort((a, b) => prio(a.d, b.d))) { if (pool <= 0) break; const p = Math.min(pool, x.bal); x.bal -= p; pool -= p; }
      for (const x of ds) if (x.bal <= 0 && x.month == null) x.month = month;
      tl.push(ds.reduce((t, x) => t + Math.max(0, x.bal), 0));
      if (month > 24 && tl[month] >= tl[month - 12]) { stuck = true; break; }
    }
    if (ds.some(x => x.bal > 0)) stuck = true;
    return { months: stuck ? null : month, totalInterest: interest, stuck, budget, per: ds, timeline: tl };
  }
  const REVOLVING = { credit_card: true, line: true, heloc: true }; // cards revolve; loans are installment (fixed payment)
  const AVALANCHE = (a, b) => b.apr - a.apr || a.balance - b.balance || a.name.localeCompare(b.name);
  const SNOWBALL = (a, b) => a.balance - b.balance || b.apr - a.apr || a.name.localeCompare(b.name);
  function customPrio(order) {
    const pos = new Map(); (order || []).forEach((id, n) => { if (!pos.has(id)) pos.set(id, n); });
    return (a, b) => { const pa = pos.has(a.id) ? pos.get(a.id) : Infinity, pb = pos.has(b.id) ? pos.get(b.id) : Infinity; return pa !== pb ? (pa < pb ? -1 : 1) : AVALANCHE(a, b); };
  }
  function payoffDateFor(dueDay, months) {
    const td = today(); const mk = WT.monthOf(td);
    const off = WT.dateInMonthClamped(mk, dueDay) >= td ? 0 : 1;
    return WT.dateInMonthClamped(WT.addMonthKey(mk, months - 1 + off), dueDay);
  }

  function debtPlans(opts) {
    opts = opts || {};
    const saved = (sb().debt && typeof sb().debt === 'object') ? sb().debt : {};
    const extra = isCents(opts.extra) ? opts.extra : (isCents(saved.extra) ? saved.extra : 0);
    const method = ['avalanche', 'snowball', 'custom'].includes(opts.method) ? opts.method : (['avalanche', 'snowball', 'custom'].includes(saved.method) ? saved.method : 'avalanche');
    const order = Array.isArray(opts.order) ? opts.order : (Array.isArray(saved.order) ? saved.order : []);
    const { debts, missing } = debtList();
    const minimums = debts.reduce((t, d) => t + d.minimum, 0);
    // mortgage principal + interest is paid from Essentials (housing); the rest are the Debt bucket's minimums
    const housingMinimums = debts.filter(d => d.housing).reduce((t, d) => t + d.minimum, 0);
    const totalBalance = debts.reduce((t, d) => t + d.balance, 0);
    const estimate = missing.length > 0;
    const missingNotes = [];
    missing.forEach(m => {
      const f = m.fields.map(x => x === 'apr' ? 'interest rate (APR)' : x === 'minimum' ? 'minimum payment' : 'balance');
      const assumed = m.fields.includes('balance') ? 'It is left out of these plans.' : [m.fields.includes('apr') ? '0% interest was assumed' : '', m.fields.includes('minimum') ? 'no minimum payment was assumed' : ''].filter(Boolean).join(' and ') + '.';
      missingNotes.push(`${m.name} has no ${f.join(' or ')}. ${assumed.charAt(0).toUpperCase() + assumed.slice(1)}`);
    });

    const minimum = simulate(debts, 0, null);
    const build = (id, prio) => {
      const sim = simulate(debts, extra, prio);
      const per = sim.per.slice();
      if (prio) per.sort((a, b) => (a.month == null ? Infinity : a.month) - (b.month == null ? Infinity : b.month) || prio(a.d, b.d));
      const orderOut = per.map(x => {
        const exact = !estimate && x.month != null;
        return { id: x.d.id, name: x.d.name, type: x.d.type, housing: !!x.d.housing, escrow: x.d.escrow || 0, revolving: x.d.revolving, balance: x.d.balance, apr: x.d.apr, minimum: x.d.minimum, aprMissing: x.d.aprMissing, minimumMissing: x.d.minMissing, interest: x.interest, payoffMonth: x.month, payoffDate: exact ? payoffDateFor(x.d.dueDay, x.month) : null };
      });
      const notes = [];
      const months = sim.months;
      const lastDate = months != null && !estimate ? orderOut.reduce((m, x) => (x.payoffDate && x.payoffDate > m ? x.payoffDate : m), '') || null : null;
      if (!debts.length) notes.push(missing.length ? 'Add the missing details below to see a payoff plan.' : 'You have no open debts with a balance.');
      else if (sim.stuck) notes.push(`At ${fmt(sim.budget)} a month this never pays off: the interest grows as fast as the payments. Add an extra payment or ask your lenders for a lower rate.`);
      if (debts.length && prio) {
        const first = debts.slice().sort(prio)[0];
        if (id === 'avalanche') notes.push(`Extra money goes to the highest interest rate first: ${first.name} (${WT.pctStr(first.apr)} APR).`);
        if (id === 'snowball') notes.push(`Extra money goes to the smallest balance first: ${first.name} (${fmt(first.balance)}).`);
        if (id === 'custom') notes.push(order.some(x => debts.some(d => d.id === x)) ? `Extra money goes to the debts you picked first, starting with ${first.name}. The rest follow by highest interest rate.` : 'Pick which debts get extra money first. Until you do, this works like Avalanche.');
        if (extra <= 0) notes.push('With no extra payment, only the minimums are paid. When a debt is paid off, its payment moves to the next one.');
      }
      if (estimate && debts.length) notes.push('These are estimates, not exact dates, because some debt details are missing.');
      missingNotes.forEach(n => notes.push(n));
      // vs minimum-only. When minimums alone never pay off, that plan's interest so far is a floor, so the saving is "at least".
      let interestSaved = 0, interestSavedAtLeast = false;
      if (prio) {
        if (sim.stuck) interestSaved = null;
        else { interestSaved = Math.max(0, minimum.totalInterest - sim.totalInterest); interestSavedAtLeast = minimum.stuck; }
        if (interestSavedAtLeast) notes.push(`Paying only the minimums would never pay these debts off. This plan saves at least ${fmt(interestSaved)} in interest.`);
      }
      return { id, order: orderOut, monthly: sim.budget, months, payoffDate: lastDate, totalInterest: sim.totalInterest, interestSaved, interestSavedAtLeast, neverPaysOff: debts.length > 0 && sim.stuck, estimate, notes, timeline: sim.timeline.slice() };
    };
    const methods = { avalanche: build('avalanche', AVALANCHE), snowball: build('snowball', SNOWBALL), custom: build('custom', customPrio(order)), minimum: build('minimum', null) };
    let best = null;
    for (const id of ['avalanche', 'snowball', 'custom']) {
      const m = methods[id]; if (m.neverPaysOff || m.months == null) continue;
      const b = best && methods[best];
      if (!b || m.totalInterest < b.totalInterest || (m.totalInterest === b.totalInterest && m.months < b.months)) best = id;
    }
    return { minimums, housingMinimums, debtMinimums: minimums - housingMinimums, extra, method, order: order.slice(), totalBalance, count: debts.length, methods, selected: methods[method], best, estimate, missing };
  }

  // Public payoff simulation over debtPlans-shaped debts ({id, name, balance, apr, minimum}).
  // method: 'avalanche' | 'snowball' | 'minimum' | an array of debt ids (custom order).
  function simulatePlan(debts, extra, method) {
    const prio = Array.isArray(method) ? customPrio(method) : method === 'snowball' ? SNOWBALL : method === 'minimum' ? null : AVALANCHE;
    const ds = (debts || []).filter(d => d && d.balance > 0).map(d => ({ id: d.id, name: d.name || '', balance: d.balance, apr: d.apr || 0, minimum: d.minimum || 0 }));
    const r = simulate(ds, isCents(extra) ? extra : 0, prio);
    return { months: r.months, totalInterest: r.totalInterest, stuck: r.stuck, budget: r.budget, timeline: r.timeline, order: r.per.map(x => ({ id: x.d.id, name: x.d.name, interest: x.interest, payoffMonth: x.month })) };
  }

  return { ready: true, ALLOC, ALLOC_NAMES, paycheckPlan, moveTargets, debtPlans, simulate: simulatePlan, debtList: () => debtList(), _simulate: simulate };
});
