// Unit tests for accounts.js (node:test). A small in-memory localStorage stands in for the browser's.
const test = require('node:test');
const assert = require('node:assert');
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const A = require('../web/accounts.js');
const reset = () => mem.clear();

test('a fresh device has just the first account, with the original names', () => {
  reset();
  assert.deepEqual(A.list().map(a => a.id), ['main']);
  assert.equal(A.active(), 'main');
  assert.equal(A.dbName(), 'wealthtrack');
  assert.equal(A.driveFile(), 'WealthTrack-backup.json');
  assert.equal(A.key('wt.demoDone'), 'wt.demoDone');
});

test('a new account gets its own database, Drive file and per-account keys', () => {
  reset();
  const id = A.create('  Test   user ');
  assert.match(id, /^[a-z0-9]{1,24}$/);
  assert.equal(A.get(id).name, 'Test user');
  assert.equal(A.active(), 'main', 'creating does not switch');
  A.switchTo(id);
  assert.equal(A.active(), id);
  assert.equal(A.dbName(), 'wealthtrack-' + id);
  assert.equal(A.driveFile(), 'WealthTrack-backup-' + id + '.json');
  assert.equal(A.key('wt.demoDone'), 'wt.a.' + id + '.demoDone');
  assert.equal(A.key('wt.theme'), 'wt.theme', 'device-wide keys stay shared');
});

test('names are cleaned, required and unique', () => {
  reset();
  assert.throws(() => A.create('   '), /name/);
  assert.equal(A.get(A.create('<b>Bob</b>')).name, 'bBob/b');
  assert.throws(() => A.create('bbob/B'), /already/);
  assert.equal(A.get(A.create('x'.repeat(50))).name.length, 30);
});

test('at most 10 accounts', () => {
  reset();
  for (let i = 1; i < 10; i++) A.create('A' + i);
  assert.equal(A.list().length, 10);
  assert.throws(() => A.create('one more'), /up to 10/);
});

test('sign out and switch', () => {
  reset();
  const id = A.create('T');
  A.signOut(); assert.equal(A.signedOut(), true);
  A.switchTo(id); assert.equal(A.signedOut(), false);
  assert.throws(() => A.switchTo('nope'), /no longer exists/);
});

test('a damaged or tampered list is cleaned up, and the first account always exists', () => {
  reset();
  localStorage.setItem('wt.accounts', JSON.stringify([{ id: '__proto__', name: 'x' }, { id: 'ok1', name: 'Fine' }, { id: 'ok1', name: 'Dup' }, null, 5]));
  assert.deepEqual(A.list().map(a => a.id), ['main', 'ok1']);
  localStorage.setItem('wt.activeAccount', 'gone');
  assert.equal(A.active(), 'main');
  localStorage.setItem('wt.accounts', '{not json');
  assert.deepEqual(A.list().map(a => a.id), ['main']);
});

test('deleting: never the first or the open account; removes its keys', async () => {
  reset();
  globalThis.indexedDB = { deleteDatabase: name => { const r = {}; setTimeout(() => { deleted.push(name); r.onsuccess && r.onsuccess(); }); return r; } };
  const deleted = [];
  const id = A.create('T');
  assert.throws(() => A.remove('main'), /can't be deleted/);
  A.switchTo(id);
  assert.throws(() => A.remove(id), /Switch to another/);
  localStorage.setItem(A.key('wt.gd'), '{}');
  A.switchTo('main');
  await A.remove(id);
  assert.equal(A.get(id), null);
  assert.deepEqual(deleted, ['wealthtrack-' + id]);
  assert.equal(localStorage.getItem('wt.a.' + id + '.gd'), null);
});

test('rename', () => {
  reset();
  const id = A.create('T');
  A.rename(id, 'New name'); assert.equal(A.get(id).name, 'New name');
  A.rename('main', 'Ben'); assert.equal(A.get('main').name, 'Ben');
  assert.throws(() => A.rename(id, 'ben'), /already/);
});
