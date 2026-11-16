/* WealthTrack accounts: several separate sets of data on one device.
 *
 * Each account has its own IndexedDB database, PIN, settings, backups and Google Drive backup file.
 * The first account ("main") keeps the original names (database "wealthtrack", Drive file
 * "WealthTrack-backup.json"), so installs from before accounts existed carry on unchanged.
 *
 * The list of accounts (id + name only, no money data) and which one is open live in localStorage.
 * Signing out just marks the device as signed out; the next start shows the account picker.
 * Loaded before store.js, which asks dbName() which database to open.
 */
(function (root) {
  'use strict';
  const REG = 'wt.accounts', ACTIVE = 'wt.activeAccount', OUT = 'wt.signedOut';
  const MAIN = 'main';
  const ID_RE = /^[a-z0-9]{1,24}$/;
  // per-account switches kept in localStorage (everything else is in the account's own database)
  const PER_ACCOUNT = ['wt.demoDone', 'wt.restoreAfterReset', 'wt.gd', 'wt.rem', 'wt.previewFree', 'wt.tourDone'];

  const ls = {
    get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    del(k) { try { root.localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  const cleanName = n => String(n == null ? '' : n).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30);

  function list() {
    let a = null;
    try { a = JSON.parse(ls.get(REG) || 'null'); } catch (e) { a = null; }
    if (!Array.isArray(a)) a = [];
    const seen = new Set(); const out = [];
    for (const x of a) {
      if (!x || typeof x.id !== 'string' || !ID_RE.test(x.id) || seen.has(x.id)) continue;
      seen.add(x.id); out.push({ id: x.id, name: cleanName(x.name) || 'Account', created: typeof x.created === 'string' ? x.created.slice(0, 10) : '' });
    }
    if (!seen.has(MAIN)) out.unshift({ id: MAIN, name: 'My account', created: '' });
    return out;
  }
  const save = a => ls.set(REG, JSON.stringify(a));
  const get = id => list().find(x => x.id === id) || null;

  function active() { const id = ls.get(ACTIVE); return id && get(id) ? id : MAIN; }
  const isMain = (id = active()) => id === MAIN;
  const dbName = (id = active()) => isMain(id) ? 'wealthtrack' : 'wealthtrack-' + id;
  const driveFile = (id = active()) => isMain(id) ? 'WealthTrack-backup.json' : 'WealthTrack-backup-' + id + '.json';
  /** localStorage key for this account: the main account keeps the original key. */
  function key(k, id = active()) {
    if (isMain(id) || !PER_ACCOUNT.includes(k)) return k;
    return 'wt.a.' + id + '.' + k.slice(3);
  }

  function create(name) {
    const n = cleanName(name);
    if (!n) throw new Error('Give the account a name');
    const a = list();
    if (a.length >= 10) throw new Error('You can have up to 10 accounts on one device');
    if (a.some(x => x.name.toLowerCase() === n.toLowerCase())) throw new Error('There is already an account called ' + n);
    let id;
    do { id = Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, '') || 'a' + Date.now().toString(36); } while (a.some(x => x.id === id) || id === MAIN);
    a.push({ id, name: n, created: new Date().toISOString().slice(0, 10) });
    save(a);
    return id;
  }
  function rename(id, name) {
    const n = cleanName(name); if (!n) throw new Error('Give the account a name');
    const a = list(); const x = a.find(y => y.id === id); if (!x) throw new Error('That account no longer exists');
    if (a.some(y => y.id !== id && y.name.toLowerCase() === n.toLowerCase())) throw new Error('There is already an account called ' + n);
    x.name = n; save(a);
  }
  function switchTo(id) { if (!get(id)) throw new Error('That account no longer exists'); ls.set(ACTIVE, id); ls.del(OUT); }
  function signOut() { ls.set(OUT, '1'); }
  const signedOut = () => ls.get(OUT) === '1';

  /** Deletes another account and all of its data on this device (never the main or the open one). */
  function remove(id) {
    if (isMain(id)) throw new Error('The first account can\'t be deleted. Use Erase everything instead.');
    if (id === active()) throw new Error('Switch to another account first');
    if (!get(id)) return Promise.resolve();
    save(list().filter(x => x.id !== id));
    for (const k of PER_ACCOUNT) ls.del(key(k, id));
    return new Promise(res => {
      try {
        const r = root.indexedDB.deleteDatabase(dbName(id));
        r.onsuccess = r.onerror = r.onblocked = () => res();
      } catch (e) { res(); }
    });
  }

  const WTAccounts = { MAIN, PER_ACCOUNT, list, get, active, isMain, dbName, driveFile, key, create, rename, switchTo, signOut, signedOut, remove, cleanName };
  if (typeof module !== 'undefined' && module.exports) module.exports = WTAccounts;
  else root.WTAccounts = WTAccounts;
})(typeof window !== 'undefined' ? window : globalThis);
