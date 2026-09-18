const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function ui(){
 const elements=new Map(),calls=[],pending=[];let accepted=true,result={total:2,validos:2,invalidos:0,criar:1,atualizar:1,erros:[],preview:'snapshot'};
 const element=id=>{if(!elements.has(id)){const handlers={};elements.set(id,{value:'',textContent:'',innerHTML:'',disabled:id==='#applyImport',files:[],checked:false,children:[],reset(){},replaceChildren(...children){this.children=children;},append(child){this.children.push(child);},addEventListener(type,fn){handlers[type]=fn;},dispatch(type){handlers[type]?.({});}});}return elements.get(id);};
 const API={user:{role:'operator'},esc:String,ready:async()=>{},header(){},confirm:async()=>accepted,
  async call(path,options){calls.push({path,options});if(path.startsWith('/products?'))return {items:[],count:0};if(path.includes('apply=true'))return {...result,inseridos:1,atualizados:1};return result;},
  run(notice,fn){const p=fn().catch(e=>notice.textContent=e.message);pending.push(p);return p;}};
 const c=vm.createContext({document:{querySelector:element,createElement:()=>({textContent:'',children:[],append(x){this.children.push(x);}})},API,structuredClone,window:{scrollTo(){}}});
 vm.runInContext(fs.readFileSync('produtos.js','utf8'),c);
 return {element,calls,set result(r){result=r;},set accepted(v){accepted=v;},async settle(){await Promise.all(pending.splice(0));}};
}
test('operator previews XLSX then explicitly confirms; changed file invalidates preview',async()=>{
 const app=ui();await app.settle();assert.ok(app.calls.some(c=>c.path.startsWith('/products?')));
 const file={name:'products.xlsx',size:10};app.element('#importFile').files=[file];
 app.element('#previewImport').dispatch('click');await app.settle();assert.equal(app.element('#applyImport').disabled,false);
 assert.equal(app.calls.filter(c=>c.path.includes('apply=true')).length,0);
 app.accepted=false;app.element('#applyImport').dispatch('click');await app.settle();assert.equal(app.calls.filter(c=>c.path.includes('apply=true')).length,0);
 app.accepted=true;app.element('#applyImport').dispatch('click');await app.settle();
 assert.equal(app.calls.filter(c=>c.path.includes('apply=true')).length,1);assert.match(app.element('#importNotice').textContent,/1 criados, 1 atualizados/);
 assert.equal(app.element('#applyImport').disabled,true);
 app.element('#previewImport').dispatch('click');await app.settle();app.element('#importFile').dispatch('change');assert.equal(app.element('#applyImport').disabled,true);
});
test('invalid rows require explicit skip and another preview; errors are text',async()=>{
 const app=ui();await app.settle();app.element('#importFile').files=[{name:'p.xlsx',size:1}];
 app.result={total:2,validos:1,invalidos:1,criar:1,atualizar:0,preview:'x',erros:[{aba:'<img>',linha:2,erro:'bad'}]};
 app.element('#previewImport').dispatch('click');await app.settle();assert.equal(app.element('#applyImport').disabled,true);
 assert.match(app.element('#importErrors').children[0].children[0].textContent,/<img>/);
 app.element('#skipInvalid').checked=true;app.element('#skipInvalid').dispatch('change');app.element('#previewImport').dispatch('click');await app.settle();
 assert.equal(app.element('#applyImport').disabled,false);assert.ok(app.calls.at(-1).path.includes('skip_invalid=true'));
});
