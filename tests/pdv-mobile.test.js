'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdvHarness, flush } = require('./helpers/pdv-harness.js');
const product = { id: 'p-1', code: '001', name: 'Rosa', price_cents: 2500, active: true };
const other = { ...product, id: 'p-2', name: 'Lírio' };
const el = (h, id) => h.elements.get(id);
async function boot(mobile = true) {
  const h = createPdvHarness({ mobile }); await flush();
  h.api.resolve(0, { items: [product, other] }); await flush(); return h;
}
async function search(h, value, items = [product]) {
  el(h, 'productSearch').value = value; el(h, 'productSearch').dispatch('input'); await flush();
  h.api.requests.at(-1).deferred.resolve({ items }); await flush();
}
function add(h, first = false) {
  if (first) el(h, 'addFirstResult').dispatch('click');
  else el(h, 'catalogGrid').dispatch('click', { target: { closest: () => ({ dataset: { add: product.id } }) } });
}
async function payment(h) {
  await search(h, 'Rosa'); add(h);
  el(h, 'togglePayment').dispatch('click'); el(h, 'quoteSale').dispatch('click'); await flush();
  h.api.requests.at(-1).deferred.resolve({ total_cents: 2500, discount_cents: 0, quote_token: 'test-only', items: [{ product_id: product.id, name: product.name, quantity: 1, unit_price_cents: 2500 }] }); await flush();
}
test('@spec:AC-032 mobile exibe carrinho e total sem catálogo e atualiza estimativa', async () => {
  const h = await boot(); assert.equal(el(h, 'catalogGrid').hidden, true);
  assert.match(el(h, 'cartList').innerHTML, /Nenhum produto/);
  assert.equal(el(h, 'finalTotal').textContent, 'R$ 0');
  await search(h, 'Rosa'); add(h);
  assert.match(el(h, 'cartList').innerHTML, /Rosa/); assert.equal(el(h, 'catalogGrid').hidden, true);
  assert.equal(el(h, 'finalTotal').textContent, 'R$ 25'); assert.equal(el(h, 'totalLabel').textContent, 'Total estimado');
  el(h, 'discount').value = '5'; el(h, 'discount').dispatch('input');
  assert.equal(el(h, 'finalTotal').textContent, 'R$ 20');
});
test('@spec:AC-033 busca mobile mostra resultados e os oculta ao apagar', async () => {
  const h = await boot(); await search(h, 'Rosa');
  assert.equal(el(h, 'catalogGrid').hidden, false); assert.match(el(h, 'catalogGrid').innerHTML, /Rosa/);
  await search(h, 'inexistente', []); assert.match(el(h, 'catalogGrid').innerHTML, /Nenhum produto encontrado/);
  await search(h, '', [product, other]); assert.equal(el(h, 'catalogGrid').hidden, true);
});
test('@spec:AC-034 ambos os botões limpam a busca nos dois layouts', async () => {
  for (const mobile of [true, false]) for (const first of [true, false]) {
    const h = await boot(mobile); await search(h, 'Rosa'); add(h, first);
    assert.equal(el(h, 'productSearch').value, ''); assert.equal(h.document.activeElement, el(h, 'productSearch'));
    assert.equal(el(h, 'suggestions').hidden, true); assert.equal(el(h, 'catalogGrid').hidden, mobile);
    assert.match(el(h, 'cartList').innerHTML, /Rosa/);
    await search(h, 'Rosa'); add(h, first);
    assert.match(el(h, 'cartList').innerHTML, /<span>2<\/span>/);
  }
});
test('@spec:AC-035 desktop mantém catálogo e alternar largura preserva a venda e o diálogo', async () => {
  const h = await boot(false); assert.equal(el(h, 'catalogGrid').hidden, false);
  assert.equal(el(h, 'paymentDialog').open, false); assert.equal(el(h, 'togglePayment').hidden, false);
  await search(h, 'Rosa'); add(h); assert.match(el(h, 'catalogGrid').innerHTML, /Lírio/);
  el(h, 'togglePayment').dispatch('click');
  h.setMobile(true); assert.equal(el(h, 'catalogGrid').hidden, true); assert.equal(el(h, 'paymentDialog').open, true);
  assert.match(el(h, 'cartList').innerHTML, /Rosa/);
  h.setMobile(false); assert.equal(el(h, 'paymentDialog').open, true); assert.equal(el(h, 'catalogGrid').hidden, false);
});
test('@spec:AC-036 pagamento começa fechado com controle de diálogo acessível', async () => {
  const h = await boot(); assert.equal(el(h, 'paymentDialog').open, false); assert.equal(el(h, 'togglePayment').hidden, false);
  const html = require('node:fs').readFileSync(require.resolve('../pdv.html'), 'utf8');
  assert.match(html, /id="togglePayment" aria-haspopup="dialog" aria-controls="paymentDialog"/);
});
test('@spec:AC-037 abrir pagamento mantém carrinho e sair limpa cobrança conforme decisão posterior', async () => {
  const h = await boot(); await payment(h);
  assert.equal(el(h, 'paymentDialog').open, true);
  assert.match(el(h, 'cartList').innerHTML, /Rosa/); assert.equal(el(h, 'finalTotal').textContent, 'R$ 25');
  assert.equal(h.payments.rows.length, 1); el(h, 'closePayment').dispatch('click'); el(h, 'togglePayment').dispatch('click');
  assert.equal(h.payments.rows.length, 0); assert.equal(el(h, 'finishSale').disabled, true);
  assert.match(el(h, 'cartList').innerHTML, /Rosa/);
});
test('@spec:AC-038 venda confirmada recolhe pagamento, prepara busca e mantém comprovante', async () => {
  const h = await boot(); await payment(h); el(h, 'finishSale').dispatch('click'); await flush();
  h.api.requests.at(-1).deferred.resolve({ id: 'sale-1', number: 1, total_cents: 2500 }); await flush();
  assert.equal(el(h, 'paymentDialog').open, false); assert.equal(el(h, 'productSearch').value, '');
  assert.equal(h.document.activeElement, el(h, 'productSearch')); assert.equal(el(h, 'productSearch').disabled, false);
  assert.match(el(h, 'cartList').innerHTML, /Nenhum produto/); assert.equal(el(h, 'finalTotal').textContent, 'R$ 0');
  assert.equal(el(h, 'receiptLink').hidden, false); assert.equal(el(h, 'receiptLink').href, 'receipt.html?id=sale-1');
});
test('@spec:AC-039 erros de validação e rede mantêm carrinho e pagamento abertos', async () => {
  for (const status of [422, 503]) {
    const h = await boot(); await payment(h); el(h, 'finishSale').dispatch('click'); await flush();
    h.api.requests.at(-1).deferred.reject(Object.assign(new Error('Falha na venda'), { status })); await flush();
    assert.equal(el(h, 'paymentDialog').open, true); assert.match(el(h, 'cartList').innerHTML, /Rosa/);
    assert.match(el(h, 'saleNotice').textContent, /Falha na venda/); assert.equal(h.payments.rows.length, 1);
  }
});
test('busca em andamento não permite adicionar um resultado antigo', async () => {
  const h = await boot(); await search(h, 'Rosa');
  el(h, 'productSearch').value = 'Lírio'; el(h, 'productSearch').dispatch('input'); await flush(); add(h, true);
  assert.match(el(h, 'cartList').innerHTML, /Nenhum produto/);
  h.api.requests.at(-1).deferred.resolve({ items: [other] }); await flush();
  assert.match(el(h, 'catalogGrid').innerHTML, /Lírio/);
});

test('pedido pendente no desktop permanece acessível ao mudar para mobile', async () => {
  const h = await boot(false); await search(h, 'Rosa'); add(h);
  el(h, 'togglePayment').dispatch('click');
  el(h, 'quoteSale').dispatch('click'); await flush();
  h.api.requests.at(-1).deferred.resolve({ total_cents: 2500, discount_cents: 0, quote_token: 'test-only', items: [{ product_id: product.id, name: product.name, unit_price_cents: 2500 }] }); await flush();
  el(h, 'finishSale').dispatch('click'); await flush();
  h.api.requests.at(-1).deferred.reject(Object.assign(new Error('Rede indisponível'), { status: 503 })); await flush();
  h.setMobile(true);
  assert.equal(el(h, 'paymentDialog').open, true);
  assert.equal(el(h, 'finishSale').disabled, false);
  el(h, 'closePayment').dispatch('click'); assert.equal(el(h, 'paymentDialog').open, true);
});
