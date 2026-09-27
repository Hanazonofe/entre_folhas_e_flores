// Testes de spec da feature leitura-automatica-codigo-barras — gerados por onp-spec scaffold
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { TemporalBarcodeClassifier } = require('../barcode-scanner.js');
const pdv = fs.readFileSync(require.resolve('../pdv.js'), 'utf8');
const html = fs.readFileSync(require.resolve('../pdv.html'), 'utf8');

function scannerHarness() {
  let now = 0; let timer; const scans = [];
  const scanner = new TemporalBarcodeClassifier({now:()=>now,setTimeout:callback=>{timer=callback;return 1;},clearTimeout:()=>{timer=null;},onScan:code=>scans.push(code)});
  return {scanner,scans,type(code){for(const key of code){scanner.handleKey(key,now);now+=20;}},finish(){now+=80;timer();}};
}

// US-001 — Adicionar produtos com o leitor
test('AC-001: Ler sem selecionar a busca @spec:AC-001', () => {
  const harness = scannerHarness(); harness.type('00042'); harness.finish();
  assert.deepEqual(harness.scans, ['00042']);
  assert.match(html, /<script src="barcode-scanner\.js"><\/script>[\s\S]*<script src="pdv\.js">/);
  assert.match(pdv, /document\.addEventListener\('keydown'/);
  assert.match(pdv, /API\.call\('\/products\?code='\+encodeURIComponent\(entry\.code\)\)/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-002: Incrementar a quantidade @spec:AC-002', () => {
  assert.match(pdv, /const row = cart\.get\(product\.id\) \|\| \{\.\.\.product,quantity:0\}; row\.quantity\+\+; cart\.set\(product\.id,row\);/);
  assert.match(pdv, /addProduct\(product, \{fromScanner:true\}\)/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-003: Preservar a busca e encontrar fora do filtro @spec:AC-003', () => {
  assert.match(pdv, /captureSnapshot = \{ field, value: field\.value/);
  assert.match(pdv, /snapshot\.field\.value = snapshot\.value/);
  assert.match(pdv, /snapshot\.field === \$\('#productSearch'\)\) search\(\)/);
  assert.match(pdv, /addProduct\(product, \{fromScanner:true\}\)/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-004: Avisar sobre produto não encontrado @spec:AC-004', () => {
  assert.match(pdv, /if \(!product\) \{ setScanNotice\('Produto não encontrado'\); return; \}/);
  assert.match(pdv, /scanWorkerActive = false;\n        if \(scanQueue\.length\) processScanQueue\(\); else renderCart\(\);/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-005: Suspender com janela aberta @spec:AC-005', () => {
  assert.match(pdv, /function dialogOpen\(\).*dialog\[open\]/);
  assert.match(pdv, /if \(dialogOpen\(\)\) \{ cancelPendingScans\(\); scanner\.cancel\(\); captureSnapshot = null; return; \}/);
  assert.match(pdv, /if \(dialogOpen\(\) \|\| pending \|\| busy\) return;/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-006: Resolver o código completo @spec:AC-006', () => {
  const harness = scannerHarness(); harness.type('00123'); harness.finish();
  assert.deepEqual(harness.scans, ['00123']);
  assert.doesNotMatch(harness.scans[0], /^0012$/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-007: Processar leituras consecutivas @spec:AC-007', () => {
  assert.match(pdv, /scanQueue\.push\(\{code\}\);\n    processScanQueue\(\);/);
  assert.match(pdv, /const entry = scanQueue\.shift\(\), generation = scanGeneration;/);
  assert.match(pdv, /if \(scanQueue\.length\) processScanQueue\(\); else renderCart\(\);/);
});

// US-002 — Buscar manualmente e escolher por clique
test('AC-008: Digitação manual apenas filtra @spec:AC-008', () => {
  assert.match(pdv, /#productSearch'\)\.addEventListener\('input'/);
  assert.match(pdv, /#productSearch'\)\.addEventListener\('keydown',event=>\{if\(event\.key==='Enter'\) event\.preventDefault\(\);\}\)/);
  assert.doesNotMatch(pdv, /event\.key==='Enter'\)\{event\.preventDefault\(\);add\(/);
});

// US-002 — Buscar manualmente e escolher por clique
test('AC-009: Não transformar digitação fora da busca em pesquisa @spec:AC-009', () => {
  const harness = scannerHarness(); harness.scanner.handleKey('1',0); harness.scanner.handleKey('2',100);
  assert.deepEqual(harness.scans, []);
  assert.match(pdv, /captureField\(document\.activeElement\)/);
  assert.doesNotMatch(pdv, /productSearch'\)\.focus\(/);
});

// US-002 — Buscar manualmente e escolher por clique
test('AC-010: Preservar bloqueios existentes da venda @spec:AC-010', () => {
  assert.match(pdv, /if \(dialogOpen\(\) \|\| pending \|\| busy\) return;/);
  assert.match(pdv, /if \(pending \|\| busy \|\| \(scanWorkerActive && !fromScanner\)\) return;/);
});

test('AC-011: Informar produto inativo @spec:AC-011', () => {
  assert.match(pdv, /if \(!product\.active\) \{ setScanNotice\('Produto inativo'\); return; \}/);
  assert.match(pdv, /const product = result\.items\?\.\[0\];/);
});

test('AC-012: Preservar campos financeiros durante a leitura @spec:AC-012', () => {
  assert.match(pdv, /function isFinancialField\(field\).*#discount.*data-applied.*data-received/);
  assert.match(pdv, /if \(isFinancialField\(snapshot\.field\)\) \{ invalidate\(\); renderCart\(\); \}/);
  assert.match(pdv, /#discount'\)\.addEventListener\('input',\(\)=>\{if\(!captureSnapshot\)\{invalidate\(\);renderCart\(\);\}\}\)/);
});

test('AC-013: Aguardar leituras antes de conferir ou fechar @spec:AC-013', () => {
  assert.match(pdv, /const locked = value \|\| scanWorkerActive;/);
  assert.match(pdv, /if\(scanWorkerActive \|\| scanQueue\.length\) return;/);
  assert.match(pdv, /if\(busy \|\| scanWorkerActive \|\| scanQueue\.length\) return;/);
  assert.match(html, /id="quoteNotice" aria-live="polite"/);
});

test('AC-014: Cancelar leituras pendentes ao abrir janela @spec:AC-014', () => {
  assert.match(pdv, /scanGeneration\+\+;\n    scanQueue = \[\];\n    scanWorkerActive = false;/);
  assert.match(pdv, /Leituras pendentes canceladas\. Leia os produtos novamente\./);
  assert.match(pdv, /if \(generation !== scanGeneration \|\| dialogOpen\(\) \|\| pending \|\| busy\) return;/);
  assert.match(pdv, /new MutationObserver\(\(\)=>\{ if \(dialogOpen\(\)\) cancelPendingScans\(\); \}\)\.observe/);
});

// Regressões comportamentais: pdv.js é executado contra um DOM determinístico,
// com relógio e API controlada. Estas provas exercitam o fluxo que o operador vê.
const { createPdvHarness } = require('../tests/helpers/pdv-harness.js');
const browserProduct = (id, code, extra = {}) => ({ id, code, name: `Produto ${code}`, price_cents: 100, active: true, ...extra });
async function browserBoot(h) { await h.flush(); h.api.resolve(0, { items: [], count: 0 }); await h.flush(); }
async function browserScan(h, code) { h.type(code); h.clock.advanceBy(60); await h.flush(); }
function browserLookup(h, code) { return h.api.requests.findLast(request => request.path === `/products?code=${encodeURIComponent(code)}`); }
function browserCart(h) { return h.elements.get('cartList').innerHTML; }

test('navegador: leitura sem busca selecionada @spec:AC-001', async () => {
  const h = createPdvHarness(); await browserBoot(h); h.focus('saleNotes'); await browserScan(h, '00042'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00042/);
});
test('navegador: incrementa a linha existente @spec:AC-002', async () => {
  const h = createPdvHarness(); await browserBoot(h); for (const code of ['00042', '00042']) { await browserScan(h, code); browserLookup(h, code).deferred.resolve({ items: [browserProduct('p1', code)], count: 1 }); await h.flush(); } assert.match(browserCart(h), />2</); assert.equal((browserCart(h).match(/Produto 00042/g) || []).length, 1);
});
test('navegador: preserva filtro ao ler produto fora da lista @spec:AC-003', async () => {
  const h = createPdvHarness(); await browserBoot(h); const field = h.focus('productSearch'); field.value = 'Copo'; field.dispatch('input'); await h.flush(); h.api.requests.at(-1).deferred.resolve({ items: [browserProduct('other', '10001')], count: 1 }); await h.flush(); await browserScan(h, '00042'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.equal(field.value, 'Copo'); assert.match(browserCart(h), /Produto 00042/);
});
test('navegador: avisa código desconhecido e continua @spec:AC-004', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '99999'); browserLookup(h, '99999').deferred.resolve({ items: [], count: 0 }); await h.flush(); assert.equal(h.elements.get('saleNotice').textContent, 'Produto não encontrado'); await browserScan(h, '00042'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00042/);
});
test('navegador: ignora leitura durante janela sobreposta @spec:AC-005', async () => {
  const h = createPdvHarness(); await browserBoot(h); h.openDialog(); await browserScan(h, '00042'); assert.equal(browserLookup(h, '00042'), undefined); h.closeDialog(); await browserScan(h, '00042'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00042/);
});
test('navegador: consulta exclusivamente o código completo @spec:AC-006', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '00123'); const request = browserLookup(h, '00123'); assert.equal(request.path, '/products?code=00123'); request.deferred.resolve({ items: [browserProduct('exact', '00123')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00123/);
});
test('navegador: mantém duas leituras em fila @spec:AC-007', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '00042'); await browserScan(h, '00043'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('one', '00042')], count: 1 }); await h.flush(); browserLookup(h, '00043').deferred.resolve({ items: [browserProduct('two', '00043')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00042/); assert.match(browserCart(h), /Produto 00043/);
});
test('navegador: digitação manual filtra e Enter não adiciona @spec:AC-008', async () => {
  const h = createPdvHarness(); await browserBoot(h); const field = h.focus('productSearch'); h.type('Copo', 50); h.keydown('Enter'); await h.flush(); assert.equal(field.value, 'Copo'); assert.match(browserCart(h), /Nenhum produto/);
});
test('navegador: digitação fora da busca não vira pesquisa @spec:AC-009', async () => {
  const h = createPdvHarness(); await browserBoot(h); const field = h.focus('saleNotes'); h.type('12345', 50); assert.equal(field.value, '12345'); assert.equal(h.elements.get('productSearch').value, ''); assert.match(browserCart(h), /Nenhum produto/);
});
test('navegador: venda pendente bloqueia leitura @spec:AC-010', async () => {
  const h = createPdvHarness({ pending: true }); await browserBoot(h); await browserScan(h, '00042'); assert.equal(browserLookup(h, '00042'), undefined); assert.match(browserCart(h), /Nenhum produto/);
});
test('navegador: produto inativo não entra no carrinho @spec:AC-011', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '00044'); browserLookup(h, '00044').deferred.resolve({ items: [browserProduct('inactive', '00044', { active: false })], count: 1 }); await h.flush(); assert.equal(h.elements.get('saleNotice').textContent, 'Produto inativo'); assert.match(browserCart(h), /Nenhum produto/);
});
test('navegador: restaura desconto após scanner e aceita edição lenta @spec:AC-012', async () => {
  const h = createPdvHarness(); await browserBoot(h); const field = h.focus('discount'); field.value = '12.34'; await browserScan(h, '00042'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.equal(field.value, '12.34'); assert.equal(h.elements.get('finalTotal').textContent, 'A confirmar'); h.type('5', 50, field); assert.equal(field.value, '12.345');
});
test('navegador: bloqueia conferência enquanto consulta leitura @spec:AC-013', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '00042'); assert.equal(h.elements.get('quoteSale').disabled, true); assert.equal(h.elements.get('finishSale').disabled, true); assert.equal(h.elements.get('saleNotice').textContent, 'Leituras em processamento…'); browserLookup(h, '00042').deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.equal(h.elements.get('quoteSale').disabled, false);
});
test('navegador: cancela resposta antiga ao abrir janela @spec:AC-014', async () => {
  const h = createPdvHarness(); await browserBoot(h); await browserScan(h, '00042'); const old = browserLookup(h, '00042'); h.openDialog(); old.deferred.resolve({ items: [browserProduct('p1', '00042')], count: 1 }); await h.flush(); assert.equal(h.elements.get('saleNotice').textContent, 'Leituras pendentes canceladas. Leia os produtos novamente.'); assert.match(browserCart(h), /Nenhum produto/); h.closeDialog(); await browserScan(h, '00043'); browserLookup(h, '00043').deferred.resolve({ items: [browserProduct('p2', '00043')], count: 1 }); await h.flush(); assert.match(browserCart(h), /Produto 00043/);
});
