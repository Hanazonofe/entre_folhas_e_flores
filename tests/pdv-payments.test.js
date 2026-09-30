'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPdvHarness, flush } = require('./helpers/pdv-harness.js');

const product = { id: 'p-1', name: 'Flor', price_cents: 10000, active: true };

async function quote(harness, totalCents) {
  await flush();
  harness.api.resolve(0, { items: [product] });
  await flush();
  harness.elements.get('catalogGrid').dispatch('click', { target: { closest: () => ({ dataset: { add: product.id } }) } });
  harness.elements.get('quoteSale').dispatch('click');
  await flush();
  harness.api.resolve(1, { total_cents: totalCents, discount_cents: 0, quote_token: 'quote-1-test-only', items: [{ product_id: product.id, unit_price_cents: totalCents, name: product.name }] });
  await flush();
}

async function requote(harness, totalCents) {
  harness.elements.get('quoteSale').dispatch('click');
  await flush();
  harness.api.resolve(harness.api.requests.length - 1, { total_cents: totalCents, discount_cents: 0, quote_token: 'quote-2-test-only', items: [{ product_id: product.id, unit_price_cents: totalCents, name: product.name }] });
  await flush();
}

test('@spec:AC-024 meio zerado bloqueia a conclusão do PDV sem enviar venda', async () => {
  const harness = createPdvHarness();
  await quote(harness, 10000);
  harness.payments.rows.push({ method: 'pix', applied_cents: 0, received_cents: 0 });
  harness.payments.valuesError = new Error('Cada parcela precisa ter um valor positivo.');
  harness.elements.get('finishSale').dispatch('click');
  await flush();
  assert.match(harness.elements.get('saleNotice').textContent, /valor positivo/);
  assert.equal(harness.api.requests.filter(request => request.path === '/sales').length, 0);
  assert.equal(harness.payments.rows.length, 2);
});

test('@spec:AC-025 soma divergente bloqueia a conclusão do PDV', async () => {
  const harness = createPdvHarness();
  await quote(harness, 10000);
  harness.payments.rows = [{ method: 'credit', applied_cents: 6000, received_cents: 6000 }, { method: 'pix', applied_cents: 3000, received_cents: 3000 }];
  harness.payments.valuesError = new Error('A soma dos pagamentos deve ser igual ao total.');
  harness.elements.get('finishSale').dispatch('click');
  await flush();
  assert.match(harness.elements.get('saleNotice').textContent, /soma dos pagamentos/);
  assert.equal(harness.api.requests.filter(request => request.path === '/sales').length, 0);
});

test('@spec:AC-026 distribuição válida permite concluir e envia os pagamentos informados', async () => {
  const harness = createPdvHarness();
  await quote(harness, 10000);
  harness.payments.rows = [{ method: 'cash', applied_cents: 7000, received_cents: 10000 }, { method: 'pix', applied_cents: 3000, received_cents: 3000 }];
  harness.elements.get('finishSale').dispatch('click');
  await flush();
  const request = harness.api.requests.find(candidate => candidate.path === '/sales');
  assert.deepEqual(JSON.parse(request.options.body).payments, harness.payments.rows);
});

test('@spec:AC-027 confirmação do servidor preserva ordem, meios, valores recebidos e linha zerada', async () => {
  const harness = createPdvHarness();
  await quote(harness, 10000);
  const distribution = [{ method: 'cash', applied_cents: 7000, received_cents: 10000 }, { method: 'pix', applied_cents: 3000, received_cents: 3000 }, { method: 'debit', applied_cents: 0, received_cents: 0 }];
  harness.payments.rows = distribution.map(row => ({ ...row }));
  await requote(harness, 10000);
  assert.deepEqual(harness.payments.rows, distribution);
  assert.deepEqual(harness.payments.calls.map(call => call.method), ['setTotal', 'set', 'setTotal']);
});

test('@spec:AC-028 novo total do servidor atualiza apenas a diferença sem redistribuir pagamentos', async () => {
  const harness = createPdvHarness();
  await quote(harness, 10000);
  const distribution = [{ method: 'credit', applied_cents: 7000, received_cents: 7000 }, { method: 'pix', applied_cents: 3000, received_cents: 3000 }];
  harness.payments.rows = distribution.map(row => ({ ...row }));
  await requote(harness, 12000);
  assert.deepEqual(harness.payments.rows, distribution);
  assert.equal(harness.payments.summary, 'Faltam R$ 20');
  await requote(harness, 9000);
  assert.deepEqual(harness.payments.rows, distribution);
  assert.equal(harness.payments.summary, 'Excedem R$ 10');
});
