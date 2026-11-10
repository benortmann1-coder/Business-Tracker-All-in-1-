/* WealthTrack persistence: IndexedDB, one object store per collection.
 * Writes are queued and flushed in a single transaction (coalesced per record).
 * Failed writes (quota exceeded, transient errors) are re-queued and retried with backoff,
 * so in-memory data is never silently dropped.
 *
 * Optional app lock: AES-GCM 256 encryption of every record (fresh random 96-bit IV per
 * record write), key derived from your PIN with PBKDF2-SHA256 — 600k iterations for new
 * locks; older locks keep the count stored with them. The PIN itself is never stored.
 */
(function (root) {
  'use strict';
  const DB_NAME = 'wealthtrack', VERSION = 1;
  const ITER_NEW = 600000, ITER_LEGACY = 250000;
  const BAD_IDS = new Set(['__proto__', 'constructor', 'prototype']);
  const safeId = id => typeof id === 'string' && id.length > 0 && id.length <= 200 && !BAD_IDS.has(id);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = buf => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  const Store = {
    db: null, key: null, pending: new Map(), flushing: Promise.resolve(), timer: null, onError: null, onSaved: null, onRemoteChange: null,
    failures: 0, channel: null,
    cryptoAvailable: !!(root.crypto && root.crypto.subtle && root.isSecureContext !== false),

    open(colls) {
      return new Promise((resolve, reject) => {
        if (!root.indexedDB) return reject(new Error('This browser has no IndexedDB storage.'));
        const req = indexedDB.open(DB_NAME, VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          colls.concat(['sys']).forEach(c => { if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' }); });
        };
        req.onsuccess = () => {
          Store.db = req.result; Store.colls = colls;
          // a newer version opened in another tab: save what we have and step aside instead of blocking it
          Store.db.onversionchange = () => {
            try { Store.flush(); Store.db.close(); } catch (e) { /* ignore */ }
            Store.onError && Store.onError(new Error('WealthTrack was updated in another tab. Reload this page.'));
          };
          try {
            if (root.BroadcastChannel) {
              Store.channel = new BroadcastChannel('wealthtrack');
              Store.channel.onmessage = ev => { if (ev.data === 'changed' && Store.onRemoteChange) Store.onRemoteChange(); };
            }
          } catch (e) { Store.channel = null; }
          resolve(Store.db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('Close other WealthTrack tabs and reload.'));
      }).then(db => { try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* optional */ } return db; });
    },
    _all(store) {
      return new Promise((resolve, reject) => {
        const r = Store.db.transaction(store, 'readonly').objectStore(store).getAll();
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
      });
    },
    async lockInfo() { const rows = await Store._all('sys'); return rows.find(r => r.id === 'lock') || null; },
    // first name for the lock-screen greeting (kept unencrypted on purpose: only the first name, nothing else)
    async greetName() { try { const rows = await Store._all('sys'); const r = rows.find(x => x.id === 'greet'); return r && typeof r.first === 'string' ? r.first.slice(0, 40) : ''; } catch (e) { return ''; } },
    async setGreetName(first) { try { if (first) await Store._putSys({ id: 'greet', first: String(first).slice(0, 40) }); else await Store._delSys('greet'); } catch (e) { /* ignore */ } },
    async isEmpty() { const m = await Store._all('meta'); return m.length === 0; },
    async loadAll() {
      const data = {};
      for (const c of Store.colls) {
        const rows = await Store._all(c); data[c] = {};
        for (const r of rows) {
          const v = r.__enc ? await Store._decrypt(r) : r;
          if (!v || !safeId(v.id)) continue; // a record id like "__proto__" must never touch object prototypes
          data[c][v.id] = v;
        }
      }
      return data;
    },
    put(coll, rec) { Store.pending.set(coll + '\u0000' + rec.id, { coll, id: rec.id, rec: JSON.parse(JSON.stringify(rec)) }); Store._schedule(); },
    del(coll, id) { Store.pending.set(coll + '\u0000' + id, { coll, id, rec: null }); Store._schedule(); },
    _schedule() { if (!Store.timer) Store.timer = setTimeout(() => { Store.timer = null; Store.flush(); }, 30); },
    hasUnsaved() { return Store.pending.size > 0; },
    flush() {
      if (!Store.pending.size) return Store.flushing;
      const batch = Array.from(Store.pending.values()); Store.pending.clear();
      Store.flushing = Store.flushing.then(async () => {
        if (!Store.db) throw new Error('Database is closed');
        const rows = [];
        for (const b of batch) rows.push({ b, row: b.rec ? (Store.key ? await Store._encrypt(b.rec) : b.rec) : null });
        await new Promise((resolve, reject) => {
          const stores = Array.from(new Set(rows.map(r => r.b.coll)));
          const tx = Store.db.transaction(stores, 'readwrite');
          for (const { b, row } of rows) { const os = tx.objectStore(b.coll); if (row) os.put(row); else os.delete(b.id); }
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save aborted'));
        });
        Store.failures = 0;
        Store.onSaved && Store.onSaved();
        try { Store.channel && Store.channel.postMessage('changed'); } catch (e) { /* ignore */ }
      }).catch(err => {
        console.error(err);
        // Put the failed writes back (unless a newer write for the same record is already queued) and retry.
        for (const b of batch) { const k = b.coll + '\u0000' + b.id; if (!Store.pending.has(k)) Store.pending.set(k, b); }
        Store.failures++;
        const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
        Store.onError && Store.onError(quota ? new Error('Your device is out of storage space. Free some space; WealthTrack keeps retrying.') : err);
        clearTimeout(Store.timer);
        Store.timer = setTimeout(() => { Store.timer = null; Store.flush(); }, Math.min(30000, 1000 * Math.pow(2, Math.min(Store.failures, 5))));
      });
      return Store.flushing;
    },
    async replaceAll(data) { // used by restore, lock on/off & reset (after explicit confirmation)
      await Store.flush();
      Store.pending.clear(); // the full snapshot below supersedes anything still queued
      const run = async () => {
        const rows = [];
        for (const c of Store.colls) for (const r of Object.values(data[c] || {})) rows.push({ c, row: Store.key ? await Store._encrypt(r) : r });
        await new Promise((resolve, reject) => {
          const tx = Store.db.transaction(Store.colls, 'readwrite');
          Store.colls.forEach(c => tx.objectStore(c).clear());
          rows.forEach(({ c, row }) => tx.objectStore(c).put(row));
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save aborted'));
        });
      };
      const p = Store.flushing.then(run); // serialize with normal flushes
      Store.flushing = p.catch(() => { });
      await p;
      try { Store.channel && Store.channel.postMessage('changed'); } catch (e) { /* ignore */ }
    },

    // ---------------- encryption
    async _derive(pin, salt, iterations) {
      const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iterations || ITER_NEW, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    },
    async _encrypt(rec, key) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key || Store.key, enc.encode(JSON.stringify(rec)));
      return { id: rec.id, __enc: 1, iv: b64(iv), c: b64(c) };
    },
    async _decrypt(row, key) {
      const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.iv) }, key || Store.key, unb64(row.c));
      return JSON.parse(dec.decode(p));
    },
    async unlock(pin) {
      const info = await Store.lockInfo(); if (!info) return true;
      const key = await Store._derive(pin, unb64(info.salt), info.iter || ITER_LEGACY);
      try { const v = await Store._decrypt(info.verifier, key); if (v.ok !== 'wealthtrack') return false; } catch (e) { return false; }
      Store.key = key; return true;
    },
    async enableLock(pin, data) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await Store._derive(pin, salt, ITER_NEW);
      const verifier = await Store._encrypt({ id: 'verifier', ok: 'wealthtrack' }, key);
      // Lock record FIRST: if the app dies half-way we have the lock plus some plaintext rows
      // (loadAll reads mixed rows), never encrypted rows without the salt needed to read them.
      await Store._putSys({ id: 'lock', salt: b64(salt), iter: ITER_NEW, verifier, createdAt: new Date().toISOString() });
      Store.key = key;
      await Store.replaceAll(data);
    },
    // New PIN for an already-locked store: rows and the lock record are rewritten in ONE transaction,
    // so a crash leaves either the old PIN working or the new one, never rows the lock can't read.
    async changeLock(pin, data) {
      if (!(await Store.lockInfo())) return Store.enableLock(pin, data);
      await Store.flush(); Store.pending.clear();
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await Store._derive(pin, salt, ITER_NEW);
      const verifier = await Store._encrypt({ id: 'verifier', ok: 'wealthtrack' }, key);
      const run = async () => {
        const rows = [];
        for (const c of Store.colls) for (const r of Object.values(data[c] || {})) rows.push({ c, row: await Store._encrypt(r, key) });
        await new Promise((resolve, reject) => {
          const tx = Store.db.transaction(Store.colls.concat('sys'), 'readwrite');
          Store.colls.forEach(c => tx.objectStore(c).clear());
          rows.forEach(({ c, row }) => tx.objectStore(c).put(row));
          tx.objectStore('sys').put({ id: 'lock', salt: b64(salt), iter: ITER_NEW, verifier, createdAt: new Date().toISOString() });
          tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save aborted'));
        });
        Store.key = key;
      };
      const p = Store.flushing.then(run);
      Store.flushing = p.catch(() => { });
      return p;
    },
    // Plaintext rows are written before the lock record is removed (same crash-safety reasoning).
    async disableLock(data) { Store.key = null; await Store.replaceAll(data); await Store._delSys('lock'); },
    _putSys(r) { return new Promise((res, rej) => { const tx = Store.db.transaction('sys', 'readwrite'); tx.objectStore('sys').put(r); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
    _delSys(id) { return new Promise((res, rej) => { const tx = Store.db.transaction('sys', 'readwrite'); tx.objectStore('sys').delete(id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },

    // password-protected backup files
    async encryptBackup(json, password) {
      const salt = crypto.getRandomValues(new Uint8Array(16)); const key = await Store._derive(password, salt, ITER_NEW);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(json));
      return JSON.stringify({ wealthtrackEncryptedBackup: 1, iter: ITER_NEW, salt: b64(salt), iv: b64(iv), c: b64(c) });
    },
    async decryptBackup(obj, password) {
      if (typeof obj.salt !== 'string' || typeof obj.iv !== 'string' || typeof obj.c !== 'string') throw new Error('Damaged backup');
      const key = await Store._derive(password, unb64(obj.salt), +obj.iter || ITER_LEGACY);
      const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(obj.iv) }, key, unb64(obj.c));
      return dec.decode(p);
    },

    // ---------------- recovery (boot-failure screen)
    async rawDump() { // every store as stored (encrypted rows stay encrypted)
      const out = {};
      for (const c of (Store.colls || []).concat(['sys'])) { try { out[c] = await Store._all(c); } catch (e) { out[c] = { error: String(e) }; } }
      return out;
    },
    async eraseAll() {
      const stores = (Store.colls || []).concat(['sys']);
      await new Promise((resolve, reject) => {
        const tx = Store.db.transaction(stores, 'readwrite');
        stores.forEach(c => tx.objectStore(c).clear());
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
      });
      Store.key = null; Store.pending.clear();
    },
    sanitizeData, BACKUP_FORMAT: 1,
    b64, unb64,
  };

  // ---------------------------------------------------------------- backup validation
  // Cleans an untrusted backup before restore. Returns {data, report:{dropped, fixed, notes}}.
  // Records that can't be repaired are dropped and counted (shown to the user before they confirm).
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const MONTH = /^\d{4}-\d{2}$/;
  const ID = /^[A-Za-z0-9_.:|@-]{1,200}$/;
  const COLOR = /^#[0-9a-fA-F]{6}$/;
  const IMG = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;
  const FREQ = ['once', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly', 'custom'];
  const SCHED = ['weekly', 'biweekly', 'semimonthly', 'monthly'];
  function sanitizeData(raw, colls) {
    const report = { dropped: 0, fixed: 0, notes: [] };
    const note = m => { if (report.notes.length < 25) report.notes.push(m); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Backup has no data');
    const data = {}; colls.forEach(c => data[c] = {});
    const isRef = v => typeof v === 'string' && ID.test(v) && !BAD_IDS.has(v);
    const str = (o, k, max, req) => {
      let v = o[k];
      if (v == null) { if (req) return false; o[k] = ''; return true; }
      if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
      if (typeof v !== 'string') { if (req) return false; o[k] = ''; report.fixed++; return true; }
      if (v.length > max) { v = v.slice(0, max); report.fixed++; }
      o[k] = v;
      return !(req && !v.trim());
    };
    const int = (o, k, req, min, max) => {
      let v = o[k];
      if (v == null || v === '') { if (req) return false; o[k] = null; return true; }
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) { v = Number(v); report.fixed++; }
      if (typeof v !== 'number' || !isFinite(v)) return false;
      if (!Number.isInteger(v)) { v = Math.round(v); report.fixed++; }
      if (Math.abs(v) > 1e13) return false; // > $100 billion: not a real amount
      if ((min != null && v < min) || (max != null && v > max)) return false;
      o[k] = v; return true;
    };
    const intDef = (o, k, def, min, max) => { if (!int(o, k, false, min, max) || o[k] == null) { if (o[k] != null) report.fixed++; o[k] = def; } return true; };
    const date = (o, k, req) => { const v = o[k]; if (v == null || v === '') { if (req) return false; o[k] = null; return true; } return typeof v === 'string' && DATE.test(v); };
    const ref = (o, k, req) => { const v = o[k]; if (v == null || v === '') { if (req) return false; o[k] = null; return true; } return isRef(v); };
    const src = (o, k) => { if (o[k] == null || o[k] === '') { o[k] = null; return true; } return isRef(o[k]); };
    const bool = (o, k) => { o[k] = !!o[k]; return true; };
    const V = {
      templates: t => str(t, 'name', 200, true) && Array.isArray(t.versions) && t.versions.length > 0 && t.versions.length < 500 &&
        t.versions.every(v => v && typeof v === 'object' && date(v, 'from', true) && date(v, 'anchor', true) && int(v, 'amountCents', true) && FREQ.includes(v.frequency) &&
          intDef(v, 'interval', 1, 1, 1000) && ((v.unit = ['day', 'week', 'month', 'year'].includes(v.unit) ? v.unit : 'month'), true) && bool(v, 'eom')) &&
        ((t.pauses = Array.isArray(t.pauses) ? t.pauses.filter(p => p && typeof p === 'object' && DATE.test(p.from) && (p.to == null || DATE.test(p.to))) : []), true) &&
        date(t, 'endDate') && ref(t, 'debtId') && src(t, 'accountId') &&
        ((t.removedKeys = Array.isArray(t.removedKeys) ? t.removedKeys.filter(k => typeof k === 'string' && DATE.test(k)) : []), true) &&
        ((t.status = ['active', 'paused', 'cancelled', 'deleted'].includes(t.status) ? t.status : 'active'), true) &&
        ((t.payFrom = t.payFrom === 'auto' || isRef(t.payFrom) ? t.payFrom : 'auto'), true) &&
        str(t, 'category', 100) && str(t, 'method', 100) && str(t, 'notes', 5000) && bool(t, 'deleted') && bool(t, 'subscription') && ((delete t.payEarly, delete t.payOn), true),
      instances: i => ref(i, 'templateId', true) && date(i, 'periodKey', true) && date(i, 'dueDate', true) && int(i, 'amountCents', true) && str(i, 'name', 200, true) &&
        ((i.periodMonth = i.periodKey.slice(0, 7)), true) &&
        ((i.custom = i.custom && typeof i.custom === 'object' && !Array.isArray(i.custom) ? { amount: !!i.custom.amount, due: !!i.custom.due, note: !!i.custom.note } : {}), true) &&
        str(i, 'category', 100) && str(i, 'note', 5000) && str(i, 'method', 100) && ref(i, 'debtId') && src(i, 'accountId') &&
        ((i.paycheckKey = isRef(i.paycheckKey) && i.paycheckKey.includes('|') ? i.paycheckKey : null), true) && bool(i, 'skipped'),
      payments: p => ref(p, 'instanceId', true) && int(p, 'amountCents', true) && date(p, 'date', true) && src(p, 'sourceId') && ref(p, 'templateId') &&
        str(p, 'method', 100) && str(p, 'note', 2000) && str(p, 'voidReason', 200) && bool(p, 'voided'),
      incomes: x => str(x, 'name', 200, true) && SCHED.includes(x.schedule) && date(x, 'anchor', true) && date(x, 'startDate') && date(x, 'endDate') &&
        int(x, 'netCents', false, 0) && int(x, 'grossCents', false, 0) && intDef(x, 'day1', 1, 1, 31) && intDef(x, 'day2', 15, 1, 31) && src(x, 'accountId') && str(x, 'employer', 200) &&
        ((x.kind = x.kind === 'gross' ? 'gross' : 'net'), true) && bool(x, 'deleted'),
      deposits: d => isRef(d.key) && d.key.includes('|') && ref(d, 'incomeId') && int(d, 'amountCents', true) && date(d, 'date', true) && date(d, 'payDate') && src(d, 'accountId') && str(d, 'note', 2000) && bool(d, 'voided'),
      extraIncome: x => int(x, 'amountCents', true) && date(x, 'date', true) && str(x, 'type', 50) && ((x.type = x.type || 'other'), true) && src(x, 'accountId') && ref(x, 'incomeId') && str(x, 'note', 2000) && bool(x, 'voided'),
      expenses: e => int(e, 'amountCents', true) && date(e, 'date', true) && str(e, 'category', 100) && str(e, 'description', 500) && str(e, 'notes', 5000) && src(e, 'sourceId') && ref(e, 'receiptId'),
      receipts: r => typeof r.dataUrl === 'string' && r.dataUrl.length < 12e6 && IMG.test(r.dataUrl),
      debts: d => str(d, 'name', 200, true) && str(d, 'type', 50) && int(d, 'startBalanceCents', true) && date(d, 'startDate', true) && intDef(d, 'aprCenti', 0, 0, 100000) &&
        intDef(d, 'minCents', 0, 0) && intDef(d, 'dueDay', 1, 1, 31) && int(d, 'limitCents', false, 0) && bool(d, 'autoInterest') && bool(d, 'closed') && bool(d, 'deleted') &&
        // mortgage escrow part of the monthly payment (cents, optional): a bad value is dropped, never the debt
        (d.escrowCents == null || (Number.isInteger(d.escrowCents) && d.escrowCents >= 0 && d.escrowCents <= 1e11) || ((delete d.escrowCents), report.fixed++, true)),
      debtTxns: x => ref(x, 'debtId', true) && int(x, 'amountCents', true) && date(x, 'date', true) && ['payment', 'interest', 'charge', 'adjust', 'fee'].includes(x.type) && src(x, 'sourceId') &&
        str(x, 'note', 500) && bool(x, 'voided') && ((x.key = typeof x.key === 'string' && x.key.length < 200 ? x.key : null), true),
      budgets: b => b.category === b.id && int(b, 'limitCents', true, 0) && bool(b, 'rollover') && ((b.startMonth = typeof b.startMonth === 'string' && MONTH.test(b.startMonth) ? b.startMonth : new Date().toISOString().slice(0, 7)), true),
      goals: g => str(g, 'name', 200, true) && int(g, 'targetCents', true, 0) && intDef(g, 'startCents', 0) && date(g, 'targetDate') && src(g, 'accountId') && str(g, 'type', 50) && bool(g, 'archived'),
      goalTxns: x => ref(x, 'goalId', true) && int(x, 'amountCents', true) && date(x, 'date', true) && src(x, 'fromAccountId') && ref(x, 'transferId') && str(x, 'note', 500) && bool(x, 'voided'),
      transfers: t => src(t, 'fromId') && src(t, 'toId') && t.fromId && t.toId && int(t, 'amountCents', true, 0) && date(t, 'date', true) && str(t, 'note', 500) && bool(t, 'voided'),
      accounts: a => str(a, 'name', 100, true) && ((a.type = ['checking', 'savings', 'cash', 'investment', 'property', 'other'].includes(a.type) ? a.type : 'other'), true) && intDef(a, 'openingCents', 0) &&
        (date(a, 'openingDate') || ((a.openingDate = null), true)) && bool(a, 'inAvailable') && intDef(a, 'order', 0, -1e6, 1e6) && bool(a, 'archived'),
      categories: c => str(c, 'name', 100, true) && (COLOR.test(c.color || '') || ((c.color = '#94a3b8'), report.fixed++, true)) && bool(c, 'archived'),
      meta: m => m.id === 'settings' && sanitizeSettings(m),
    };
    function sanitizeSettings(m) {
      const keep = { id: 'settings' };
      if (['system', 'light', 'blue', 'dark', 'seasonal', 'random'].includes(m.theme)) keep.theme = m.theme;
      if (['seasonal', 'random', 'off'].includes(m.monthColors)) keep.monthColors = m.monthColors;
      if (m.account && typeof m.account === 'object' && typeof m.account.email === 'string') keep.account = { email: m.account.email.slice(0, 200) };
      if (m.guest === true) keep.guest = true;
      if (m.profile && typeof m.profile === 'object') {
        const pr = {};
        const txt = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : '';
        let first = txt(m.profile.first, 40), last = txt(m.profile.last, 40);
        if (!first && !last && typeof m.profile.name === 'string') { const parts = txt(m.profile.name, 80).split(/\s+/).filter(Boolean); first = (parts.shift() || '').slice(0, 40); last = parts.join(' ').slice(0, 40); }
        if (first) pr.first = first; if (last) pr.last = last;
        const em = txt(m.profile.email, 200); if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) pr.email = em;
        [['street', 100], ['unit', 30], ['city', 60], ['state', 40]].forEach(([k, n]) => { const v = txt(m.profile[k], n); if (v) pr[k] = v; });
        const zip = txt(m.profile.zip, 12); if (/^[A-Za-z0-9 -]{3,12}$/.test(zip)) pr.zip = zip;
        if (typeof m.profile.photo === 'string' && m.profile.photo.length <= 300000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(m.profile.photo)) pr.photo = m.profile.photo;
        keep.profile = pr;
      }
      // same codes as CURRENCIES in app.js
      if (['USD', 'ARS', 'AUD', 'BDT', 'BRL', 'GBP', 'CAD', 'CLP', 'CNY', 'COP', 'CZK', 'DKK', 'EGP', 'EUR', 'GHS', 'HKD', 'HUF', 'INR', 'IDR', 'ILS', 'JPY', 'KES', 'MYR', 'MXN', 'MAD',
        'TWD', 'NZD', 'NGN', 'NOK', 'PKR', 'PEN', 'PHP', 'PLN', 'QAR', 'RON', 'SAR', 'SGD', 'ZAR', 'KRW', 'LKR', 'SEK', 'CHF', 'THB', 'TRY', 'AED', 'UAH', 'VND'].includes(m.currency)) keep.currency = m.currency;
      // date formats (WT.DATE_FORMATS); older backups used 'md' (Nov 7) and 'dm' (7 Nov)
      if (m.dateFormat === 'md') keep.dateFormat = 'mdy';
      else if (m.dateFormat === 'dm') keep.dateFormat = 'dmy';
      else if (['mdy', 'dmy', 'mdy_long', 'mdy_num', 'dmy_num', 'dmy_dot', 'ymd'].includes(m.dateFormat)) keep.dateFormat = m.dateFormat;
      if (m.gdrive && typeof m.gdrive === 'object') keep.gdrive = { on: !!m.gdrive.on, email: typeof m.gdrive.email === 'string' ? m.gdrive.email.slice(0, 200) : '' };
      if (Number.isInteger(m.monthColorSeed) && m.monthColorSeed > 0 && m.monthColorSeed < 2147483648) keep.monthColorSeed = m.monthColorSeed;
      if (m.reminders && typeof m.reminders === 'object') keep.reminders = { enabled: !!m.reminders.enabled, daysBefore: Array.isArray(m.reminders.daysBefore) ? m.reminders.daysBefore.filter(d => Number.isInteger(d) && d >= 0 && d <= 30) : [3, 1, 0], hour: Number.isInteger(m.reminders.hour) && m.reminders.hour >= 0 && m.reminders.hour < 24 ? m.reminders.hour : 9 };
      if (m.dashboard && Array.isArray(m.dashboard.order) && Array.isArray(m.dashboard.hidden)) {
        const ok = k => typeof k === 'string' && /^[a-z]{1,20}$/.test(k);
        keep.dashboard = { order: m.dashboard.order.filter(ok), hidden: m.dashboard.hidden.filter(ok) };
      }
      if (['due', 'status', 'name', 'mine', 'category', 'paycheck'].includes(m.billView)) keep.billView = m.billView;
      if (['date', 'month', '30', '60'].includes(m.upRange)) keep.upRange = m.upRange;
      if (['plan', 'compare', 'customize'].includes(m.sbSection)) keep.sbSection = m.sbSection; // Smart Budget page section
      if (m.demoDone === true) keep.demoDone = true;
      if (Array.isArray(m.billOrder)) keep.billOrder = Array.from(new Set(m.billOrder.filter(isRef))).slice(0, 1000); // My order (Bills)
      if (Array.isArray(m.setAsides)) keep.setAsides = m.setAsides.filter(x => x && typeof x === 'object').slice(0, 50).map(x => ({ id: isRef(x.id) ? x.id : 'sa_' + Math.random().toString(36).slice(2), name: String(x.name == null ? '' : x.name).slice(0, 100), amountCents: Number.isInteger(x.amountCents) && x.amountCents >= 0 ? x.amountCents : 0 }));
      if ('projectionIncludesSetAsides' in m) keep.projectionIncludesSetAsides = !!m.projectionIncludesSetAsides;
      if (Number.isInteger(m.dueSoonDays) && m.dueSoonDays >= 1 && m.dueSoonDays <= 30) keep.dueSoonDays = m.dueSoonDays;
      if (isRef(m.defaultAccountId)) keep.defaultAccountId = m.defaultAccountId;
      if (typeof m.generatedThrough === 'string' && MONTH.test(m.generatedThrough)) keep.generatedThrough = m.generatedThrough;
      ['createdAt', 'seededAt', 'lastBackup'].forEach(k => { if (typeof m[k] === 'string' && DATE.test(m[k])) keep[k] = m[k]; });
      if (typeof m.seeded === 'string') keep.seeded = m.seeded.slice(0, 40);
      if (m.smartBudget && typeof m.smartBudget === 'object' && !Array.isArray(m.smartBudget)) {
        const sb = m.smartBudget, out = {};
        // the 8 named strategies + the personalized recommendation; older ids are accepted and renamed
        const SB_IDS = ['recommended', 'avalanche', 'snowball', '50-30-20', 'zero', 'pay-first', 'aggressive', 'balanced', 'custom'];
        const SB_OLD = { debt: 'aggressive', savings: 'pay-first', '60-20-20': 'balanced' };
        const sbId = v => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SB_OLD, v) ? SB_OLD[v] : v;
        const BK = ['needs', 'debt', 'savings', 'wants'];
        const ROLL = ['carry', 'savings', 'debt', 'reset'];
        const plain = o => o && typeof o === 'object' && !Array.isArray(o);
        const pctOk = p => plain(p) && BK.every(k => typeof p[k] === 'number' && isFinite(p[k]) && p[k] >= 0 && p[k] <= 100);
        const pctOf = p => { const o = {}; BK.forEach(k => { o[k] = Math.round(p[k] * 10) / 10; }); return o; };
        const centsOk = a => plain(a) && BK.every(k => Number.isInteger(a[k]) && Math.abs(a[k]) <= 1e13);
        const cents = v => Number.isInteger(v) && v >= 0 && v <= 1e11;            // money amounts the user typed
        const dollarsOk = a => plain(a) && BK.every(k => cents(a[k]));
        const pick = (a, keys) => { const o = {}; keys.forEach(k => { o[k] = a[k]; }); return o; };
        if (SB_IDS.includes(sbId(sb.strategyId))) out.strategyId = sbId(sb.strategyId);
        if (pctOk(sb.custom)) out.custom = pctOf(sb.custom);
        if (dollarsOk(sb.customDollars)) out.customDollars = pick(sb.customDollars, BK);
        if (sb.mode === 'dollars' || sb.mode === 'percent') out.mode = sb.mode;
        if (Number.isInteger(sb.savingsAprCenti) && sb.savingsAprCenti >= 0 && sb.savingsAprCenti <= 2000) out.savingsAprCenti = sb.savingsAprCenti; // optional savings rate, 0..20%
        if (plain(sb.locks)) { out.locks = {}; BK.forEach(k => { out.locks[k] = sb.locks[k] === true; }); }
        if (plain(sb.rollover)) { out.rollover = {}; BK.forEach(k => { out.rollover[k] = ROLL.includes(sb.rollover[k]) ? sb.rollover[k] : 'reset'; }); }
        if (plain(sb.essentialOverrides)) {
          const ov = {}; let n = 0;
          for (const k of Object.keys(sb.essentialOverrides)) { if (n >= 500) break; if (isRef(k) && typeof sb.essentialOverrides[k] === 'boolean') { ov[k] = sb.essentialOverrides[k]; n++; } }
          out.essentialOverrides = ov;
        }
        if (plain(sb.paycheckIncome)) {
          const pi = {}; let n = 0;
          for (const k of Object.keys(sb.paycheckIncome)) { if (n >= 60) break; if (isRef(k) && cents(sb.paycheckIncome[k])) { pi[k] = sb.paycheckIncome[k]; n++; } }
          out.paycheckIncome = pi;
        }
        if (plain(sb.paycheckAlloc)) {
          const pa = {}; let n = 0; const AK = ['everyday', 'savings', 'extraDebt', 'wants'];
          for (const k of Object.keys(sb.paycheckAlloc)) {
            if (n >= 60) break; const v = sb.paycheckAlloc[k];
            if (!isRef(k) || !plain(v)) continue;
            const o = {}; AK.forEach(a => { if (cents(v[a])) o[a] = v[a]; });
            if (Object.keys(o).length) { pa[k] = o; n++; }
          }
          out.paycheckAlloc = pa;
        }
        if (plain(sb.debt)) {
          const d = {};
          if (['avalanche', 'snowball', 'custom'].includes(sb.debt.method)) d.method = sb.debt.method;
          if (cents(sb.debt.extra)) d.extra = sb.debt.extra;
          if (Array.isArray(sb.debt.order)) { const seen = new Set(); d.order = sb.debt.order.filter(id => isRef(id) && !seen.has(id) && seen.add(id)).slice(0, 100); }
          out.debt = d;
        }
        if (Array.isArray(sb.history)) {
          const seen = {};
          sb.history.forEach(h => {
            if (!plain(h) || typeof h.month !== 'string' || !MONTH.test(h.month) || !SB_IDS.includes(sbId(h.strategyId)) || !pctOk(h.pct) || !centsOk(h.amounts)) return;
            if (!Number.isInteger(h.income) || Math.abs(h.income) > 1e13) return;
            const snap = { month: h.month, strategyId: sbId(h.strategyId), pct: pctOf(h.pct), amounts: pick(h.amounts, BK), income: h.income, savedAt: typeof h.savedAt === 'string' && DATE.test(h.savedAt) ? h.savedAt : h.month + '-01' };
            if (dollarsOk(h.dollars)) snap.dollars = pick(h.dollars, BK);
            if (dollarsOk(h.rollover)) snap.rollover = pick(h.rollover, BK);
            seen[h.month] = snap;
          });
          out.history = Object.keys(seen).sort().slice(-36).map(k => seen[k]);
        }
        // named custom strategies (max 20): { id, name, dollars, locks, savedOn }
        if (Array.isArray(sb.saved)) {
          const ids = new Set(); out.saved = [];
          for (const x of sb.saved) {
            if (out.saved.length >= 20) break;
            if (!plain(x) || !isRef(x.id) || ids.has(x.id) || !dollarsOk(x.dollars) || typeof x.name !== 'string') continue;
            const name = x.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40); if (!name) continue;
            const v = { id: x.id, name, dollars: pick(x.dollars, BK), locks: {} };
            BK.forEach(k => { v.locks[k] = !!(plain(x.locks) && x.locks[k] === true); });
            if (typeof x.savedOn === 'string' && DATE.test(x.savedOn)) v.savedOn = x.savedOn;
            ids.add(x.id); out.saved.push(v);
          }
        }
        keep.smartBudget = out;
      }
      Object.keys(m).forEach(k => delete m[k]); Object.assign(m, keep);
      return true;
    }
    for (const c of colls) {
      const col = raw[c];
      if (col == null) continue;
      if (typeof col !== 'object' || Array.isArray(col)) { report.dropped++; note(c + ': not a collection'); continue; }
      for (const key of Object.keys(col)) {
        let r = col[key];
        if (!r || typeof r !== 'object' || Array.isArray(r)) { report.dropped++; note(c + ': bad record'); continue; }
        try { r = JSON.parse(JSON.stringify(r)); } catch (e) { report.dropped++; note(c + ': unreadable record'); continue; }
        if (r.id == null) r.id = key;
        if (typeof r.id !== 'string' || r.id !== key || !isRef(r.id)) { report.dropped++; note(c + ': record with a bad id'); continue; }
        for (const k of Object.keys(r)) if (BAD_IDS.has(k)) delete r[k];
        let ok = false;
        try { ok = V[c] ? !!V[c](r) : true; } catch (e) { ok = false; }
        if (!ok) { report.dropped++; note(c + ': invalid "' + String(r.name || r.id).slice(0, 40) + '"'); continue; }
        data[c][r.id] = r;
      }
    }
    // referential integrity — payments need their bill entry; bill entries need their bill
    for (const p of Object.values(data.payments || {})) if (!data.instances[p.instanceId]) { delete data.payments[p.id]; report.dropped++; note('payments: payment for a missing bill'); }
    for (const i of Object.values(data.instances || {})) {
      if (data.templates[i.templateId]) continue;
      data.templates[i.templateId] = { id: i.templateId, name: i.name, category: i.category || 'cat_other', method: '', accountId: null, notes: '', status: 'deleted', deleted: true, pauses: [], endDate: i.periodKey, debtId: null, payFrom: 'auto', subscription: false, removedKeys: [], versions: [{ from: i.periodKey, anchor: i.periodKey, amountCents: i.amountCents, frequency: 'once', interval: 1, unit: 'month' }] };
      report.fixed++; note('Recreated missing bill "' + i.name + '" as deleted (its history is kept)');
    }
    for (const e of Object.values(data.expenses || {})) if (e.receiptId && !data.receipts[e.receiptId]) { e.receiptId = null; report.fixed++; }
    if (!data.meta.settings) data.meta.settings = { id: 'settings' };
    return { data, report };
  }

  root.WTStore = Store;
  if (typeof module !== 'undefined' && module.exports) module.exports = Store;
})(typeof window !== 'undefined' ? window : globalThis);
