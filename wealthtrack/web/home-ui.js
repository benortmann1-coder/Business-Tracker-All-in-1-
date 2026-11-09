// Home screen extras (WTHomeUI): Today's Wealth Tip + net worth card on the dashboard, and the Progress page
// (net worth trend, milestones, notification toggle, saved tips).
// Renders through window.WTUI helpers (app.js), WTWealth (wealth.js) and WTTips (tips.js). Read-only over WT data.
// The only writes are settings: settings.tips.favorites (tip ids, on tap), settings.achievementsNotify (on toggle)
// and settings.achievements (milestone dates, recorded automatically once WTWealth verifies them; never in demo mode).
(function () {
  'use strict';
  const U = () => window.WTUI || {};
  const Wt = () => (window.WTUI && window.WTUI.W) || window.WT;
  const Wealth = () => (window.WTWealth && window.WTWealth.ready ? window.WTWealth : null);
  const Tips = () => (window.WTTips && window.WTTips.ready ? window.WTTips : null);
  const num = v => (Number.isFinite(+v) ? Math.round(+v) : 0);
  const fmt = c => (U().fmt ? U().fmt(num(c)) : String(num(c) / 100));
  const esc = s => (U().esc ? U().esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const ic = n => (U().ic ? U().ic(n) : '');
  const toast = (m, o) => U().toast && U().toast(m, o);
  const settings = () => { try { return Wt().settings() || {}; } catch (e) { return {}; } };
  const today = () => { try { return Wt().todayStr(); } catch (e) { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); } };
  const isDemo = () => settings().demo === true;
  const longDate = d => { try { return Wt().dateLabel(d, true); } catch (e) { return d || ''; } };
  const signed = c => (c > 0 ? '+' : c < 0 ? '−' : '') + fmt(Math.abs(c));
  const MAX_FAVS = 400;

  // ------------------------------------------------------------ styles (one injected block, theme tokens only)
  const CSS = `
.hm-top { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin: 0 0 24px; }
.hm-card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; min-width: 0; }
.hm-eyebrow { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); }
.hm-eyebrow .hm-topic { letter-spacing: .02em; text-transform: none; font-weight: 600; color: var(--ink-2); background: var(--sunken); border-radius: 999px; padding: 1px 8px; font-size: 11.5px; }
.hm-tip-h { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin: -6px -6px 4px 0; }
.hm-tip-text { margin: 0; color: var(--ink); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.hm-fav { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border: 0; background: none; border-radius: 8px; color: var(--ink-3); font-size: 20px; line-height: 1; cursor: pointer; }
.hm-fav:hover { background: var(--hover); color: var(--ink); }
.hm-fav.on { color: var(--brand); }
.hm-more { margin-top: 6px; }
.hm-more summary { display: inline-flex; align-items: center; min-height: 40px; cursor: pointer; color: var(--brand); font-weight: 600; font-size: 13px; list-style: none; }
.hm-more summary::-webkit-details-marker { display: none; }
.hm-more summary::after { content: ''; width: 6px; height: 6px; margin-left: 8px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform .15s; }
.hm-more[open] summary::after { transform: rotate(-135deg) translateY(-1px); }
.hm-more p { margin: 0 0 2px; color: var(--ink-2); font-size: 13px; line-height: 1.5; }
.hm-nw-row { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 4px; }
.hm-nw-big { font-size: 26px; font-weight: 650; letter-spacing: -.01em; color: var(--ink); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.hm-nw-big.neg { color: var(--ink); }
.hm-sides { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.hm-sides > div { min-width: 0; }
.hm-sides b { display: block; font-variant-numeric: tabular-nums; font-size: 14.5px; color: var(--ink); overflow-wrap: anywhere; }
.hm-lbl { font-size: 12px; color: var(--ink-3); }
.hm-chg { font-size: 13px; color: var(--ink-2); margin-top: 8px; font-variant-numeric: tabular-nums; }
.hm-chg .up { color: var(--paid); font-weight: 600; } .hm-chg .down { color: var(--ink); font-weight: 600; }
.hm-pill { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 7px; border-radius: 999px; background: var(--sunken); color: var(--ink-2); border: 1px solid var(--line); vertical-align: 1px; text-transform: none; letter-spacing: 0; }
.hm-pill.demo { background: var(--due-soft, var(--sunken)); border-color: transparent; color: var(--ink); }
.hm-note { font-size: 12px; color: var(--ink-3); margin-top: 6px; line-height: 1.45; }
.hm-link { display: inline-flex; align-items: center; gap: 4px; min-height: 40px; font-weight: 600; font-size: 13px; color: var(--brand); text-decoration: none; margin-bottom: -8px; }
.hm-link svg { width: 15px; height: 15px; }
.hm-sec { margin-top: 26px; }
.hm-sec > h2 { font-size: 15px; font-weight: 650; margin: 0 0 10px; color: var(--ink); display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.hm-sec > h2 .meta { font-size: 12.5px; font-weight: 500; color: var(--ink-3); }
.hm-trend { margin-top: 14px; }
.hm-trend svg { display: block; width: 100%; height: 120px; overflow: visible; }
.hm-trend .ln { fill: none; stroke: var(--brand); stroke-width: 2; vector-effect: non-scaling-stroke; }
.hm-trend .ar { fill: var(--brand); opacity: .08; }
.hm-trend .zero { stroke: var(--line-2); stroke-width: 1; stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
.hm-trend-x { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--ink-3); margin-top: 4px; }
.hm-list { border: 1px solid var(--line); border-radius: 12px; background: var(--surface); overflow: hidden; }
.hm-ach { display: flex; gap: 12px; align-items: flex-start; padding: 11px 14px; border-top: 1px solid var(--line); }
.hm-ach:first-child { border-top: 0; }
.hm-badge { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 1.5px solid var(--line-2); color: var(--ink-3); margin-top: 1px; }
.hm-badge svg { width: 14px; height: 14px; }
.hm-ach.earned .hm-badge { background: var(--paid-soft); border-color: transparent; color: var(--paid); }
.hm-ach .t { font-weight: 600; font-size: 13.5px; color: var(--ink); }
.hm-ach.locked .t { color: var(--ink-2); font-weight: 550; }
.hm-ach .d { font-size: 12px; color: var(--ink-3); margin-top: 1px; overflow-wrap: anywhere; }
.hm-ach .when { font-size: 12px; color: var(--paid); font-weight: 600; margin-top: 1px; }
.hm-bar { height: 5px; border-radius: 3px; background: var(--sunken); overflow: hidden; margin-top: 7px; }
.hm-bar i { display: block; height: 100%; background: var(--paid); border-radius: 3px; }
.hm-set { display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 12px 14px; min-height: 40px; }
.hm-set .switch { margin-left: auto; }
.hm-saved { display: flex; gap: 8px; align-items: flex-start; padding: 10px 6px 10px 14px; border-top: 1px solid var(--line); }
.hm-saved:first-child { border-top: 0; }
.hm-saved p { margin: 2px 0 0; font-size: 13.5px; color: var(--ink); line-height: 1.5; overflow-wrap: anywhere; }
.hm-empty { padding: 14px; font-size: 13px; color: var(--ink-3); }
.hm-privacy { display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; color: var(--ink-2); margin-top: 26px; padding: 12px 14px; border-radius: 10px; background: var(--sunken); }
.hm-privacy svg { width: 16px; height: 16px; flex: none; margin-top: 1px; color: var(--ink-3); }
@media (prefers-reduced-motion: reduce) { .hm-more summary::after { transition: none; } }
`;
  function css() {
    if (document.getElementById('wt-home-css')) return;
    const s = document.createElement('style'); s.id = 'wt-home-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ------------------------------------------------------------ tips
  function favorites() {
    const t = settings().tips; const f = t && typeof t === 'object' && Array.isArray(t.favorites) ? t.favorites : [];
    const T = Tips();
    return f.filter((id, i) => typeof id === 'string' && f.indexOf(id) === i && (!T || T.get(id)));
  }
  function setFavorites(list) {
    const cur = settings().tips; const base = cur && typeof cur === 'object' && !Array.isArray(cur) ? cur : {};
    Wt().saveSettings({ tips: Object.assign({}, base, { favorites: list.slice(0, MAX_FAVS) }) });
  }
  function tipCard() {
    const T = Tips(); if (!T) return '';
    let t; try { t = T.forDate(today()); } catch (e) { return ''; }
    if (!t || !t.text) return '';
    const fav = favorites().includes(t.id);
    return `<section class="hm-card hm-tip" data-tip-id="${esc(t.id)}" aria-label="Today's Wealth Tip">
      <div class="hm-tip-h"><div class="hm-eyebrow">Today's Wealth Tip <span class="hm-topic">${esc(t.topicName || '')}</span></div>
      <button class="hm-fav${fav ? ' on' : ''}" data-act="hmTipFav" data-id="${esc(t.id)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from saved tips' : 'Save this tip'}" title="${fav ? 'Saved — tap to remove' : 'Save this tip'}">${fav ? '★' : '☆'}</button></div>
      <p class="hm-tip-text">${esc(t.text)}</p>
      ${t.more ? `<details class="hm-more"><summary>Why it matters</summary><p>${esc(t.more)}</p></details>` : ''}
    </section>`;
  }

  // ------------------------------------------------------------ net worth
  function netWorthCard() {
    const WW = Wealth(); if (!WW) return '';
    const n = WW.netWorth(); let ch = null; try { ch = WW.change(); } catch (e) { ch = null; }
    const demo = n.demo || isDemo();
    const empty = !n.assets.some(a => a.amount) && !n.liabilities.length;
    let chg = '';
    if (ch && !empty) {
      const a = num(ch.amount);
      chg = `<div class="hm-chg">${a === 0 ? 'No change' : `<span class="${a > 0 ? 'up' : 'down'}">${signed(a)}</span>`} since last month${ch.estimate ? ' <span class="hm-pill">estimate</span>' : ''}</div>`;
    }
    const note = demo ? 'Demo — not your real net worth. It uses the example accounts and debts only.'
      : empty ? 'Add your account balances and debts to see your net worth.'
        : n.estimate ? 'Estimate: some balances haven\'t been entered yet.' : '';
    return `<section class="hm-card hm-nw" aria-label="Net worth">
      <div class="hm-eyebrow">Net worth ${demo ? '<span class="hm-pill demo">Demo</span>' : n.estimate && !empty ? '<span class="hm-pill">estimate</span>' : ''}</div>
      <div class="hm-nw-row"><span class="hm-nw-big${n.netWorth < 0 ? ' neg' : ''}" data-nw-cents="${num(n.netWorth)}">${n.netWorth < 0 ? '−' + fmt(-n.netWorth) : fmt(n.netWorth)}</span></div>
      <div class="hm-sides"><div><span class="hm-lbl">Assets</span><b data-nw-assets="${num(n.totalAssets)}">${fmt(n.totalAssets)}</b></div><div><span class="hm-lbl">Liabilities</span><b data-nw-liab="${num(n.totalLiabilities)}">${fmt(n.totalLiabilities)}</b></div></div>
      ${chg}${note ? `<div class="hm-note${demo ? ' hm-demo-note' : ''}">${esc(note)}</div>` : ''}
      <a class="hm-link" href="#/progress">See progress ${ic('chevR')}</a>
    </section>`;
  }

  // ------------------------------------------------------------ achievements: record newly verified ones
  let toastTimer = null;
  function recordNew() {
    const WW = Wealth(); if (!WW || isDemo()) return [];
    let ids = [];
    try { ids = WW.check() || []; } catch (e) { console.error(e); return []; }
    if (!ids.length || isDemo()) return [];
    const patch = WW.recordPatch(ids);
    Wt().saveSettings({ achievements: patch });
    if (WW.notifyEnabled()) {
      const title = id => { const m = (WW.MILESTONES || []).find(x => x.id === id); return m ? m.title : id; };
      const msgs = ids.slice(0, 3).map(id => 'Milestone reached: ' + title(id));
      if (ids.length > 3) msgs.push(`And ${ids.length - 3} more milestone${ids.length - 3 > 1 ? 's' : ''}. See Progress.`);
      // one quiet toast at a time, after the screen has rendered
      clearTimeout(toastTimer);
      const next = () => { const m = msgs.shift(); if (!m) return; toast(m); if (msgs.length) toastTimer = setTimeout(next, 1200); };
      toastTimer = setTimeout(next, 50);
    }
    return ids;
  }

  function renderDashboardTop() {
    css();
    recordNew();
    const html = netWorthCard() + tipCard();
    return html ? `<div class="hm-top">${html}</div>` : '';
  }

  // ------------------------------------------------------------ Progress page
  function trend(hist) {
    if (!hist || hist.length < 2) return '';
    const vals = hist.map(h => num(h.netWorth));
    let lo = Math.min.apply(null, vals.concat([0])), hi = Math.max.apply(null, vals.concat([0]));
    if (hi === lo) { hi += 100; lo -= 100; }
    const W = 300, H = 100, pad = 6;
    const x = i => (i / (vals.length - 1)) * W;
    const y = v => pad + (1 - (v - lo) / (hi - lo)) * (H - pad * 2);
    const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1));
    const zeroY = y(0).toFixed(1);
    const anyEst = hist.some(h => h.estimate);
    const first = hist[0], last = hist[hist.length - 1];
    const desc = `Net worth by month from ${first.label} (${fmt(first.netWorth)}) to ${last.label} (${fmt(last.netWorth)}).`;
    return `<div class="hm-trend"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(desc)}">
      <line class="zero" x1="0" x2="${W}" y1="${zeroY}" y2="${zeroY}"/>
      <polygon class="ar" points="0,${zeroY} ${pts.join(' ')} ${W},${zeroY}"/>
      <polyline class="ln" points="${pts.join(' ')}"/></svg>
      <div class="hm-trend-x"><span>${esc(first.label)}</span><span>${esc(last.label)}</span></div>
      ${anyEst ? '<div class="hm-note">Some months are estimates, worked out from recorded activity before balances were entered.</div>' : ''}</div>`;
  }

  function summaryBlock() {
    const WW = Wealth(); if (!WW) return '';
    const n = WW.netWorth(); const demo = n.demo || isDemo();
    let hist = []; try { hist = WW.history(12); } catch (e) { hist = []; }
    let ch = null; try { ch = WW.change(); } catch (e) { ch = null; }
    const pill = demo ? ' <span class="hm-pill demo">Demo</span>' : n.estimate ? ' <span class="hm-pill">estimate</span>' : '';
    return `<section class="hm-card hm-nw" aria-label="Net worth">
      <div class="hm-eyebrow">Net worth${pill}</div>
      <div class="hm-nw-row"><span class="hm-nw-big${n.netWorth < 0 ? ' neg' : ''}" data-nw-cents="${num(n.netWorth)}">${n.netWorth < 0 ? '−' + fmt(-n.netWorth) : fmt(n.netWorth)}</span></div>
      <div class="hm-sides"><div><span class="hm-lbl">Assets</span><b>${fmt(n.totalAssets)}</b></div><div><span class="hm-lbl">Liabilities</span><b>${fmt(n.totalLiabilities)}</b></div></div>
      ${ch ? `<div class="hm-chg">${num(ch.amount) === 0 ? 'No change' : `<span class="${ch.amount > 0 ? 'up' : 'down'}">${signed(num(ch.amount))}</span>`} since last month${ch.estimate ? ' <span class="hm-pill">estimate</span>' : ''}</div>` : ''}
      ${trend(hist)}
      ${demo ? '<div class="hm-note hm-demo-note">Demo — not your real net worth.</div>' : ''}
      ${!demo && (n.notes || []).length ? `<div class="hm-note">${n.notes.slice(0, 3).map(esc).join('<br>')}</div>` : ''}
      <div class="hm-note">Net worth = what you own (account balances) minus what you owe (debts). Bills and savings goals aren't counted twice.</div>
    </section>`;
  }

  function achBlock() {
    const WW = Wealth(); if (!WW) return '';
    const list = WW.achievements(); const groups = WW.GROUPS || { debt: 'Debt', networth: 'Net worth', savings: 'Savings' };
    const demo = isDemo();
    const earnedN = list.filter(a => a.earned).length;
    const row = a => {
      const pct = Math.round(Math.max(0, Math.min(1, +a.progress || 0)) * 100);
      const showBar = !a.earned && a.next && !demo;
      return `<div class="hm-ach ${a.earned ? 'earned' : 'locked'}${a.next ? ' next' : ''}" data-ach="${esc(a.id)}" data-earned="${a.earned ? (a.earnedOn || '1') : ''}">
        <span class="hm-badge" aria-hidden="true">${a.earned ? ic('check') : ''}</span>
        <div style="flex:1;min-width:0"><div class="t">${esc(a.title)}</div>
          ${a.earned ? `<div class="when">Earned ${esc(longDate(a.earnedOn))}</div>` : showBar ? `<div class="d">${esc(a.detail || '')}</div><div class="hm-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(a.title)} progress"><i style="width:${pct}%"></i></div>` : `<div class="d">${demo ? '' : 'Not yet'}</div>`}
        </div>${showBar ? `<span class="tiny faint num" style="flex:none">${pct}%</span>` : ''}</div>`;
    };
    const sections = Object.keys(groups).map(g => {
      const items = list.filter(a => a.group === g);
      return `<div class="hm-sec hm-group" data-group="${esc(g)}"><h2>${esc(groups[g])}<span class="meta">${items.filter(a => a.earned).length} of ${items.length} earned</span></h2><div class="hm-list">${items.map(row).join('')}</div></div>`;
    }).join('');
    return `<div class="hm-sec"><h2>Milestones<span class="meta">${earnedN} of ${list.length}</span></h2>
      ${demo ? '<div class="callout blue small"><div>Demo — milestones only count your real records, so none are earned while the demo is showing.</div></div>' : '<div class="hm-note" style="margin-top:-4px">Milestones unlock only from what you\'ve recorded. Estimates never count.</div>'}</div>${sections}`;
  }

  function savedTipsBlock() {
    const T = Tips(); if (!T) return '';
    const favs = favorites();
    const items = favs.map(id => T.get(id)).filter(Boolean);
    return `<div class="hm-sec hm-saved-tips"><h2>Saved tips<span class="meta">${items.length || ''}</span></h2><div class="hm-list">${items.length ? items.map(t => `<div class="hm-saved" data-tip-id="${esc(t.id)}"><div style="flex:1;min-width:0"><div class="hm-eyebrow"><span class="hm-topic">${esc(t.topicName || '')}</span></div><p>${esc(t.text)}</p></div><button class="hm-fav on" data-act="hmTipFav" data-id="${esc(t.id)}" aria-pressed="true" aria-label="Remove from saved tips" title="Remove">★</button></div>`).join('')
      : '<div class="hm-empty">Tap ☆ on Today\'s Wealth Tip to keep it here.</div>'}</div></div>`;
  }

  function renderProgress() {
    if (!Wealth()) return '';
    css();
    recordNew();
    const on = Wealth().notifyEnabled();
    return `<div class="topbar"><div><h1>Progress</h1><div class="sub">Net worth, milestones and saved tips.</div></div></div>
      <div class="fade-in hm-progress">${summaryBlock()}${achBlock()}
      <div class="hm-sec"><h2>Notifications</h2><div class="hm-list"><label class="hm-set"><span><b class="small">Milestone notifications</b><div class="tiny faint">A short message when you reach a new milestone.</div></span><span class="switch"><input type="checkbox" data-act-change="hmNotify" aria-label="Milestone notifications" ${on ? 'checked' : ''}><span></span></span></label></div></div>
      ${savedTipsBlock()}
      <div class="hm-privacy">${ic('lock')}<div><b>Only on this device.</b> Your net worth, milestones and saved tips stay with your WealthTrack data (and your own backup, if you turned one on). Nothing is shared or posted.</div></div>
      </div>`;
  }

  // ------------------------------------------------------------ actions (names start with hm)
  const act = {
    hmTipFav: d => {
      const id = d && d.id; const T = Tips();
      if (typeof id !== 'string' || !T || !T.get(id)) return;
      const f = favorites(); const i = f.indexOf(id);
      if (i >= 0) f.splice(i, 1); else f.unshift(id);
      setFavorites(f);
      toast(i >= 0 ? 'Removed from saved tips' : 'Tip saved. Find it in Progress.');
      U().refresh && U().refresh();
    },
    hmNotify: (d, el) => {
      Wt().saveSettings({ achievementsNotify: !!(el && el.checked) });
      toast(el && el.checked ? 'Milestone notifications on' : 'Milestone notifications off');
    },
  };

  window.WTExt = window.WTExt || {};
  window.WTExt.home = { act };
  window.WTHomeUI = { ready: true, renderDashboardTop, renderProgress, onTick: recordNew, _favorites: favorites };
})();
