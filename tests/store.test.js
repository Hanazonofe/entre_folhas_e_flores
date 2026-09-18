const test = require('node:test');
const assert = require('node:assert/strict');
const Shop = require('../store');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const product = { id: 'p1', code: '001', barcode: '123', name: 'Planta', price: 0.1, stock: 12, status: 'active' };
const item = { id: 'p1', code: '001', barcode: '123', name: 'Planta', price: 0.1, quantity: 3 };
const fields = (extra = {}) => ({ items: [item], discount: 0, paymentMethod: 'cash', cashReceived: 1, notes: 'Original', ...extra });
const legacy = (status = 'completed') => ({ id: 's1', createdAt: '2025-03-01T12:00:00.000Z', status, items: [{ ...item }], subtotal: 0.3, discount: 0, total: 0.3, paymentMethod: 'cash', paymentLabel: 'Dinheiro', cashReceived: 1, change: 0.7, notes: 'Observação antiga.\nVenda cancelada.' });
class Storage {
  constructor() { this.data = new Map(); this.fail = () => false; }
  getItem(key) { if (this.fail('get', key)) throw new Error('Blocked'); return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.fail('set', key)) throw new Error('QuotaExceeded'); this.data.set(key, String(value)); }
  removeItem(key) { if (this.fail('remove', key)) throw new Error('Blocked'); this.data.delete(key); }
}
function setup(sales = [legacy()]) {
  const storage = new Storage();
  storage.setItem(Shop.KEYS.products, JSON.stringify([product]));
  storage.setItem(Shop.KEYS.sales, JSON.stringify(sales));
  return { storage, db: Shop.createStore(storage, [product]) };
}
const incoming = () => ({ version: 1, exportedAt: '2026-08-30T12:00:00.000Z', products: [{ ...product, name: 'Novo' }], sales: [Shop.create(fields())] });

test('integer cents: 0.10 x 3, discounts and cash change', () => {
  assert.deepEqual(Shop.totals([item], 0.1), { subtotal: 0.3, discount: 0.1, total: 0.2 });
  assert.equal(Shop.create(fields()).change, 0.7);
  assert.equal(Shop.totals([{ ...item, price: 1.005, quantity: 1 }]).total, 1.01);
  assert.equal(Shop.totals([item], 1).total, 0);
});
for (const value of [-1, Infinity, NaN, '', 'garbage', null, true, {}, 1e30]) {
  test(`reject invalid money ${String(value)}`, () => assert.throws(() => Shop.cents(value)));
}
test('cash changes on edit; other methods clear change; switching to cash requires received', () => {
  const original = legacy();
  const changed = Shop.edit(original, fields({ items: [{ ...item, price: 0.2 }] }));
  assert.equal(changed.total, 0.6); assert.equal(changed.change, 0.4);
  for (const method of ['credit', 'debit', 'pix']) {
    const nonCash = Shop.edit(original, fields({ paymentMethod: method, cashReceived: '' }));
    assert.equal(nonCash.cashReceived, 0.3); assert.equal(nonCash.change, 0);
    assert.throws(() => Shop.edit(nonCash, fields({ cashReceived: '' })), /Valor recebido/);
  }
  assert.throws(() => Shop.edit(original, fields({ cashReceived: 0.1 })), /menor/);
});
test('zero received is valid only for a zero-total sale', () => {
  assert.equal(Shop.create(fields({ discount: 1, cashReceived: 0 })).change, 0);
  assert.throws(() => Shop.create(fields({ cashReceived: 0 })), /menor/);
});
for (const status of ['completed', 'edited']) {
  test(`cancel/reactivate ${status} repeatedly preserves status, notes and separate history`, () => {
    const original = legacy(status);
    const { db, storage } = setup([original]);
    const stock = storage.getItem(Shop.KEYS.products);
    for (let i = 0; i < 3; i++) {
      const cancelled = db.updateSale('s1', sale => Shop.transition(sale, 'cancelled'));
      assert.equal(cancelled.statusBeforeCancellation, status);
      assert.throws(() => db.updateSale('s1', sale => Shop.transition(sale, 'cancelled')), /já está/);
      assert.throws(() => db.updateSale('s1', sale => Shop.edit(sale, fields())), /Reative/);
      const active = db.updateSale('s1', sale => Shop.transition(sale, 'reactivated'));
      assert.equal(active.status, status); assert.ok(!Object.hasOwn(active, 'statusBeforeCancellation'));
      assert.equal(active.history.length, (i + 1) * 2);
      assert.equal(active.notes, original.notes);
      assert.throws(() => db.updateSale('s1', sale => Shop.transition(sale, 'reactivated')), /não está/);
    }
    assert.equal(storage.getItem(Shop.KEYS.products), stock);
    const refreshed = Shop.createStore(storage).readSales()[0];
    assert.equal(refreshed.history.length, 6);
  });
}
test('old cancelled sales fall back to completed without inventing history', () => {
  for (const oldStatus of [undefined, 'unknown', 'cancelled']) {
    const sale = legacy('cancelled');
    if (oldStatus !== undefined) sale.statusBeforeCancellation = oldStatus;
    const active = Shop.transition(sale, 'reactivated');
    assert.equal(active.status, 'completed'); assert.equal(active.history.length, 1);
    assert.equal(active.createdAt, sale.createdAt); assert.equal(active.notes, sale.notes);
  }
});
test('creation event and edits keep prior events unchanged', () => {
  const sale = Shop.create(fields());
  assert.equal(sale.history[0].type, 'created'); assert.equal(sale.history[0].changes.before, null);
  const previous = JSON.stringify(sale.history);
  const updated = Shop.edit(sale, fields({ notes: '' }));
  assert.equal(JSON.stringify(updated.history.slice(0, 1)), previous);
  assert.equal(updated.history[1].changes.after.notes, '');
  assert.equal(JSON.stringify(sale.history), previous);
});
test('missing sale and stale editor never save or append events', () => {
  const { db, storage } = setup();
  const original = storage.getItem(Shop.KEYS.sales);
  assert.throws(() => db.updateSale('missing', () => null), /não encontrada/);
  assert.throws(() => db.updateSale('s1', sale => Shop.edit(sale, fields()), 'outdated'), /mudou/);
  assert.equal(storage.getItem(Shop.KEYS.sales), original);
});
test('legacy amounts are not silently recalculated on read or reactivation', () => {
  const sale = { ...legacy('cancelled'), total: 0.4, change: 5 };
  const { db } = setup([sale]);
  assert.deepEqual(db.readSales()[0], sale);
  const reactivated = db.updateSale('s1', row => Shop.transition(row, 'reactivated'));
  assert.equal(reactivated.total, 0.4); assert.equal(reactivated.change, 5);
});
for (const bad of ['{', 'null', '{}', '[{"id":"bad"}]']) {
  test(`invalid stored data ${bad} blocks writes and survives unchanged`, () => {
    const { storage, db } = setup();
    storage.setItem(Shop.KEYS.sales, bad);
    assert.throws(() => db.readSales(), /inválidos/);
    assert.throws(() => db.saveSales([]));
    assert.throws(() => db.saveProducts([]));
    assert.equal(storage.getItem(Shop.KEYS.sales), bad);
  });
}
test('absent defaults do not write; explicitly empty catalog stays empty', () => {
  const storage = new Storage(); const db = Shop.createStore(storage, [product]);
  assert.deepEqual(db.readProducts(), [product]); assert.equal(storage.data.size, 0);
  db.saveProducts([]); assert.deepEqual(db.readProducts(), []);
});
test('failed sale write changes neither records nor history', () => {
  const { storage, db } = setup(); const original = storage.getItem(Shop.KEYS.sales);
  storage.fail = (op, key) => op === 'set' && key === Shop.KEYS.sales;
  assert.throws(() => db.updateSale('s1', sale => Shop.transition(sale, 'cancelled')), /Não foi possível salvar/);
  assert.equal(storage.getItem(Shop.KEYS.sales), original);
});
test('backup roundtrip includes products, old notes, events and unchanged stock', () => {
  const { db, storage } = setup();
  db.updateSale('s1', sale => Shop.transition(sale, 'cancelled'));
  const exported = db.exportBackup(); const data = Shop.parseBackup(exported.text);
  const original = db.readAll();
  db.importBackup(data, exported.fingerprint);
  assert.deepEqual(db.readAll(), original);
  assert.equal(storage.getItem(Shop.JOURNAL), null);
});
test('import requires a fresh export, even if an earlier export was downloaded', () => {
  const { db } = setup(); const backup = incoming();
  assert.throws(() => db.importBackup(backup, null), /Exporte/);
  const exported = db.exportBackup();
  db.updateSale('s1', sale => Shop.transition(sale, 'cancelled'));
  assert.throws(() => db.importBackup(backup, exported.fingerprint), /Exporte/);
});
test('backup validation rejects duplicates, unknown statuses, dates, money and bad history', () => {
  const changes = [
    b => { b.version = 9; }, b => { b.exportedAt = 'yesterday'; },
    b => { b.products.push(b.products[0]); }, b => { b.sales.push(b.sales[0]); },
    b => { b.products[0].status = 'gone'; }, b => { b.sales[0].status = 'refunded'; },
    b => { b.products[0].price = -1; }, b => { b.sales[0].total = null; },
    b => { b.sales[0].items[0].quantity = 0; }, b => { b.sales[0].history[0].type = 'unknown'; },
    b => { b.sales[0].history.push(b.sales[0].history[0]); },
    b => { b.sales[0].history[0].changes.after.id = 'another'; }
  ];
  for (const change of changes) { const backup = incoming(); change(backup); assert.throws(() => Shop.parseBackup(JSON.stringify(backup))); }
  assert.throws(() => Shop.parseBackup('not json'));
});
test('import failure after first collection restores both original raw values', () => {
  const { db, storage } = setup(); const before = new Map(storage.data); const exported = db.exportBackup();
  let failed = false;
  storage.fail = (op, key) => { if (!failed && op === 'set' && key === Shop.KEYS.sales) { failed = true; return true; } return false; };
  assert.throws(() => db.importBackup(incoming(), exported.fingerprint), /anteriores foram restaurados/);
  assert.deepEqual(storage.data, before);
});
test('journal preparation failure changes nothing', () => {
  const { db, storage } = setup(); const before = new Map(storage.data); const exported = db.exportBackup();
  storage.fail = (op, key) => op === 'set' && key === Shop.JOURNAL;
  assert.throws(() => db.importBackup(incoming(), exported.fingerprint), /Nenhum dado/);
  assert.deepEqual(storage.data, before);
});
test('persistent rollback failure blocks writes, then recovers on next load', () => {
  const { db, storage } = setup(); const before = new Map(storage.data); const exported = db.exportBackup();
  storage.fail = (op, key) => op === 'set' && key === Shop.KEYS.sales;
  assert.throws(() => db.importBackup(incoming(), exported.fingerprint), /recuperação pendente/);
  assert.notEqual(storage.getItem(Shop.JOURNAL), null);
  assert.throws(() => db.saveProducts([]), /Recuperação pendente/);
  storage.fail = () => false;
  Shop.createStore(storage).readAll();
  assert.deepEqual(storage.data, before);
});
test('interrupted import restores absent keys as absent', () => {
  const storage = new Storage();
  storage.setItem(Shop.JOURNAL, JSON.stringify({ products: null, sales: null }));
  storage.setItem(Shop.KEYS.products, JSON.stringify([product]));
  Shop.createStore(storage).readAll(); assert.equal(storage.data.size, 0);
});
test('receipts escape user data and show cancellation without changing saved money', () => {
  const context = vm.createContext({ Shop, Intl });
  vm.runInContext(fs.readFileSync(path.join(__dirname, './legacy/receipt.js'), 'utf8'), context);
  const sale = legacy('cancelled'); sale.items[0].name = '<img src=x onerror=alert(1)> " &';
  sale.items[0].code = '</td><script>alert(1)</script>'; sale.paymentLabel = '<svg onload=alert(1)>';
  const html = Shop.receiptHtml(sale);
  assert.match(html, /VENDA CANCELADA/); assert.match(html, /&lt;img/); assert.match(html, /&lt;script/);
  assert.doesNotMatch(html, /<img|<script|<svg/);
  assert.match(html, /0,70/); assert.match(Shop.receiptHtml(legacy()), /Concluída/);
});

test('zero or negative stock does not block sales, cancellation or reactivation', () => {
  for (const stock of [0, -3]) {
    const { storage, db } = setup();
    storage.setItem(Shop.KEYS.products, JSON.stringify([{ ...product, stock }]));
    const before = storage.getItem(Shop.KEYS.products);
    db.saveSales([Shop.create(fields())]);
    const sale = db.readSales()[0];
    db.updateSale(sale.id, row => Shop.transition(row, 'cancelled'));
    db.updateSale(sale.id, row => Shop.transition(row, 'reactivated'));
    assert.equal(storage.getItem(Shop.KEYS.products), before);
  }
});
