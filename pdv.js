(() => {
  const $ = selector => document.querySelector(selector), notice = $('#saleNotice');
  const cart = new Map(); let products = [], quote = null, pending = null, busy = false, searchSequence = 0;
  const payments = new PaymentEditor($('#paymentEditor'));
  function lock(value) { document.querySelectorAll('main input, main select, main textarea, main button').forEach(el => { el.disabled = value; }); $('#finishSale').disabled = busy || (!pending && !quote); }
  function invalidate() { quote = null; $('#finishSale').disabled = true; $('#quoteNotice').textContent = 'Confira os valores no servidor antes de fechar.'; }
  function renderCart() {
    $('#cartList').innerHTML = [...cart.values()].map(row => `<div class="cart-item"><div><strong>${API.esc(row.name)}</strong><p>${API.money(row.price_cents)} cada</p></div><div class="qty-controls"><button type="button" data-cart="less" data-id="${API.esc(row.id)}">−</button><span>${row.quantity}</span><button type="button" data-cart="more" data-id="${API.esc(row.id)}">+</button><button type="button" data-cart="remove" data-id="${API.esc(row.id)}">Remover</button></div></div>`).join('') || '<p>Nenhum produto no carrinho.</p>';
    const subtotal = [...cart.values()].reduce((sum,row)=>sum+row.price_cents*row.quantity,0);
    $('#subtotal').textContent = API.money(subtotal);
    $('#finalTotal').textContent = quote ? API.money(quote.total_cents) : 'A confirmar';
    lock(!!pending || busy);
  }
  async function search() {
    const sequence = ++searchSequence;
    const result = await API.call('/products?active_only=true&limit=100&q='+encodeURIComponent($('#productSearch').value));
    if (sequence !== searchSequence) return;
    products = result.items;
    $('#catalogGrid').innerHTML = products.map(product=>`<article class="product-card"><strong>${API.esc(product.name)}</strong><p>Cód. ${API.esc(product.code)} · EAN ${API.esc(product.barcode || '-')}</p><strong>${API.money(product.price_cents)}</strong><button type="button" data-add="${product.id}">Adicionar</button></article>`).join('') || '<p>Nenhum produto cadastrado. Peça ao administrador para cadastrar.</p>';
    lock(!!pending || busy);
  }
  function add(id) {
    if (pending || busy) return;
    const product = products.find(row=>row.id===id); if (!product) return;
    const row = cart.get(id) || {...product,quantity:0}; row.quantity++; cart.set(id,row);
    invalidate(); renderCart();
  }
  $('#catalogGrid').addEventListener('click', event => { const button=event.target.closest('[data-add]'); if(button) add(button.dataset.add); });
  $('#cartList').addEventListener('click', event => {
    const button=event.target.closest('[data-cart]'); if (!button || pending || busy) return;
    const row=cart.get(button.dataset.id); if (!row) return;
    if(button.dataset.cart==='remove') cart.delete(row.id); else { row.quantity += button.dataset.cart==='more' ? 1 : -1; if(row.quantity<=0) cart.delete(row.id); }
    invalidate(); renderCart();
  });
  $('#productSearch').addEventListener('input', ()=>API.run(notice, async()=>{await search();notice.textContent='';}));
  $('#productSearch').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();add(products[0]?.id);}});
  $('#addFirstResult').addEventListener('click',()=>add(products[0]?.id));
  $('#discount').addEventListener('input',()=>{invalidate();renderCart();});
  $('#quoteSale').addEventListener('click',()=>API.run(notice,async()=>{
    if(!cart.size) throw new Error('Adicione produtos ao carrinho.');
    busy=true; lock(true);
    try {
      quote=await API.call('/sales/quote',{method:'POST',body:JSON.stringify({items:[...cart.values()].map(row=>({product_id:row.id,quantity:row.quantity})),discount_cents:API.cents($('#discount').value)})});
      quote.items.forEach(item=>{const row=cart.get(item.product_id);row.price_cents=item.unit_price_cents;row.name=item.name;});
      payments.set(quote.total_cents ? [{method:'credit',applied_cents:quote.total_cents,received_cents:quote.total_cents}] : []);
      $('#quoteNotice').textContent='Valores conferidos. Distribua os pagamentos e confirme.'; notice.textContent='';
    } finally {busy=false;renderCart();}
  }));
  $('#finishSale').addEventListener('click',()=>API.run(notice,async()=>{
    if(busy) return;
    if(!pending) {
      if(!quote) throw new Error('Confira os valores primeiro.');
      const parts=payments.values();
      if(parts.reduce((sum,row)=>sum+row.applied_cents,0)!==quote.total_cents) throw new Error('A soma dos pagamentos deve ser igual ao total.');
      pending={key:crypto.randomUUID(),userId:API.user.id,preview:quote.items,body:{items:[...cart.values()].map(row=>({product_id:row.id,quantity:row.quantity})),discount_cents:quote.discount_cents,quote_token:quote.quote_token,payments:parts,notes:$('#saleNotes').value}};
      // Persist the exact unresolved request, never a completed sale or catalog.
      try {sessionStorage.setItem('pdv-pending-checkout',JSON.stringify(pending));} catch {pending=null;throw new Error('Não foi possível proteger o pedido para uma nova tentativa. Nenhuma venda foi enviada.');}
    }
    if(pending.userId!==API.user.id) throw new Error('Entre na mesma conta que iniciou a venda pendente.');
    busy=true; lock(true);
    try {
      const sale=await API.call('/sales',{method:'POST',headers:{'Idempotency-Key':pending.key},body:JSON.stringify(pending.body)});
      sessionStorage.removeItem('pdv-pending-checkout'); pending=null;quote=null;cart.clear();payments.set([]);$('#quoteNotice').textContent='Confira os valores antes de fechar a próxima venda.';$('#discount').value='0';$('#saleNotes').value='';
      notice.textContent=`Venda #${sale.number} confirmada: ${API.money(sale.total_cents)}.`;
      $('#receiptLink').href=`receipt.html?id=${encodeURIComponent(sale.id)}`;$('#receiptLink').hidden=false;
    } catch(error) {
      if([400,409,422].includes(error.status)){sessionStorage.removeItem('pdv-pending-checkout');pending=null;invalidate();}
      else error.message+=' Use “Fechar venda / tentar novamente” para consultar o resultado do mesmo pedido. Não inicie outra venda em outro dispositivo.';
      throw error;
    } finally {busy=false;renderCart();}
  }));
  API.run(notice,async()=>{
    await API.ready();API.header();
    const saved=sessionStorage.getItem('pdv-pending-checkout');
    if(saved){pending=JSON.parse(saved);if(pending.preview){pending.preview.forEach(item=>cart.set(item.product_id,{...item,id:item.product_id,price_cents:item.unit_price_cents}));$('#discount').value=(pending.body.discount_cents/100).toFixed(2);$('#saleNotes').value=pending.body.notes;payments.set(pending.body.payments);}$('#quoteNotice').textContent='Pedido anterior aguardando confirmação. Os dados estão bloqueados para evitar duplicação.';}
    await search();renderCart();notice.textContent=pending?'Tente novamente para resolver a venda pendente.':'';
  });
})();
