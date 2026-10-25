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
