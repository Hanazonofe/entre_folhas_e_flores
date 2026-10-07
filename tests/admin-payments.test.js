'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor(document) { this.document=document; this.value=''; this.textContent=''; this.hidden=false; this.required=false; this.disabled=false; this.className=''; this.children=[]; this.listeners=new Map(); this.parent=null; this.nodes={}; this.classList={add:()=>{},remove:()=>{}}; }
  addEventListener(type, listener) { this.listeners.set(type,[...(this.listeners.get(type)||[]),listener]); }
  dispatch(type, event={}) { for(const listener of this.listeners.get(type)||[]) listener({target:this,preventDefault(){},...event}); }
  append(child) { child.parent=this; this.children.push(child); }
  replaceChildren(...children) { this.children=[]; children.forEach(child=>this.append(child)); }
  remove() { this.parent.children=this.parent.children.filter(child=>child!==this); }
  querySelector(selector) { return this.nodes[selector] || null; }
  querySelectorAll(selector) { return selector==='.payment-row'?this.children.flatMap(child=>[...(child.className==='payment-row'?[child]:[]),...child.querySelectorAll(selector)]):[]; }
  set innerHTML(html) {
    if(html.includes('payment-rows')) { for(const selector of ['.payment-rows','[data-add-payment]','[data-recalculate]','[data-payment-summary]','[data-payment-error]']) this.nodes[selector]=new Element(this.document); this.append(this.nodes['.payment-rows']); }
    else if(html.includes('data-applied')) { for(const selector of ['[data-method]','[data-applied]','[data-received]','[data-cash-label]','[data-remove]','[data-change]']) this.nodes[selector]=new Element(this.document); }
    else if(this===this.document.elements.get('editItems')) {
      for(const [,field,index,value] of html.matchAll(/data-edit-(name|quantity|price)="(\d+)"[^>]*value="([^"]*)"/g)) this.document.fields.set(`[data-edit-${field}="${index}"]`,Object.assign(new Element(this.document),{value}));
    }
  }
}

const sale = {id:'sale-1',version:3,status:'completed',discount_cents:0,notes:'',items:[{id:'item-1',name:'Rosa',quantity:1,unit_price_cents:10000}],payments:[{method:'credit',applied_cents:10000,received_cents:10000}]};
const flush = () => new Promise(resolve=>setImmediate(resolve));

function harness() {
  const elements=new Map(), fields=new Map();
  const document={elements,fields,createElement:()=>new Element(document),querySelector(selector) { if(selector.startsWith('#')) return elements.get(selector.slice(1)); return fields.get(selector) || null; }};
  for(const id of ['notice','editModal','editPayments','summaryGrid','salesList','pageCount','previousPage','nextPage','searchSales','statusFilter','totalDateFilter','editItems','editDiscount','editNotes','editSubtotal','editTotal','editNotice','editForm','closeModal']) elements.set(id,new Element(document));
  elements.get('searchSales').value=''; elements.get('statusFilter').value='all'; elements.get('totalDateFilter').value=''; elements.get('editDiscount').value='0';
  const requests=[];
  const API={
    user:{role:'admin'}, ready:async()=>{}, header(){}, esc:value=>String(value), date:()=>'', money:cents=>`R$ ${(cents/100).toFixed(2).replace('.',',')}`,
    cents(value) { if(!/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error('valor inválido'); return Math.round(Number(value)*100); },
    call(path,options={}) { return new Promise((resolve,reject)=>requests.push({path,options,resolve,reject})); },
    run(notice,action) { notice.textContent='Carregando…'; return Promise.resolve().then(action).catch(error=>{notice.textContent=error.message;}); },
    confirm:async()=>true
  };
  const context=vm.createContext({document,API,URLSearchParams,PaymentEditor:undefined});
  vm.runInContext(fs.readFileSync('payments.js','utf8'),context,{filename:'payments.js'});
  context.PaymentEditor=context.PaymentEditor;
  vm.runInContext(fs.readFileSync('vendas.js','utf8'),context,{filename:'vendas.js'});
  const root=elements.get('editPayments');
  const rows=()=>root.querySelector('.payment-rows').querySelectorAll('.payment-row');
  const open=async (data=sale) => { elements.get('salesList').dispatch('click',{target:{closest:()=>({dataset:{action:'edit',id:data.id}})}}); await flush(); requests.find(request=>request.path==='/sales/'+data.id).resolve(data); await flush(); };
  return {elements,requests,open,rows};
}
function amounts(rows) { return rows.map(row=>row.querySelector('[data-applied]').value); }
function input(row,value) { row.querySelector('[data-applied]').value=value; row.querySelector('[data-applied]').dispatch('input'); }

test('@spec:AC-015 edição administrativa adiciona meio zerado sem alterar o primeiro',async()=>{ const h=harness(); await h.open(); h.elements.get('editPayments').querySelector('[data-add-payment]').dispatch('click'); assert.deepEqual(amounts(h.rows()),['100.00','0.00']); });
test('@spec:AC-016 edição administrativa desconta preenchimento do primeiro meio',async()=>{ const h=harness(); await h.open(); h.elements.get('editPayments').querySelector('[data-add-payment]').dispatch('click'); input(h.rows()[1],'30.00'); assert.deepEqual(amounts(h.rows()),['70.00','30.00']); });
test('@spec:AC-017 edição administrativa considera todos os demais meios',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:5000},{method:'pix',applied_cents:3000},{method:'debit',applied_cents:2000}]}); input(h.rows()[1],'40.00'); assert.deepEqual(amounts(h.rows()),['40.00','40.00','20.00']); });
test('@spec:AC-018 edição administrativa mantém ajuste manual do primeiro meio',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]}); input(h.rows()[0],'60.00'); assert.deepEqual(amounts(h.rows()),['60.00','30.00']); });
test('@spec:AC-019 edição administrativa recalcula falta sem alterar valores',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:6000},{method:'pix',applied_cents:3000}]}); h.elements.get('editPayments').querySelector('[data-recalculate]').dispatch('click'); assert.equal(h.elements.get('editPayments').querySelector('[data-payment-summary]').textContent,'Faltam R$ 10,00'); assert.deepEqual(amounts(h.rows()),['60.00','30.00']); });
test('@spec:AC-020 edição administrativa recalcula excesso sem alterar valores',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:8000},{method:'pix',applied_cents:3000}]}); h.elements.get('editPayments').querySelector('[data-recalculate]').dispatch('click'); assert.equal(h.elements.get('editPayments').querySelector('[data-payment-summary]').textContent,'Excedem R$ 10,00'); });
test('@spec:AC-021 edição administrativa informa soma correta ao recalcular',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]}); h.elements.get('editPayments').querySelector('[data-recalculate]').dispatch('click'); assert.equal(h.elements.get('editPayments').querySelector('[data-payment-summary]').textContent,'Valores conferem'); });
test('@spec:AC-022 edição administrativa informa valor individual acima do total',async()=>{ const h=harness(); await h.open(); input(h.rows()[0],'110.00'); assert.match(h.elements.get('editPayments').querySelector('[data-payment-error]').textContent,/maior que o total/); });
test('@spec:AC-023 edição administrativa preserva primeiro válido durante excesso dos demais',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:2000},{method:'pix',applied_cents:6000},{method:'debit',applied_cents:2000}]}); input(h.rows()[2],'50.00'); assert.deepEqual(amounts(h.rows()),['20.00','60.00','50.00']); assert.match(h.elements.get('editPayments').querySelector('[data-payment-error]').textContent,/demais meios excedem/); input(h.rows()[2],'10.00'); assert.deepEqual(amounts(h.rows()),['30.00','60.00','10.00']); });
test('@spec:AC-024 edição administrativa bloqueia salvamento com meio zerado',async()=>{ const h=harness(); await h.open(); h.elements.get('editPayments').querySelector('[data-add-payment]').dispatch('click'); h.elements.get('editForm').dispatch('submit'); await flush(); assert.match(h.elements.get('editNotice').textContent,/valor positivo/); assert.equal(h.requests.filter(request=>request.options.method==='PUT').length,0); });
test('@spec:AC-025 edição administrativa bloqueia salvamento com soma divergente',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:6000},{method:'pix',applied_cents:3000}]}); h.elements.get('editForm').dispatch('submit'); await flush(); assert.match(h.elements.get('editNotice').textContent,/soma dos pagamentos/); assert.equal(h.requests.filter(request=>request.options.method==='PUT').length,0); });
test('@spec:AC-029 edição administrativa recalcula primeiro após remover meio',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:5000},{method:'pix',applied_cents:3000},{method:'debit',applied_cents:2000}]}); h.rows()[0].querySelector('[data-remove]').dispatch('click'); assert.deepEqual(amounts(h.rows()),['80.00','20.00']); });
test('@spec:AC-030 edição administrativa faz o único meio restante assumir o total',async()=>{ const h=harness(); await h.open({...sale,payments:[{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]}); h.rows()[0].querySelector('[data-remove]').dispatch('click'); assert.deepEqual(amounts(h.rows()),['100.00']); assert.equal(h.rows()[0].querySelector('[data-method]').value,'pix'); });
test('@spec:AC-031 edição administrativa envia uma distribuição válida calculada pelo editor',async()=>{ const h=harness(); await h.open(); h.elements.get('editPayments').querySelector('[data-add-payment]').dispatch('click'); input(h.rows()[1],'30.00'); h.elements.get('editForm').dispatch('submit'); await flush(); const request=h.requests.find(candidate=>candidate.options.method==='PUT'); assert.deepEqual(JSON.parse(request.options.body).payments,[{method:'credit',applied_cents:7000,received_cents:7000},{method:'credit',applied_cents:3000,received_cents:3000}]); });
