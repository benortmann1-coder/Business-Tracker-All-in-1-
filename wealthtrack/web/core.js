/* WealthTrack core — pure domain logic (no DOM).
 *
 * Money is ALWAYS integer cents. Never multiply user input by 100 as a float:
 * use WT.parseMoney / WT.fmt. APRs are stored as integer hundredths of a
 * percent (26.24% -> 2624).
 *
 * Data model (each collection is an object keyed by id):
 *   templates   recurring / one-time bill definitions (with schedule versions)
 *   instances   one row per bill per billing period (id is deterministic:
 *               i_<templateId>_<periodKey>, so generation is idempotent)
 *   payments    actual money paid toward an instance (never deleted; voided)
 *   incomes     jobs / income sources with pay schedules
 *   deposits    actual paycheck deposits (keyed by paycheck key)
 *   extraIncome bonuses / overtime / other income
 *   expenses    everyday purchases
 *   receipts    receipt images (data URLs)
 *   debts       credit cards and loans
 *   debtTxns    interest, manual charges, fees, balance adjustments, extra payments
 *   budgets     per-category monthly limits (keyed by category id)
 *   goals       savings goals
 *   goalTxns    contributions / withdrawals (these are transfers, not expenses)
 *   transfers   money moved between your own accounts
 *   accounts    checking / savings / cash
 *   categories  spending categories
 *   meta        settings (single record id "settings")
 */
(function (root) {
  'use strict';

  const COLLS = ['templates', 'instances', 'payments', 'incomes', 'deposits', 'extraIncome',
    'expenses', 'receipts', 'debts', 'debtTxns', 'budgets', 'goals', 'goalTxns', 'transfers',
    'accounts', 'categories', 'meta'];

  // ---------------------------------------------------------------- money
  function parseMoney(input) {
    if (typeof input === 'number') {
      if (!Number.isInteger(input)) throw new Error('parseMoney expects a string or integer cents');
      return input;
    }
    let s = String(input == null ? '' : input).trim().replace(/[$\s]/g, '');
    if (s === '' || s === '-' || s === '.') return null;
    let neg = false;
    if (s[0] === '-') { neg = true; s = s.slice(1); }
    if (s[0] === '(' && s.endsWith(')')) { neg = true; s = s.slice(1, -1); }
    // commas are only accepted as thousands separators ("1,234.56"); "1,2,3" is rejected
    if (s.includes(',')) { if (!/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(s)) return null; s = s.replace(/,/g, ''); }
    if (!/^\d*(\.\d*)?$/.test(s)) return null;
    let [whole, frac = ''] = s.split('.');
    whole = (whole || '0').replace(/^0+(?=\d)/, '');
    if (whole.length > 13) return null; // > $9.99 trillion: beyond safe integer cents
    let cents = parseInt(whole, 10) * 100;
    const f = (frac + '000').slice(0, 3);
    let c2 = parseInt(f.slice(0, 2), 10);
    if (parseInt(f[2], 10) >= 5) c2 += 1; // round half up on the 3rd decimal
    cents += c2;
    return neg && cents !== 0 ? -cents : cents;
  }
  // Same parser for percentages: "26.24" -> 2624
  const parsePct = parseMoney;

  function centsToStr(c) { // "1234.50" (no symbol, no grouping) — for CSV/XLSX
    const neg = c < 0; c = Math.abs(c);
    return (neg ? '-' : '') + Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');
  }
  // display preferences (Settings > Personal info); money stays integer cents underneath
  // dateFormat: one of DATE_FORMATS ('mdy' default). dateOrder ('md'|'dm') is derived, kept for older callers.
  // decimals: 0 for currencies with no minor unit (JPY, KRW...): amounts are still cents underneath.
  const DISPLAY = { symbol: '$', dateFormat: 'mdy', dateOrder: 'md', decimals: 2 };
  const DATE_FORMATS = ['mdy', 'dmy', 'mdy_long', 'mdy_num', 'dmy_num', 'dmy_dot', 'ymd'];
  // older saved values: 'md' (Nov 7) and 'dm' (7 Nov)
  function normDateFormat(v) { if (v === 'md') return 'mdy'; if (v === 'dm') return 'dmy'; return DATE_FORMATS.includes(v) ? v : 'mdy'; }
  function setDisplay(o) {
    if (!o) return;
    if (typeof o.symbol === 'string' && o.symbol) DISPLAY.symbol = o.symbol;
    if (o.decimals === 0 || o.decimals === 2) DISPLAY.decimals = o.decimals;
    const f = o.dateFormat != null ? o.dateFormat : o.dateOrder;
    if (f === 'md' || f === 'dm' || DATE_FORMATS.includes(f)) { DISPLAY.dateFormat = normDateFormat(f); DISPLAY.dateOrder = DISPLAY.dateFormat.startsWith('dmy') ? 'dm' : 'md'; }
  }
  function fmt(c, opts) {
    if (c == null || isNaN(c)) return '—';
    const noCents = (opts && opts.noCents) || DISPLAY.decimals === 0;
    // zero-decimal currencies round to the whole unit (half up) instead of dropping the cents
    const a = Math.abs(Math.round(c)); const neg = c < 0 && a !== 0;
    const units = DISPLAY.decimals === 0 ? Math.floor((a + 50) / 100) : Math.floor(a / 100);
    const whole = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const frac = String(a % 100).padStart(2, '0');
    const sym = (opts && opts.symbol) || DISPLAY.symbol;
    if (noCents) return (neg && (DISPLAY.decimals !== 0 || units !== 0) ? '-' : '') + sym + whole;
    return (neg ? '-' : '') + sym + whole + '.' + frac;
  }
  function pctStr(p) { return centsToStr(p).replace(/\.?0+$/, '') + '%'; }
  // integer division with half-up rounding (works for negatives symmetrically)
  function divRound(n, d) {
    const s = (n < 0) !== (d < 0) ? -1 : 1;
    n = Math.abs(n); d = Math.abs(d);
    return s * Math.floor((n + Math.floor(d / 2)) / d);
  }
  function monthlyInterest(balanceCents, aprCenti) {
    if (balanceCents <= 0 || !aprCenti) return 0;
    return divRound(balanceCents * aprCenti, 120000);
  }

  // ---------------------------------------------------------------- dates (YYYY-MM-DD strings)
  const pad2 = n => String(n).padStart(2, '0');
  let TODAY_OVERRIDE = null;
  function todayStr() { if (TODAY_OVERRIDE) return TODAY_OVERRIDE; const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parts(s) { return { y: +s.slice(0, 4), m: +s.slice(5, 7), d: +s.slice(8, 10) }; }
  function mkDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
  function dim(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function toUTC(s) { const p = parts(s); return Date.UTC(p.y, p.m - 1, p.d); }
  function fromUTC(t) { const d = new Date(t); return mkDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  function addDays(s, n) { return fromUTC(toUTC(s) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toUTC(b) - toUTC(a)) / 86400000); } // b - a
  function dow(s) { return new Date(toUTC(s)).getUTCDay(); }
  function monthOf(s) { return s.slice(0, 7); }
  function addMonthKey(mk, n) { let y = +mk.slice(0, 4), m = +mk.slice(5, 7) + n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return y + '-' + pad2(m); }
  function monthStart(mk) { return mk + '-01'; }
  function monthEnd(mk) { return mk + '-' + pad2(dim(+mk.slice(0, 4), +mk.slice(5, 7))); }
  function dateInMonthClamped(mk, day) { const y = +mk.slice(0, 4), m = +mk.slice(5, 7); return mkDate(y, m, Math.min(day, dim(y, m))); }
  function addMonthsClamp(anchor, k) { const p = parts(anchor); return dateInMonthClamped(addMonthKey(monthOf(anchor), k), p.d); }
  function monthsBetween(a, b) { return (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7)); } // b - a (month keys)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function monthLabel(mk, short) { const n = MONTHS[+mk.slice(5, 7) - 1]; return (short ? n.slice(0, 3) : n) + ' ' + mk.slice(0, 4); }
  // Every date in the app is shown with its year, in the format picked in Settings > Personal info.
  function formatDate(s, f) {
    if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return s ? String(s) : '';
    const p = parts(s); const mon = MONTHS[p.m - 1];
    switch (normDateFormat(f || DISPLAY.dateFormat)) {
      case 'dmy': return p.d + ' ' + mon.slice(0, 3) + ' ' + p.y;
      case 'mdy_long': return mon + ' ' + p.d + ', ' + p.y;
      case 'mdy_num': return pad2(p.m) + '/' + pad2(p.d) + '/' + p.y;
      case 'dmy_num': return pad2(p.d) + '/' + pad2(p.m) + '/' + p.y;
      case 'dmy_dot': return pad2(p.d) + '.' + pad2(p.m) + '.' + p.y;
      case 'ymd': return s.slice(0, 10);
      default: return mon.slice(0, 3) + ' ' + p.d + ', ' + p.y;
    }
  }
  // withYear is kept for older callers: the year is always shown now
  function dateLabel(s, withYear) { // eslint-disable-line no-unused-vars
    if (!s) return '';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow(s)] + ', ' + formatDate(s);
  }
  function shortDate(s) { return s ? formatDate(s) : ''; }
  // compact day+month for chart axis ticks only (the chart title/tooltip carries the year)
  function axisDate(s) {
    if (!s) return ''; const p = parts(s); const mon = MONTHS[p.m - 1].slice(0, 3);
    switch (DISPLAY.dateFormat) {
      case 'dmy': return p.d + ' ' + mon;
      case 'mdy_num': return p.m + '/' + p.d;
      case 'dmy_num': return p.d + '/' + p.m;
      case 'dmy_dot': return p.d + '.' + p.m + '.';
      case 'ymd': return pad2(p.m) + '-' + pad2(p.d);
      default: return mon + ' ' + p.d;
    }
  }

  // ---------------------------------------------------------------- recurrence
  // rule: {frequency, interval, unit, anchor}
  const FREQS = { once: 'One time', weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', custom: 'Custom' };
  function stepOf(rule) {
    switch (rule.frequency) {
      case 'weekly': return { days: 7 };
      case 'biweekly': return { days: 14 };
      case 'monthly': return { months: 1 };
      case 'quarterly': return { months: 3 };
      case 'yearly': return { months: 12 };
      case 'custom': {
        const n = Math.max(1, parseInt(rule.interval, 10) || 1);
        if (rule.unit === 'day') return { days: n };
        if (rule.unit === 'week') return { days: 7 * n };
        if (rule.unit === 'year') return { months: 12 * n };
        return { months: n };
      }
      default: return null; // once
    }
  }
  function monthlyish(rule) { const s = stepOf(rule); return !s || !!s.months; }
  // all occurrence dates of a rule within [from, to] inclusive, never before anchor
  function occurrences(rule, from, to) {
    const out = [];
    const a = rule.anchor;
    if (!a) return out;
    if (from < a) from = a;
    if (from > to) return out;
    const st = stepOf(rule);
    if (!st) { if (a >= from && a <= to) out.push(a); return out; }
    if (st.days) {
      let k = Math.max(0, Math.floor(diffDays(a, from) / st.days));
      for (let guard = 0; guard < 5000; guard++, k++) {
        const d = addDays(a, k * st.days);
        if (d > to) break;
        if (d >= from) out.push(d);
      }
    } else {
      let k = Math.max(0, Math.floor(monthsBetween(monthOf(a), monthOf(from)) / st.months) - 1);
      for (let guard = 0; guard < 5000; guard++, k++) {
        // eom: "last day of the month" (Nov 30, Dec 31, Feb 28...) instead of a fixed day number
        const d = rule.eom ? monthEnd(monthOf(addMonthsClamp(a, k * st.months))) : addMonthsClamp(a, k * st.months);
        if (d > to) break;
        if (d >= from) out.push(d);
      }
    }
    return out;
  }
  function nextOccurrenceOnOrAfter(rule, date) { const o = occurrences(rule, date, addDays(date, 800)); return o[0] || null; }

  // ---------------------------------------------------------------- state
  const WT = {
    COLLS, FREQS, D: null, persist: null, today: todayStr, listeners: [], setToday(s) { TODAY_OVERRIDE = s || null; },
    parseMoney, parsePct, fmt, centsToStr, pctStr, divRound, monthlyInterest,
    todayStr, parts, mkDate, dim, addDays, diffDays, dow, monthOf, addMonthKey, monthStart, monthEnd,
    dateInMonthClamped, addMonthsClamp, monthsBetween, monthLabel, dateLabel, shortDate, formatDate, axisDate, DATE_FORMATS, normDateFormat, MONTHS, setDisplay, display: () => Object.assign({}, DISPLAY),
    occurrences, stepOf, nextOccurrenceOnOrAfter,
  };

  function emptyData() { const d = {}; COLLS.forEach(c => d[c] = {}); return d; }
  WT.emptyData = emptyData;
  WT.init = function (data, persist) {
    WT.D = emptyData();
    if (data) COLLS.forEach(c => { if (data[c]) WT.D[c] = data[c]; });
    WT.persist = persist || { put() { }, del() { } };
    if (!WT.D.meta.settings) WT.D.meta.settings = defaultSettings();
    else WT.D.meta.settings = Object.assign(defaultSettings(), WT.D.meta.settings);
    ixRebuild();
  };
  // ---------------------------------------------------------------- indexes & memo cache
  // Kept in sync by save()/del(). The memo cache is cleared on every write, so cached
  // results can never be stale as long as all writes go through WT.save / WT.del.
  const IX = { payByInst: new Map(), instByMonth: new Map(), instMonth: new Map(), memo: new Map(), ver: 0 };
  function ixInst(rec) {
    const m = monthOf(rec.dueDate); const prev = IX.instMonth.get(rec.id);
    if (prev === m) return;
    if (prev) { const s = IX.instByMonth.get(prev); if (s) s.delete(rec.id); }
    IX.instMonth.set(rec.id, m);
    if (!IX.instByMonth.has(m)) IX.instByMonth.set(m, new Set());
    IX.instByMonth.get(m).add(rec.id);
  }
  function ixPay(rec) { if (!IX.payByInst.has(rec.instanceId)) IX.payByInst.set(rec.instanceId, new Set()); IX.payByInst.get(rec.instanceId).add(rec.id); }
  function ixRebuild() {
    IX.payByInst = new Map(); IX.instByMonth = new Map(); IX.instMonth = new Map(); IX.memo = new Map(); IX.ver++;
    for (const r of Object.values(WT.D.instances)) ixInst(r);
    for (const r of Object.values(WT.D.payments)) ixPay(r);
  }
  function ixWrite(coll, rec, id) {
    IX.memo.clear(); IX.ver++;
    if (coll === 'instances') {
      if (rec) ixInst(rec);
      else { const m = IX.instMonth.get(id); if (m && IX.instByMonth.get(m)) IX.instByMonth.get(m).delete(id); IX.instMonth.delete(id); }
    } else if (coll === 'payments') {
      if (rec) ixPay(rec);
      else for (const s of IX.payByInst.values()) s.delete(id);
    }
  }
  function memo(key, fn) { if (!IX.memo.has(key)) IX.memo.set(key, fn()); return IX.memo.get(key); }
  WT.invalidate = ixRebuild; // call after mutating WT.D directly (not needed when using save/del)
  function defaultSettings() {
    return {
      id: 'settings', schema: 1, theme: 'system', currencySymbol: '$',
      reminders: { enabled: true, daysBefore: [3, 1, 0], hour: 9, minute: 0, overdueDaily: false },
      dashboard: { order: ['summary', 'available', 'upcoming', 'overdue', 'nextcheck', 'progress', 'charts', 'projection', 'debt', 'budgets', 'goals'], hidden: [] },
      setAsides: [], projectionIncludesSetAsides: true, dueSoonDays: 7, createdAt: todayStr(),
      generatedThrough: null, lock: null,
    };
  }
  WT.settings = () => WT.D.meta.settings;
  function save(coll, rec) { WT.D[coll][rec.id] = rec; ixWrite(coll, rec); WT.persist.put(coll, rec); }
  function del(coll, id) { delete WT.D[coll][id]; ixWrite(coll, null, id); WT.persist.del(coll, id); }
  WT.save = save; WT.del = del;
  WT.saveSettings = function (patch) { Object.assign(WT.D.meta.settings, patch || {}); save('meta', WT.D.meta.settings); };
  let seq = 0;
  WT.uid = function (p) { return (p || 'x') + '_' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7); };
  const vals = c => Object.values(WT.D[c]);
  WT.list = vals;
  WT.get = (c, id) => WT.D[c][id];

  // ---------------------------------------------------------------- accounts / categories / sources
  WT.accounts = () => vals('accounts').filter(a => !a.archived).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
  WT.categories = () => vals('categories').filter(c => !c.archived).sort((a, b) => a.name.localeCompare(b.name));
  WT.catName = id => (WT.D.categories[id] || {}).name || id || 'Uncategorized';
  WT.catColor = id => (WT.D.categories[id] || {}).color || '#8a94a6';
  WT.defaultAccountId = function () { const s = WT.settings(); if (s.defaultAccountId && WT.D.accounts[s.defaultAccountId]) return s.defaultAccountId; const a = WT.accounts().find(x => x.type === 'checking') || WT.accounts()[0]; return a ? a.id : null; };
  // a "source" is either an account id or "debt:<debtId>" (charged to a card/loan)
  WT.sourceName = function (src) {
    if (!src) return '—';
    if (src.startsWith('debt:')) { const d = WT.D.debts[src.slice(5)]; return d ? d.name : 'Card'; }
    const a = WT.D.accounts[src]; return a ? a.name : '—';
  };
  WT.addCategory = function (name, color) {
    const id = 'cat_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || WT.uid('cat');
    if (WT.D.categories[id] && !WT.D.categories[id].archived) return WT.D.categories[id];
    const rec = { id, name, color: color || '#8a94a6', custom: true };
    save('categories', rec); return rec;
  };

  // ---------------------------------------------------------------- bill templates
  function ruleAt(t, date) { // schedule version in effect for an occurrence date
    let v = t.versions[0];
    for (const x of t.versions) if (x.from <= date) v = x;
    return v;
  }
  WT.ruleAt = ruleAt;
  WT.currentRule = t => ruleAt(t, todayStr());
  function inPause(t, date) { return (t.pauses || []).some(p => date >= p.from && (!p.to || date <= p.to)); }
  // occurrences for a template in [from,to], honoring versions, end date, pauses
  function templateOccurrences(t, from, to) {
    const out = [];
    const vs = t.versions.slice().sort((a, b) => a.from < b.from ? -1 : 1);
    vs.forEach((v, i) => {
      const vFrom = i === 0 ? '0000-01-01' : v.from;
      const vTo = i + 1 < vs.length ? addDays(vs[i + 1].from, -1) : '9999-12-31';
      const a = from > vFrom ? from : vFrom; const b = to < vTo ? to : vTo;
      if (a > b) return;
      occurrences(v, a, b).forEach(d => out.push({ date: d, v }));
    });
    return out.filter(o => (!t.endDate || o.date <= t.endDate) && !inPause(t, o.date));
  }
  WT.templateOccurrences = templateOccurrences;

  WT.addTemplate = function (f) {
    const id = f.id || WT.uid('bill');
    const t = {
      id, name: f.name.trim(), category: f.category || 'cat_other', method: f.method || '', accountId: f.accountId || WT.defaultAccountId(),
      notes: f.notes || '', status: 'active', pauses: [], endDate: f.endDate || null, debtId: f.debtId || null,
      payFrom: f.payFrom || 'auto', subscription: !!f.subscription, autopay: f.autopay != null ? !!f.autopay : !!f.subscription, deleted: false, createdAt: todayStr(),
      versions: [{ from: f.anchor, anchor: f.anchor, amountCents: f.amountCents, frequency: f.frequency || 'monthly', interval: f.interval || 1, unit: f.unit || 'month', eom: !!f.eom }],
    };
    { const rr = WT.cleanReminderRule(f.reminder); if (rr) t.reminder = rr; }
    if (t.versions[0].frequency === 'once') t.endDate = f.anchor;
    save('templates', t);
    WT.ensureGenerated(maxMonth(addMonthKey(monthOf(todayStr()), 1), monthOf(f.anchor)));
    return t;
  };
  const maxMonth = (a, b) => (a > b ? a : b);

  function payRecs(instId) { const s = IX.payByInst.get(instId); if (!s) return []; const out = []; for (const id of s) { const p = WT.D.payments[id]; if (p) out.push(p); } return out; }
  function instPaid(instId) { let s = 0; for (const p of payRecs(instId)) if (!p.voided) s += p.amountCents; return s; }
  WT.paidFor = instPaid;
  WT.paymentsFor = id => payRecs(id).sort((a, b) => a.date < b.date ? -1 : 1);
  const hasPayments = id => payRecs(id).length > 0; // voided payments still count as history

  function makeInstance(t, occ) {
    return {
      id: 'i_' + t.id + '_' + occ.date, templateId: t.id, periodKey: occ.date, periodMonth: monthOf(occ.date),
      dueDate: occ.date, amountCents: occ.v.amountCents, name: t.name, category: t.category, debtId: t.debtId || null,
      accountId: t.accountId || null, method: t.method || '', skipped: false, paycheckKey: null, note: '', custom: {}, createdAt: todayStr(),
    };
  }
  // Generate every missing instance up to the end of `throughMonth`.
  // Idempotent: instance ids are deterministic, and monthly-or-longer bills
  // never get two instances for the same billing month.
  WT.ensureGenerated = function (throughMonth) {
    const s = WT.settings();
    throughMonth = throughMonth || addMonthKey(monthOf(todayStr()), 1);
    const to = monthEnd(throughMonth);
    let created = 0;
    const byTplMonth = {};
    for (const i of vals('instances')) byTplMonth[i.templateId + '|' + i.periodMonth] = true;
    for (const t of vals('templates')) {
      if (t.deleted) continue;
      for (const occ of templateOccurrences(t, '0000-01-01', to)) {
        const id = 'i_' + t.id + '_' + occ.date;
        if (WT.D.instances[id]) continue;
        if (monthlyish(occ.v) && byTplMonth[t.id + '|' + monthOf(occ.date)]) continue;
        if (t.removedKeys && t.removedKeys.includes(occ.date)) continue;
        save('instances', makeInstance(t, occ));
        byTplMonth[t.id + '|' + monthOf(occ.date)] = true;
        created++;
      }
    }
    if (!s.generatedThrough || s.generatedThrough < throughMonth) WT.saveSettings({ generatedThrough: throughMonth });
    return created;
  };

  // instances that may be rebuilt from the template (no history, no per-month override)
  function replaceable(i) { return !hasPayments(i.id) && !i.skipped && !(i.custom && (i.custom.amount || i.custom.due || i.custom.note)) && !i.paycheckKey; }

  // changes: {name, category, method, accountId, notes, debtId, payFrom, subscription, amountCents, frequency, interval, unit, anchor}
  // scope: {mode:'this', instanceId} | {mode:'future', fromMonth}
  WT.updateTemplate = function (id, ch, scope) {
    const t = WT.D.templates[id]; if (!t) throw new Error('No bill');
    scope = scope || { mode: 'future', fromMonth: monthOf(todayStr()) };
    if (scope.mode === 'this') {
      const i = WT.D.instances[scope.instanceId];
      if (ch.amountCents != null && ch.amountCents !== i.amountCents) { i.amountCents = ch.amountCents; i.custom.amount = true; }
      if (ch.anchor && ch.anchor !== i.dueDate) { i.dueDate = ch.anchor; i.custom.due = true; }
      if (ch.name) i.name = ch.name.trim();
      ['category', 'accountId', 'method'].forEach(k => { if (ch[k] != null) i[k] = ch[k]; });
      if (ch.notes != null) { i.note = ch.notes; i.custom.note = !!ch.notes; }
      save('instances', i);
      return { changed: 1 };
    }
    const from = monthStart(scope.fromMonth);
    const wasAuto = t.autopay != null ? !!t.autopay : !!t.subscription;
    if (ch.autopay !== undefined && !!ch.autopay !== wasAuto) { if (ch.autopay) t.autopaySince = todayStr(); else delete t.autopaySince; }
    ['name', 'category', 'method', 'accountId', 'notes', 'debtId', 'payFrom', 'subscription', 'autopay'].forEach(k => { if (ch[k] !== undefined) t[k] = k === 'name' ? ch[k].trim() : ch[k]; });
    if (ch.reminder !== undefined) { const rr = WT.cleanReminderRule(ch.reminder); if (rr) t.reminder = rr; else delete t.reminder; }
    const cur = ruleAt(t, from);
    const sched = { amountCents: ch.amountCents ?? cur.amountCents, frequency: ch.frequency || cur.frequency, interval: ch.interval ?? cur.interval, unit: ch.unit || cur.unit, anchor: ch.anchor || cur.anchor, eom: ch.eom !== undefined ? !!ch.eom : !!cur.eom };
    const schedChanged = ['amountCents', 'frequency', 'interval', 'unit', 'anchor'].some(k => String(sched[k]) !== String(cur[k])) || sched.eom !== !!cur.eom;
    if (schedChanged) {
      const firstFrom = t.versions.map(v => v.from).sort()[0];
      if (from <= firstFrom) {
        t.versions = [Object.assign({ from: sched.anchor < firstFrom ? sched.anchor : firstFrom }, sched)];
      } else {
        t.versions = t.versions.filter(v => v.from < from);
        t.versions.push(Object.assign({ from }, sched));
      }
      if (sched.frequency === 'once') t.endDate = sched.anchor;
      else if (t.endDate && cur.frequency === 'once') t.endDate = null;
    }
    save('templates', t);
    // reconcile instances from `from` onward
    let changed = 0;
    for (const i of vals('instances').filter(x => x.templateId === id && x.periodKey >= from)) {
      if (replaceable(i)) { del('instances', i.id); changed++; continue; }
      // kept (has history or overrides): refresh descriptive fields only when unpaid
      if (instPaid(i.id) < i.amountCents) {
        i.name = t.name; i.category = t.category; i.debtId = t.debtId;
        if (!i.custom.amount && !hasPayments(i.id)) i.amountCents = sched.amountCents;
        // kept only because it was skipped or moved to another paycheck: follow the new due date too
        if (!hasPayments(i.id) && !i.custom.due && monthlyish(sched)) {
          const occ = templateOccurrences(t, monthStart(i.periodMonth), monthEnd(i.periodMonth))[0];
          if (occ) i.dueDate = occ.date;
        }
        save('instances', i);
      }
    }
    WT.ensureGenerated(maxMonth(WT.settings().generatedThrough || monthOf(todayStr()), scope.fromMonth));
    return { changed };
  };

  WT.moveInstanceDue = function (instId, date) {
    const i = WT.D.instances[instId]; if (!i || !date) return;
    i.dueDate = date; i.custom.due = date !== i.periodKey; save('instances', i);
  };
  // "Refresh due dates" for a month: a bill whose due date was moved into another month becomes that
  // month's bill for good (its payments go with it), and the month it left gets its normal bill back.
  WT.refreshMonth = function (mk) {
    let moved = 0;
    for (const i of vals('instances')) {
      if (!(i.custom && i.custom.due)) continue;
      const dm = monthOf(i.dueDate);
      if (dm === i.periodMonth || (i.periodMonth !== mk && dm !== mk)) continue;
      let id = 'i_' + i.templateId + '_' + i.dueDate + '_moved'; for (let n = 2; WT.D.instances[id]; n++) id = 'i_' + i.templateId + '_' + i.dueDate + '_moved' + n;
      save('instances', Object.assign({}, i, { id, periodKey: i.dueDate, periodMonth: dm, custom: Object.assign({}, i.custom, { due: false }) }));
      for (const p of vals('payments').filter(p => p.instanceId === i.id)) { p.instanceId = id; save('payments', p); }
      del('instances', i.id); moved++;
    }
    if (moved) ixRebuild();
    const s = WT.settings();
    const created = WT.ensureGenerated(maxMonth(addMonthKey(mk, 1), s.generatedThrough || mk));
    return { moved, created };
  };
  WT.setSkipped = function (instId, skipped) { const i = WT.D.instances[instId]; i.skipped = !!skipped; save('instances', i); };
  WT.assignInstance = function (instId, paycheckKey) { const i = WT.D.instances[instId]; i.paycheckKey = paycheckKey || null; save('instances', i); };

  function dropFutureUnpaid(t, fromDate) {
    let n = 0;
    for (const i of vals('instances').filter(x => x.templateId === t.id && x.dueDate >= fromDate)) {
      if (!hasPayments(i.id)) { del('instances', i.id); n++; }
    }
    return n;
  }
  WT.pauseTemplate = function (id, fromDate) {
    const t = WT.D.templates[id]; fromDate = fromDate || todayStr();
    t.pauses = (t.pauses || []).filter(p => p.to); t.pauses.push({ from: fromDate, to: null }); t.status = 'paused';
    save('templates', t); return dropFutureUnpaid(t, fromDate);
  };
  WT.resumeTemplate = function (id) {
    const t = WT.D.templates[id]; const today = todayStr();
    // close the open pause the day before today; a pause resumed on the day it started is dropped
    (t.pauses || []).forEach(p => { if (!p.to) p.to = addDays(today, -1); });
    t.pauses = (t.pauses || []).filter(p => p.to >= p.from);
    t.status = 'active'; save('templates', t); WT.ensureGenerated(); return t;
  };
  WT.cancelTemplate = function (id, effective) {
    const t = WT.D.templates[id]; effective = effective || todayStr();
    t.status = 'cancelled'; t.endDate = addDays(effective, -1); t.cancelledOn = effective; save('templates', t);
    return dropFutureUnpaid(t, effective);
  };
  WT.reactivateTemplate = function (id) {
    const t = WT.D.templates[id]; const today = todayStr();
    // the months it was cancelled for stay empty: keep that gap as a pause
    if (t.cancelledOn && t.cancelledOn < today) t.pauses = (t.pauses || []).concat({ from: t.cancelledOn, to: addDays(today, -1) });
    t.status = 'active'; t.endDate = ruleAt(t, today).frequency === 'once' ? t.versions[0].anchor : null; delete t.cancelledOn;
    save('templates', t); WT.ensureGenerated(); return t;
  };
  // Deletes the bill: it disappears from this month on. Any month with a payment, earlier months
  // and every payment recorded are kept as history.
  WT.deleteTemplate = function (id) {
    const t = WT.D.templates[id]; const today = todayStr(); t.deleted = true; t.status = 'deleted'; t.deletedOn = today;
    save('templates', t); return dropFutureUnpaid(t, monthStart(monthOf(today)));
  };
  // Remove one unpaid month entirely (kept out of regeneration). Instances with payments can't be removed.
  WT.removeInstance = function (instId) {
    const i = WT.D.instances[instId]; if (!i || hasPayments(i.id)) return false;
    const t = WT.D.templates[i.templateId];
    if (t) { t.removedKeys = (t.removedKeys || []).concat(i.periodKey); save('templates', t); }
    del('instances', instId); return true;
  };

  // ---------------------------------------------------------------- bill status
  WT.instStatus = function (i, today) {
    today = today || todayStr();
    const paid = instPaid(i.id); const remaining = Math.max(0, i.amountCents - paid);
    let status;
    if (i.skipped) status = 'skipped';
    else if (remaining === 0) status = 'paid';
    else if (i.dueDate < today) status = paid > 0 ? 'overdue-partial' : 'overdue';
    else if (paid > 0) status = 'partial';
    else if (diffDays(today, i.dueDate) <= (WT.settings().dueSoonDays ?? 7)) status = 'due-soon';
    else status = 'upcoming';
    const t = WT.D.templates[i.templateId];
    return { paid, remaining, status, overdue: status.startsWith('overdue'), deletedBill: !!(t && t.deleted), template: t };
  };
  function instOfMonth(mk) { const s = IX.instByMonth.get(mk); if (!s) return []; const out = []; for (const id of s) { const r = WT.D.instances[id]; if (r) out.push(r); } return out; }
  WT.instancesForMonth = function (mk) {
    return instOfMonth(mk).sort((a, b) => a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.name.localeCompare(b.name));
  };
  WT.instancesBetween = function (a, b) {
    let list;
    if (monthsBetween(monthOf(a), monthOf(b)) > 240) list = vals('instances');
    else { list = []; for (let mk = monthOf(a); mk <= monthOf(b); mk = addMonthKey(mk, 1)) list.push(...instOfMonth(mk)); }
    return list.filter(i => i.dueDate >= a && i.dueDate <= b).sort((x, y) => x.dueDate < y.dueDate ? -1 : 1);
  };
  // unpaid instances due before today (carried forward — the same records, never duplicated)
  WT.overdue = function (today) {
    today = today || todayStr();
    return vals('instances').filter(i => i.dueDate < today && !i.skipped).filter(i => { const t = WT.D.templates[i.templateId]; return !(t && t.deleted); })
      .map(i => ({ i, s: WT.instStatus(i, today) })).filter(x => x.s.remaining > 0).sort((a, b) => a.i.dueDate < b.i.dueDate ? -1 : 1);
  };
  WT.billsSummary = function (mk) {
    let total = 0, paid = 0, remaining = 0, count = 0, paidCount = 0, overdue = 0;
    const today = todayStr();
    for (const i of WT.instancesForMonth(mk)) {
      if (i.skipped) continue;
      const s = WT.instStatus(i, today);
      total += i.amountCents; paid += Math.min(s.paid, i.amountCents); remaining += s.remaining; count++;
      if (s.status === 'paid') paidCount++; if (s.overdue) overdue += s.remaining;
    }
    return { total, paid, remaining, count, paidCount, overdue };
  };

  // ---------------------------------------------------------------- payments
  WT.recordPayment = function (instId, f) {
    const i = WT.D.instances[instId]; if (!i) throw new Error('No bill');
    const amount = f.amountCents; if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be more than $0.00');
    const p = {
      id: WT.uid('pay'), instanceId: instId, templateId: i.templateId, amountCents: amount, date: f.date || todayStr(),
      sourceId: f.sourceId || i.accountId || WT.defaultAccountId(), method: f.method ?? i.method ?? '', note: f.note || '', voided: false, createdAt: new Date().toISOString(),
    };
    save('payments', p); return p;
  };
  // Auto-pay bills (subscriptions by default) are deducted automatically: never marked by hand.
  WT.isAutopay = function (i) { const t = i && WT.D.templates[i.templateId]; if (!t || !(t.autopay != null ? t.autopay : t.subscription)) return false; return !(t.autopaySince && i.dueDate < t.autopaySince); };
  // Records the payment for every auto-pay bill whose due date has arrived (once; voided history blocks a re-add).
  WT.applyAutopay = function (today) {
    today = today || todayStr(); let n = 0;
    for (const i of vals('instances')) {
      if (i.dueDate > today || i.skipped || !(i.amountCents > 0) || !WT.isAutopay(i) || hasPayments(i.id)) continue;
      const t = WT.D.templates[i.templateId]; if (t && t.deleted && t.deletedOn && i.dueDate >= t.deletedOn) continue;
      save('payments', { id: 'pay_auto_' + i.id, instanceId: i.id, templateId: i.templateId, amountCents: i.amountCents, date: i.dueDate, sourceId: i.accountId || WT.defaultAccountId(), method: 'Auto-pay', note: 'Auto-deducted', voided: false, auto: true, createdAt: new Date().toISOString() });
      n++;
    }
    return n;
  };
  WT.markPaid = function (instId, date) {
    const i = WT.D.instances[instId]; if (!i) return null;
    const rem = i.amountCents - instPaid(instId);
    if (rem <= 0) return null;
    return WT.recordPayment(instId, { amountCents: rem, date: date || todayStr() });
  };
  WT.voidPayment = function (payId, reason) { const p = WT.D.payments[payId]; if (!p || p.voided) return; p.voided = true; p.voidedAt = new Date().toISOString(); p.voidReason = reason || ''; save('payments', p); };
  WT.markUnpaid = function (instId) { let n = 0; WT.paymentsFor(instId).forEach(p => { if (!p.voided) { WT.voidPayment(p.id, 'Marked unpaid'); n++; } }); return n; };
  // Voids (never deletes) every payment for bills due in the month.
  WT.resetMonthStatuses = function (mk) {
    let n = 0; WT.instancesForMonth(mk).filter(i => !WT.isAutopay(i)).forEach(i => { WT.paymentsFor(i.id).forEach(p => { if (!p.voided) { WT.voidPayment(p.id, 'Month reset ' + mk); n++; } }); });
    return n;
  };

  // ---------------------------------------------------------------- income & paychecks
  const SCHED = { weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly' };
  WT.SCHED = SCHED;
  WT.addIncome = function (f) {
    const r = Object.assign({ id: WT.uid('inc'), active: true, kind: 'net', schedule: 'biweekly', day1: 1, day2: 15, startDate: f.anchor, endDate: null, accountId: WT.defaultAccountId() }, f);
    save('incomes', r); return r;
  };
  WT.updateIncome = function (id, f) { const r = Object.assign(WT.D.incomes[id], f); save('incomes', r); return r; };
  function incomeDates(inc, from, to) {
    const start = inc.startDate || inc.anchor;
    if (from < start) from = start;
    if (inc.endDate && to > inc.endDate) to = inc.endDate;
    if (from > to) return [];
    if (inc.schedule === 'weekly' || inc.schedule === 'biweekly') {
      const step = inc.schedule === 'weekly' ? 7 : 14;
      // anchor may be after startDate; walk back to align
      let k = Math.floor(diffDays(inc.anchor, from) / step);
      const out = [];
      for (let g = 0; g < 2000; g++, k++) { const d = addDays(inc.anchor, k * step); if (d > to) break; if (d >= from) out.push(d); }
      return out;
    }
    const out = [];
    for (let mk = monthOf(from); mk <= monthOf(to); mk = addMonthKey(mk, 1)) {
      const days = inc.schedule === 'semimonthly' ? [inc.day1 || 1, inc.day2 || 15] : [inc.day1 || parts(inc.anchor).d];
      days.forEach(day => { const d = day >= 31 ? monthEnd(mk) : dateInMonthClamped(mk, day); if (d >= from && d <= to) out.push(d); });
    }
    return out.sort();
  }
  WT.incomeDates = incomeDates;
  WT.expectedNet = inc => inc.kind === 'gross' ? (inc.netCents || inc.grossCents || 0) : (inc.netCents || 0);
  WT.paychecksBetween = function (from, to) {
    return memo('pcb|' + from + '|' + to, () => {
      const out = [];
      for (const inc of vals('incomes')) {
        if (inc.deleted) continue;
        for (const d of incomeDates(inc, from, to)) out.push(WT.paycheck(inc.id + '|' + d));
      }
      return out.filter(Boolean).sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    }).slice();
  };
  const depositByKey = () => memo('depByKey', () => { const m = new Map(); for (const x of vals('deposits')) if (!x.voided) m.set(x.key, x); return m; });
  WT.paycheck = function (key) {
    if (!key) return null;
    const [incomeId, date] = key.split('|'); const inc = WT.D.incomes[incomeId]; if (!inc || inc.deleted || !date) return null;
    const dep = depositByKey().get(key);
    const expected = WT.expectedNet(inc);
    return { key, incomeId, income: inc, date, expectedCents: expected, deposit: dep || null, received: !!dep, amountCents: dep ? dep.amountCents : expected };
  };
  WT.recordDeposit = function (key, f) {
    const pc = WT.paycheck(key);
    vals('deposits').filter(x => x.key === key && !x.voided).forEach(x => { x.voided = true; x.voidedAt = new Date().toISOString(); save('deposits', x); });
    const r = { id: WT.uid('dep'), key, incomeId: pc.incomeId, payDate: pc.date, date: f.date || pc.date, amountCents: f.amountCents ?? pc.expectedCents, accountId: f.accountId || pc.income.accountId || WT.defaultAccountId(), note: f.note || '', voided: false };
    save('deposits', r); return r;
  };
  WT.undoDeposit = function (key) { vals('deposits').filter(x => x.key === key && !x.voided).forEach(x => { x.voided = true; x.voidedAt = new Date().toISOString(); save('deposits', x); }); };
  WT.addExtraIncome = function (f) { const r = Object.assign({ id: WT.uid('xin'), type: 'bonus', date: todayStr(), accountId: WT.defaultAccountId(), note: '', voided: false }, f); save('extraIncome', r); return r; };

  // Which paycheck pays a bill instance. Exactly one (or none) — so a bill can never be deducted twice.
  WT.paycheckFor = function (i) {
    if (i.paycheckKey) { const pc = WT.paycheck(i.paycheckKey); if (pc) return pc; }
    const t = WT.D.templates[i.templateId];
    const pref = t && t.payFrom && t.payFrom !== 'auto' && WT.D.incomes[t.payFrom] ? t.payFrom : null;
    const cands = WT.paychecksBetween(addDays(i.dueDate, -45), i.dueDate).filter(p => !pref || p.incomeId === pref);
    return cands.length ? cands[cands.length - 1] : null;
  };
  WT.billsForPaycheck = function (key) {
    const pc = WT.paycheck(key); if (!pc) return [];
    // automatic assignments are always within 45 days before the due date; manual ones can be anywhere
    const near = WT.instancesBetween(pc.date, addDays(pc.date, 46));
    const manual = memo('manualPc', () => { const m = new Map(); for (const i of vals('instances')) if (i.paycheckKey) { if (!m.has(i.paycheckKey)) m.set(i.paycheckKey, []); m.get(i.paycheckKey).push(i); } return m; }).get(key) || [];
    const seen = new Set(); const out = [];
    for (const i of near.concat(manual)) { if (seen.has(i.id)) continue; seen.add(i.id); if (!i.skipped && (WT.paycheckFor(i) || {}).key === key) out.push(i); }
    return out.sort((a, b) => a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);
  };
  WT.paycheckPlan = function (key) {
    const pc = WT.paycheck(key); if (!pc) return null;
    const bills = WT.billsForPaycheck(key).map(i => ({ i, s: WT.instStatus(i) }));
    const setAsides = (WT.settings().setAsides || []).filter(x => x.amountCents > 0);
    const setAsideTotal = setAsides.reduce((a, x) => a + x.amountCents, 0);
    const billTotal = bills.reduce((a, b) => a + b.i.amountCents, 0);
    const paid = bills.reduce((a, b) => a + Math.min(b.s.paid, b.i.amountCents), 0);
    return { pc, bills, billTotal, paid, unpaid: billTotal - paid, setAsides, setAsideTotal, remaining: pc.amountCents - billTotal, remainingAfterSetAsides: pc.amountCents - billTotal - setAsideTotal };
  };
  WT.nextPaycheck = function (today) {
    today = today || todayStr();
    return WT.paychecksBetween(today, addDays(today, 45))[0] || null;
  };
  WT.currentPaycheck = function (today) {
    today = today || todayStr();
    const ps = WT.paychecksBetween(addDays(today, -40), today); return ps[ps.length - 1] || WT.nextPaycheck(today);
  };

  // ---------------------------------------------------------------- debts
  // Mortgage escrow: the part of a mortgage payment the lender holds for property tax and homeowners insurance.
  // Only debts of type 'mortgage' with escrowCents > 0 have one; for every other debt this is 0.
  // With a date, the escrow in effect on that date: escrow changes apply going forward (escrowHistory keeps
  // [{from:'YYYY-MM-DD', cents}]), so past payments keep the escrow they had when they were made.
  WT.debtEscrow = function (d, date) {
    if (typeof d === 'string') d = WT.D.debts[d];
    if (!d || d.type !== 'mortgage') return 0;
    let c = d.escrowCents;
    if (date && Array.isArray(d.escrowHistory) && d.escrowHistory.length) {
      const h = d.escrowHistory.slice().sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0);
      const on = h.filter(x => x.from <= date);
      c = on.length ? on[on.length - 1].cents : h[0].cents;
    }
    return Number.isInteger(c) && c > 0 ? c : 0;
  };
  // principal + interest part of a debt's monthly payment (minCents minus escrow; unchanged for non-mortgages)
  WT.debtPI = function (d, paymentCents) {
    if (typeof d === 'string') d = WT.D.debts[d];
    const pay = paymentCents != null ? paymentCents : ((d && d.minCents) || 0);
    return Math.max(0, pay - WT.debtEscrow(d));
  };
  // payment id -> escrow part, for bill payments on mortgages with escrow. Per bill instance the first
  // escrowCents paid (earliest payment first) goes to escrow; only the rest lowers the loan balance.
  function mortgageEscrowShares() {
    const out = new Map(); const byInst = new Map();
    for (const p of vals('payments')) {
      if (p.voided || !(p.amountCents > 0)) continue;
      const i = WT.D.instances[p.instanceId]; if (!i || !i.debtId || !WT.debtEscrow(WT.D.debts[i.debtId], i.dueDate)) continue;
      if (!byInst.has(i.id)) byInst.set(i.id, []); byInst.get(i.id).push(p);
    }
    for (const [instId, ps] of byInst) {
      const inst = WT.D.instances[instId]; let left = WT.debtEscrow(WT.D.debts[inst.debtId], inst.dueDate);
      ps.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const p of ps) { const e = Math.min(left, p.amountCents); if (e > 0) { out.set(p.id, e); left -= e; } }
    }
    return out;
  }
  // derived flows into every debt (signed: + raises balance), built in one pass and cached until the next write
  function allDebtCharges() {
    return memo('debtCharges', () => {
      const m = new Map(); const add = (id, x) => { if (!m.has(id)) m.set(id, []); m.get(id).push(x); };
      const srcDebt = s => (s && s.startsWith('debt:') ? s.slice(5) : null);
      for (const e of vals('expenses')) { const d = srcDebt(e.sourceId); if (d) add(d, { date: e.date, amountCents: e.amountCents, type: 'charge', label: e.description || WT.catName(e.category), ref: e.id }); }
      const escrowOf = mortgageEscrowShares();
      for (const p of vals('payments')) {
        if (p.voided) continue;
        const i = WT.D.instances[p.instanceId];
        if (i && i.debtId) { const esc = escrowOf.get(p.id) || 0; add(i.debtId, Object.assign({ date: p.date, amountCents: -(p.amountCents - esc), type: 'payment', label: 'Payment — ' + i.name + (esc ? ' (' + fmt(esc) + ' to escrow)' : ''), ref: p.id }, esc ? { escrowCents: esc } : {})); }
        const d = srcDebt(p.sourceId); if (d) add(d, { date: p.date, amountCents: p.amountCents, type: 'charge', label: 'Bill charged — ' + (i ? i.name : ''), ref: p.id });
      }
      for (const x of vals('debtTxns')) if (!x.voided) add(x.debtId, { date: x.date, amountCents: x.amountCents, type: x.type, label: x.note || x.type, ref: x.id, txn: true });
      for (const arr of m.values()) arr.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      return m;
    });
  }
  WT.debtCharges = function (debtId) { return (allDebtCharges().get(debtId) || []).slice(); };
  WT.debtBalance = function (debtId, asOf, exclusive) {
    const d = WT.D.debts[debtId]; if (!d) return 0;
    let b = d.startBalanceCents || 0;
    for (const x of (allDebtCharges().get(debtId) || [])) { if (asOf && (exclusive ? x.date >= asOf : x.date > asOf)) continue; b += x.amountCents; }
    return b;
  };
  WT.debts = () => vals('debts').filter(d => !d.deleted).sort((a, b) => a.name.localeCompare(b.name));
  WT.totalDebt = asOf => WT.debts().reduce((a, d) => a + Math.max(0, WT.debtBalance(d.id, asOf)), 0);
  WT.addDebt = function (f) { const r = Object.assign({ id: WT.uid('debt'), type: 'credit_card', startBalanceCents: 0, startDate: todayStr(), aprCenti: 0, minCents: 0, dueDay: 1, limitCents: null, autoInterest: true, closed: false }, f); save('debts', r); return r; };
  // A changed mortgage escrow starts on f.escrowFrom (default today); bills due earlier keep the old escrow.
  WT.updateDebt = function (id, f) {
    const cur = WT.D.debts[id]; f = Object.assign({}, f); const from = f.escrowFrom || todayStr(); f.escrowFrom = undefined;
    if (cur && f.escrowCents != null && (cur.escrowCents || 0) !== f.escrowCents) {
      let h = Array.isArray(cur.escrowHistory) ? cur.escrowHistory.slice() : [{ from: '0000-01-01', cents: cur.escrowCents || 0 }];
      h = h.filter(x => x.from < from); h.push({ from, cents: f.escrowCents });
      f.escrowHistory = h.slice(-120);
    }
    const r = Object.assign(cur, f); if ('escrowFrom' in r) Reflect.deleteProperty(r, 'escrowFrom'); save('debts', r); return r;
  };
  WT.addDebtTxn = function (f) { const r = Object.assign({ id: WT.uid('dtx'), date: todayStr(), note: '', voided: false }, f); save('debtTxns', r); return r; };
  WT.setDebtBalance = function (debtId, cents, date) {
    date = date || todayStr(); const cur = WT.debtBalance(debtId, date);
    if (cur === cents) return null;
    return WT.addDebtTxn({ debtId, type: 'adjust', amountCents: cents - cur, date, note: 'Balance updated to ' + fmt(cents) });
  };
  // extra payment straight to a debt from an account (cash outflow, not a bill)
  WT.payDebtExtra = function (debtId, cents, date, sourceId) { return WT.addDebtTxn({ debtId, type: 'payment', amountCents: -cents, date: date || todayStr(), sourceId: sourceId || WT.defaultAccountId(), note: 'Extra payment' }); };
  // Adds monthly interest on each due date (once per debt per month; idempotent by key).
  WT.accrueInterest = function (today) {
    today = today || todayStr(); let n = 0;
    const have = new Set(vals('debtTxns').map(x => x.key).filter(Boolean));
    for (const d of WT.debts()) {
      if (!d.autoInterest || !d.aprCenti || d.closed) continue;
      // running balance from the debt's history plus interest added in this loop (no per-month rescans)
      const flows = WT.debtCharges(d.id); const added = [];
      const balBefore = date => { let b = d.startBalanceCents || 0; for (const x of flows) if (x.date < date) b += x.amountCents; for (const x of added) if (x.date < date) b += x.amountCents; return b; };
      let mk = monthOf(d.startDate);
      for (let g = 0; g < 600; g++, mk = addMonthKey(mk, 1)) {
        const date = dateInMonthClamped(mk, d.dueDay || 1);
        if (date > today) break;
        if (date <= d.startDate) continue;
        const key = 'int|' + d.id + '|' + mk;
        if (have.has(key)) continue;
        const amt = monthlyInterest(balBefore(date), d.aprCenti);
        WT.addDebtTxn({ id: 'dtx_' + key.replace(/\|/g, '_'), key, debtId: d.id, type: 'interest', amountCents: amt, date, note: 'Interest ' + pctStr(d.aprCenti) + ' APR' });
        added.push({ date, amountCents: amt }); have.add(key);
        n++;
      }
    }
    return n;
  };
  // Payoff simulation. strategy: 'minimum' | 'snowball' | 'avalanche'; extraCents per month on top of minimums.
  WT.simulatePayoff = function (debtsIn, extraCents, strategy) {
    const ds = debtsIn.map(d => ({ id: d.id, name: d.name, bal: Math.max(0, d.balanceCents), apr: d.aprCenti || 0, min: Math.max(d.minCents || 0, 0), paidOffMonth: null, interest: 0 }))
      .filter(d => d.bal > 0);
    let month = 0, totalInterest = 0; const timeline = [ds.reduce((a, d) => a + d.bal, 0)];
    const budget = ds.reduce((a, d) => a + d.min, 0) + (strategy === 'minimum' ? 0 : extraCents);
    let stuck = false;
    while (ds.some(d => d.bal > 0) && month < 600) {
      month++;
      for (const d of ds) if (d.bal > 0) { const it = monthlyInterest(d.bal, d.apr); d.bal += it; d.interest += it; totalInterest += it; }
      let pool = budget;
      for (const d of ds) if (d.bal > 0) { const p = Math.min(d.min, d.bal, pool); d.bal -= p; pool -= p; }
      if (strategy !== 'minimum') {
        const order = ds.filter(d => d.bal > 0).sort(strategy === 'avalanche' ? (a, b) => b.apr - a.apr || a.bal - b.bal : (a, b) => a.bal - b.bal || b.apr - a.apr);
        for (const d of order) { if (pool <= 0) break; const p = Math.min(pool, d.bal); d.bal -= p; pool -= p; }
      }
      for (const d of ds) if (d.bal <= 0 && d.paidOffMonth == null) d.paidOffMonth = month;
      const tot = ds.reduce((a, d) => a + Math.max(0, d.bal), 0);
      timeline.push(tot);
      if (month > 24 && timeline[month] >= timeline[month - 12]) { stuck = true; break; }
    }
    return { months: stuck ? null : month, totalInterest, debts: ds, timeline, stuck, monthlyBudget: budget };
  };
  // payoff inputs. For a mortgage with escrow, minCents is principal + interest only (the escrow part pays
  // property tax and insurance, not the loan); paymentCents/escrowCents keep the full payment and its escrow part.
  WT.debtInputs = () => WT.debts().filter(d => !d.closed).map(d => {
    const r = { id: d.id, name: d.name, balanceCents: WT.debtBalance(d.id), aprCenti: d.aprCenti, minCents: d.minCents };
    const esc = WT.debtEscrow(d);
    if (esc) Object.assign(r, { minCents: WT.debtPI(d), paymentCents: d.minCents || 0, escrowCents: esc });
    return r;
  });

  // ---------------------------------------------------------------- expenses
  WT.addExpense = function (f) {
    const r = Object.assign({ id: WT.uid('exp'), date: todayStr(), category: 'cat_other', description: '', sourceId: WT.defaultAccountId(), receiptId: null, notes: '', createdAt: new Date().toISOString() }, f);
    if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) throw new Error('Amount must be more than $0.00');
    save('expenses', r); return r;
  };
  WT.updateExpense = function (id, f) { const r = Object.assign(WT.D.expenses[id], f); save('expenses', r); return r; };
  WT.deleteExpense = function (id) { const e = WT.D.expenses[id]; if (e && e.receiptId) del('receipts', e.receiptId); del('expenses', id); };
  // possible duplicate: a bill payment with same amount within 3 days
  WT.findDuplicatePayment = function (amountCents, date) {
    return vals('payments').filter(p => !p.voided && p.amountCents === amountCents && Math.abs(diffDays(p.date, date)) <= 3).map(p => ({ p, i: WT.D.instances[p.instanceId] }));
  };

  // ---------------------------------------------------------------- accounts / transfers / goals
  WT.addTransfer = function (f) { const r = Object.assign({ id: WT.uid('trf'), date: todayStr(), note: '' }, f); save('transfers', r); return r; };
  WT.addGoal = function (f) { const r = Object.assign({ id: WT.uid('goal'), type: 'custom', targetCents: 0, startCents: 0, targetDate: null, accountId: null, archived: false, createdAt: todayStr() }, f); save('goals', r); return r; };
  WT.updateGoal = function (id, f) { const r = Object.assign(WT.D.goals[id], f); save('goals', r); return r; };
  // contribution = transfer between own accounts (never an expense)
  WT.contributeGoal = function (goalId, cents, date, fromAccountId) {
    const g = WT.D.goals[goalId]; date = date || todayStr();
    const gt = { id: WT.uid('gtx'), goalId, amountCents: cents, date, fromAccountId: fromAccountId || null, note: '' };
    if (fromAccountId && g.accountId && fromAccountId !== g.accountId) {
      const tr = cents >= 0 ? WT.addTransfer({ fromId: fromAccountId, toId: g.accountId, amountCents: cents, date, note: 'Goal: ' + g.name })
        : WT.addTransfer({ fromId: g.accountId, toId: fromAccountId, amountCents: -cents, date, note: 'Goal withdrawal: ' + g.name });
      gt.transferId = tr.id;
    }
    save('goalTxns', gt); return gt;
  };
  WT.goalSaved = id => { const g = WT.D.goals[id]; return (g.startCents || 0) + vals('goalTxns').filter(x => x.goalId === id && !x.voided).reduce((a, x) => a + x.amountCents, 0); };
  WT.goalProjection = function (id, today) {
    today = today || todayStr(); const g = WT.D.goals[id]; const saved = WT.goalSaved(id);
    const since = addDays(today, -90);
    const recent = vals('goalTxns').filter(x => x.goalId === id && !x.voided && x.date >= since).reduce((a, x) => a + x.amountCents, 0);
    const perMonth = divRound(recent, 3);
    const left = Math.max(0, g.targetCents - saved);
    let date = null;
    if (left === 0) date = today; else if (perMonth > 0) date = addMonthsClamp(today, Math.ceil(left / perMonth));
    let neededPerMonth = null;
    if (g.targetDate && left > 0) { const m = Math.max(1, monthsBetween(monthOf(today), monthOf(g.targetDate))); neededPerMonth = Math.ceil(left / m); }
    return { saved, left, pct: g.targetCents ? Math.max(0, Math.min(100, Math.floor(saved * 100 / g.targetCents))) : 0, perMonth, date, neededPerMonth };
  };

  WT.accountFlows = function (accId) { // signed flows for a cash account
    const out = [];
    for (const d of vals('deposits')) if (!d.voided && d.accountId === accId) out.push({ date: d.date, amountCents: d.amountCents, kind: 'income', label: 'Paycheck — ' + ((WT.D.incomes[d.incomeId] || {}).name || ''), ref: d.id });
    for (const x of vals('extraIncome')) if (!x.voided && x.accountId === accId) out.push({ date: x.date, amountCents: x.amountCents, kind: 'income', label: (x.type || 'Income') + (x.note ? ' — ' + x.note : ''), ref: x.id });
    for (const p of vals('payments')) if (!p.voided && p.sourceId === accId) out.push({ date: p.date, amountCents: -p.amountCents, kind: 'bill', label: (WT.D.instances[p.instanceId] || {}).name || 'Bill', ref: p.id });
    for (const e of vals('expenses')) if (e.sourceId === accId) out.push({ date: e.date, amountCents: -e.amountCents, kind: 'expense', label: e.description || WT.catName(e.category), ref: e.id });
    for (const t of vals('transfers')) { if (t.voided) continue; if (t.fromId === accId) out.push({ date: t.date, amountCents: -t.amountCents, kind: 'transfer', label: 'Transfer to ' + WT.sourceName(t.toId), ref: t.id }); if (t.toId === accId) out.push({ date: t.date, amountCents: t.amountCents, kind: 'transfer', label: 'Transfer from ' + WT.sourceName(t.fromId), ref: t.id }); }
    for (const x of vals('debtTxns')) if (!x.voided && x.type === 'payment' && x.sourceId === accId) out.push({ date: x.date, amountCents: x.amountCents, kind: 'debt', label: 'Extra payment — ' + ((WT.D.debts[x.debtId] || {}).name || ''), ref: x.id });
    return out;
  };
  WT.accountBalance = function (accId, asOf) {
    const a = WT.D.accounts[accId]; if (!a) return 0; asOf = asOf || todayStr();
    let b = a.openingCents || 0;
    for (const f of WT.accountFlows(accId)) if (f.date >= (a.openingDate || '0000') && f.date <= asOf) b += f.amountCents;
    return b;
  };
  WT.availableBalance = asOf => WT.accounts().filter(a => a.inAvailable).reduce((s, a) => s + WT.accountBalance(a.id, asOf), 0);

  // ---------------------------------------------------------------- spending / income summaries
  const cardDebt = id => { const d = id && WT.D.debts[id]; return !!(d && d.type === 'credit_card'); };
  // Cash-basis spending by category. Prevents double counting:
  //  - credit-card bill payments are NOT spending (the purchases were already counted as expenses)
  //  - goal contributions and transfers between your own accounts are NOT spending
  //  - a bill paid by charging it to a card is counted once (when charged)
  // One pass over all records, grouped by month; cached until the next write.
  function monthlyFlows() {
    return memo('monthlyFlows', () => {
      const M = new Map();
      const get = mk => { let r = M.get(mk); if (!r) { r = { by: {}, card: 0, expenses: 0, extra: 0 }; M.set(mk, r); } return r; };
      const add = (mk, c, v) => { const r = get(mk); r.by[c] = (r.by[c] || 0) + v; };
      for (const e of vals('expenses')) { add(monthOf(e.date), e.category, e.amountCents); get(monthOf(e.date)).expenses += e.amountCents; }
      for (const p of vals('payments')) {
        if (p.voided) continue;
        const i = WT.D.instances[p.instanceId]; if (!i) continue;
        if (cardDebt(i.debtId)) { get(monthOf(p.date)).card += p.amountCents; continue; }
        add(monthOf(p.date), i.category, p.amountCents);
      }
      for (const x of vals('debtTxns')) {
        if (x.voided || x.type !== 'payment') continue;
        if (cardDebt(x.debtId)) get(monthOf(x.date)).card += -x.amountCents;
        else if (x.sourceId) add(monthOf(x.date), 'cat_loans', -x.amountCents);
      }
      for (const x of vals('extraIncome')) if (!x.voided) get(monthOf(x.date)).extra += x.amountCents;
      return M;
    });
  }
  WT.spendingByCategory = function (mk) { const r = monthlyFlows().get(mk); return r ? Object.assign({}, r.by) : {}; };
  WT.cardPaymentsInMonth = function (mk) { const r = monthlyFlows().get(mk); return r ? r.card : 0; };
  WT.totalSpending = mk => Object.values(WT.spendingByCategory(mk)).reduce((a, b) => a + b, 0);
  WT.incomeForMonth = function (mk) {
    let expected = 0, received = 0, extra = 0;
    for (const pc of WT.paychecksBetween(monthStart(mk), monthEnd(mk))) { expected += pc.amountCents; if (pc.received) received += pc.deposit.amountCents; }
    extra = (monthlyFlows().get(mk) || { extra: 0 }).extra;
    return { paychecks: expected, received, extra, total: expected + extra };
  };
  WT.monthSummary = function (mk) {
    const inc = WT.incomeForMonth(mk); const bills = WT.billsSummary(mk); const spend = WT.spendingByCategory(mk);
    const expensesOnly = (monthlyFlows().get(mk) || { expenses: 0 }).expenses;
    return { month: mk, income: inc, bills, spending: spend, totalSpending: Object.values(spend).reduce((a, b) => a + b, 0), expensesOnly, cardPayments: WT.cardPaymentsInMonth(mk), leftAfterBills: inc.total - bills.total };
  };

  // ---------------------------------------------------------------- budgets
  WT.setBudget = function (category, limitCents, rollover) {
    const r = Object.assign(WT.D.budgets[category] || { id: category, category, startMonth: monthOf(todayStr()) }, { limitCents, rollover: !!rollover });
    save('budgets', r); return r;
  };
  WT.budgetStatus = function (mk) {
    const out = [];
    const cache = {};
    const spentIn = m => (cache[m] = cache[m] || WT.spendingByCategory(m));
    for (const b of vals('budgets')) {
      if (!b.limitCents && b.limitCents !== 0) continue;
      let carry = 0;
      if (b.rollover) {
        // carry accumulates from the month the budget started, so every month agrees with the one before it
        let m = b.startMonth || mk;
        for (let g = 0; m < mk && g < 1200; g++, m = addMonthKey(m, 1)) { const avail = b.limitCents + carry; carry = Math.max(0, avail - (spentIn(m)[b.category] || 0)); }
      }
      const budget = b.limitCents + carry; const spent = spentIn(mk)[b.category] || 0;
      const pct = budget > 0 ? Math.floor(spent * 100 / budget) : (spent > 0 ? 100 : 0);
      out.push({ b, category: b.category, limit: b.limitCents, carry, budget, spent, remaining: budget - spent, pct, level: pct >= 100 ? (spent > budget ? 'over' : 'at') : pct >= 80 ? 'warn' : 'ok' });
    }
    return out.sort((a, b) => b.pct - a.pct);
  };

  // ---------------------------------------------------------------- projection
  WT.projection = function (days, today) {
    today = today || todayStr(); days = days || 60;
    const end = addDays(today, days);
    const start = WT.availableBalance(today);
    const ev = [];
    for (const pc of WT.paychecksBetween(addDays(today, 1), end)) {
      if (pc.received) continue;
      ev.push({ date: pc.date, amountCents: pc.amountCents, label: 'Paycheck — ' + pc.income.name, kind: 'income' });
      if (WT.settings().projectionIncludesSetAsides) for (const sa of WT.settings().setAsides || []) if (sa.amountCents > 0) ev.push({ date: pc.date, amountCents: -sa.amountCents, label: sa.name, kind: 'setaside' });
    }
    for (const pc of WT.paychecksBetween(today, today)) if (!pc.received) ev.push({ date: today, amountCents: pc.amountCents, label: 'Paycheck — ' + pc.income.name + ' (not marked received)', kind: 'income' });
    // bills charged to a credit card don't come out of cash (same rule for overdue and upcoming)
    for (const x of WT.overdue(today)) { if (x.i.accountId && x.i.accountId.startsWith('debt:')) continue; ev.push({ date: today, amountCents: -x.s.remaining, label: x.i.name + ' (overdue)', kind: 'bill' }); }
    for (const i of WT.instancesBetween(today, end)) {
      if (i.skipped) continue; const s = WT.instStatus(i, today); if (s.remaining <= 0) continue;
      if (i.accountId && i.accountId.startsWith('debt:')) continue;
      ev.push({ date: i.dueDate, amountCents: -s.remaining, label: i.name, kind: 'bill' });
    }
    ev.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (b.amountCents - a.amountCents));
    let bal = start; const series = []; let low = { date: today, balance: start };
    let k = 0;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      while (k < ev.length && ev[k].date === d) { bal += ev[k].amountCents; ev[k].balance = bal; k++; }
      series.push({ date: d, balance: bal });
      if (bal < low.balance) low = { date: d, balance: bal };
    }
    return { start, end: bal, series, events: ev, low };
  };

  // ---------------------------------------------------------------- reminders
  // PRO-GATE: custom reminders (per-bill overrides, minutes, extra lead days, daily overdue reminders) are Pro.
  // Wired to the real entitlement at merge; until then everything is unlocked.
  WT.remindersPro = () => (typeof WT_isPro === 'function' ? !!WT_isPro() : true);
  const REM_FREE_DAYS = [7, 3, 1, 0];
  const REM_MINUTES = [0, 15, 30, 45];
  const remDays = (a, allowed) => Array.from(new Set((Array.isArray(a) ? a : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 30 && (!allowed || allowed.includes(d))))).sort((x, y) => y - x);
  const remHour = h => (Number.isInteger(h) && h >= 0 && h < 24 ? h : 9);
  const remMinute = m => (REM_MINUTES.includes(m) ? m : 0);
  // a bill's own reminder rule: {mode:'default'} | {mode:'off'} | {mode:'custom', daysBefore, hour, minute}
  WT.cleanReminderRule = function (r) {
    if (!r || typeof r !== 'object' || !['custom', 'off'].includes(r.mode)) return null;
    if (r.mode === 'off') return { mode: 'off' };
    return { mode: 'custom', daysBefore: remDays(r.daysBefore), hour: remHour(r.hour), minute: remMinute(r.minute) };
  };
  // Pure: which reminders a bill gets. g = settings.reminders, rule = template.reminder, pro = has Pro.
  // Returns null for none, else {daysBefore, hour, minute, overdueDaily}.
  WT.reminderPlan = function (g, rule, pro) {
    if (!g || !g.enabled) return null;
    const base = { daysBefore: remDays(g.daysBefore, pro ? null : REM_FREE_DAYS), hour: remHour(g.hour), minute: pro ? remMinute(g.minute) : 0, overdueDaily: !!(pro && g.overdueDaily) };
    if (!g.daysBefore) base.daysBefore = [1];
    const r = pro ? WT.cleanReminderRule(rule) : null;
    if (r && r.mode === 'off') return null;
    if (r && r.mode === 'custom') { base.daysBefore = r.daysBefore; base.hour = r.hour; base.minute = r.minute; }
    return base.daysBefore.length || base.overdueDaily ? base : null;
  };
  const OVERDUE_DAYS = 14; // daily overdue reminders run for at most two weeks past the due date
  WT.reminderList = function (today, horizonDays) {
    const g = WT.settings().reminders; if (!g || !g.enabled) return [];
    today = today || todayStr(); const out = []; const pro = WT.remindersPro();
    const end = addDays(today, horizonDays || 45);
    const from = g.overdueDaily && pro ? addDays(today, -OVERDUE_DAYS) : today;
    for (const i of WT.instancesBetween(from, end)) {
      const t = WT.D.templates[i.templateId];
      if (t && (t.deleted || t.status === 'cancelled' || t.status === 'deleted' || inPause(t, i.dueDate))) continue;
      const st = WT.instStatus(i, today); if (st.remaining <= 0 || i.skipped || WT.isAutopay(i)) continue;
      const plan = WT.reminderPlan(g, t && t.reminder, pro); if (!plan) continue;
      const body = fmt(st.remaining) + ' due ' + dateLabel(i.dueDate);
      for (const db of plan.daysBefore) {
        const d = addDays(i.dueDate, -db); if (d < today) continue;
        out.push({ id: i.id + '@' + db, date: d, hour: plan.hour, minute: plan.minute, title: db === 0 ? i.name + ' is due today' : i.name + ' due in ' + db + ' day' + (db > 1 ? 's' : ''), body });
      }
      if (plan.overdueDaily) for (let k = 1; k <= OVERDUE_DAYS; k++) {
        const d = addDays(i.dueDate, k); if (d < today) continue; if (d > end) break;
        out.push({ id: i.id + '@od' + k, date: d, hour: plan.hour, minute: plan.minute, title: i.name + ' is overdue', body: fmt(st.remaining) + ' was due ' + dateLabel(i.dueDate) });
      }
    }
    // soonest first, so the phone's alarm cap keeps the nearest reminders
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute));
  };

  // ---------------------------------------------------------------- unified transaction history
  WT.transactions = function () {
    const out = [];
    for (const p of vals('payments')) { const i = WT.D.instances[p.instanceId] || {}; out.push({ id: p.id, kind: 'bill', date: p.date, amountCents: -p.amountCents, name: i.name || 'Bill', category: i.category, source: p.sourceId, voided: p.voided, note: p.note, ref: p }); }
    for (const e of vals('expenses')) out.push({ id: e.id, kind: 'expense', date: e.date, amountCents: -e.amountCents, name: e.description || WT.catName(e.category), category: e.category, source: e.sourceId, note: e.notes, receipt: !!e.receiptId, ref: e });
    for (const d of vals('deposits')) out.push({ id: d.id, kind: 'income', date: d.date, amountCents: d.amountCents, name: 'Paycheck — ' + ((WT.D.incomes[d.incomeId] || {}).name || ''), category: 'income', source: d.accountId, voided: d.voided, ref: d });
    for (const x of vals('extraIncome')) out.push({ id: x.id, kind: 'income', date: x.date, amountCents: x.amountCents, name: ((x.type || 'income')[0].toUpperCase() + (x.type || 'income').slice(1)) + (x.note ? ' — ' + x.note : ''), category: 'income', source: x.accountId, voided: x.voided, ref: x });
    for (const t of vals('transfers')) out.push({ id: t.id, kind: 'transfer', date: t.date, amountCents: t.amountCents, name: WT.sourceName(t.fromId) + ' → ' + WT.sourceName(t.toId) + (t.note ? ' (' + t.note + ')' : ''), category: 'transfer', voided: t.voided, ref: t });
    for (const x of vals('debtTxns')) out.push({ id: x.id, kind: 'debt-' + x.type, date: x.date, amountCents: x.amountCents, name: ((WT.D.debts[x.debtId] || {}).name || 'Debt') + ' — ' + (x.note || x.type), category: 'debt', source: x.sourceId, voided: x.voided, ref: x });
    return out.sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  };

  // ---------------------------------------------------------------- maintenance (run on every app open)
  WT.runMaintenance = function (today) {
    today = today || todayStr();
    const created = WT.ensureGenerated(addMonthKey(monthOf(today), 1));
    const autopaid = WT.applyAutopay(today);
    const interest = WT.accrueInterest(today);
    return { created, interest, autopaid };
  };

  // ---------------------------------------------------------------- integrity check
  WT.integrity = function () {
    const issues = [];
    const seen = {};
    for (const i of vals('instances')) {
      const t = WT.D.templates[i.templateId]; if (!t) continue;
      const k = i.templateId + '|' + i.periodKey; if (seen[k]) issues.push('Duplicate bill for ' + i.name + ' ' + i.periodKey); seen[k] = 1;
    }
    for (const p of vals('payments')) if (!WT.D.instances[p.instanceId]) issues.push('Payment ' + p.id + ' has no bill');
    return issues;
  };
  // Structured version for Settings > Check data, which can clean these up:
  //   {type:'dupBill', key, templateId, periodKey, name, keepId, removeIds, conflict, paidCents, text}
  //     conflict = more than one copy has real (not voided) payments that add up to more than the bill,
  //     so the user might have paid twice: never merged without asking.
  //   {type:'orphanPayment', key, paymentId, amountCents, date, voided, name, text}
  const activePaid = id => payRecs(id).reduce((a, p) => a + (p.voided ? 0 : p.amountCents), 0);
  function keepScore(i) { // higher is better: the copy holding money records and edits wins
    const c = i.custom || {};
    return [activePaid(i.id) > 0 ? 1 : 0, hasPayments(i.id) ? 1 : 0, i.id === 'i_' + i.templateId + '_' + i.periodKey ? 1 : 0,
      (c.amount || c.due || c.note ? 1 : 0) + (i.note ? 1 : 0) + (i.paycheckKey ? 1 : 0) + (i.skipped ? 1 : 0)];
  }
  function dupGroup(templateId, periodKey) {
    const g = vals('instances').filter(i => i.templateId === templateId && i.periodKey === periodKey);
    g.sort((a, b) => { const x = keepScore(a), y = keepScore(b); for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return y[k] - x[k]; return String(a.createdAt || '') < String(b.createdAt || '') ? -1 : String(a.createdAt || '') > String(b.createdAt || '') ? 1 : a.id < b.id ? -1 : 1; });
    return g;
  }
  WT.integrityIssues = function () {
    const out = []; const groups = {};
    for (const i of vals('instances')) {
      if (!WT.D.templates[i.templateId]) continue;
      const k = i.templateId + '|' + i.periodKey; (groups[k] = groups[k] || []).push(i);
    }
    for (const k of Object.keys(groups).sort()) {
      if (groups[k].length < 2) continue;
      const g0 = groups[k][0]; const g = dupGroup(g0.templateId, g0.periodKey); const keep = g[0];
      const paidCopies = g.filter(i => activePaid(i.id) > 0);
      const paidCents = g.reduce((a, i) => a + activePaid(i.id), 0);
      const conflict = paidCopies.length > 1 && paidCents > keep.amountCents;
      out.push({ type: 'dupBill', key: 'dup:' + k, templateId: keep.templateId, periodKey: keep.periodKey, name: keep.name, keepId: keep.id, removeIds: g.slice(1).map(i => i.id), conflict, paidCents, amountCents: keep.amountCents,
        text: (g.length === 2 ? keep.name + ' is listed twice for ' : keep.name + ' is listed ' + g.length + ' times for ') + formatDate(keep.periodKey) + (conflict ? '. More than one copy is paid (' + fmt(paidCents) + ' in total), so you may have paid it twice.' : '.') });
    }
    for (const p of vals('payments').sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)) {
      if (WT.D.instances[p.instanceId]) continue;
      const t = WT.D.templates[p.templateId];
      out.push({ type: 'orphanPayment', key: 'pay:' + p.id, paymentId: p.id, amountCents: p.amountCents, date: p.date, voided: !!p.voided, name: t ? t.name : '',
        text: (p.voided ? 'A voided payment of ' : 'A payment of ') + fmt(p.amountCents) + (t ? ' for ' + t.name : '') + ' on ' + formatDate(p.date) + ' is not linked to any bill.' });
    }
    return out;
  };
  // Fixes the given issues (from integrityIssues). Duplicates: the extra copies are removed and their
  // payments moved onto the copy that is kept, so no money record is ever lost. A conflict (paid twice)
  // is only merged with opts.merge; then every payment is kept on one bill so the user can void the extra.
  // Orphan payments are deleted only when passed in (the user chose to). Returns {fixed, skipped, snapshot};
  // WT.undoRepair(snapshot) puts every touched record back exactly as it was.
  WT.repairIntegrity = function (issues, opts) {
    opts = opts || {}; const snap = []; const seenSnap = {}; let fixed = 0; const skipped = [];
    const keep = (coll, id) => { const k = coll + '|' + id; if (seenSnap[k]) return; seenSnap[k] = 1; const r = WT.D[coll][id]; snap.push({ coll, id, rec: r ? JSON.parse(JSON.stringify(r)) : null }); };
    for (const is of issues || []) {
      if (!is) continue;
      if (is.type === 'dupBill') {
        const g = dupGroup(is.templateId, is.periodKey); // re-checked against the data as it is now
        if (g.length < 2) { skipped.push(is.key); continue; }
        const k = g[0]; const extras = g.slice(1);
        const paidCopies = g.filter(i => activePaid(i.id) > 0);
        if (paidCopies.length > 1 && g.reduce((a, i) => a + activePaid(i.id), 0) > k.amountCents && !opts.merge) { skipped.push(is.key); continue; }
        for (const x of extras) {
          for (const p of payRecs(x.id)) { keep('payments', p.id); const np = Object.assign({}, p, { instanceId: k.id, movedFrom: x.id }); del('payments', p.id); save('payments', np); }
          keep('instances', x.id);
          if (x.id === 'i_' + x.templateId + '_' + x.periodKey) { // stop the next app open from making it again
            const t = WT.D.templates[x.templateId];
            if (t && !(t.removedKeys || []).includes(x.periodKey)) { keep('templates', t.id); t.removedKeys = (t.removedKeys || []).concat(x.periodKey); save('templates', t); }
          }
          del('instances', x.id);
        }
        fixed++;
      } else if (is.type === 'orphanPayment') {
        const p = WT.D.payments[is.paymentId];
        if (!p || WT.D.instances[p.instanceId]) { skipped.push(is.key); continue; }
        keep('payments', p.id); del('payments', p.id); fixed++;
      }
    }
    return { fixed, skipped, snapshot: snap };
  };
  WT.undoRepair = function (snapshot) {
    for (const s of (snapshot || []).slice().reverse()) {
      if (WT.D[s.coll][s.id]) del(s.coll, s.id); // clears the payment index for a moved payment
      if (s.rec) save(s.coll, JSON.parse(JSON.stringify(s.rec)));
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = WT;
  else root.WT = WT;
})(typeof window !== 'undefined' ? window : globalThis);
