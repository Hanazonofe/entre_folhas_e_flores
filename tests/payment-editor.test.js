const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class Element {
  constructor() { this.value=''; this.textContent=''; this.hidden=false; this.required=false; this.className=''; this.children=[]; this.listeners=new Map(); this.parent=null; this.nodes={}; }
  addEventListener(type, listener) { this.listeners.set(type,[...(this.listeners.get(type)||[]),listener]); }
  dispatch(type) { for(const listener of this.listeners.get(type)||[]) listener({target:this}); }
  click() { this.dispatch('click'); }
  append(child) { child.parent=this; this.children.push(child); }
  replaceChildren(...children) { this.children=[]; children.forEach(child=>this.append(child)); }
  remove() { this.parent.children=this.parent.children.filter(child=>child!==this); }
  querySelector(selector) { return this.nodes[selector] || null; }
  querySelectorAll(selector) {
    if(selector !== '.payment-row') return [];
    return this.children.flatMap(child=>[...(child.className==='payment-row'?[child]:[]),...child.querySelectorAll(selector)]);
  }
  set innerHTML(html) {
    if(html.includes('payment-rows')) {
      for(const selector of ['.payment-rows','[data-add-payment]','[data-recalculate]','[data-payment-summary]','[data-payment-error]']) this.nodes[selector]=new Element();
      this.append(this.nodes['.payment-rows']);
    } else if(html.includes('data-applied')) {
      for(const selector of ['[data-method]','[data-applied]','[data-received]','[data-cash-label]','[data-remove]','[data-change]']) this.nodes[selector]=new Element();
    }
  }
}
function editor(total=10000) {
  const root=new Element(), document={createElement:()=>new Element()};
  const context=vm.createContext({document,API:{
    cents(value) { if(!/^\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error('inválido'); return Math.round(Number(value)*100); },
    money(cents) { return `R$ ${(cents/100).toFixed(2).replace('.',',')}`; }
  }});
  vm.runInContext(`${fs.readFileSync('payments.js','utf8')}\nthis.ExportedPaymentEditor = PaymentEditor;`,context);
  return { editor:new context.ExportedPaymentEditor(root,total), root };
}
function rows(root) { return root.querySelector('.payment-rows').querySelectorAll('.payment-row'); }
function applied(row) { return row.querySelector('[data-applied]'); }
function setApplied(row, value) { applied(row).value=value; applied(row).dispatch('input'); }
function summary(root) { return root.querySelector('[data-payment-summary]').textContent; }
function error(root) { return root.querySelector('[data-payment-error]').textContent; }

test('@spec:AC-015 novo meio começa zerado sem alterar o primeiro nem permitir concluir',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:10000,received_cents:10000}]);
  root.querySelector('[data-add-payment]').click();
  assert.deepEqual(rows(root).map(row=>applied(row).value),['100.00','0.00']);
  assert.throws(()=>payments.values(),/valor positivo/);
});
test('@spec:AC-016 preencher outro meio desconta o valor do primeiro',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:10000},{method:'pix',applied_cents:0}]);
  setApplied(rows(root)[1],'30.00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['70.00','30.00']);
});
test('@spec:AC-017 alterações consideram todos os demais meios',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:5000},{method:'pix',applied_cents:3000},{method:'debit',applied_cents:2000}]);
  setApplied(rows(root)[1],'40.00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['40.00','40.00','20.00']);
});
test('@spec:AC-018 primeiro meio aceita ajuste manual sem redistribuir os demais',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]);
  setApplied(rows(root)[0],'60.00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['60.00','30.00']);
});
test('@spec:AC-019 recalcular mostra falta e conserva valores',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:6000},{method:'pix',applied_cents:3000}]); root.querySelector('[data-recalculate]').click();
  assert.equal(summary(root),'Faltam R$ 10,00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['60.00','30.00']);
});
test('@spec:AC-020 recalcular mostra excesso e conserva valores',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:8000},{method:'pix',applied_cents:3000}]); root.querySelector('[data-recalculate]').click();
  assert.equal(summary(root),'Excedem R$ 10,00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['80.00','30.00']);
});
test('@spec:AC-021 recalcular informa soma correta sem alterar valores digitados',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]); root.querySelector('[data-recalculate]').click();
  assert.equal(summary(root),'Valores conferem'); assert.deepEqual(rows(root).map(row=>applied(row).value),['70.00','30.00']);
});
test('@spec:AC-022 valor individual acima do total mostra erro e impede conclusão',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:11000}]);
  assert.match(error(root),/maior que o total/); assert.throws(()=>payments.values(),/maior que o total/);
});
test('@spec:AC-023 excesso nos demais preserva primeiro, mostra excesso e volta a recalcular ao corrigir',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:2000},{method:'pix',applied_cents:6000},{method:'debit',applied_cents:2000}]);
  setApplied(rows(root)[2],'50.00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['20.00','60.00','50.00']); assert.match(error(root),/demais meios excedem/); assert.equal(summary(root),'Excedem R$ 30,00'); assert.throws(()=>payments.values(),/igual ao total/);
  setApplied(rows(root)[2],'10.00'); assert.deepEqual(rows(root).map(row=>applied(row).value),['30.00','60.00','10.00']);
});
test('@spec:AC-024 meio zerado impede conclusão sem removê-lo silenciosamente',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:10000},{method:'pix',applied_cents:0}]);
  assert.equal(rows(root).length,2); assert.throws(()=>payments.values(),/valor positivo/);
});
test('@spec:AC-025 soma diferente do total impede conclusão',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:6000},{method:'pix',applied_cents:3000}]);
  assert.throws(()=>payments.values(),/soma dos pagamentos/);
});
test('@spec:AC-029 remoção recalcula o primeiro meio restante, inclusive ao remover o primeiro',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:5000},{method:'pix',applied_cents:3000},{method:'debit',applied_cents:2000}]);
  rows(root)[1].querySelector('[data-remove]').click(); assert.deepEqual(rows(root).map(row=>applied(row).value),['80.00','20.00']);
  payments.set([{method:'credit',applied_cents:5000},{method:'pix',applied_cents:3000},{method:'debit',applied_cents:2000}]); rows(root)[0].querySelector('[data-remove]').click(); assert.deepEqual(rows(root).map(row=>applied(row).value),['80.00','20.00']);
});
test('@spec:AC-030 único meio restante assume o total e preserva o tipo selecionado',()=>{
  const {editor:payments,root}=editor(); payments.set([{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]);
  rows(root)[0].querySelector('[data-remove]').click(); assert.equal(applied(rows(root)[0]).value,'100.00'); assert.equal(rows(root)[0].querySelector('[data-method]').value,'pix');
});


test('dinheiro preserva troco visível e rejeita recebido insuficiente e duas parcelas em dinheiro',()=>{
  const {editor:payments,root}=editor();
  payments.set([{method:'cash',applied_cents:10000,received_cents:12000}]);
  assert.equal(rows(root)[0].querySelector('[data-change]').textContent,'Troco: R$ 20,00');
  rows(root)[0].querySelector('[data-received]').value='90.00';
  rows(root)[0].querySelector('[data-received]').dispatch('input');
  assert.match(error(root),/insuficiente/);
  assert.equal(rows(root)[0].querySelector('[data-change]').textContent,'');
  payments.set([{method:'cash',applied_cents:5000,received_cents:5000},{method:'cash',applied_cents:5000,received_cents:5000}]);
  assert.throws(()=>payments.values(),/somente uma/);
});
test('@spec:AC-023 excesso restaura o último primeiro positivo após saldo zero ou edição inválida',()=>{
  const {editor:payments,root}=editor();
  payments.set([{method:'credit',applied_cents:7000},{method:'pix',applied_cents:3000}]);
  setApplied(rows(root)[1],'100.00');
  assert.equal(applied(rows(root)[0]).value,'0.00');
  setApplied(rows(root)[1],'110.00');
  assert.equal(applied(rows(root)[0]).value,'70.00');
  assert.throws(()=>payments.values(),/maior|soma/);
});
