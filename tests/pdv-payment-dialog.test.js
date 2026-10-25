'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createPdvHarness, flush } = require('./helpers/pdv-harness.js');
const product = { id:'p1', name:'Flor', code:'00042', price_cents:1234, active:true };
async function boot() { const h=createPdvHarness();await flush();h.api.resolve(0,{items:[product]});await flush();return h; }
function add(h) { h.elements.get('catalogGrid').dispatch('click',{target:{closest:()=>({dataset:{add:product.id}})}}); }
function open(h) { h.elements.get('togglePayment').dispatch('click'); }
test('@spec:AC-075 resumo precede carrinho em região sticky de altura completa',()=>{
 const html=fs.readFileSync(require.resolve('../pdv.html'),'utf8');const css=fs.readFileSync(require.resolve('../ui.css'),'utf8');
 assert.ok(html.indexOf('id="summaryTotal"')<html.indexOf('id="cartList"')); assert.match(css,/\.sale-summary \{ position: sticky; top: 0/);assert.match(css,/\.sale-column \{ display: contents/);
});
test('@spec:AC-076 total acompanha itens e cobrança inicia fechada',async()=>{
 const h=await boot();assert.equal(h.elements.get('paymentDialog').open,false);assert.equal(h.elements.get('summaryTotal').textContent,'R$ 0');add(h);assert.equal(h.elements.get('summaryTotal').textContent,'R$ 12.34');add(h);assert.equal(h.elements.get('summaryTotal').textContent,'R$ 24.68');assert.equal(h.elements.get('paymentDialog').open,false);
});
test('@spec:AC-077 total é identificado como estimado antes da conferência',async()=>{const h=await boot();add(h);assert.equal(h.elements.get('summaryLabel').textContent,'Total estimado');assert.equal(h.elements.get('finishSale').disabled,true);});
test('@spec:AC-078 abrir cobrança única não envia nem confere venda',async()=>{const h=await boot();add(h);const count=h.api.requests.length;open(h);open(h);assert.equal(h.elements.get('paymentDialog').open,true);assert.equal(h.api.requests.length,count);assert.equal(h.document.activeElement,h.elements.get('closePayment'));});
test('@spec:AC-079 vazio impede abrir cobrança e orienta adicionar produtos',async()=>{const h=await boot();open(h);assert.equal(h.elements.get('paymentDialog').open,false);assert.equal(h.elements.get('togglePayment').disabled,true);assert.equal(h.elements.get('emptyCartHelp').hidden,false);});
test('@spec:AC-089 diálogo nativo associa título, descrição, foco e Escape',async()=>{
 const html=fs.readFileSync(require.resolve('../pdv.html'),'utf8');assert.match(html,/<dialog id="paymentDialog"[^>]*aria-labelledby="paymentTitle" aria-describedby="paymentDescription"/);
 const h=await boot();add(h);open(h);h.elements.get('paymentDialog').dispatch('cancel',{preventDefault(){}});assert.equal(h.elements.get('paymentDialog').open,false);assert.equal(h.document.activeElement,h.elements.get('togglePayment'));
});
test('@spec:AC-090 composição usa tokens Garden e ações operacionais acessíveis',()=>{
 const css=fs.readFileSync(require.resolve('../ui.css'),'utf8');const html=fs.readFileSync(require.resolve('../pdv.html'),'utf8');assert.match(css,/min-height: 44px/);assert.match(css,/font-variant-numeric: tabular-nums/);assert.match(css,/\.sale-summary[^}]*var\(--ds-surface\)/);assert.doesNotMatch(html,/class="ds-/);
});
module.exports={boot,add,open,product};
async function confer(h,total=1234) {
 h.elements.get('quoteSale').dispatch('click');await flush();h.api.requests.at(-1).deferred.resolve({total_cents:total,discount_cents:0,quote_token:'quote-test-only',items:[{product_id:'p1',name:'Flor',quantity:1,unit_price_cents:total}]});await flush();
}
test('@spec:AC-080 Fechar, Voltar e Escape descartam cobrança e mantêm produtos',async()=>{
 for(const action of ['closePayment','backToCart','cancel']) {
  const h=await boot();add(h);open(h);await confer(h);h.elements.get('discount').value='1';h.elements.get('saleNotes').value='Entrega';
  if(action==='cancel')h.elements.get('paymentDialog').dispatch('cancel',{preventDefault(){}});else h.elements.get(action).dispatch('click');
  assert.equal(h.elements.get('paymentDialog').open,false);assert.equal(h.elements.get('discount').value,'0');assert.equal(h.elements.get('saleNotes').value,'');assert.deepEqual(h.payments.rows,[]);assert.equal(h.payments.totalCents,null);assert.match(h.elements.get('cartList').innerHTML,/Flor/);assert.equal(h.elements.get('summaryTotal').textContent,'R$ 12.34');open(h);assert.equal(h.elements.get('finishSale').disabled,true);
 }
});
test('@spec:AC-081 reabrir exige nova conferência antes do envio',async()=>{
 const h=await boot();add(h);open(h);await confer(h);h.elements.get('closePayment').dispatch('click');open(h);h.elements.get('finishSale').dispatch('click');await flush();assert.equal(h.api.requests.filter(r=>r.path==='/sales').length,0);assert.match(h.elements.get('paymentNotice').textContent,/Confira os valores/);
});
test('@spec:AC-082 scanner modal preserva campos, Enter e digitação manual, cancelando resposta antiga',async()=>{
 const h=await boot();add(h);h.type('00042');h.clock.advanceBy(80);await flush();const old=h.api.requests.at(-1);open(h);
 old.deferred.resolve({items:[{...product,id:'old',name:'Não adicionar'}]});await flush();assert.doesNotMatch(h.elements.get('cartList').innerHTML,/Não adicionar/);
 for(const id of ['saleNotes','discount']) {const field=h.focus(id);field.value=id==='discount'?'1.23':'Entrega';for(const code of ['00042','PLA0486']){h.type(code,20,field);const enter=h.keydown('Enter');assert.equal(enter.defaultPrevented,true);assert.equal(field.value,id==='discount'?'1.23':'Entrega');}h.type('abc',100,field);h.clock.advanceBy(80);assert.equal(field.value,(id==='discount'?'1.23':'Entrega')+'abc');}
 const lookups=h.api.requests.filter(r=>r.path.includes('?code=')).length;h.elements.get('closePayment').dispatch('click');h.focus('productSearch');h.type('00042');h.clock.advanceBy(80);await flush();assert.equal(h.api.requests.filter(r=>r.path.includes('?code=')).length,lookups+1);
});
test('@spec:AC-083 pedido desconhecido bloqueia saída e repete corpo e chave',async()=>{
 const h=await boot();add(h);open(h);await confer(h);h.elements.get('finishSale').dispatch('click');await flush();const first=h.api.requests.at(-1);h.elements.get('closePayment').dispatch('click');assert.equal(h.elements.get('paymentDialog').open,true);first.deferred.reject(new Error('offline'));await flush();h.elements.get('backToCart').dispatch('click');assert.equal(h.elements.get('paymentDialog').open,true);h.elements.get('finishSale').dispatch('click');await flush();const second=h.api.requests.at(-1);assert.equal(second.options.body,first.options.body);assert.equal(second.options.headers['Idempotency-Key'],first.options.headers['Idempotency-Key']);
});
test('@spec:AC-084 confirmação limpa produtos e cobrança e oferece comprovante',async()=>{
 const h=await boot();add(h);open(h);await confer(h);h.elements.get('finishSale').dispatch('click');await flush();h.api.requests.at(-1).deferred.resolve({id:'sale1',number:42,total_cents:1234});await flush();assert.equal(h.elements.get('paymentDialog').open,false);assert.match(h.elements.get('cartList').innerHTML,/Nenhum produto/);assert.match(h.elements.get('saleNotice').textContent,/Venda #42 confirmada/);assert.equal(h.elements.get('receiptLink').hidden,false);assert.equal(h.payments.totalCents,null);
});
test('scanner no valor aplicado e recebido não dispara redistribuição temporária',async()=>{
 const h=await boot();add(h);open(h);
 for(const dataset of [{applied:''},{received:''}]) { const field=h.createField('money-'+Object.keys(dataset)[0],dataset);field.value='12.34';let updates=0;field.addEventListener('input',()=>{updates++;});field.focus();h.type('00042',20,field);h.keydown('Enter');assert.equal(field.value,'12.34');assert.equal(updates,0);h.type('5',100,field);h.clock.advanceBy(80);assert.equal(field.value,'12.345');assert.equal(updates,1); }
});
test('inicialização pronta remove mensagem de carregamento',async()=>{const h=await boot();assert.equal(h.elements.get('saleNotice').textContent,'');});
