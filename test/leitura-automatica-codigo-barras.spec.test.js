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
  assert.match(pdv, /API\.call\('\/products\?code='\+encodeURIComponent\(code\)\)/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-002: Incrementar a quantidade @spec:AC-002', () => {
  // Dado: um produto já no carrinho e captura automática ativa
  // Quando: o mesmo código de barras é lido novamente
  // Então: a quantidade desse produto aumenta em uma unidade, sem criar uma segunda linha para o mesmo produto
  assert.fail('critério de aceite AC-002 ainda não provado — implemente este teste');
});

// US-001 — Adicionar produtos com o leitor
test('AC-003: Preservar a busca e encontrar fora do filtro @spec:AC-003', () => {
  assert.match(pdv, /captureSnapshot = \{ field, value: field\.value/);
  assert.match(pdv, /snapshot\.field\.value = snapshot\.value/);
  assert.match(pdv, /snapshot\.field === \$\('#productSearch'\)\) search\(\)/);
  assert.match(pdv, /addProduct\(product\)/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-004: Avisar sobre produto não encontrado @spec:AC-004', () => {
  // Dado: captura automática ativa e um código de barras sem produto cadastrado
  // Quando: o leitor envia esse código completo
  // Então: a tela exibe “Produto não encontrado”, não altera o carrinho e permite a próxima leitura
  assert.fail('critério de aceite AC-004 ainda não provado — implemente este teste');
});

// US-001 — Adicionar produtos com o leitor
test('AC-005: Suspender com janela aberta @spec:AC-005', () => {
  assert.match(pdv, /function dialogOpen\(\).*dialog\[open\]/);
  assert.match(pdv, /if \(dialogOpen\(\)\) \{ scanner\.cancel\(\); captureSnapshot = null; return; \}/);
  assert.match(pdv, /if \(dialogOpen\(\) \|\| pending \|\| busy\) return;/);
});

// US-001 — Adicionar produtos com o leitor
test('AC-006: Resolver o código completo @spec:AC-006', () => {
  // Dado: produtos cadastrados com códigos diferentes e captura ativa
  // Quando: o leitor envia o código de barras completo de um deles
  // Então: somente o produto correspondente ao código completo é adicionado; um prefixo ou primeiro resultado de busca não é usado como substituto
  assert.fail('critério de aceite AC-006 ainda não provado — implemente este teste');
});

// US-001 — Adicionar produtos com o leitor
test('AC-007: Processar leituras consecutivas @spec:AC-007', () => {
  // Dado: captura ativa e carrinho editável
  // Quando: duas leituras completas e distintas são identificadas em sequência, inclusive antes de terminar a consulta da primeira
  // Então: cada leitura adiciona exatamente uma unidade do produto correspondente, sem perda nem duplicação
  assert.fail('critério de aceite AC-007 ainda não provado — implemente este teste');
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
  // Dado: a venda bloqueada por processamento ou pedido pendente de confirmação
  // Quando: um código de barras é lido
  // Então: o carrinho continua bloqueado e a leitura não altera os dados do pedido em processamento ou pendente
  assert.fail('critério de aceite AC-010 ainda não provado — implemente este teste');
});

test('AC-012: Preservar campos financeiros durante a leitura @spec:AC-012', () => {
  assert.match(pdv, /function isFinancialField\(field\).*#discount.*data-applied.*data-received/);
  assert.match(pdv, /if \(isFinancialField\(snapshot\.field\)\) \{ invalidate\(\); renderCart\(\); \}/);
  assert.match(pdv, /#discount'\)\.addEventListener\('input',\(\)=>\{if\(!captureSnapshot\)\{invalidate\(\);renderCart\(\);\}\}\)/);
});
