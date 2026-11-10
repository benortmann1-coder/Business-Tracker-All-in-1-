// Smart Budget: paycheck-by-paycheck planner + debt payoff screens (WTPlanUI).
// Renders through window.WTUI helpers (app.js) and the WTPlan engine (smartplan.js). Read-only over WT data:
// the only writes happen on Save — WT.assignInstance (which paycheck funds a bill) and settings.smartBudget.
(function () {
  'use strict';
  const U = () => window.WTUI || {};
  const Wt = () => (window.WTUI && window.WTUI.W) || window.WT;
  const Plan = () => (typeof window.WTPlan !== 'undefined' && window.WTPlan) || null;
  const has = n => { const P = Plan(); return !!(P && typeof P[n] === 'function'); };
  const ALLOC = [['everyday', 'Everyday', 'Groceries, gas, getting to work'], ['savings', 'Savings', 'Emergency fund and goals'], ['extraDebt', 'Extra debt', 'On top of the minimums'], ['wants', 'Spending money', 'Fun, eating out, extras']];
  const METHODS = [['avalanche', 'Avalanche', 'Highest interest rate first. Usually saves the most interest.'], ['snowball', 'Snowball', 'Smallest balance first. Quick wins keep you going.'], ['custom', 'Custom', 'You pick which debts get the extra money first.']];
  const FIELD = { apr: 'interest rate (APR)', minimum: 'minimum payment', balance: 'balance' };
  const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
  const fmt = c => U().fmt ? U().fmt(num(c)) : String(num(c) / 100);
  const esc = s => U().esc ? U().esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = n => U().ic ? U().ic(n) : '';
  const sectionH = (t, m, l) => U().sectionH ? U().sectionH(t, m, l) : `<div class="section-h"><h2>${t}</h2></div>`;
  const toast = (m, o) => U().toast && U().toast(m, o);
  const sym = () => { try { return Wt().display().symbol || '$'; } catch (e) { return '$'; } };
  const cfg = () => { try { const s = Wt().settings().smartBudget; return s && typeof s === 'object' ? s : {}; } catch (e) { return {}; } };
  const short = d => { try { return Wt().shortDate(d); } catch (e) { return d || ''; } };
  const longDate = d => { try { return Wt().dateLabel(d); } catch (e) { return d || ''; } };
  const money = c => Wt().centsToStr(num(c));
  const parse = v => { const s = String(v == null ? '' : v).trim(); if (s === '') return 0; const c = Wt().parseMoney(s); return c == null || c < 0 || c > 1e11 ? null : c; };
  const isObj = o => o && typeof o === 'object' && !Array.isArray(o);
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  // ------------------------------------------------------------ drafts (memory only until Save)
  const draft = { moves: {}, income: {}, alloc: {}, debt: null, debtDirty: false, ctx: null };
  const pcDirty = () => Object.keys(draft.moves).length + Object.keys(draft.income).length + Object.keys(draft.alloc).length > 0;
  function clearPc() { draft.moves = {}; draft.income = {}; draft.alloc = {}; }
  function clearDebt() { draft.debt = null; draft.debtDirty = false; }

  // saved overrides with the draft on top (null in the draft = remove the saved override)
  // (null is passed through to the engine so it ignores the saved value; it's dropped when saving)
  function mergedIncome() { return Object.assign({}, isObj(cfg().paycheckIncome) ? cfg().paycheckIncome : {}, draft.income); }
  function mergedAlloc() { return Object.assign({}, isObj(cfg().paycheckAlloc) ? cfg().paycheckAlloc : {}, draft.alloc); }
  const noNulls = o => { const out = {}; Object.keys(o).forEach(k => { if (o[k] != null) out[k] = o[k]; }); return out; };

  function getCtx(ctx) {
    if (ctx && typeof ctx === 'object') { draft.ctx = ctx; return ctx; }
    if (draft.ctx) return draft.ctx;
    try { const E = window.WTSmart; const a = E.analyze(); const list = E.strategies(a) || []; const id = cfg().strategyId; return { a, strategies: list, chosen: list.find(s => s.id === id) || list.find(s => s.id === 'recommended') || list[0], smart: E }; } catch (e) { return {}; }
  }
  function plan() {
    if (!has('paycheckPlan')) return null;
    const ctx = getCtx();
    const r = Plan().paycheckPlan({ count: 4, moves: Object.assign({}, draft.moves), income: mergedIncome(), alloc: mergedAlloc(), strategy: ctx.chosen });
    return r && Array.isArray(r.paychecks) ? r : null;
  }

  // Which earlier paycheck(s) a short paycheck borrows from: the engine's own breakdown when given,
  // otherwise walk back from the closest earlier paycheck (same rule the engine uses).
  function reserveSources(pcs) {
    const out = pcs.map(() => []);
    const left = pcs.map(p => Math.max(0, num(p.reserveOut)));
    pcs.forEach((p, i) => {
      const given = Array.isArray(p.reserveFrom) ? p.reserveFrom : Array.isArray(p.reserveSources) ? p.reserveSources : null;
      if (given) { given.forEach(s => { const src = pcs.find(q => q.key === s.key); const amt = num(s.amount != null ? s.amount : s.cents); if (amt > 0) out[i].push({ key: s.key, date: s.date || (src && src.date), amount: amt }); }); return; }
      let need = Math.max(0, num(p.reserveIn));
      for (let j = i - 1; j >= 0 && need > 0; j--) { const take = Math.min(left[j], need); if (take > 0) { out[i].push({ key: pcs[j].key, date: pcs[j].date, amount: take }); left[j] -= take; need -= take; } }
    });
    return out;
  }
  // where each earlier paycheck's set-aside goes (for the "Keep $X for the Dec 4 paycheck" line)
  function reserveTargets(pcs, src) {
    if (pcs.every(p => Array.isArray(p.reserveFor))) return pcs.map(p => p.reserveFor.filter(t => t && num(t.amount) > 0).map(t => ({ key: t.key, date: t.date, amount: num(t.amount) })));
    const out = pcs.map(() => []); src.forEach((list, i) => list.forEach(s => { const j = pcs.findIndex(q => q.key === s.key); if (j >= 0) out[j].push({ key: pcs[i].key, date: pcs[i].date, amount: s.amount }); })); return out;
  }

  const allocOf = p => { const a = isObj(p.alloc) ? p.alloc : {}; return { everyday: num(a.everyday), savings: num(a.savings), extraDebt: num(a.extraDebt), wants: num(a.wants) }; };
  const allocSum = p => { const a = allocOf(p); return a.everyday + a.savings + a.extraDebt + a.wants; };

  // ------------------------------------------------------------ CSS (themed with the app's tokens)
  const CSS = `
.sp [hidden] { display: none !important; }
.sp .sp-card { padding: 16px; }
.sp .sp-card + .sp-card { margin-top: 12px; }
.sp .sp-card.is-over { border-color: color-mix(in srgb, var(--over) 55%, var(--line)); }
.sp .sp-card-h { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; }
.sp .sp-card-h > div:first-child { min-width: 0; flex: 1 1 160px; }
.sp .sp-src { font-weight: 650; color: var(--ink); font-size: 15px; overflow-wrap: anywhere; }
.sp .sp-money { display: flex; align-items: center; gap: 0; position: relative; }
.sp .sp-money > span { position: absolute; left: 11px; color: var(--ink-3); font-weight: 600; pointer-events: none; font-size: 16px; }
.sp .sp-money .input { padding-left: 24px; height: 42px; font-size: 16px; text-align: right; }
.sp .sp-net { display: flex; flex-direction: column; gap: 3px; flex: 0 1 150px; min-width: 120px; }
.sp .sp-net .input { font-size: 18px; font-weight: 700; }
.sp .sp-sum { margin: 12px 0 4px; padding: 10px 12px; border-radius: 8px; background: var(--sunken); font-size: 13.5px; color: var(--ink-2); line-height: 1.7; overflow-wrap: anywhere; }
.sp .sp-sum b { color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.sp .sp-sum .sp-eq-r { color: var(--paid); } .sp .sp-sum .sp-eq-r.neg { color: var(--over); }
.sp .sp-h4 { font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin: 14px 0 4px; }
.sp .sp-bill { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 12px; align-items: center; padding: 8px 0; border-bottom: 1px dotted var(--line-2); }
.sp .sp-bill { row-gap: 0; }
.sp .sp-bill .sp-bn { min-width: 0; overflow-wrap: anywhere; grid-row: span 2; }
.sp .sp-bill.is-paid .sp-bn { grid-row: auto; }
.sp .sp-bill .num { text-align: right; }
.sp .sp-bill.is-paid .num { color: var(--ink-3); text-decoration: line-through; }
.sp .sp-bill .sp-fund-btn { grid-column: 2; justify-self: end; font-size: 13px; min-height: 40px; padding: 0 2px; }
.sp .sp-bill .sp-fund { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; }
.sp .sp-bill .sp-fund span { flex: none; font-size: 12.5px; color: var(--ink-3); }
.sp .sp-bill .sp-fund select { height: 40px; font-size: 16px; min-width: 0; flex: 1; }
.sp .sp-moved { background: var(--partial-soft); color: var(--partial); }
.sp .sp-alloc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(110px, 140px); gap: 6px 12px; align-items: center; }
.sp .sp-alloc label { min-width: 0; }
.sp .sp-alloc .tiny { display: block; }
.sp .sp-line { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; font-size: 14px; border-bottom: 1px dotted var(--line-2); }
.sp .sp-line > span:first-child { color: var(--ink-2); min-width: 0; }
.sp .sp-line b { font-variant-numeric: tabular-nums; white-space: nowrap; }
.sp .sp-left { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: 8px; padding-top: 10px; border-top: 3px double var(--rule); font-weight: 700; font-size: 16px; }
.sp .sp-left b { font-size: 20px; font-variant-numeric: tabular-nums; }
.sp .sp-left b.pos { color: var(--paid); } .sp .sp-left b.neg { color: var(--over); }
.sp .sp-warn:empty { display: none; }
.sp .sp-warn { display: grid; gap: 8px; margin-top: 10px; }
.sp .sp-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 14px; }
.sp .sp-bar .grow { min-width: 140px; }
.sp .sp-bar .btn { min-height: 40px; }
.sp .sp-dirty { background: var(--due-soft); color: var(--due); }
.sp .sp-tabs { display: flex; gap: 4px; padding: 3px; border: 1px solid var(--line-2); border-radius: 10px; margin-top: 12px; }
.sp .sp-tabs button { flex: 1; min-height: 40px; border: 0; border-radius: 8px; background: none; font-weight: 650; font-size: 14px; color: var(--ink-2); cursor: pointer; }
.sp .sp-tabs button.on { background: var(--sb-accent, var(--brand)); color: var(--sb-on-accent, var(--on-brand)); }
.sp .sp-extra { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.sp .sp-extra label { max-width: 320px; flex: 1 1 180px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sp .sp-figs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-top: 12px; }
.sp .sp-fig { padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); min-width: 0; }
.sp .sp-fig b { display: block; font-size: 17px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sp .sp-tbl { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 14px; }
.sp .sp-tbl td.r, .sp .sp-tbl th.r { text-align: right; }
.sp .sp-tbl tr.on td { background: var(--sb-soft, var(--brand-soft)); }
.sp .sp-order { margin-top: 6px; }
.sp .sp-debt { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 10px 0; border-bottom: 1px dotted var(--line-2); }
.sp .sp-debt .sp-rank { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--sunken); font-weight: 700; font-size: 12.5px; }
.sp .sp-debt .sp-dn { min-width: 0; overflow-wrap: anywhere; }
.sp .sp-debt .sp-mv { display: flex; gap: 4px; }
.sp .sp-debt .sp-mv .btn { width: 40px; height: 40px; padding: 0; }
.sp .sp-debt .sp-pd { text-align: right; font-size: 13px; }
.sp .callout a { font-weight: 650; }
.sp .sp-note { display: flex; gap: 8px; align-items: flex-start; }
.sp .sp-note svg { width: 15px; height: 15px; flex: none; margin-top: 2px; }
.sp .callout ul { margin: 4px 0 0; padding-left: 18px; }
@media (max-width: 600px) {
  .sp .sp-tbl thead { display: none; }
  .sp .sp-tbl, .sp .sp-tbl tbody, .sp .sp-tbl tr, .sp .sp-tbl td { display: block; width: 100%; }
  .sp .sp-tbl tr { border: 1px solid var(--line); border-radius: 8px; padding: 6px 12px; margin-bottom: 8px; background: var(--surface); }
  .sp .sp-tbl tr.on { border-color: var(--sb-accent, var(--brand)); }
  .sp .sp-tbl tr.on td { background: none; }
  .sp .sp-tbl td { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border: 0; text-align: right; }
  .sp .sp-tbl td::before { content: attr(data-label); color: var(--ink-3); font-size: 12.5px; text-align: left; }
  .sp .sp-tbl td.sp-mname { font-weight: 700; font-size: 15px; }
  .sp .sp-tbl td.sp-mname::before { content: none; }
  .sp .sp-alloc { grid-template-columns: minmax(0, 1fr) 130px; }
}`;
  function css() { if (document.getElementById('wt-plan-css')) return; const s = document.createElement('style'); s.id = 'wt-plan-css'; s.textContent = CSS; document.head.appendChild(s); }

  // ------------------------------------------------------------ paycheck by paycheck
  const moneyIn = (val, attrs, label) => `<span class="sp-money"><span>${esc(sym())}</span><input class="input money-in" inputmode="decimal" autocomplete="off" enterkeyhint="done" placeholder="0.00" value="${esc(money(val))}" aria-label="${esc(label)}" ${attrs}></span>`;

  function moveOptions(b, p, pcs) {
    let ts = [];
    try { ts = has('moveTargets') ? (Plan().moveTargets(b.instId) || []) : []; } catch (e) { console.error(e); ts = []; }
    ts = ts.filter(t => t && t.key);
    if (!ts.some(t => t.key === p.key)) ts.push({ key: p.key, date: p.date, label: '' });
    // an overdue bill can be paid from any upcoming paycheck
    if (pcs.length && b.dueDate < pcs[0].date) pcs.forEach(q => { if (!ts.some(t => t.key === q.key)) ts.push({ key: q.key, date: q.date, incomeName: q.incomeName }); });
    ts.sort((x, y) => (x.date || '') < (y.date || '') ? -1 : (x.date || '') > (y.date || '') ? 1 : 0);
    const nameOf = t => { const q = pcs.find(z => z.key === t.key); const n = (q && q.incomeName) || t.incomeName || ''; return 'The ' + short(t.date) + ' paycheck' + (n ? ' · ' + n : '') + (t.automatic && t.key !== p.key ? ' (automatic)' : ''); };
    return ts.map(t => `<option value="${esc(t.key)}"${t.key === p.key ? ' selected' : ''}>${esc(nameOf(t))}</option>`).join('');
  }
  function billRow(b, p, pcs) {
    const paid = !!b.paid, rem = num(b.remaining), amt = num(b.amount);
    const moved = Object.prototype.hasOwnProperty.call(draft.moves, b.instId);
    const partly = !paid && rem < amt && rem > 0;
    return `<div class="sp-bill${paid ? ' is-paid' : ''}" data-inst="${esc(b.instId)}" data-paid="${paid ? 1 : 0}" data-amt="${paid ? 0 : rem}">
      <div class="sp-bn"><b>${esc(b.name)}</b> ${paid ? '<span class="pill paid">Paid</span>' : ''}${moved ? ' <span class="pill sp-moved">Moved · not saved</span>' : ''}
        <div class="tiny faint">Due ${esc(short(b.dueDate))}${paid ? ' · already paid, not counted again' : partly ? ' · ' + fmt(amt - rem) + ' of ' + fmt(amt) + ' paid' : ''}${b.kind === 'debt' ? ' · debt payment' : b.essential === false ? ' · optional' : ''}</div></div>
      <b class="num">${fmt(paid ? amt : rem)}</b>
      ${paid ? '' : `<button type="button" class="link sp-fund-btn" data-act="spFundOpen" data-inst="${esc(b.instId)}" aria-expanded="${moved || draft.open === b.instId ? 'true' : 'false'}">Fund from…</button>`}
      ${paid ? '' : `<label class="sp-fund"${moved || draft.open === b.instId ? '' : ' hidden'}><span>Fund from</span><select class="input" data-act-change="spMove" data-inst="${esc(b.instId)}" aria-label="Fund ${esc(b.name)} from which paycheck">${moveOptions(b, p, pcs)}</select></label>`}
    </div>`;
  }
  // engine warnings that the callouts below already say in their own words
  const DUP = /^(set aside |keep |this paycheck is .* short)/i;
  function warnHtml(p, i, src, tgt) {
    const out = [], ws = (Array.isArray(p.warnings) ? p.warnings : []).filter(w => typeof w === 'string' && w);
    const short_ = Math.max(0, num(p.shortfall));
    (src[i] || []).forEach(s => out.push(`<div class="callout blue small sp-res-in" data-from="${esc(s.key)}" data-amt="${s.amount}">${ic('info')}<div><b>Set aside ${fmt(s.amount)} from the ${esc(short(s.date))} paycheck.</b> This paycheck can't cover its bills and plans by itself.</div></div>`));
    (tgt[i] || []).forEach(t => out.push(`<div class="callout small sp-res-out" data-for="${esc(t.key)}" data-amt="${t.amount}">${ic('wallet')}<div><b>Keep ${fmt(t.amount)} of this paycheck for the ${esc(short(t.date))} paycheck.</b> It's already taken out of "Left after everything".</div></div>`));
    if (short_ > 0) { const eng = ws.find(w => /short/i.test(w) && /^this paycheck/i.test(w)); out.push(`<div class="callout red small sp-short" data-amt="${short_}">${ic('alert')}<div><b>Short by ${fmt(short_)}.</b> ${esc(eng ? eng.replace(/^This paycheck is .*? short[^.]*\.\s*/i, '') : 'Earlier paychecks don\'t have enough left. Lower an amount below or fund a bill from another paycheck.')}</div></div>`); }
    else if (num(p.remaining) < 0 || p.overallocated) out.push(`<div class="callout red small sp-overw">${ic('alert')}<div><b>Over by ${fmt(Math.abs(Math.min(0, num(p.remaining))))}.</b> You've planned more than this paycheck has. Lower an amount below.</div></div>`);
    ws.filter(w => !DUP.test(w)).forEach(w => out.push(`<div class="callout small${/^only /i.test(w) ? ' sp-near' : ''}">${ic('alert')}<div>${esc(w)}</div></div>`));
    return out.join('');
  }
  function sumHtml(p) {
    const a = allocOf(p), parts = [`<b>${fmt(p.net)}</b> paycheck`];
    if (num(p.carryIn) > 0) parts.push(`+ <b>${fmt(p.carryIn)}</b> carried in`);
    if (num(p.reserveIn) > 0) parts.push(`+ <b>${fmt(p.reserveIn)}</b> set aside earlier`);
    parts.push(`− <b>${fmt(p.billsDue)}</b> bills`);
    if (a.everyday) parts.push(`− <b>${fmt(a.everyday)}</b> everyday`);
    if (a.savings) parts.push(`− <b>${fmt(a.savings)}</b> savings`);
    if (a.extraDebt) parts.push(`− <b>${fmt(a.extraDebt)}</b> extra debt`);
    if (a.wants) parts.push(`− <b>${fmt(a.wants)}</b> spending`);
    if (num(p.reserveOut) > 0) parts.push(`− <b>${fmt(p.reserveOut)}</b> kept for later`);
    return parts.join(' ') + ` = <b class="sp-eq-r${num(p.remaining) < 0 ? ' neg' : ''}">${fmt(p.remaining)}</b> left`;
  }
  function card(p, i, pcs, src, tgt) {
    const a = allocOf(p), bills = Array.isArray(p.bills) ? p.bills : [];
    const over = num(p.remaining) < 0 || num(p.shortfall) > 0 || !!p.overallocated;
    const paidN = bills.filter(b => b.paid).length;
    return `<div class="panel sp-card${over ? ' is-over' : ''}" data-key="${esc(p.key)}">
      <div class="sp-card-h"><div><div class="eyebrow">${esc(longDate(p.date))}</div><div class="sp-src">${esc(p.incomeName || 'Paycheck')}</div>
        <div class="tiny faint" data-f="exp">${p.incomeOverridden ? `Changed by you · usually ${fmt(p.expected)} <button class="link" data-act="spIncomeReset" data-key="${esc(p.key)}">Use ${fmt(p.expected)}</button>` : 'Expected amount'}</div></div>
        <label class="sp-net"><span class="tiny faint">This paycheck</span>${moneyIn(p.net, `data-act-input="spIncome" data-act-change="spBlur" data-key="${esc(p.key)}" data-k="net"`, 'Income for the ' + short(p.date) + ' paycheck')}</label></div>
      <div class="sp-sum" data-f="sum">${sumHtml(p)}</div>
      <div class="sp-line" data-row="carryIn"${num(p.carryIn) > 0 ? '' : ' hidden'}><span>Carried in from earlier paychecks</span><b class="pos" data-f="carryIn">+${fmt(p.carryIn)}</b></div>
      <div class="sp-line" data-row="reserveIn"${num(p.reserveIn) > 0 ? '' : ' hidden'}><span>Set aside from earlier paychecks</span><b class="pos" data-f="reserveIn">+${fmt(p.reserveIn)}</b></div>
      <div class="sp-h4">Bills from this paycheck</div>
      ${bills.length ? bills.map(b => billRow(b, p, pcs)).join('') : '<p class="small muted" style="margin:4px 0">No bills are paid from this paycheck.</p>'}
      <div class="sp-line"><span><b>Bills still to pay</b>${paidN ? ` <span class="tiny faint">(${paidN} paid, not counted)</span>` : ''}</span><b data-f="billsDue">${fmt(p.billsDue)}</b></div>
      <div class="sp-h4">Plan for the rest</div>
      <div class="sp-alloc">${ALLOC.map(([k, n, h]) => `<label for="sp-${esc(p.key)}-${k}">${n}<span class="tiny faint">${h}</span></label>${moneyIn(a[k], `id="sp-${esc(p.key)}-${k}" data-act-input="spAlloc" data-act-change="spBlur" data-key="${esc(p.key)}" data-k="${k}"`, n + ' from the ' + short(p.date) + ' paycheck')}`).join('')}</div>
      <div class="sp-line" data-row="reserveOut"${num(p.reserveOut) > 0 ? '' : ' hidden'}><span>Kept for a later paycheck</span><b data-f="reserveOut">−${fmt(p.reserveOut)}</b></div>
      <div class="sp-left"><span>Left after everything</span><b data-f="remaining" class="${num(p.remaining) < 0 ? 'neg' : 'pos'}">${fmt(p.remaining)}</b></div>
      <div class="sp-warn" data-f="warn" aria-live="polite">${warnHtml(p, i, src, tgt)}</div>
    </div>`;
  }
  function pcBar() {
    const d = pcDirty();
    return `<div class="sp-bar" data-f="pcbar"><span class="grow small muted">${d ? '<span class="pill sp-dirty">Not saved yet</span> Tap Save to keep these changes.' : 'Change any amount. Nothing is saved until you tap Save.'}</span>
      <button class="btn" data-act="spPcCancel"${d ? '' : ' disabled'}>Cancel</button><button class="btn primary" data-act="spPcSave"${d ? '' : ' disabled'}>${ic('check')}Save</button></div>`;
  }
  // overdue bills no upcoming paycheck pays: let the user pick one (staged like any other move)
  function unassignedHtml(r, pcs) {
    const list = (Array.isArray(r.unassigned) ? r.unassigned : []).filter(x => x && x.instId && !Object.prototype.hasOwnProperty.call(draft.moves, x.instId));
    if (!list.length) return '';
    const opts = '<option value="">Pick a paycheck…</option>' + pcs.map(q => `<option value="${esc(q.key)}">${esc('The ' + short(q.date) + ' paycheck · ' + (q.incomeName || 'Paycheck'))}</option>`).join('');
    return `<div class="panel sp-card sp-unassigned"><div class="sp-h4" style="margin-top:0">Overdue bills not in a paycheck yet</div>
      ${list.map(x => `<div class="sp-bill" data-inst="${esc(x.instId)}"><div class="sp-bn"><b>${esc(x.name)}</b><div class="tiny neg">Was due ${esc(short(x.dueDate))}</div></div><b class="num">${fmt(x.remaining)}</b>
        <label class="sp-fund"><span>Fund from</span><select class="input" data-act-change="spMove" data-inst="${esc(x.instId)}" aria-label="Fund ${esc(x.name)} from which paycheck">${opts}</select></label></div>`).join('')}</div>`;
  }
  function pcInner() {
    let r = null;
    try { r = plan(); } catch (e) { console.error(e); r = null; }
    if (!r) return { meta: '', html: `<p class="small muted" style="margin:10px 0 0">The paycheck planner isn't available right now. Your bills and paychecks are not affected.</p>` };
    const pcs = r.paychecks.filter(p => p && p.key && p.date);
    if (!pcs.length) return { meta: '', html: `<div class="empty"><b>No paychecks coming up</b>Add your income to plan each paycheck.<div style="margin-top:10px"><a class="btn" href="#/paychecks">Paychecks</a></div></div>` };
    const src = reserveSources(pcs), tgt = reserveTargets(pcs, src);
    const top = (Array.isArray(r.warnings) ? r.warnings : []).filter(w => typeof w === 'string' && w);
    return { meta: 'Next ' + pcs.length, html: `<p class="small muted" style="margin:10px 0 12px">Each paycheck pays the bills listed under it. Paid bills are shown but not counted again. Money left over carries into the next paycheck.</p>
      ${top.length ? `<div class="gap-s" style="margin-bottom:12px;display:grid;gap:8px">${top.map(w => `<div class="callout small">${ic('alert')}<div>${esc(w)}</div></div>`).join('')}</div>` : ''}
      ${unassignedHtml(r, pcs)}
      <div class="sp-cards">${pcs.map((p, i) => card(p, i, pcs, src, tgt)).join('')}</div>${pcBar()}` };
  }
  function renderPaychecks(ctx) {
    css(); getCtx(ctx);
    const r = pcInner();
    return `<section class="section sp sp-pcs" id="spPaychecks">${sectionH('Paycheck by paycheck', r.meta || 'Paychecks', 'href="#/paychecks"')}<div data-f="pcbody">${r.html}</div></section>`;
  }
  function rerenderPc() { const box = $('#spPaychecks [data-f=pcbody]'); if (box) box.innerHTML = pcInner().html; }

  // update numbers in place (keeps focus and the cursor in the field being typed in)
  function patchPc() {
    let r = null; try { r = plan(); } catch (e) { console.error(e); }
    if (!r) return;
    const pcs = r.paychecks.filter(p => p && p.key && p.date);
    const src = reserveSources(pcs), tgt = reserveTargets(pcs, src);
    pcs.forEach((p, i) => {
      const el = $$('#spPaychecks .sp-card').find(c => c.dataset.key === p.key); if (!el) return;
      const set = (f, t) => { const n = $(`[data-f="${f}"]`, el); if (n && n.textContent !== t) n.textContent = t; };
      set('carryIn', '+' + fmt(p.carryIn)); set('reserveIn', '+' + fmt(p.reserveIn)); set('reserveOut', '−' + fmt(p.reserveOut)); set('billsDue', fmt(p.billsDue)); set('remaining', fmt(p.remaining));
      ['carryIn', 'reserveIn', 'reserveOut'].forEach(k => { const row = $(`[data-row="${k}"]`, el); if (row) row.hidden = !(num(p[k]) > 0); });
      const rem = $('[data-f=remaining]', el); if (rem) rem.className = num(p.remaining) < 0 ? 'neg' : 'pos';
      const sum = $('[data-f=sum]', el); if (sum) sum.innerHTML = sumHtml(p);
      const w = $('[data-f=warn]', el); if (w) w.innerHTML = warnHtml(p, i, src, tgt);
      const exp = $('[data-f=exp]', el); if (exp) exp.innerHTML = p.incomeOverridden ? `Changed by you · usually ${fmt(p.expected)} <button class="link" data-act="spIncomeReset" data-key="${esc(p.key)}">Use ${fmt(p.expected)}</button>` : 'Expected amount';
      el.classList.toggle('is-over', num(p.remaining) < 0 || num(p.shortfall) > 0 || !!p.overallocated);
      const a = allocOf(p);
      $$('input[data-k]', el).forEach(inp => { if (inp === document.activeElement || inp.classList.contains('sp-bad')) return; const v = inp.dataset.k === 'net' ? p.net : a[inp.dataset.k]; const s = money(v); if (inp.value !== s && parse(inp.value) !== num(v)) inp.value = s; });
    });
    const bar = $('#spPaychecks [data-f=pcbar]'); if (bar) bar.outerHTML = pcBar();
  }
  function currentPlanPc(key) { try { const r = plan(); return r && r.paychecks.find(p => p.key === key); } catch (e) { return null; } }
  function badInput(el, bad) { el.classList.toggle('sp-bad', !!bad); el.setAttribute('aria-invalid', bad ? 'true' : 'false'); el.style.borderColor = bad ? 'var(--over)' : ''; }

  function savePc() {
    const W = Wt(), c = cfg(), moves = Object.assign({}, draft.moves);
    const today = W.todayStr(), cutoff = W.addDays(today, -62);
    const fresh = o => { const out = {}; Object.keys(o).forEach(k => { const d = String(k).split('|')[1] || ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d >= cutoff) out[k] = o[k]; }); return out; };
    let moved = 0;
    for (const id of Object.keys(moves)) {
      const inst = W.D && W.D.instances && W.D.instances[id]; if (!inst) continue;
      const curKey = (W.paycheckFor(inst) || {}).key || null;
      if (moves[id] && moves[id] !== curKey) { W.assignInstance(id, moves[id]); moved++; }
    }
    const paycheckIncome = fresh(noNulls(mergedIncome())), paycheckAlloc = fresh(noNulls(mergedAlloc()));
    W.saveSettings({ smartBudget: Object.assign({}, c, { paycheckIncome, paycheckAlloc }) });
    clearPc();
    toast(moved ? 'Paycheck plan saved. ' + moved + ' bill' + (moved === 1 ? '' : 's') + ' moved. Due dates are the same.' : 'Paycheck plan saved');
    if (U().refresh) U().refresh(); else rerenderPc();
  }

  // ------------------------------------------------------------ debt payoff
  function debtDraft(ctx) {
    if (draft.debt) return draft.debt;
    const s = isObj(cfg().debt) ? cfg().debt : null;
    const ch = (ctx || getCtx()).chosen || {};
    const defExtra = ch.debtSplit && Number.isFinite(+ch.debtSplit.extra) ? Math.max(0, num(ch.debtSplit.extra)) : 0;
    // no saved debt plan yet: follow the chosen strategy's repayment order (Debt Snowball -> snowball), else avalanche
    const defMethod = ch.debtOrder === 'snowball' || ch.id === 'snowball' ? 'snowball' : 'avalanche';
    return { method: s && ['avalanche', 'snowball', 'custom'].includes(s.method) ? s.method : defMethod, extra: s && Number.isFinite(+s.extra) ? Math.max(0, num(s.extra)) : defExtra, order: s && Array.isArray(s.order) ? s.order.slice(0, 100) : [] };
  }
  function editDebt() { if (!draft.debt) draft.debt = JSON.parse(JSON.stringify(debtDraft())); draft.debtDirty = true; return draft.debt; }
  function debtResult(d) { if (!has('debtPlans')) return null; const r = Plan().debtPlans({ extra: d.extra, method: d.method, order: d.order.slice() }); return r && isObj(r.methods) ? r : null; }
  const monthTxt = d => { try { return Wt().monthLabel(d.slice(0, 7)); } catch (e) { return d; } };
  function needTxt(missing, ids) {
    const m = (missing || []).filter(x => !ids || ids.includes(x.id));
    if (!m.length) return '';
    const byField = {}; m.forEach(x => (x.fields || []).forEach(f => { (byField[f] = byField[f] || []).push(x.name); }));
    const keys = Object.keys(byField); if (!keys.length) return 'Need more details';
    const f = keys[0], names = byField[f];
    return 'Need ' + (f === 'apr' ? 'APR' : FIELD[f] || f) + ' for ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) + ' more' : '');
  }
  function payoffTxt(m, missing) {
    if (!m) return '—';
    if (m.neverPaysOff) return 'Never at this payment';
    if (m.payoffDate) return (m.estimate ? 'About ' : '') + monthTxt(m.payoffDate) + (m.estimate ? ' (estimate)' : '');
    if (m.estimate && missing && missing.length) return needTxt(missing);
    if (m.months != null && Number.isFinite(+m.months)) return 'About ' + m.months + ' months (estimate)';
    return 'Never at this payment';
  }
  const monthsHint = m => !m || m.months == null ? '' : m.payoffDate ? m.months + ' months' : 'about ' + m.months + ' months (estimate)';
  const interestTxt = m => !m ? '—' : (m.estimate ? 'About ' : '') + fmt(m.totalInterest);
  const savedTxt = m => !m ? '—' : m.interestSaved == null ? 'Can\'t tell' : (m.estimate ? 'About ' : '') + fmt(m.interestSaved);
  const AVAL = (a, b) => (num(b.apr) - num(a.apr)) || (num(a.balance) - num(b.balance)) || String(a.name).localeCompare(String(b.name));
  // custom priority list: the user's order first, then everything else by highest APR (same rule as the engine)
  function customIds(d, entries) { const known = new Set(entries.map(x => x.id)); const ids = d.order.filter((x, i) => known.has(x) && d.order.indexOf(x) === i); entries.slice().sort(AVAL).forEach(x => { if (!ids.includes(x.id)) ids.push(x.id); }); return ids; }
  function debtFigs(r, m) {
    const fig = (l, v, h, f) => `<div class="sp-fig"><span class="tiny faint">${l}</span><b data-f="${f}">${v}</b>${h ? `<span class="tiny faint">${h}</span>` : ''}</div>`;
    return `<div class="sp-figs">
      ${fig('Monthly minimums', fmt(r.minimums), 'required every month', 'dmin')}
      ${fig('Extra each month', fmt(r.extra), r.extra > 0 ? 'optional, on top' : 'none planned', 'dextra')}
      ${fig('Debt-free', esc(payoffTxt(m, r.missing)), esc(monthsHint(m)), 'ddate')}
      ${fig('Total interest', esc(interestTxt(m)), '', 'dint')}
      ${fig('Interest saved', esc(savedTxt(m)), 'vs paying only minimums', 'dsaved')}</div>`;
  }
  function debtBody() {
    const d = debtDraft();
    let r = null; try { r = debtResult(d); } catch (e) { console.error(e); r = null; }
    if (!r) return `<p class="small muted" style="margin:10px 0 0">The payoff planner isn't available right now. Your debts are not affected.</p>`;
    const ms = r.methods, sel = ms[d.method] || ms.avalanche;
    let order = sel && Array.isArray(sel.order) ? sel.order : [];
    if (d.method === 'custom') { const by = new Map(order.map(x => [x.id, x])); order = customIds(d, order).map(id => by.get(id)).filter(Boolean); }
    if (!order.length && !(ms.avalanche && ms.avalanche.order && ms.avalanche.order.length)) return `<div class="empty"><b>No debts to pay off</b>Debts with a balance show here. Bills that aren't debts are never included.<div style="margin-top:10px"><a class="btn" href="#/debts">Debts</a></div></div>`;
    const missing = Array.isArray(r.missing) ? r.missing : [];
    const rows = [['avalanche', 'Avalanche'], ['snowball', 'Snowball'], ['custom', 'Custom'], ['minimum', 'Minimums only']].filter(([k]) => ms[k]);
    const best = r.best;
    const notes = (sel && Array.isArray(sel.notes) ? sel.notes : []).filter(n => typeof n === 'string' && n && !/ has no /.test(n));
    return `${missing.length ? `<div class="callout red small sp-missing" style="margin-top:12px">${ic('alert')}<div><b>Some debts are missing details, so dates are estimates.</b> Fill these in on the <a href="#/debts">Debts page</a>:<ul>${missing.map(x => `<li data-debt="${esc(x.id)}"><b>${esc(x.name)}</b>: add the ${(x.fields || []).map(f => FIELD[f] || f).join(', ')}</li>`).join('')}</ul></div></div>` : ''}
      ${debtFigs(r, sel)}
      ${notes.length ? `<div style="display:grid;gap:6px;margin-top:10px">${notes.map(n => `<div class="small muted sp-note">${ic('info')}<span>${esc(n)}</span></div>`).join('')}</div>` : ''}
      <div class="sp-h4" style="margin-top:18px">Side by side</div>
      <table class="tbl sp-tbl"><thead><tr><th>Method</th><th class="r">Each month</th><th class="r">Debt-free</th><th class="r">Total interest</th><th class="r">Interest saved</th></tr></thead><tbody>
      ${rows.map(([k, n]) => { const m = ms[k]; return `<tr data-method="${k}" class="${k === d.method ? 'on' : ''}"><td class="sp-mname" data-label="Method">${n}${k === best ? ' <span class="pill paid">Saves most</span>' : ''}${k === d.method ? ' <span class="pill">Selected</span>' : ''}</td><td class="r num" data-label="Each month">${fmt(m.monthly != null ? m.monthly : r.minimums + (k === 'minimum' ? 0 : r.extra))}</td><td class="r" data-label="Debt-free" data-f="date">${esc(payoffTxt(m, missing))}</td><td class="r num" data-label="Total interest">${esc(interestTxt(m))}</td><td class="r num" data-label="Interest saved">${k === 'minimum' ? '—' : esc(savedTxt(m))}</td></tr>`; }).join('')}
      </tbody></table>
      <div class="sp-h4" style="margin-top:18px">${d.method === 'custom' ? 'Your order: extra money goes to #1 first' : 'Payoff order'}</div>
      <div class="sp-order">${order.map((x, i) => { const miss = missing.find(z => z.id === x.id);
        return `<div class="sp-debt" data-debt="${esc(x.id)}"><span class="sp-rank">${i + 1}</span><div class="sp-dn"><b>${esc(x.name)}</b><div class="tiny faint">${fmt(x.balance)} owed · ${x.aprMissing || x.apr == null ? '<span class="neg">APR missing</span>' : esc(Wt().pctStr(num(x.apr))) + ' APR'} · ${x.minimumMissing || x.minimum == null ? '<span class="neg">minimum missing</span>' : fmt(x.minimum) + ' minimum'}</div>
          <div class="tiny ${miss ? 'neg' : 'muted'}">${x.payoffDate ? 'Paid off by ' + esc(monthTxt(x.payoffDate)) : miss ? 'No date until you add the ' + esc((miss.fields || []).map(f => FIELD[f] || f).join(', ')) : x.payoffMonth != null ? 'Paid off in about ' + esc(x.payoffMonth) + ' months (estimate)' : 'Not paid off at this rate'}</div></div>
          ${d.method === 'custom' ? `<div class="sp-mv"><button class="btn icon" data-act="spDebtMove" data-id="${esc(x.id)}" data-n="-1" aria-label="Move ${esc(x.name)} up"${i === 0 ? ' disabled' : ''}>${ic('up')}</button><button class="btn icon" data-act="spDebtMove" data-id="${esc(x.id)}" data-n="1" aria-label="Move ${esc(x.name)} down"${i === order.length - 1 ? ' disabled' : ''}>${ic('down')}</button></div>` : ''}</div>`; }).join('')}</div>`;
  }
  function debtBar() {
    const dd = draft.debtDirty;
    return `<div class="sp-bar" data-f="dbar"><span class="grow small muted">${dd ? '<span class="pill sp-dirty">Not saved yet</span> Tap Save to keep this plan.' : 'This is a plan only. It never changes your debts or payments.'}</span>
      <button class="btn" data-act="spDebtCancel"${dd ? '' : ' disabled'}>Cancel</button><button class="btn primary" data-act="spDebtSave"${dd ? '' : ' disabled'}>${ic('check')}Save</button></div>`;
  }
  function renderDebt(ctx) {
    css(); getCtx(ctx);
    const d = debtDraft();
    const avail = has('debtPlans');
    const desc = (METHODS.find(m => m[0] === d.method) || METHODS[0])[2];
    return `<section class="section sp sp-debts" id="spDebt">${sectionH('Debt payoff plan', 'Debts', 'href="#/debts"')}
      ${avail ? `<div class="sp-tabs" role="tablist" aria-label="Payoff method">${METHODS.map(([k, n]) => `<button type="button" role="tab" class="${k === d.method ? 'on' : ''}" aria-selected="${k === d.method}" data-act="spDebtMethod" data-m="${k}">${n}</button>`).join('')}</div>
      <p class="small muted" style="margin:8px 0 0" data-f="mdesc">${esc(desc)}</p>
      <div class="sp-extra"><label><span class="small"><b>Extra payment each month</b> <span class="faint">(optional, on top of minimums)</span></span>${moneyIn(d.extra, 'data-act-input="spDebtExtra" data-act-change="spBlur" data-k="extra"', 'Extra debt payment each month')}</label></div>` : ''}
      <div data-f="dbody">${debtBody()}</div>${avail ? debtBar() : ''}</section>`;
  }
  function rerenderDebt(full) {
    const sec = $('#spDebt'); if (!sec) return;
    if (full) { const ae = document.activeElement; const wasExtra = ae && ae.dataset && ae.dataset.k === 'extra'; sec.outerHTML = renderDebt(); if (wasExtra) { const n = $('#spDebt input[data-k=extra]'); if (n) n.focus(); } return; }
    const b = $('[data-f=dbody]', sec); if (b) b.innerHTML = debtBody();
    const bar = $('[data-f=dbar]', sec); if (bar) bar.outerHTML = debtBar();
  }

  // ------------------------------------------------------------ actions (routed by app.js: data-act / data-act-change / data-act-input)
  const act = {
    spIncome(ds, el) {
      const c = parse(el.value); badInput(el, c == null); if (c == null) return;
      const p = currentPlanPc(ds.key);
      const expected = p ? num(p.expected) : null;
      const saved = isObj(cfg().paycheckIncome) && Object.prototype.hasOwnProperty.call(cfg().paycheckIncome, ds.key);
      if (expected != null && c === expected) { if (saved) draft.income[ds.key] = null; else delete draft.income[ds.key]; }
      else draft.income[ds.key] = c;
      patchPc();
    },
    spIncomeReset(ds) { const saved = isObj(cfg().paycheckIncome) && Object.prototype.hasOwnProperty.call(cfg().paycheckIncome, ds.key); if (saved) draft.income[ds.key] = null; else delete draft.income[ds.key]; rerenderPc(); },
    spAlloc(ds, el) {
      const c = parse(el.value); badInput(el, c == null); if (c == null) return;
      if (!isObj(draft.alloc[ds.key])) { const p = currentPlanPc(ds.key); draft.alloc[ds.key] = p ? allocOf(p) : { everyday: 0, savings: 0, extraDebt: 0, wants: 0 }; }
      draft.alloc[ds.key][ds.k] = c;
      patchPc();
    },
    spBlur(ds, el) { const c = parse(el.value); if (c != null) { el.value = money(c); badInput(el, false); } },
    spMove(ds, el) {
      const id = ds.inst, key = el.value; if (!id || !key) return;
      const inst = Wt().D.instances[id];
      const orig = inst ? (Wt().paycheckFor(inst) || {}).key : null;
      if (key === orig) delete draft.moves[id]; else draft.moves[id] = key;
      rerenderPc();
      const sel = $$('#spPaychecks select[data-inst]').find(s => s.dataset.inst === id); if (sel) sel.focus();
    },
    spFundOpen(ds, el) {
      const row = el.closest('.sp-bill'); const f = row && $('.sp-fund', row); if (!f) return;
      f.hidden = !f.hidden; el.setAttribute('aria-expanded', f.hidden ? 'false' : 'true'); draft.open = f.hidden ? null : ds.inst;
      if (!f.hidden) { const sel = $('select', f); if (sel) sel.focus(); }
    },
    spPcCancel() { clearPc(); rerenderPc(); toast('Changes discarded'); },
    spPcSave() { savePc(); },
    spDebtMethod(ds) {
      const d = editDebt(); if (!['avalanche', 'snowball', 'custom'].includes(ds.m)) return;
      if (ds.m === 'custom') { try { const r = debtResult(Object.assign({}, d, { method: 'custom' })); if (r && r.methods.custom) d.order = customIds(d, r.methods.custom.order); } catch (e) { /* keep the saved order */ } }
      d.method = ds.m; rerenderDebt(true);
    },
    spDebtExtra(ds, el) { const c = parse(el.value); badInput(el, c == null); if (c == null) return; editDebt().extra = c; rerenderDebt(false); },
    spDebtMove(ds) {
      const d = editDebt(); let r = null; try { r = debtResult(d); } catch (e) { r = null; }
      const ids = r && r.methods.custom ? customIds(d, r.methods.custom.order) : d.order.slice();
      const i = ids.indexOf(ds.id), j = i + (+ds.n || 0); if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; d.order = ids; d.method = 'custom'; rerenderDebt(false);
      const btn = $$('#spDebt [data-act=spDebtMove]').find(b => b.dataset.id === ds.id && b.dataset.n === ds.n && !b.disabled); if (btn) btn.focus();
    },
    spDebtCancel() { clearDebt(); rerenderDebt(true); toast('Changes discarded'); },
    spDebtSave() {
      const d = debtDraft(), c = cfg();
      Wt().saveSettings({ smartBudget: Object.assign({}, c, { debt: { method: d.method, extra: Math.max(0, num(d.extra)), order: d.order.filter(x => typeof x === 'string').slice(0, 100) } }) });
      clearDebt(); toast('Debt plan saved');
      if (U().refresh) U().refresh(); else rerenderDebt(true);
    },
  };

  window.WTExt = window.WTExt || {};
  window.WTExt.plan = { act };
  // dirty(): unsaved paycheck or debt-plan changes (app.js keeps them while the Smart Budget section changes)
  window.WTPlanUI = { ready: true, renderPaychecks, renderDebt, dirty: () => pcDirty() || !!draft.debtDirty, _draft: draft };
})();
