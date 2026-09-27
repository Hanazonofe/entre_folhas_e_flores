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
  // Dado: produtos cadastrados com códigos diferentes e captura ativa
  // Quando: o leitor envia o código de barras completo de um deles
  // Então: somente o produto correspondente ao código completo é adicionado; um prefixo ou primeiro resultado de busca não é usado como substituto
  assert.fail('critério de aceite AC-006 ainda não provado — implemente este teste');
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
