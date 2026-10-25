(() => {
  const $ = selector => document.querySelector(selector), notice = $('#saleNotice');
  const cart = new Map(); let products = [], quote = null, pending = null, busy = false, searchSequence = 0;
  let scanQueue = [], scanWorkerActive = false, scanGeneration = 0, noticeSequence = 0;
  let quoteGeneration = 0;
  let captureSnapshot = null, navigationReady = false, navigationInProgress = false;
  const mobileLayout = window.matchMedia('(max-width: 920px)');
  let catalogProducts = [];
  const paymentDialog = $('#paymentDialog');
  function syncLayout() {
    $('#catalogGrid').hidden = mobileLayout.matches && !$('#productSearch').value.trim();
    $('#togglePayment').disabled = !cart.size || busy || !!pending || scanWorkerActive;
    $('#emptyCartHelp').hidden = !!cart.size;
  }
  function openPayment() {
    if (!cart.size || busy || pending || paymentDialog.open) return;
    cancelPendingScans();
    resetBilling();
    paymentDialog.showModal();
    $('#closePayment').focus({preventScroll:true});
  }
  function closePayment() {
    if (busy || pending) { $('#paymentNotice').textContent = 'Aguarde a confirmação do pedido antes de sair do pagamento.'; return; }
    resetBilling();
    resetModalCapture();
    paymentDialog.close();
    renderCart();
    $('#togglePayment').focus({preventScroll:true});
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
  $('#togglePayment').addEventListener('click', openPayment);
  $('#closePayment').addEventListener('click', closePayment);
  $('#backToCart').addEventListener('click', closePayment);
  paymentDialog.addEventListener('cancel', event => { event.preventDefault(); closePayment(); });
  mobileLayout.addEventListener('change', () => { syncLayout(); renderCart(); });
  syncLayout();
  let payments = new PaymentEditor($('#paymentEditor'));
  function resetBilling() {
    if (pending || busy) return false;
    $('#discount').value = '0';
    $('#saleNotes').value = '';
    payments = new PaymentEditor($('#paymentEditor'));
    invalidate();
    $('#paymentNotice').textContent = '';
    return true;
  }
  function runFinancial(action) {
    return API.run(notice, action).finally(() => { $('#paymentNotice').textContent = notice.textContent; });
  }
  function lock(value) { const locked = value || scanWorkerActive; document.querySelectorAll('main input, main select, main textarea, main button, #paymentDialog input, #paymentDialog select, #paymentDialog textarea, #paymentDialog button').forEach(el => { el.disabled = locked; }); $('#finishSale').disabled = scanWorkerActive || busy || (!pending && !quote); syncLayout(); }
  function invalidate() { quoteGeneration++; quote = null; $('#finishSale').disabled = true; $('#quoteNotice').textContent = 'Confira os valores no servidor antes de fechar.'; }
  function renderCart() {
    $('#cartList').innerHTML = [...cart.values()].map(row => `<div class="cart-item"><div><strong>${API.esc(row.name)}</strong><p>${API.money(row.price_cents)} cada</p></div><div class="qty-controls"><button type="button" aria-label="Diminuir quantidade de ${API.esc(row.name)}" class="secondary" data-cart="less" data-id="${API.esc(row.id)}">−</button><span>${row.quantity}</span><button type="button" aria-label="Aumentar quantidade de ${API.esc(row.name)}" class="secondary" data-cart="more" data-id="${API.esc(row.id)}">+</button><button type="button" aria-label="Remover ${API.esc(row.name)} do carrinho" class="danger" data-cart="remove" data-id="${API.esc(row.id)}">Remover</button></div></div>`).join('') || '<div class="empty"><strong>Nenhum produto no carrinho.</strong><p>Busque um produto ou use o leitor de barras para começar.</p></div>';
    const subtotal = [...cart.values()].reduce((sum,row)=>sum+row.price_cents*row.quantity,0);
    $('#subtotal').textContent = API.money(subtotal);
    let estimatedTotal = null;
    try { estimatedTotal = Math.max(0, subtotal - API.cents($('#discount').value)); } catch { /* A conferência exibirá o erro do desconto inválido. */ }
    $('#totalLabel').textContent = quote ? 'Total conferido' : 'Total estimado';
    $('#finalTotal').textContent = quote ? API.money(quote.total_cents) : estimatedTotal !== null ? API.money(estimatedTotal) : 'A confirmar';
    $('#summaryLabel').textContent = quote ? 'Total conferido' : 'Total estimado';
    $('#summaryTotal').textContent = API.money(quote ? quote.total_cents : estimatedTotal === null ? subtotal : estimatedTotal);
    lock(!!pending || busy);
    syncLayout();
    if (navigationReady && !pending && !busy && typeof SaleNavigation !== 'undefined') SaleNavigation.save([...cart.values()]);
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
    if (snapshot.field.setSelectionRange && snapshot.selectionStart !== null) { try { snapshot.field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch { /* number inputs have no selection API */ } }
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
  // The modal classifier discards scanner input without adding or queuing products.
  // Defer input handlers until manual typing is established, so PaymentEditor cannot
  // redistribute money from the temporary scanner characters before restoration.
  let modalSnapshot = null;
  function releaseModalManual() {
    const snapshot = modalSnapshot; modalSnapshot = null;
    if (snapshot) snapshot.field.dispatchEvent(new Event('input', {bubbles:true}));
  }
  const modalScanner = new BarcodeScanner.TemporalBarcodeClassifier({
    onScan: () => {
      const snapshot = modalSnapshot; modalSnapshot = null;
      if (!snapshot) return;
      snapshot.field.value = snapshot.value;
      if (snapshot.selectionStart !== null && snapshot.field.setSelectionRange) {
        try { snapshot.field.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd); } catch { /* number input */ }
      }
    },
    onManual: releaseModalManual
  });
  function resetModalCapture() { modalScanner.cancel(); modalSnapshot = null; scanner.cancel(); captureSnapshot = null; }
  document.addEventListener('input', event => {
    if (modalSnapshot?.field === event.target) event.stopImmediatePropagation();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
    if (dialogOpen()) {
      cancelPendingScans(); scanner.cancel(); captureSnapshot = null;
      const field = document.activeElement;
      if (/^[a-zA-Z0-9]$/.test(event.key) && field?.matches?.('input, textarea') && !modalSnapshot) {
        modalSnapshot = {field,value:field.value,selectionStart:field.selectionStart,selectionEnd:field.selectionEnd};
      }
      const outcome = modalScanner.handleKey(event.key);
      if (outcome.kind === 'scan' || outcome.kind === 'protected-enter') event.preventDefault();
      return;
    }
    modalScanner.cancel(); modalSnapshot = null;
    if (/^[a-zA-Z0-9]$/.test(event.key)) captureField(document.activeElement);
    const outcome = scanner.handleKey(event.key);
    if (outcome.kind === 'scan' || outcome.kind === 'protected-enter') event.preventDefault();
  }, true);
  $('#productSearch').addEventListener('input', ()=>{
    if (!captureSnapshot) API.run(notice, async()=>{const sequence = noticeSequence;await search();if(sequence === noticeSequence) notice.textContent='';});
  });
  $('#productSearch').addEventListener('keydown',event=>{if(event.key==='Enter') event.preventDefault();});
  $('#addFirstResult').addEventListener('click',()=>add(products[0]?.id));
  $('#discount').addEventListener('input',()=>{if(!captureSnapshot){invalidate();renderCart();}});
  $('#quoteSale').addEventListener('click',()=>runFinancial(async()=>{
    if(busy || pending || scanWorkerActive || scanQueue.length) return;
    if(!cart.size) throw new Error('Adicione produtos ao carrinho.');
    busy=true; lock(true);
    const generation = ++quoteGeneration; quote = null;
    try {
      const response = await API.call('/sales/quote',{method:'POST',body:JSON.stringify({items:[...cart.values()].map(row=>({product_id:row.id,quantity:row.quantity})),discount_cents:API.cents($('#discount').value)})});
      if (generation !== quoteGeneration) return;
      quote = response;
      quote.items.forEach(item=>{const row=cart.get(item.product_id);row.price_cents=item.unit_price_cents;row.name=item.name;});
      payments.setTotal(quote.total_cents);
      if (!payments.hasPayments() && quote.total_cents) payments.set([{method:'credit',applied_cents:quote.total_cents,received_cents:quote.total_cents}]);
      $('#quoteNotice').textContent='Valores conferidos. Distribua os pagamentos e confirme.'; notice.textContent='';
    } finally {busy=false;renderCart();}
  }));
  $('#finishSale').addEventListener('click',()=>runFinancial(async()=>{
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
      sessionStorage.removeItem('pdv-pending-checkout'); if (typeof SaleNavigation !== 'undefined') SaleNavigation.clear(); pending=null;quote=null;cart.clear();payments.set([]);$('#quoteNotice').textContent='Confira os valores antes de fechar a próxima venda.';$('#discount').value='0';$('#saleNotes').value='';
      payments = new PaymentEditor($('#paymentEditor')); resetModalCapture(); paymentDialog.close(); clearSearch({focus: false}); syncLayout();
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
    if(saved){pending=JSON.parse(saved);paymentDialog.showModal();if(pending.preview){pending.preview.forEach(item=>cart.set(item.product_id,{...item,id:item.product_id,price_cents:item.unit_price_cents}));$('#discount').value=(pending.body.discount_cents/100).toFixed(2);$('#saleNotes').value=pending.body.notes;payments.set(pending.body.payments);}$('#quoteNotice').textContent='Pedido anterior aguardando confirmação. Os dados estão bloqueados para evitar duplicação.';}
    if (typeof SaleNavigation !== 'undefined') {
      const restored = await SaleNavigation.connect(API.user.id, recovered => {
        if (pending && sessionStorage.getItem('pdv-pending-checkout')) return;
        pending = null;
        quote = null; $('#discount').value = '0'; $('#saleNotes').value = '';
        payments = new PaymentEditor($('#paymentEditor'));
        invalidate(); resetModalCapture(); cancelPendingScans();
        if (paymentDialog.open) paymentDialog.close();
        cart.clear(); recovered.forEach(row => cart.set(row.id,row));
        renderCart();
      });
      if (!pending) restored.forEach(row => cart.set(row.id,row));
      navigationReady = true;
      if (!SaleNavigation.available && !pending) notice.textContent = 'Recuperação do carrinho indisponível nesta aba. Mantenha a venda aberta.';
    }
    await search();renderCart();
    notice.textContent = pending ? 'Tente novamente para resolver a venda pendente.' : typeof SaleNavigation !== 'undefined' && !SaleNavigation.available ? 'Recuperação do carrinho indisponível nesta aba. Mantenha a venda aberta.' : '';
  });
  document.addEventListener('click', async event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || (destination.pathname === location.pathname && destination.search === location.search) || !/\/(pdv|produtos|vendas|admin|receipt)\.html$/.test(destination.pathname)) return;
    if (pending || busy) { event.preventDefault(); $('#paymentNotice').textContent = notice.textContent = 'Resolva a operação em andamento antes de sair da venda.'; return; }
    if (!cart.size) return;
    event.preventDefault();
    if (navigationInProgress) return;
    navigationInProgress = true;
    cancelPendingScans(); resetModalCapture();
    try {
      const confirmed = await API.confirm('Os produtos serão mantidos ao voltar. Desconto, pagamentos e observações serão descartados. Deseja sair?');
      resetModalCapture();
      if (!confirmed) return;
      if (typeof SaleNavigation === 'undefined' || !SaleNavigation.save([...cart.values()])) throw new Error('Não foi possível preservar o carrinho. A navegação foi cancelada; mantenha esta venda aberta.');
      resetBilling();
      if (paymentDialog.open) paymentDialog.close();
      location.href = destination.href;
    } catch (error) { notice.textContent = $('#paymentNotice').textContent = error.message; }
    finally { navigationInProgress = false; }
  }, true);
  window.addEventListener?.('pagehide', () => {
    cancelPendingScans(); resetModalCapture();
    if (!pending) invalidate();
  });
  new MutationObserver(()=>{ if (dialogOpen()) cancelPendingScans(); }).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open','aria-modal']});
})();
