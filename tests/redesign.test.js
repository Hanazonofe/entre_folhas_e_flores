'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createPdvHarness,flush}=require('./helpers/pdv-harness');
const read=f=>fs.readFileSync(f,'utf8');
function surface(file,api) {
 const nodes=new Map();
 function node(id) { if(nodes.has(id))return nodes.get(id);const n={id,value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,checked:false,files:[],dataset:{},children:[],listeners:{},addEventListener(t,cb){(this.listeners[t]??=[]).push(cb);},dispatch(t,event={}){for(const cb of this.listeners[t]||[])cb({preventDefault(){},target:this,...event});},reset(){},replaceChildren(...c){this.children=c;},append(c){this.children.push(c);},focus(){}};nodes.set(id,n);return n; }
 const context=vm.createContext({document:{querySelector:s=>node(s.slice(1)),createElement:()=>node('generated-'+nodes.size)},API:{esc:String,money:n=>String(n),cents:n=>Math.round(Number(n)*100),date:String,header(){},ready:async()=>{},user:{role:'operator'},run:(notice,action)=>Promise.resolve().then(action).catch(e=>notice.textContent=e.message),...api},location:{href:''},structuredClone,window:{scrollTo(){}}});
 vm.runInContext(read(file),context,{filename:file});return {node,context};
}
test('@spec:AC-067 login envia credenciais, conserva falha e só navega após sucesso; marca e navegação são locais',async()=>{
 let fail=true;const calls=[];const h=surface('login.js',{login:async(...args)=>{calls.push(args);if(fail)throw Error('Acesso não autorizado');}});
 h.node('login').value='operador';h.node('password').value='test-only';h.node('loginForm').dispatch('submit');await flush();assert.equal(h.context.location.href,'');assert.equal(h.node('loginNotice').textContent,'Acesso não autorizado');fail=false;h.node('loginForm').dispatch('submit');await flush();assert.equal(h.context.location.href,'pdv.html');assert.deepEqual(calls[0],['operador','test-only']);
 assert.match(read('login.html'),/<title>Entrar \|/);assert.doesNotMatch(read('login.html'),/aria-current/);
 for(const file of ['pdv','produtos','vendas','admin']){const html=read(file+'.html');assert.match(html,new RegExp(`aria-current="page" class="active" href="${file}.html"`));assert.match(html,/garden-logo.jpg/);assert.doesNotMatch(html,/<style>/);}
});
const product={id:'p1',name:'Manjericão',code:'001',price_cents:1200,active:true};
async function boot(){const h=createPdvHarness({mobile:false});await flush();h.api.resolve(0,{items:[product]});await flush();h.elements.get('addFirstResult').dispatch('click');return h;}
test('@spec:AC-068 caixa mantém item e controles acessíveis ao alternar desktop e celular',async()=>{
 const h=await boot();const el=id=>h.elements.get(id);assert.match(el('cartList').innerHTML,/aria-label="Aumentar quantidade de Manjericão"/);assert.equal(el('catalogGrid').hidden,false);h.setMobile(true);assert.equal(el('catalogGrid').hidden,true);assert.equal(el('paymentPanel').hidden,true);el('togglePayment').dispatch('click');assert.equal(el('paymentPanel').hidden,false);h.setMobile(false);assert.match(el('cartList').innerHTML,/Manjericão/);assert.equal(el('paymentPanel').hidden,false);
});
test('@spec:AC-069 falha após conferência preserva pedido e repete a mesma chave antes de confirmar',async()=>{
 const h=await boot(),el=id=>h.elements.get(id);el('quoteSale').dispatch('click');await flush();h.api.requests.at(-1).deferred.resolve({total_cents:1200,discount_cents:0,quote_token:'fixture-test-only',items:[{product_id:'p1',quantity:1,name:product.name,unit_price_cents:1200}]});await flush();el('finishSale').dispatch('click');await flush();const first=h.api.requests.at(-1);assert.equal(first.path,'/sales');first.deferred.reject(Object.assign(Error('Falha de rede'),{status:0}));await flush();assert.match(el('cartList').innerHTML,/Manjericão/);el('finishSale').dispatch('click');await flush();const retry=h.api.requests.at(-1);assert.equal(retry.options.headers['Idempotency-Key'],first.options.headers['Idempotency-Key']);assert.equal(retry.options.body,first.options.body);retry.deferred.resolve({id:'s1',number:1,total_cents:1200});await flush();assert.match(el('saleNotice').textContent,/confirmada/);assert.equal(el('receiptLink').hidden,false);
});
test('@spec:AC-070 produtos mantém busca, edição, validação e confirmação de importação',async()=>{
 const requests=[];const h=surface('produtos.js',{call:async(path,options={})=>{requests.push({path,options});if(path.startsWith('/products/import'))return {total:1,validos:1,invalidos:0,criar:1,atualizar:0,erros:[],preview:'preview-only',inseridos:1,atualizados:0};return {items:[{...product,stock:5}],count:1};},confirm:async()=>true});await flush();
 h.node('productSearch').value='Manjericão';h.node('productSearch').dispatch('input');await flush();assert.ok(requests.some(r=>r.path.includes('q=Manjeric%C3%A3o')));
 h.node('productList').dispatch('click',{target:{closest:()=>({dataset:{edit:'p1'}})}});assert.equal(h.node('code').value,'001');assert.equal(h.node('price').value,'12.00');
 h.node('importFile').files=[{name:'produtos.xlsx',size:100}];h.node('previewImport').dispatch('click');await flush();assert.equal(h.node('applyImport').disabled,false);assert.ok(requests.some(r=>r.path.includes('apply=false')));h.node('applyImport').dispatch('click');await flush();assert.ok(requests.some(r=>r.path.includes('apply=true')));assert.match(h.node('importNotice').textContent,/Importação concluída/);
});
test('@spec:AC-072 administração preserva restrição por papel e seções de conta, usuários e backup',async()=>{
 for(const role of ['operator','admin']){const calls=[];const h=surface('admin.js',{user:{role},call:async(path)=>{calls.push(path);return path==='/users'?[]:{pending:0,items:[],overdue:false};}});await flush();assert.equal(h.node('adminOnly').hidden,role!=='admin');assert.equal(calls.includes('/users'),role==='admin');assert.equal(calls.includes('/backups'),role==='admin');}
 const api=read('api.js');assert.match(api,/aria-labelledby', 'authTitle'/);assert.match(api,/aria-label', 'Confirmar ação'/);assert.match(api,/autofocus/);assert.match(read('admin.html'),/Segurança da conta/);
});
test('@spec:AC-073 comprovante preserva valores, escape e situação nas três variantes com print independente',()=>{
 const c=vm.createContext({document:{querySelector:()=>null},API:{esc:s=>String(s??'').replaceAll('<','&lt;'),money:n=>`R$ ${n/100}`,date:()=> '21/10/2026'},PaymentEditor:{labels:{cash:'Dinheiro'}}});vm.runInContext(read('receipt.js'),c);
 for(const [status,edited,text] of [['completed',false,'VENDA CONCLUÍDA'],['completed',true,'VENDA ALTERADA'],['cancelled',false,'VENDA CANCELADA']]){c.sale={number:1,status,edited,subtotal_cents:1200,discount_cents:0,total_cents:1200,notes:'<teste>',items:[{name:'<planta>',code:'001',quantity:1,unit_price_cents:1200}],payments:[{method:'cash',applied_cents:1200,received_cents:2000,change_cents:800}]};const html=vm.runInContext('Receipt.html(sale)',c);assert.match(html,new RegExp(text));assert.match(html,/Troco: R\$ 8/);assert.match(html,/&lt;planta>/);assert.doesNotMatch(html,/<img/);}
 const css=read('ui.css');assert.match(css,/@page \{ size: 80mm 297mm; margin: 4mm; \}/);assert.match(css,/\.receipt-paper \{ width: 72mm/);assert.match(css,/\.receipt-page #printReceipt/);
});
test('@spec:AC-074 recursos locais compartilham tokens, têm contraste e controles de 44 pixels',()=>{
 const pages=['login','pdv','produtos','vendas','admin','receipt','design-system'];const allowed=read('backend/pdv/app.py');for(const page of pages){const html=read(page+'.html');assert.match(html,/href="design-tokens.css"/);for(const [,ref] of html.matchAll(/(?:src|href)="([^"#]+\.(?:css|js|jpg))"/g)){assert.ok(fs.existsSync(ref),ref);assert.ok(allowed.includes('"'+ref+'"'),ref);}assert.doesNotMatch(html,/(?:src|href)="https?:/);}
 const css=read('ui.css');assert.match(css,/min-height: 44px/);assert.match(css,/:focus-visible/);assert.match(css,/@media\(max-width:920px\)/);assert.match(css,/@media\(max-width:600px\)/);assert.match(read('deployment/Dockerfile.api'),/\*\.css garden-logo.jpg/);
 const tokens=read('design-tokens.css');const value=token=>tokens.match(new RegExp('--ds-'+token+': (#[0-9a-f]{6}|#fff)\\b'))[1];const lum=hex=>{if(hex==='#fff')hex='#ffffff';const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};for(const [fg,bg] of [['text','bg'],['muted','surface'],['surface','primary'],['danger','danger-bg'],['warning','warning-bg'],['info','info-bg']]){const [a,b]=[lum(value(fg)),lum(value(bg))].sort((a,b)=>a-b);assert.ok((b+.05)/(a+.05)>=4.5,fg+'/'+bg);}
});
