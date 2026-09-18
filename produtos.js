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
  let importPreview=null,importBusy=false;
  const importNotice=$('#importNotice'),applyButton=$('#applyImport'),previewButton=$('#previewImport');
  function resetImport(){importPreview=null;applyButton.disabled=true;importNotice.textContent='';$('#importErrors').replaceChildren();}
  function importState(busy){
    importBusy=busy;previewButton.disabled=busy;$('#importFile').disabled=busy;$('#skipInvalid').disabled=busy;
    applyButton.disabled=busy||!importPreview;
  }
  function showImport(result){
    importNotice.textContent=`${result.total} lidos · ${result.validos} válidos · ${result.invalidos} inválidos · ${result.criar} para criar · ${result.atualizar} para atualizar.`;
    const list=document.createElement('ul');
    for(const error of result.erros){const li=document.createElement('li');li.textContent=`${error.aba}, linha ${error.linha}: ${error.erro}`;list.append(li);}
    $('#importErrors').replaceChildren(list);
  }
  async function uploadImport(file,skip,apply=false,preview=''){
    return API.call('/products/import?apply='+apply+'&skip_invalid='+skip+'&preview='+encodeURIComponent(preview),{
      method:'POST',headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});
  }
  $('#importFile').addEventListener('change',resetImport);$('#skipInvalid').addEventListener('change',resetImport);
  previewButton.addEventListener('click',()=>{if(importBusy)return;API.run(importNotice,async()=>{
    importPreview=null;importState(true);$('#importErrors').replaceChildren();
    try{
      const file=$('#importFile').files[0],skip=$('#skipInvalid').checked;
      if(!file||!file.name.toLowerCase().endsWith('.xlsx'))throw new Error('Selecione uma planilha .xlsx.');
      if(file.size>5242880)throw new Error('A planilha deve ter no máximo 5 MB.');
      const result=await uploadImport(file,skip);showImport(result);
      if(result.validos && (!result.invalidos||skip))importPreview={file,skip,result};
      else importNotice.textContent+=' Corrija os erros ou marque ignorar inválidos e valide novamente.';
    }finally{importState(false);}
  });});
  applyButton.addEventListener('click',()=>{if(importBusy||!importPreview)return;API.run(importNotice,async()=>{
    const pending=importPreview;importState(true);
    try{
      if(!await API.confirm(`Criar ${pending.result.criar} e atualizar ${pending.result.atualizar} produtos? ${pending.result.invalidos} inválidos serão ignorados.`)){
        showImport(pending.result);return;
      }
      const result=await uploadImport(pending.file,pending.skip,true,pending.result.preview);
      importPreview=null;showImport(result);
      importNotice.textContent=`Importação concluída: ${result.inseridos} criados, ${result.atualizados} atualizados e ${result.invalidos} ignorados.`;
      clear();offset=0;await API.run($('#listNotice'),load);
    }catch(error){importPreview=null;throw error;}finally{importState(false);}
  });});
  API.run(notice,async()=>{await API.ready();API.header();await load();notice.textContent='';});
})();
