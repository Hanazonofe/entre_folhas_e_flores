(() => {
  const $=selector=>document.querySelector(selector), notice=$('#notice'), modal=$('#editModal');
  const payments=new PaymentEditor($('#editPayments'));
  let sales=[],offset=0,count=0,editing=null,sequence=0;
  const expanded=new Set();
  const status=sale=>sale.status==='cancelled'?'Cancelada':sale.edited?'Alterada':'Concluída';
  async function load() {
    const current=++sequence;
    const query=new URLSearchParams({q:$('#searchSales').value,status:$('#statusFilter').value,offset:String(offset),limit:'50'});
    if($('#totalDateFilter').value)query.set('day',$('#totalDateFilter').value);
    const result=await API.call('/sales?'+query);
    if(current!==sequence)return;
    sales=result.items;count=result.count;
    $('#summaryGrid').innerHTML=`<section class="summary-card"><span>Total ativo das vendas filtradas</span><strong>${API.money(result.total_cents)}</strong><span>Canceladas não entram no total.</span></section><section class="summary-card"><span>Valores aplicados por pagamento</span>${Object.entries(PaymentEditor.labels).map(([key,label])=>`<div>${label}: <strong>${API.money(result.by_payment[key]||0)}</strong></div>`).join('')}</section>`;
    $('#salesList').innerHTML=sales.map(sale=>`<article class="sale-card ${expanded.has(sale.id)?'expanded':''}"><button class="sale-toggle" data-action="toggle" data-id="${sale.id}" aria-expanded="${expanded.has(sale.id)}"><div class="sale-header"><h3>Venda #${sale.number}</h3><span>${status(sale)} · ${API.date(sale.created_at)}</span><strong>${API.money(sale.total_cents)}</strong></div></button><div class="sale-details">
      ${sale.items.map(item=>`<div class="item-line"><span>${API.esc(item.name)} · Cód. ${API.esc(item.code)} · ${item.quantity} un.</span><strong>${API.money(item.unit_price_cents*item.quantity)}</strong></div>`).join('')}
      <p class="preserve-lines">${API.esc(sale.notes)}</p><div class="totals"><div>Subtotal: ${API.money(sale.subtotal_cents)}</div><div>Desconto: ${API.money(sale.discount_cents)}</div><strong>Total: ${API.money(sale.total_cents)}</strong>
      ${sale.payments.map(row=>`<div>${PaymentEditor.labels[row.method]}: ${API.money(row.applied_cents)}${row.method==='cash'?` · Recebido: ${API.money(row.received_cents)} · Troco: ${API.money(row.change_cents)}`:''}</div>`).join('')}</div>
      <div class="actions"><a target="_blank" rel="noopener" href="receipt.html?id=${sale.id}">Comprovante</a><button class="secondary" data-action="events" data-id="${sale.id}">Histórico</button>
      ${API.user.role==='admin'?`<button data-action="edit" data-id="${sale.id}" ${sale.status==='cancelled'?'disabled':''}>Alterar</button><button class="warning" data-action="${sale.status==='cancelled'?'reactivate':'cancel'}" data-id="${sale.id}">${sale.status==='cancelled'?'Reativar':'Cancelar'}</button>`:''}</div><div data-history="${sale.id}"></div></div></article>`).join('')||'<p>Nenhuma venda encontrada.</p>';
    $('#pageCount').textContent=`${count?offset+1:0}–${Math.min(offset+sales.length,count)} de ${count}`;
    $('#previousPage').disabled=offset===0;$('#nextPage').disabled=offset+50>=count;
    notice.textContent='';
  }
  function editedItems() {
    return editing.items.map((item,index)=>({...item,name:$(`[data-edit-name="${index}"]`).value,quantity:Number($(`[data-edit-quantity="${index}"]`).value),unit_price_cents:API.cents($(`[data-edit-price="${index}"]`).value)}));
  }
  function totals() {
    const subtotal=editedItems().reduce((sum,item)=>sum+item.quantity*item.unit_price_cents,0),discount=API.cents($('#editDiscount').value);
    $('#editSubtotal').textContent=API.money(subtotal);$('#editTotal').textContent=API.money(subtotal-discount);
    if(discount>subtotal)throw new Error('Desconto maior que o subtotal.');
  }
  async function edit(id) {
    editing=await API.call('/sales/'+id);
    if(editing.status==='cancelled')throw new Error('Reative a venda antes de editar.');
    $('#editItems').innerHTML=editing.items.map((item,index)=>`<div class="edit-grid"><label>Produto ${index+1}<input data-edit-name="${index}" value="${API.esc(item.name)}" required></label><label>Quantidade ${index+1}<input data-edit-quantity="${index}" type="number" min="1" step="1" value="${item.quantity}" required></label><label>Preço ${index+1}<input data-edit-price="${index}" type="number" min="0" step="0.01" value="${(item.unit_price_cents/100).toFixed(2)}" required></label></div>`).join('');
    $('#editDiscount').value=(editing.discount_cents/100).toFixed(2);$('#editNotes').value=editing.notes;payments.set(editing.payments);totals();$('#editNotice').textContent='';modal.classList.add('show');
  }
  $('#salesList').addEventListener('click',event=>{
    const button=event.target.closest('[data-action]');if(!button)return;
    API.run(notice,async()=>{
      const id=button.dataset.id,action=button.dataset.action;
      if(action==='toggle'){expanded.has(id)?expanded.delete(id):expanded.add(id);await load();return;}
      if(action==='edit'){await edit(id);notice.textContent='';return;}
      if(action==='events'){
        const rows=await API.call('/sales/'+id+'/events');
        document.querySelector(`[data-history="${id}"]`).innerHTML='<h4>Histórico registrado no servidor</h4>'+rows.map(row=>`<details><summary>${API.esc(({created:'Criação',edited:'Edição',cancelled:'Cancelamento',reactivated:'Reativação'})[row.type])} · ${API.esc(row.actor)} · ${API.date(row.at)}</summary><pre>${API.esc(JSON.stringify({antes:row.before,depois:row.after},null,2))}</pre></details>`).join('');notice.textContent='';return;
      }
      if(!['cancel','reactivate'].includes(action))return;
      if(!await API.confirm(action==='cancel'?'Cancelar esta venda? Isso altera somente o registro. Nenhum pagamento será estornado automaticamente.':'Reativar esta venda e incluí-la novamente nos totais?')){notice.textContent='';return;}
      const sale=sales.find(row=>row.id===id);
      await API.call(`/sales/${id}/${action}`,{method:'POST',body:JSON.stringify({version:sale.version})});await load();notice.textContent='Situação atualizada com sucesso.';
    });
  });
  $('#editForm').addEventListener('input',()=>API.run($('#editNotice'),async()=>{totals();$('#editNotice').textContent='';}));
  $('#editForm').addEventListener('submit',event=>{event.preventDefault();const button=event.submitter;API.run($('#editNotice'),async()=>{
    if(button)button.disabled=true;
    try{await API.call('/sales/'+editing.id,{method:'PUT',body:JSON.stringify({version:editing.version,items:editedItems(),discount_cents:API.cents($('#editDiscount').value),payments:payments.values(),notes:$('#editNotes').value})});modal.classList.remove('show');await load();notice.textContent='Venda alterada com sucesso.';}finally{if(button)button.disabled=false;}
  });});
  $('#closeModal').addEventListener('click',()=>modal.classList.remove('show'));
  for(const id of ['searchSales','statusFilter','totalDateFilter'])$('#'+id).addEventListener(id==='searchSales'?'input':'change',()=>{offset=0;API.run(notice,load);});
  $('#previousPage').addEventListener('click',()=>{offset=Math.max(0,offset-50);API.run(notice,load);});$('#nextPage').addEventListener('click',()=>{offset+=50;API.run(notice,load);});
  API.run(notice,async()=>{await API.ready();API.header();await load();});
})();
