// Custom bill reminders (core.js WT.reminderPlan / WT.reminderList). Run: node --test wealthtrack/tests/reminders.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const WT = require(path.join(__dirname, '../web/core.js'));
const { seed: blankSeed } = require(path.join(__dirname, '../web/seed.js'));

const TODAY = '2026-11-13';
function fresh() {
  WT.setToday(TODAY);
  WT.init(null, { put() { }, del() { } });
  blankSeed(WT, { today: TODAY });
}
const G = o => Object.assign({ enabled: true, daysBefore: [3, 1, 0], hour: 9, minute: 0, overdueDaily: false }, o);
function bill(name, anchor, extra) {
  return WT.addTemplate(Object.assign({ name, amountCents: 5000, anchor, frequency: 'monthly', category: 'cat_other' }, extra || {}));
}
const withPro = (on, fn) => { const prev = global.WT_isPro; global.WT_isPro = () => on; try { return fn(); } finally { if (prev) global.WT_isPro = prev; else delete global.WT_isPro; } };

test('reminderPlan: defaults, per-bill custom and off (Pro)', () => {
  assert.equal(WT.reminderPlan(G({ enabled: false }), null, true), null);
  assert.deepEqual(WT.reminderPlan(G({ minute: 30 }), null, true), { daysBefore: [3, 1, 0], hour: 9, minute: 30, overdueDaily: false });
  assert.deepEqual(WT.reminderPlan(G(), { mode: 'custom', daysBefore: [0, 10, 10], hour: 18, minute: 45 }, true), { daysBefore: [10, 0], hour: 18, minute: 45, overdueDaily: false });
  assert.equal(WT.reminderPlan(G(), { mode: 'off' }, true), null);
  assert.equal(WT.reminderPlan(G({ daysBefore: [] }), null, true), null);
  assert.deepEqual(WT.reminderPlan(G({ daysBefore: [], overdueDaily: true }), null, true).overdueDaily, true);
});

test('reminderPlan without Pro: free behaviour, custom settings ignored', () => {
  const p = WT.reminderPlan(G({ daysBefore: [14, 7, 2, 0], minute: 30, overdueDaily: true }), { mode: 'off' }, false);
  assert.deepEqual(p, { daysBefore: [7, 0], hour: 9, minute: 0, overdueDaily: false });
  assert.deepEqual(WT.reminderPlan(G(), { mode: 'custom', daysBefore: [10], hour: 20, minute: 15 }, false).daysBefore, [3, 1, 0]);
});

test('cleanReminderRule rejects junk', () => {
  assert.equal(WT.cleanReminderRule(null), null);
  assert.equal(WT.cleanReminderRule({ mode: 'default' }), null);
  assert.deepEqual(WT.cleanReminderRule({ mode: 'custom', daysBefore: [-1, 31, 2.5, 5, '3'], hour: 99, minute: 7 }), { mode: 'custom', daysBefore: [5], hour: 9, minute: 0 });
});

test('reminderList: per-bill rules, times, sorting', () => withPro(true, () => {
  fresh();
  WT.saveSettings({ reminders: G({ daysBefore: [1], hour: 8, minute: 15 }) });
  const a = bill('Rent', '2026-11-20');
  bill('Gym', '2026-11-20', { reminder: { mode: 'custom', daysBefore: [5], hour: 18, minute: 30 } });
  bill('Paper', '2026-11-20', { reminder: { mode: 'off' } });
  const list = WT.reminderList(TODAY, 20);
  const rent = list.filter(r => r.title.startsWith('Rent'));
  assert.deepEqual(rent.map(r => [r.date, r.hour, r.minute]), [['2026-11-19', 8, 15]]);
  const gym = list.filter(r => r.title.startsWith('Gym'));
  assert.deepEqual(gym.map(r => [r.date, r.hour, r.minute]), [['2026-11-15', 18, 30]]);
  assert.ok(!list.some(r => r.title.startsWith('Paper')));
  const keys = list.map(r => r.date + ' ' + String(r.hour * 60 + r.minute).padStart(4, '0'));
  assert.deepEqual(keys, [...keys].sort());
  // editing the rule ("this and all future months") changes it; null goes back to defaults
  WT.updateTemplate(a.id, { reminder: { mode: 'off' } }, { mode: 'future', fromMonth: '2026-11' });
  assert.ok(!WT.reminderList(TODAY, 20).some(r => r.title.startsWith('Rent')));
  WT.updateTemplate(a.id, { reminder: null }, { mode: 'future', fromMonth: '2026-11' });
  assert.equal(WT.D.templates[a.id].reminder, undefined);
  assert.ok(WT.reminderList(TODAY, 20).some(r => r.title.startsWith('Rent')));
}));

test('reminderList: daily while overdue, up to two weeks; stops once paid', () => withPro(true, () => {
  fresh();
  WT.saveSettings({ reminders: G({ daysBefore: [0], overdueDaily: true }) });
  bill('Phone', '2026-11-10'); // 3 days overdue
  let od = WT.reminderList(TODAY, 30).filter(r => r.title === 'Phone is overdue' && r.id.includes('2026-11-10'));
  assert.equal(od[0].date, TODAY);
  assert.equal(od[od.length - 1].date, '2026-11-24'); // due + 14 days
  assert.equal(od.length, 12);
  const inst = WT.instancesBetween('2026-11-01', '2026-11-30').find(i => i.name === 'Phone');
  WT.recordPayment(inst.id, { amountCents: 5000, date: TODAY });
  od = WT.reminderList(TODAY, 30).filter(r => r.title === 'Phone is overdue' && r.id.includes('2026-11-10'));
  assert.equal(od.length, 0);
  withPro(false, () => assert.ok(!WT.reminderList(TODAY, 30).some(r => r.title.endsWith('overdue'))));
}));

test('reminderList: skipped, paused and deleted bills get none', () => withPro(true, () => {
  fresh();
  WT.saveSettings({ reminders: G({ daysBefore: [1] }) });
  const s = bill('Skipme', '2026-11-20'); const p = bill('Pauseme', '2026-11-20'); const d = bill('Deleteme', '2026-11-20');
  const i = WT.instancesBetween(TODAY, '2026-11-30').find(x => x.templateId === s.id);
  i.skipped = true; WT.save('instances', i);
  WT.pauseTemplate(p.id, TODAY);
  WT.deleteTemplate(d.id);
  const names = WT.reminderList(TODAY, 20).map(r => r.title);
  assert.ok(!names.some(n => /Skipme|Pauseme|Deleteme/.test(n)), names.join(', '));
}));
