const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(receipt=false, role='operator') {
 const nodes={};
 const make=()=>({hidden:true,attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.events[k]=f;},focus(){this.focused=true;},remove(){this.removed=true;}});
 for(const k of ['#accountToggle','#accountMenu','a','#logout'])nodes[k]=make();
 const old=make(),host={querySelector:()=>old,append(b){this.bar=b;}};
 const doc={events:{},querySelector(s){return s===(receipt?'.receipt-toolbar':'.topbar')?host:null;},createElement(){return {...make(),querySelector:s=>nodes[s],contains:t=>Object.values(nodes).includes(t)};},addEventListener(k,f){this.events[k]=f;}};
 const calls=[],location={pathname:'/pdv.html',href:''};
 const context=vm.createContext({document:doc,location,sessionStorage:{getItem:()=>null},AbortController,setTimeout,clearTimeout,fetch:async(path)=>{calls.push(path);return {ok:true,json:async()=>({user:{id:1,name:'Ana <Flor>',role},csrf_token:'menu-test-only'})};}});
 vm.runInContext(fs.readFileSync('api.js','utf8')+';globalThis.api=API;',context);
 return {nodes,host,doc,calls,location,async init(){await context.api.ready();context.api.header();}};
}
test('@spec:AC-108 cabeçalho compartilhado em telas comuns e comprovante',async()=>{for(const receipt of [false,true])for(const role of ['admin','operator']){const h=setup(receipt,role);await h.init();assert.ok(h.host.bar);assert.equal(h.host.bar.id,'accountBar');}});
test('@spec:AC-109 inicialmente fechado e botão acessível',async()=>{const h=setup();await h.init();assert.equal(h.nodes['#accountMenu'].hidden,true);assert.match(h.host.bar.innerHTML,/aria-label="Menu do usuário" aria-expanded="false"/);});
test('@spec:AC-110 abre lista ordenada e nome seguro',async()=>{const h=setup();await h.init();h.nodes['#accountToggle'].events.click();assert.equal(h.nodes['#accountMenu'].hidden,false);assert.equal(h.nodes['#accountToggle'].attrs['aria-expanded'],'true');assert.match(h.host.bar.innerHTML,/Ana &lt;Flor&gt;<\/span><a href="admin.html">Minha conta<\/a><button[^>]+>Sair/);});
test('@spec:AC-111 selecionar conta fecha sem impedir navegação',async()=>{const h=setup();await h.init();h.nodes['#accountToggle'].events.click();h.nodes.a.events.click();assert.equal(h.nodes['#accountMenu'].hidden,true);assert.match(h.host.bar.innerHTML,/href="admin.html"/);});
test('@spec:AC-112 sair fecha e chama logout existente',async()=>{const h=setup();await h.init();h.nodes['#accountToggle'].events.click();await h.nodes['#logout'].events.click();assert.equal(h.nodes['#accountMenu'].hidden,true);assert.ok(h.calls.includes('/api/auth/logout'));assert.equal(h.location.href,'login.html');});
test('@spec:AC-113 clique interno preserva menu e externo fecha',async()=>{const h=setup();await h.init();h.nodes['#accountToggle'].events.click();h.doc.events.click({target:h.nodes.a});assert.equal(h.nodes['#accountMenu'].hidden,false);h.doc.events.click({target:{}});assert.equal(h.nodes['#accountMenu'].hidden,true);assert.equal(h.location.href,'');});
test('@spec:AC-114 Esc fecha e devolve foco',async()=>{const h=setup();await h.init();h.nodes['#accountToggle'].events.click();h.doc.events.keydown({key:'Escape'});assert.equal(h.nodes['#accountMenu'].hidden,true);assert.equal(h.nodes['#accountToggle'].focused,true);});
test('@spec:AC-115 layout limita largura e mantém menu na primeira linha',()=>{const css=fs.readFileSync('ui.css','utf8');assert.match(css,/width: min\(260px,calc\(100vw - 32px\)\)/);assert.match(css,/grid-column: 2; grid-row: 1/);assert.match(css,/@media print \{ #accountBar \{ display: none !important/);});
