const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function context(fetch){const c=vm.createContext({Intl,Date,fetch,AbortController,setTimeout,clearTimeout,document:{querySelector:()=>null}});for(const file of ['api.js','payments.js','receipt.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);return c;}
test('integer money and HTML escaping across receipt with split payments',()=>{
 const c=context();assert.equal(vm.runInContext("API.cents('123.45')",c),12345);
 for(const value of ['NaN','Infinity','-1','1.234','1e2'])assert.throws(()=>vm.runInContext(`API.cents(${JSON.stringify(value)})`,c));
 c.sale={number:1,status:'cancelled',created_at:'2026-08-30T12:00:00Z',items:[{name:'<img onerror="bad">',code:'<script>bad</script>',quantity:2,unit_price_cents:1000}],subtotal_cents:2000,discount_cents:100,total_cents:1900,notes:'<svg onload=bad>',payments:[{method:'pix',applied_cents:900,received_cents:900,change_cents:0},{method:'cash',applied_cents:1000,received_cents:2000,change_cents:1000}]};
 const html=vm.runInContext('Receipt.html(sale)',c);assert.match(html,/VENDA CANCELADA/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|<svg|<script/);assert.match(html,/Troco:/);assert.match(html,/Pix/);
});
test('network failure cannot become success; request key and body survive retry',async()=>{
 let first=true;const requests=[];
 const c=context(async(path,options)=>{requests.push({path,options});if(first){first=false;throw Error('lost response');}return {ok:true,json:async()=>({id:'saved-sale'})};});
 c.options={method:'POST',headers:{'Idempotency-Key':'same-key'},body:'{"same":"payload"}'};
 await assert.rejects(vm.runInContext("API.call('/sales',options)",c),/não foi confirmada/);
 assert.equal((await vm.runInContext("API.call('/sales',options)",c)).id,'saved-sale');
 assert.equal(requests[0].options.body,requests[1].options.body);assert.equal(requests[0].options.headers['Idempotency-Key'],requests[1].options.headers['Idempotency-Key']);
});
test('active pages do not load legacy persistence or external executable resources',()=>{
 for(const file of ['pdv.html','vendas.html','produtos.html','admin.html','login.html','receipt.html']){
 const html=fs.readFileSync(file,'utf8');assert.doesNotMatch(html,/<script[^>]+src=["']https?:|onclick=|src=["'](?:store|catalog|backup)\.js/);
 }
 for(const file of ['pdv.js','vendas.js','produtos.js','api.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/localStorage/);
});
