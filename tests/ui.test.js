const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Shop = require('../store');
// Minimal DOM/event adapter: executes the actual page scripts, not copies of handlers.
// Real DOM parsing, CSS and native form validity are covered by the browser checklist.
function page(script, initial = {}) {
  const data = new Map(Object.entries(initial));
  let fail = false, confirmed = true, printFailure = false;
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      const handlers = new Map();
      elements.set(selector, {
        value: selector === '#statusFilter' ? 'all' : '', textContent: '', innerHTML: '', dataset: {}, hidden: false,
        classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c), toggle: (c, enabled) => enabled ? classes.add(c) : classes.delete(c) },
        addEventListener: (type, action) => { handlers.set(type, [...(handlers.get(type) || []), action]); },
        dispatch: (type, extra = {}) => { for (const handler of handlers.get(type) || []) handler({ preventDefault() {}, target: element(selector), ...extra }); },
        focus() {}, reset() { for (const el of elements.values()) el.value = ''; }
      });
    }
    return elements.get(selector);
  }
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { if (fail) throw new Error('quota'); data.set(key, String(value)); },
    removeItem: key => data.delete(key)
  };
  const context = vm.createContext({ Shop: { ...Shop }, Intl, Date, Map, Set, JSON, Number, String, Object, Math,
    document: { querySelector: element },
    window: { localStorage: storage, open() { if (printFailure) throw new Error('printer unavailable'); return null; }, scrollTo() {} },
    confirm: () => confirmed,
  });
  for (const file of ['catalog.js', 'receipt.js', script]) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  return { context, element, storage, data, eval: code => vm.runInContext(code, context), failWrites: value => { fail = value; }, confirm: value => { confirmed = value; }, failPrint: value => { printFailure = value; } };
}
const oldSale = { id: 'sale1', createdAt: '2026-08-01T12:00:00.000Z', status: 'completed', items: [{ id: '1', name: 'Planta', price: 10, quantity: 1 }], subtotal: 10, discount: 0, total: 10, paymentMethod: 'cash', paymentLabel: 'Dinheiro', cashReceived: 20, change: 10, notes: 'Preservar' };
const oldState = () => ({ [Shop.KEYS.sales]: JSON.stringify([oldSale]) });

test('checkout keeps cart and inputs on insufficient cash or failed save; successful retry clears once', () => {
  const app = page('pdv.js');
  app.eval('addToCart(products[0])');
  app.element('#paymentMethod').value = 'cash'; app.element('#cashReceived').value = '10';
  app.element('#discount').value = '0.10';
  app.element('#finishSale').dispatch('click');
  assert.match(app.element('#saleNotice').textContent, /menor/);
  assert.equal(app.eval('cart.size'), 1); assert.equal(app.data.size, 0);
  app.element('#cashReceived').value = '20'; app.failWrites(true);
  app.element('#finishSale').dispatch('click');
  assert.match(app.element('#saleNotice').textContent, /Não foi possível salvar/);
  assert.equal(app.eval('cart.size'), 1); assert.equal(app.element('#cashReceived').value, '20'); assert.equal(app.element('#discount').value, '0.10');
  app.failWrites(false); app.failPrint(true); app.element('#finishSale').dispatch('click');
  assert.equal(app.eval('cart.size'), 0); assert.match(app.element('#saleNotice').textContent, /salva com sucesso.*Não foi possível imprimir/);
  app.element('#finishSale').dispatch('click');
  assert.equal(JSON.parse(app.data.get(Shop.KEYS.sales)).length, 1);
  assert.equal(app.data.has(Shop.KEYS.products), false);
});
test('cancel confirmation refusal and repeated actions do not change sale or show false success', () => {
  const app = page('vendas.js', oldState());
  app.confirm(false); app.eval('run(() => cancelSale("sale1"))');
  assert.equal(app.data.get(Shop.KEYS.sales), oldState()[Shop.KEYS.sales]);
  assert.equal(app.element('#notice').textContent, '');
  app.confirm(true); app.eval('run(() => cancelSale("sale1"))');
  assert.match(app.element('#notice').textContent, /sucesso/);
  app.eval('run(() => cancelSale("sale1"))');
  assert.match(app.element('#notice').textContent, /já está/);
  assert.equal(JSON.parse(app.data.get(Shop.KEYS.sales))[0].history.length, 1);
  app.eval('run(() => reactivateSale("sale1"))');
  app.eval('run(() => reactivateSale("sale1"))');
  assert.match(app.element('#notice').textContent, /não está/);
  assert.equal(JSON.parse(app.data.get(Shop.KEYS.sales))[0].history.length, 2);
});
function openEditor(app) {
  app.element('[data-index="0"][data-field="name"]').value = 'Planta';
  app.element('[data-index="0"][data-field="quantity"]').value = '1';
  app.element('[data-index="0"][data-field="price"]').value = '10';
  app.eval('run(() => openEdit("sale1"))');
}
test('failed edit preserves modal, edited notes and original history', () => {
  const app = page('vendas.js', oldState()); openEditor(app);
  app.element('#editNotes').value = 'Texto novo'; app.failWrites(true);
  app.element('#editForm').dispatch('submit');
  assert.match(app.element('#editNotice').textContent, /Não foi possível salvar/);
  assert.equal(app.element('#editModal').classList.contains('show'), true);
  assert.equal(app.element('#editNotes').value, 'Texto novo');
  assert.equal(app.data.get(Shop.KEYS.sales), oldState()[Shop.KEYS.sales]);
});
test('cash editing updates change, clears stale change on invalid input and requires received after switching', () => {
  const app = page('vendas.js', oldState()); openEditor(app);
  app.element('[data-index="0"][data-field="price"]').value = '15'; app.element('#editForm').dispatch('input');
  assert.match(app.element('#editChange').textContent, /5,00/);
  app.element('#editCashReceived').value = '1'; app.element('#editForm').dispatch('input');
  assert.equal(app.element('#editChange').textContent, ''); assert.match(app.element('#editNotice').textContent, /menor/);
  app.element('#editPayment').value = 'pix'; app.element('#editPayment').dispatch('change');
  assert.equal(app.element('#editCashField').hidden, true);
  app.element('#editPayment').value = 'cash'; app.element('#editPayment').dispatch('change');
  assert.equal(app.element('#editCashReceived').value, ''); assert.equal(app.element('#editCashReceived').required, true);
  app.element('#editForm').dispatch('submit'); assert.match(app.element('#editNotice').textContent, /Valor recebido/);
});
test('stale editor cannot overwrite cancellation from another page', () => {
  const app = page('vendas.js', oldState()); openEditor(app);
  app.storage.setItem(Shop.KEYS.sales, JSON.stringify([Shop.transition(oldSale, 'cancelled')]));
  app.element('#editForm').dispatch('submit');
  assert.match(app.element('#editNotice').textContent, /mudou/);
  assert.equal(JSON.parse(app.data.get(Shop.KEYS.sales))[0].status, 'cancelled');
});
test('special characters remain literal in sales markup, editor and product action attributes', () => {
  const malicious = '<img src=x onerror=alert(1)> " \' &';
  const sale = structuredClone(oldSale); sale.id = malicious; sale.items[0].name = malicious; sale.notes = malicious;
  const app = page('vendas.js', { [Shop.KEYS.sales]: JSON.stringify([sale]) });
  assert.doesNotMatch(app.element('#salesList').innerHTML, /<img|onclick=/);
  assert.match(app.element('#salesList').innerHTML, /&lt;img/);
  app.context.malicious = malicious; app.eval('run(() => openEdit(malicious))');
  assert.doesNotMatch(app.element('#editItems').innerHTML, /<img/);
  const prod = { id: malicious, code: malicious, name: malicious, price: 1, stock: 2, status: 'active' };
  const products = page('produtos.js', { [Shop.KEYS.products]: JSON.stringify([prod]) });
  assert.doesNotMatch(products.element('#productList').innerHTML, /<img|onclick=/);
});
test('invalid storage shows errors on all pages without reseeding or overwriting', () => {
  for (const [script, notice] of [['pdv.js', '#saleNotice'], ['vendas.js', '#notice'], ['produtos.js', '#listNotice']]) {
    const app = page(script, { [Shop.KEYS.products]: '{' });
    assert.match(app.element(notice).textContent, /inválidos/);
    assert.equal(app.data.get(Shop.KEYS.products), '{'); assert.equal(app.data.size, 1);
  }
});
test('failed product save keeps form and fails without success message', () => {
  const app = page('produtos.js');
  for (const [id, value] of Object.entries({ code:'new', name:'Nova planta', price:'2.20', stock:'3', status:'active' })) app.element('#'+id).value = value;
  app.failWrites(true); app.element('#productForm').dispatch('submit');
  assert.match(app.element('#formNotice').textContent, /Não foi possível salvar/);
  assert.equal(app.element('#name').value, 'Nova planta'); assert.equal(app.data.size, 0);
});
