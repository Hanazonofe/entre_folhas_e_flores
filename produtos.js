(() => {
  const $=selector=>document.querySelector(selector),notice=$('#formNotice');
  let editing=null,rows=[],offset=0,sequence=0;
  function clear(){editing=null;$('#productForm').reset();$('#stock').value='0';$('#status').value='active';}
  async function load(){
    const current=++sequence,result=await API.call('/products?limit=100&offset='+offset+'&q='+encodeURIComponent($('#productSearch').value));if(current!==sequence)return;
    rows=result.items;$('#productList').innerHTML=rows.map(row=>`<article class="product-card"><h3>${API.esc(row.name)}</h3><p>Cód. ${API.esc(row.code)} · EAN ${API.esc(row.barcode||'-')}</p><p>${API.money(row.price_cents)} · Estoque cadastral: ${row.stock} · ${row.active?'Ativo':'Inativo'}</p><button type="button" data-edit="${row.id}">Editar</button></article>`).join('')||'<p>Nenhum produto cadastrado.</p>';
    $('#productCount').textContent=`${result.count} produto(s) · página ${Math.floor(offset/100)+1}`;$('#previousProducts').disabled=offset===0;$('#nextProducts').disabled=offset+100>=result.count;$('#listNotice').textContent='';
  }
  $('#productList').addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(!button)return;editing=structuredClone(rows.find(row=>row.id===button.dataset.edit));for(const key of ['code','barcode','name','stock'])$('#'+key).value=editing[key]??'';$('#price').value=(editing.price_cents/100).toFixed(2);$('#status').value=editing.active?'active':'inactive';notice.textContent='Editando produto. A alteração não modifica vendas anteriores.';window.scrollTo({top:0,behavior:'smooth'});});
  $('#productForm').addEventListener('submit',event=>{event.preventDefault();API.run(notice,async()=>{
    const button=event.submitter;if(button)button.disabled=true;
    try{
      const body={code:$('#code').value,barcode:$('#barcode').value||null,name:$('#name').value,stock:Number($('#stock').value),price_cents:API.cents($('#price').value),active:$('#status').value==='active'};
      if(editing)body.version=editing.version;
      await API.call('/products'+(editing?'/'+editing.id:''),{method:editing?'PUT':'POST',body:JSON.stringify(body)});clear();await load();notice.textContent='Produto salvo com sucesso.';
    }finally{if(button)button.disabled=false;}
  });});
  $('#clearForm').addEventListener('click',clear);$('#productSearch').addEventListener('input',()=>{offset=0;API.run($('#listNotice'),load);});
  $('#previousProducts').addEventListener('click',()=>{offset=Math.max(0,offset-100);API.run($('#listNotice'),load);});$('#nextProducts').addEventListener('click',()=>{offset+=100;API.run($('#listNotice'),load);});
  API.run(notice,async()=>{await API.ready();API.header();if(API.user.role!=='admin'){$('main').textContent='Cadastro disponível somente ao administrador.';return;}await load();notice.textContent='';});
})();
