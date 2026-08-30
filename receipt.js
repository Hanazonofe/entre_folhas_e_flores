const Receipt = {
  html(sale) {
    const e=API.esc,m=API.money;
    return `<h1>Entre Folhas e Flores</h1><p>Comprovante de venda #${sale.number}</p><p>${API.date(sale.created_at)}</p><h2 class="receipt-status">${sale.status==='cancelled'?'VENDA CANCELADA':sale.edited?'VENDA ALTERADA':'VENDA CONCLUÍDA'}</h2>
    <table><thead><tr><th>Produto</th><th>Qtd.</th><th>Unitário</th><th>Total</th></tr></thead><tbody>${sale.items.map(row=>`<tr><td>${e(row.name)}<br><small>Cód. ${e(row.code)} · EAN ${e(row.barcode||'-')}</small></td><td>${row.quantity}</td><td>${m(row.unit_price_cents)}</td><td>${m(row.unit_price_cents*row.quantity)}</td></tr>`).join('')}</tbody></table>
    <p>Subtotal: ${m(sale.subtotal_cents)}</p><p>Desconto: ${m(sale.discount_cents)}</p><h2>Total: ${m(sale.total_cents)}</h2>
    ${sale.payments.map(row=>`<p>${PaymentEditor.labels[row.method]}: ${m(row.applied_cents)}${row.method==='cash'?`<br>Recebido: ${m(row.received_cents)} · Troco: ${m(row.change_cents)}`:''}</p>`).join('')}
    <p class="preserve-lines">${e(sale.notes)}</p><p>Registro de pagamentos informados. Não confirma transações bancárias.</p>`;
  }
};
if (document.querySelector('#receipt')) {
  const button=document.querySelector('#printReceipt'), notice=document.querySelector('#receiptNotice');
  async function refresh() {
    const id=new URLSearchParams(location.search).get('id');
    if(!id)throw new Error('Venda não informada.');
    const sale=await API.call('/sales/'+encodeURIComponent(id));
    document.querySelector('#receipt').innerHTML=Receipt.html(sale);
    notice.textContent='';
  }
  button.addEventListener('click',()=>API.run(notice,async()=>{
    button.disabled=true;
    try { await refresh(); window.print(); } finally { button.disabled=false; }
  }));
  API.run(notice,async()=>{await API.ready();await refresh();button.disabled=false;});
}
