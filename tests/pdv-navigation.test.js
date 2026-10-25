'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {createPdvHarness,flush}=require('./helpers/pdv-harness.js');
const source=fs.readFileSync(require.resolve('../sale-navigation.js'),'utf8');
const SNAPSHOT='pdv-cart-navigation-v1';
const item={id:'p1',code:'00042',name:'Flor',price_cents:1234,quantity:2};
let serial=0;
function locks() {
 const held=new Set();
 return {held,async request(name,_options,callback){if(held.has(name))return callback(null);held.add(name);try{return await callback({name});}finally{held.delete(name);}}};
}
function navigation(options={}) {
 const session=options.session||new Map(),events=new Map(),manager=options.locks||locks();
 const context={console,crypto:{randomUUID:()=>`context-${++serial}`},navigator:{locks:options.unsupported?undefined:manager},performance:{getEntriesByType:()=>[{type:options.type||'navigate'}]},location:{pathname:options.path||'/pdv.html'},sessionStorage:{getItem:k=>session.get(k)||null,setItem(k,v){if(options.storageFails)throw new Error('quota');session.set(k,v);},removeItem:k=>session.delete(k)},window:{addEventListener:(type,handler)=>events.set(type,handler)},API:{user:{id:'operator'},ready:async()=>{}}};
 vm.runInNewContext(source+'\nglobalThis.navigation = SaleNavigation;',context);
 return {api:context.navigation,session,manager,context,async event(type,event={}){await events.get(type)?.(event);await flush();}};
}
async function pdv(options={}) {const h=createPdvHarness(options);await flush();h.api.resolve(0,{items:[{...item,active:true}]});await flush();return h;}
function add(h){h.elements.get('catalogGrid').dispatch('click',{target:{closest:()=>({dataset:{add:'p1'}})}});}
function linkEvent(){const link={href:'http://garden.test/produtos.html',target:'',hasAttribute:()=>false};return {target:{closest:()=>link},button:0,preventDefault(){this.prevented=true;}};}
test('@spec:AC-085 cancelar aviso mantém carrinho e cobrança sem navegar',async()=>{
 const writes=[],nav={connect:async()=>[],save:items=>{writes.push(items);return true;},available:true};let message='';const h=await pdv({navigation:nav,confirm:async text=>{message=text;return false;}});add(h);h.elements.get('togglePayment').dispatch('click');h.elements.get('discount').value='1';h.elements.get('saleNotes').value='Entrega';const event=linkEvent();await h.dispatchDocument('click',event);assert.equal(event.prevented,true);assert.equal(h.location.href,'http://garden.test/pdv.html');assert.equal(h.elements.get('discount').value,'1');assert.equal(h.elements.get('saleNotes').value,'Entrega');assert.equal(h.elements.get('paymentDialog').open,true);assert.match(message,/produtos serão mantidos.*Desconto, pagamentos e observações serão descartados/);
});
test('@spec:AC-086 navegação confirmada transporta somente produtos e substitui recuperação',async()=>{
 const n=navigation();await n.api.connect('operator',()=>{});let callback;const h=await pdv({navigation:{connect:async(_user,cb)=>{callback=cb;return [];},save:items=>n.api.save(items),available:true},confirm:async()=>true});add(h);h.elements.get('togglePayment').dispatch('click');h.elements.get('saleNotes').value='secreto';h.elements.get('discount').value='2';await h.dispatchDocument('click',linkEvent());assert.equal(h.location.href,'http://garden.test/produtos.html');const saved=JSON.parse(n.session.get(SNAPSHOT));assert.deepEqual(saved.items,[{...item,quantity:1}]);assert.doesNotMatch(n.session.get(SNAPSHOT),/secreto|discount|payments|notes|quote/);callback([{...item,quantity:3}]);callback([{...item,quantity:3}]);assert.match(h.elements.get('cartList').innerHTML,/>3</);assert.equal((h.elements.get('cartList').innerHTML.match(/class="cart-item"/g)||[]).length,1);assert.equal(h.elements.get('discount').value,'0');assert.equal(h.elements.get('saleNotes').value,'');assert.equal(h.elements.get('finishSale').disabled,true);
});
test('@spec:AC-086 lease transfere entre documentos e reconcilia retorno de BFCache',async()=>{
 const first=navigation();let restored;await first.api.connect('operator',items=>{restored=items;});assert.equal(first.api.save([item]),true);await first.event('pagehide');const middle=navigation({session:first.session,locks:first.manager,path:'/produtos.html'});await middle.api.identify('operator');assert.equal(middle.api.read().length,1);await middle.event('pagehide');const last=navigation({session:first.session,locks:first.manager});const cart=await last.api.connect('operator',()=>{});assert.equal(cart[0].quantity,2);last.api.clear();await last.event('pagehide');await first.event('pageshow',{persisted:true});assert.equal(restored.length,0);assert.equal(first.api.available,true);
});
test('@spec:AC-087 recarga descarta rascunho e retornos seguintes não ressuscitam',async()=>{
 const n=navigation();await n.api.connect('operator',()=>{});n.api.save([item]);await n.event('pagehide');const reload=navigation({session:n.session,locks:n.manager,type:'reload'});assert.equal((await reload.api.connect('operator',()=>{})).length,0);assert.equal(n.session.has(SNAPSHOT),false);await reload.event('pagehide');const returned=navigation({session:n.session,locks:n.manager});assert.equal((await returned.api.connect('operator',()=>{})).length,0);
});
test('@spec:AC-088 cópia da aba recebe novo contexto sem alterar a original',async()=>{
 const n=navigation();await n.api.connect('operator',()=>{});n.api.save([item]);for(const path of ['/pdv.html','/produtos.html','/admin.html']){const clone=navigation({session:new Map(n.session),locks:n.manager,path});await clone.api.identify('operator');assert.equal(clone.api.read().length,0);assert.notEqual(clone.session.get('pdv-cart-context-v1'),n.session.get('pdv-cart-context-v1'));assert.equal(n.api.read()[0].quantity,2);await clone.event('pagehide');}
});
test('@spec:AC-088 troca de conta e logout removem autorização do carrinho',async()=>{
 const n=navigation();let restored;await n.api.connect('operator',items=>{restored=items;});n.api.save([item]);await n.api.identify('other');assert.equal(n.api.read().length,0);assert.equal(restored.length,0);n.api.save([item]);n.api.logout();assert.equal(n.session.has(SNAPSHOT),false);
});
test('@spec:AC-083 rascunho de navegação não sobrescreve pedido pendente',async()=>{
 const session=new Map([['pdv-pending-checkout',JSON.stringify({key:'same-key',userId:'operator',preview:[{product_id:'pending',name:'Pendente',unit_price_cents:100,quantity:1}],body:{items:[{product_id:'pending',quantity:1}],discount_cents:0,notes:'original',payments:[]}})]]);let callback;const nav={connect:async(_user,cb)=>{callback=cb;return [item];},save:()=>{throw new Error('não gravar pending');},available:true};const h=await pdv({session,navigation:nav});assert.match(h.elements.get('cartList').innerHTML,/Pendente/);assert.doesNotMatch(h.elements.get('cartList').innerHTML,/Flor/);callback([]);assert.match(h.elements.get('cartList').innerHTML,/Pendente/);assert.equal(JSON.parse(session.get('pdv-pending-checkout')).key,'same-key');assert.equal(h.elements.get('paymentDialog').open,true);
});
test('@spec:AC-084 venda confirmada remove snapshot recuperável',async()=>{
 const n=navigation();await n.api.connect('operator',()=>{});n.api.save([item]);n.api.clear();assert.equal(n.api.read().length,0);assert.equal(n.session.has(SNAPSHOT),false);
});
test('armazenamento indisponível cancela saída sem descartar cobrança',async()=>{
 const h=await pdv({navigation:{connect:async()=>[],save:()=>false,available:false},confirm:async()=>true});add(h);h.elements.get('discount').value='1';await h.dispatchDocument('click',linkEvent());assert.equal(h.location.href,'http://garden.test/pdv.html');assert.equal(h.elements.get('discount').value,'1');assert.match(h.elements.get('saleNotice').textContent,/navegação foi cancelada/);
});
test('snapshot corrompido, duplicado ou monetário inválido é descartado',async()=>{
 const n=navigation();await n.api.connect('operator',()=>{});for(const invalid of ['{bad',JSON.stringify({version:1,userId:'operator',contextId:n.session.get('pdv-cart-context-v1'),items:[item,item]})]){n.session.set(SNAPSHOT,invalid);assert.equal(n.api.read().length,0);assert.equal(n.session.has(SNAPSHOT),false);}assert.equal(n.api.save([{...item,price_cents:1.1}]),false);
});
test('sem Web Locks recuperação não é prometida e pedido pendente é preservado',async()=>{
 const n=navigation({unsupported:true});n.session.set('pdv-pending-checkout','pedido');assert.equal(await n.api.identify('operator'),false);assert.equal(n.api.save([item]),false);assert.equal(n.session.get('pdv-pending-checkout'),'pedido');
});
