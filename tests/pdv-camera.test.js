'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPdvHarness,flush} = require('./helpers/pdv-harness.js');
const product = {id:'p1',code:'PLA0060',name:'Planta',active:true,price_cents:2500};
async function boot() {
 let capture;
 class Camera { constructor(options) { this.options=options; this.sounds=0; capture=this; } open() {} stop() {} confirm() { this.sounds++; } }
 const h=createPdvHarness({mobile:true,CameraScanner:Camera});await flush();h.api.resolve(0,{items:[]});await flush();
 h.elements.get('openCamera').dispatch('click');return {h,camera:capture};
}
test('@spec:AC-096 @spec:AC-097 @spec:AC-098 câmera adiciona produto fora da lista e confirma somente após resposta exata', async()=>{
 const {h,camera}=await boot();assert.equal(h.elements.get('cameraDialog').open,true);
 camera.options.onScan('PLA0060');await flush();assert.equal(camera.sounds,0);
 assert.equal(h.elements.get('closeCamera').disabled,false);
 assert.equal(h.api.requests.at(-1).path,'/products?code=PLA0060');
 h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();
 assert.match(h.elements.get('cartList').innerHTML,/Planta/);assert.equal(camera.sounds,1);
 assert.match(h.elements.get('cameraNotice').textContent,/1 unidade/);
 camera.options.onScan('PLA0060');await flush();h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();
 assert.match(h.elements.get('cameraNotice').textContent,/2 unidade/);assert.equal(h.elements.get('cameraDialog').open,true);
});
test('@spec:AC-094 fechar câmera ignora consulta tardia e não toca som', async()=>{
 const {h,camera}=await boot();camera.options.onScan('PLA0060');await flush();const request=h.api.requests.at(-1);
 h.elements.get('closeCamera').dispatch('click');request.deferred.resolve({items:[product]});await flush();
 assert.doesNotMatch(h.elements.get('cartList').innerHTML,/Planta/);assert.equal(camera.sounds,0);
});
test('desconhecido, inativo e código divergente não alteram carrinho', async()=>{
 for(const [items,message] of [[[],/não encontrado/],[[{...product,active:false}],/inativo/],[[{...product,code:'other'}],/inconsistente/]]) {
  const {h,camera}=await boot();camera.options.onScan('PLA0060');await flush();h.api.requests.at(-1).deferred.resolve({items});await flush();
  assert.equal(camera.sounds,0);assert.doesNotMatch(h.elements.get('cartList').innerHTML,/Planta/);assert.match(h.elements.get('cameraNotice').textContent,message);
 }
});
test('dois códigos seguem fila e mudança de câmera cancela resultados da sessão anterior',async()=>{
 const {h,camera}=await boot();camera.options.onScan('PLA0060');camera.options.onScan('B');await flush();
 const first=h.api.requests.at(-1);first.deferred.resolve({items:[product]});await flush();assert.equal(h.api.requests.at(-1).path,'/products?code=B');
 camera.options.onStop();h.api.requests.at(-1).deferred.resolve({items:[{...product,id:'p2',code:'B',name:'Outra'}]});await flush();
 assert.doesNotMatch(h.elements.get('cartList').innerHTML,/Outra/);assert.equal(camera.sounds,1);
});

test('@spec:AC-104 falha de comunicação mantém câmera aberta sem confirmação de sucesso',async()=>{
 const {h,camera}=await boot();camera.options.onScan('PLA0060');await flush();h.api.requests.at(-1).deferred.reject(new Error('Sem rede'));await flush();
 assert.match(h.elements.get('cameraNotice').textContent,/comunicação/);assert.equal(camera.sounds,0);assert.equal(h.elements.get('cameraDialog').open,true);
});
test('tela desktop e venda pendente não abrem captura',async()=>{
 for(const options of [{mobile:false},{mobile:true,pending:true}]) {
  let opened=0;class Camera {constructor(){} open(){opened++;}stop(){}}
  const h=createPdvHarness({...options,CameraScanner:Camera});await flush();h.api.resolve(0,{items:[]});await flush();h.elements.get('openCamera').dispatch('click');assert.equal(opened,0);
 }
});

test('quantidade da câmera é capturada por leitura e volta para 1 antes da resposta',async()=>{
 const {h,camera}=await boot();const quantity=h.elements.get('cameraQuantity');assert.equal(quantity.value,'1');
 quantity.value='5';camera.options.onScan('PLA0060');assert.equal(quantity.value,'1');
 quantity.value='3';camera.options.onScan('B');assert.equal(quantity.value,'1');await flush();
 h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();assert.match(h.elements.get('cameraNotice').textContent,/5 unidade/);
 h.api.requests.at(-1).deferred.resolve({items:[{...product,code:'B',id:'p2',name:'Outra'}]});await flush();
 assert.equal(h.elements.get('summaryTotal').textContent,'R$ 200');
 camera.options.onScan('PLA0060');await flush();h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();assert.match(h.elements.get('cameraNotice').textContent,/6 unidade/);
});
test('quantidade inválida não consulta, setas respeitam mínimo e corrigir permite ler',async()=>{
 const {h,camera}=await boot();const quantity=h.elements.get('cameraQuantity');
 for(const invalid of ['0','-2','1.5','','abc','1000001']) { quantity.value=invalid;assert.equal(camera.options.onScan('PLA0060'),false); }
 assert.equal(h.api.requests.filter(r=>r.path.includes('?code=')).length,0);
 quantity.value='1';h.elements.get('cameraQuantityDown').dispatch('click');assert.equal(quantity.value,'1');
 h.elements.get('cameraQuantityUp').dispatch('click');assert.equal(quantity.value,'2');camera.options.onScan('PLA0060');await flush();h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();assert.match(h.elements.get('cameraNotice').textContent,/2 unidade/);
});

test('atalhos preenchem a quantidade escolhida, aplicada uma vez e resetada após leitura',async()=>{
 const {h,camera}=await boot();const quantity=h.elements.get('cameraQuantity');
 for(const q of [6,8,10,12,15,20]) {
  h.elements.get('cameraQuantityPresets').dispatch('click',{target:{closest:()=>({dataset:{cameraQuantity:String(q)}})}});
  assert.equal(quantity.value,String(q));
 }
 camera.options.onScan('PLA0060');assert.equal(quantity.value,'1');await flush();
 h.api.requests.at(-1).deferred.resolve({items:[product]});await flush();assert.match(h.elements.get('cameraNotice').textContent,/20 unidade/);
});
