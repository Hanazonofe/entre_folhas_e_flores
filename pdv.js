(() => {
  const $ = selector => document.querySelector(selector), notice = $('#saleNotice');
  const cart = new Map(); let products = [], quote = null, pending = null, busy = false, searchSequence = 0;
  let scanQueue = [], scanWorkerActive = false, scanGeneration = 0, noticeSequence = 0;
  let captureSnapshot = null;
  const mobileLayout = window.matchMedia('(max-width: 920px)');
  let paymentExpanded = false, catalogProducts = [];
  function syncLayout() {
    const mobile = mobileLayout.matches, expanded = paymentExpanded || !!pending;
    $('#catalogGrid').hidden = mobile && !$('#productSearch').value.trim();
    $('#togglePayment').hidden = !mobile;
    $('#togglePayment').setAttribute('aria-expanded', String(expanded));
    $('#togglePayment').textContent = expanded ? 'Recolher pagamento' : 'Ir para pagamento';
    $('#paymentPanel').hidden = mobile && !expanded;
  }
  function renderProducts() {
    $('#catalogGrid').innerHTML = products.map(product=>`<article class="product-card"><strong>${API.esc(product.name)}</strong><p>Cód. ${API.esc(product.code)} · EAN ${API.esc(product.barcode || '-')}</p><strong>${API.money(product.price_cents)}</strong><button type="button" data-add="${product.id}">Adicionar</button></article>`).join('') || '<p>Nenhum produto encontrado.</p>';
    syncLayout();
  }
  function clearSearch({focus = true} = {}) {
    ++searchSequence; // A resposta de uma busca anterior não pode reabrir os resultados.
    $('#productSearch').value = '';
    $('#suggestions').hidden = true;
    products = catalogProducts;
    renderProducts();
    if (focus) $('#productSearch').focus({preventScroll: true});
  }
  $('#togglePayment').addEventListener('click', () => { paymentExpanded = !paymentExpanded; syncLayout(); });
  mobileLayout.addEventListener('change', () => { syncLayout(); renderCart(); });
  syncLayout();
  const payments = new PaymentEditor($('#paymentEditor'));
  function lock(value) { const locked = value || scanWorkerActive; document.querySelectorAll('main input, main select, main textarea, main button').forEach(el => { el.disabled = locked; }); $('#finishSale').disabled = scanWorkerActive || busy || (!pending && !quote); }
  function invalidate() { quote = null; $('#finishSale').disabled = true; $('#quoteNotice').textContent = 'Confira os valores no servidor antes de fechar.'; }
  function renderCart() {
    $('#cartList').innerHTML = [...cart.values()].map(row => `<div class="cart-item"><div><strong>${API.esc(row.name)}</strong><p>${API.money(row.price_cents)} cada</p></div><div class="qty-controls"><button type="button" data-cart="less" data-id="${API.esc(row.id)}">−</button><span>${row.quantity}</span><button type="button" data-cart="more" data-id="${API.esc(row.id)}">+</button><button type="button" data-cart="remove" data-id="${API.esc(row.id)}">Remover</button></div></div>`).join('') || '<p>Nenhum produto no carrinho.</p>';
    const subtotal = [...cart.values()].reduce((sum,row)=>sum+row.price_cents*row.quantity,0);
    $('#subtotal').textContent = API.money(subtotal);
    let estimatedTotal = null;
    try { estimatedTotal = Math.max(0, subtotal - API.cents($('#discount').value)); } catch { /* A conferência exibirá o erro do desconto inválido. */ }
    $('#totalLabel').textContent = mobileLayout.matches && !quote && cart.size ? 'Total estimado' : 'Total final';
    $('#finalTotal').textContent = quote ? API.money(quote.total_cents) : mobileLayout.matches && estimatedTotal !== null ? API.money(estimatedTotal) : 'A confirmar';
    lock(!!pending || busy);
    syncLayout();
  }
  async function search() {
    const sequence = ++searchSequence;
    const query = $('#productSearch').value.trim();
    products = [];
    renderProducts();
    $('#catalogGrid').textContent = 'Buscando produtos…';
    const result = await API.call('/products?active_only=true&limit=100&q='+encodeURIComponent(query));
    if (sequence !== searchSequence) return;
    products = result.items;
    if (!query) catalogProducts = products;
    renderProducts();
    lock(!!pending || busy);
  }
  function addProduct(product, {fromScanner = false} = {}) {
    if (pending || busy || (scanWorkerActive && !fromScanner)) return;
    if (!product) return;
    const row = cart.get(product.id) || {...product,quantity:0}; row.quantity++; cart.set(product.id,row);
    invalidate(); renderCart();
    if (!fromScanner) clearSearch();
  }
  function add(id) { addProduct(products.find(row=>row.id===id)); }
  $('#catalogGrid').addEventListener('click', event => { const button=event.target.closest('[data-add]'); if(button) add(button.dataset.add); });
  $('#cartList').addEventListener('click', event => {
    const button=event.target.closest('[data-cart]'); if (!button || pending || busy || scanWorkerActive) return;
    const row=cart.get(button.dataset.id); if (!row) return;
    if(button.dataset.cart==='remove') cart.delete(row.id); else { row.quantity += button.dataset.cart==='more' ? 1 : -1; if(row.quantity<=0) cart.delete(row.id); }
    invalidate(); renderCart();
  });
  function isFinancialField(field) { return field === $('#discount') || !!field?.matches?.('[data-applied], [data-received]'); }
  function captureField(field) {
    if (!field || !field.matches?.('input, textarea')) return;
    if (!captureSnapshot) captureSnapshot = { field, value: field.value, selectionStart: field.selectionStart, selectionEnd: field.selectionEnd };
  }
  function restoreCapture() {
    const snapshot = captureSnapshot; captureSnapshot = null;
    if (!snapshot) return;
    snapshot.field.value = snapshot.value;
    if (snapshot.field.setSelectionRange && snapshot.selectionStart !== null) snapshot.field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    if (snapshot.field === $('#productSearch')) search();
    if (isFinancialField(snapshot.field)) { invalidate(); renderCart(); }
  }
  function dialogOpen() { return !!document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'); }
  function setScanNotice(message) { noticeSequence++; notice.textContent = message; }
  function cancelPendingScans() {
    const hadPendingScans = scanWorkerActive || scanQueue.length;
    scanner.cancel();
    if (!hadPendingScans) return;
    scanGeneration++;
    scanQueue = [];
    scanWorkerActive = false;
    captureSnapshot = null;
    setScanNotice('Leituras pendentes canceladas. Leia os produtos novamente.');
    renderCart();
  }
  function processScanQueue() {
    if (scanWorkerActive || !scanQueue.length || dialogOpen() || pending || busy) return;
    const entry = scanQueue.shift(), generation = scanGeneration;
    scanWorkerActive = true;
    setScanNotice('Leituras em processamento…');
    renderCart();
    (async()=>{
      try {
        const result = await API.call('/products?code='+encodeURIComponent(entry.code));
        if (generation !== scanGeneration || dialogOpen() || pending || busy) return;
        const product = result.items?.[0];
        if (!product) { setScanNotice('Produto não encontrado'); return; }
        if (!product.active) { setScanNotice('Produto inativo'); return; }
        addProduct(product, {fromScanner:true}); setScanNotice('');
      } catch (error) {
        if (generation === scanGeneration) setScanNotice(error.message);
      } finally {
        if (generation !== scanGeneration) return;
        scanWorkerActive = false;
        if (scanQueue.length) processScanQueue(); else renderCart();
      }
    })();
  }
  function enqueueScan(code) {
    restoreCapture();
    if (dialogOpen() || pending || busy) return;
    scanQueue.push({code});
    processScanQueue();
  }
  const scanner = new BarcodeScanner.TemporalBarcodeClassifier({
    onScan: enqueueScan,
    onManual: () => {
      const snapshot = captureSnapshot; captureSnapshot = null;
      if (!snapshot) return;
      if (snapshot.field === $('#productSearch')) search();
      if (isFinancialField(snapshot.field)) { invalidate(); renderCart(); }
    }
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (dialogOpen()) { cancelPendingScans(); scanner.cancel(); captureSnapshot = null; return; }
    if (/^\d$/.test(event.key)) captureField(document.activeElement);
    const outcome = scanner.handleKey(event.key);
    if (outcome.kind === 'scan' || outcome.kind === 'protected-enter') event.preventDefault();
  });
  $('#productSearch').addEventListener('input', ()=>{
    if (!captureSnapshot) API.run(notice, async()=>{const sequence = noticeSequence;await search();if(sequence === noticeSequence) notice.textContent='';});
  });
  $('#productSearch').addEventListener('keydown',event=>{if(event.key==='Enter') event.preventDefault();});
  $('#addFirstResult').addEventListener('click',()=>add(products[0]?.id));
  $('#discount').addEventListener('input',()=>{if(!captureSnapshot){invalidate();renderCart();}});
  $('#quoteSale').addEventListener('click',()=>API.run(notice,async()=>{
    if(scanWorkerActive || scanQueue.length) return;
    if(!cart.size) throw new Error('Adicione produtos ao carrinho.');
    busy=true; lock(true);
    try {
      quote=await API.call('/sales/quote',{method:'POST',body:JSON.stringify({items:[...cart.values()].map(row=>({product_id:row.id,quantity:row.quantity})),discount_cents:API.cents($('#discount').value)})});
      quote.items.forEach(item=>{const row=cart.get(item.product_id);row.price_cents=item.unit_price_cents;row.name=item.name;});
      payments.setTotal(quote.total_cents);
      if (!payments.hasPayments() && quote.total_cents) payments.set([{method:'credit',applied_cents:quote.total_cents,received_cents:quote.total_cents}]);
      $('#quoteNotice').textContent='Valores conferidos. Distribua os pagamentos e confirme.'; notice.textContent='';
    } finally {busy=false;renderCart();}
  }));
  $('#finishSale').addEventListener('click',()=>API.run(notice,async()=>{
    if(busy || scanWorkerActive || scanQueue.length) return;
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
      paymentExpanded = false; clearSearch({focus: false}); syncLayout();
      notice.textContent=`Venda #${sale.number} confirmada: ${API.money(sale.total_cents)}.`;
      $('#receiptLink').href=`receipt.html?id=${encodeURIComponent(sale.id)}`;$('#receiptLink').hidden=false;
    } catch(error) {
      if([400,409,422].includes(error.status)){sessionStorage.removeItem('pdv-pending-checkout');pending=null;invalidate();}
      else error.message+=' Use “Fechar venda / tentar novamente” para consultar o resultado do mesmo pedido. Não inicie outra venda em outro dispositivo.';
      throw error;
    } finally {busy=false;renderCart();if(!pending && !cart.size) $('#productSearch').focus({preventScroll:true});}
  }));
  API.run(notice,async()=>{
    await API.ready();API.header();
    const saved=sessionStorage.getItem('pdv-pending-checkout');
    if(saved){paymentExpanded=true;syncLayout();pending=JSON.parse(saved);if(pending.preview){pending.preview.forEach(item=>cart.set(item.product_id,{...item,id:item.product_id,price_cents:item.unit_price_cents}));$('#discount').value=(pending.body.discount_cents/100).toFixed(2);$('#saleNotes').value=pending.body.notes;payments.set(pending.body.payments);}$('#quoteNotice').textContent='Pedido anterior aguardando confirmação. Os dados estão bloqueados para evitar duplicação.';}
    await search();renderCart();notice.textContent=pending?'Tente novamente para resolver a venda pendente.':'';
  });
  new MutationObserver(()=>{ if (dialogOpen()) cancelPendingScans(); }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','aria-modal']});
})();
