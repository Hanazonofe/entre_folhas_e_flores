const cart = new Map();
    let products = [];
    const database = () => Shop.createStore(window.localStorage, DEFAULT_PRODUCTS);
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    const productSearch = document.querySelector("#productSearch");
    const suggestions = document.querySelector("#suggestions");
    const catalogGrid = document.querySelector("#catalogGrid");
    const cartList = document.querySelector("#cartList");
    const subtotalEl = document.querySelector("#subtotal");
    const finalTotalEl = document.querySelector("#finalTotal");
    const discountEl = document.querySelector("#discount");
    const paymentMethod = document.querySelector("#paymentMethod");
    const cashField = document.querySelector("#cashField");
    const cashReceived = document.querySelector("#cashReceived");
    const changeNotice = document.querySelector("#changeNotice");
    const saleNotice = document.querySelector("#saleNotice");

    function normalize(value) {
      return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    }

    const escapeHtml = Shop.escapeHtml;
    function loadProducts() { return database().readProducts().filter(product => product.status !== "inactive"); }
    function run(action) { return Shop.attempt(saleNotice, action); }

    function similarity(query, text) {
      const q = normalize(query);
      const t = normalize(text);
      if (!q) return 0;
      if (t.includes(q)) return 100 - Math.max(0, t.indexOf(q));
      const tokens = q.split(/\s+/).filter(Boolean);
      const matched = tokens.filter(token => t.includes(token) || token.split("").every(char => t.includes(char))).length;
      return Math.round((matched / Math.max(tokens.length, 1)) * 75);
    }

    function searchProducts(query) {
      const q = normalize(query);
      if (!q) return [];
      const codeMatch = products.find(product => product.code === q || product.barcode === q);
      if (codeMatch) return [codeMatch];

      return products
        .map(product => ({ product, score: Math.max(similarity(q, product.name), similarity(q, product.code), similarity(q, product.barcode)) }))
        .filter(item => item.score >= 35)
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
        .slice(0, 6)
        .map(item => item.product);
    }

    function getProductKey(productId) {
      return String(productId ?? "");
    }

    function addToCart(product) {
      if (!product) return;
      const productKey = getProductKey(product.id);
      const current = cart.get(productKey) || { ...product, id: productKey, quantity: 0 };
      current.quantity += 1;
      cart.set(productKey, current);
      productSearch.value = "";
      suggestions.classList.remove("show");
      saleNotice.textContent = `${product.name} adicionado ao carrinho.`;
      run(renderCart);
      productSearch.focus();
    }

    function updateQuantity(productId, delta) {
      const productKey = getProductKey(productId);
      const item = cart.get(productKey);
      if (!item) return;
      item.quantity += delta;
      if (item.quantity <= 0) cart.delete(productKey);
      run(renderCart);
    }

    function removeItem(productId) {
      cart.delete(getProductKey(productId));
      run(renderCart);
    }

    function getSubtotal() { return cart.size ? Shop.totals([...cart.values()], 0).subtotal : 0; }
    function getDiscount() { return Shop.cents(discountEl.value || "0", "Desconto") / 100; }
    function getFinalTotal() { return cart.size ? Shop.totals([...cart.values()], getDiscount()).total : 0; }
    function saveClosedSale() {
      const sale = Shop.create({ items: [...cart.values()].map(item => ({ id: item.id, code: item.code, barcode: item.barcode, name: item.name, price: item.price, quantity: item.quantity })), discount: getDiscount(), paymentMethod: paymentMethod.value, cashReceived: cashReceived.value });
      const sales = database().readSales();
      database().saveSales([sale, ...sales]);
      return sale;
    }
    const getReceiptHtml = Shop.receiptHtml;

    function printSaleReceipt(sale) {
      const receiptWindow = window.open("", "_blank", "width=380,height=700");
      if (!receiptWindow) {
        saleNotice.textContent = "Venda salva, mas o navegador bloqueou a impressão do comprovante.";
        return;
      }
      receiptWindow.addEventListener("load", () => receiptWindow.print(), { once: true });
      receiptWindow.document.open();
      receiptWindow.document.write(getReceiptHtml(sale));
      receiptWindow.document.close();
    }

    function renderCart() {
      if (!cart.size) {
        cartList.innerHTML = '<div class="empty">Nenhum produto no carrinho.</div>';
      } else {
        cartList.innerHTML = [...cart.values()].map(item => `
          <div class="cart-item">
            <div>
              <strong>${escapeHtml(item.name)}</strong><br />
              <small>${formatter.format(item.price)} cada • ${formatter.format(Shop.cents(item.price) * item.quantity / 100)}</small>
            </div>
            <div class="qty-controls">
              <button class="icon secondary" type="button" data-cart-action="decrease" data-product-id="${escapeHtml(item.id)}" aria-label="Diminuir quantidade">−</button>
              <span class="qty">${item.quantity}</span>
              <button class="icon secondary" type="button" data-cart-action="increase" data-product-id="${escapeHtml(item.id)}" aria-label="Aumentar quantidade">+</button>
              <button class="icon danger" type="button" data-cart-action="remove" data-product-id="${escapeHtml(item.id)}" aria-label="Remover produto">×</button>
            </div>
          </div>
        `).join("");
      }

      subtotalEl.textContent = formatter.format(getSubtotal());
      finalTotalEl.textContent = formatter.format(getFinalTotal());
      run(updateChange);
    }

    function renderSuggestions(results) {
      suggestions.innerHTML = results.map(product => `
        <div class="suggestion" role="option" data-id="${escapeHtml(product.id)}">
          <div><strong>${escapeHtml(product.name)}</strong><small>Cód. ${escapeHtml(product.code || product.id)} • EAN ${escapeHtml(product.barcode || "-")}</small></div>
          <strong>${formatter.format(product.price)}</strong>
        </div>
      `).join("");
      suggestions.classList.toggle("show", results.length > 0);
    }

    function renderCatalog() {
      catalogGrid.innerHTML = products.slice(0, 6).map(product => `
        <article class="product-card">
          <div><strong>${escapeHtml(product.name)}</strong><p>Cód. ${escapeHtml(product.code || product.id)}</p></div>
          <div class="row"><strong>${formatter.format(product.price)}</strong><button type="button" data-add-product-id="${escapeHtml(product.id)}">Adicionar</button></div>
        </article>
      `).join("");
    }

    function updateChange() {
      changeNotice.textContent = "";
      if (paymentMethod.value !== "cash") return;
      if (cashReceived.value === "") { changeNotice.textContent = "Informe o valor recebido para calcular o troco."; return; }
      const received = Shop.cents(cashReceived.value, "Valor recebido");
      const total = Shop.cents(getFinalTotal());
      changeNotice.textContent = received < total ? `Faltam ${formatter.format((total - received) / 100)}.` : `Troco: ${formatter.format((received - total) / 100)}.`;
    }

    productSearch.addEventListener("input", event => renderSuggestions(searchProducts(event.target.value)));
    productSearch.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        const [first] = searchProducts(productSearch.value);
        if (first) addToCart(first);
      }
    });

    suggestions.addEventListener("click", event => {
      const option = event.target.closest(".suggestion");
      if (!option) return;
      const product = products.find(item => String(item.id) === option.dataset.id);
      if (product) addToCart(product);
    });

    catalogGrid.addEventListener("click", event => {
      const button = event.target.closest("[data-add-product-id]");
      if (!button) return;
      const product = products.find(item => String(item.id) === button.dataset.addProductId);
      if (product) addToCart(product);
    });

    cartList.addEventListener("click", event => {
      const button = event.target.closest("[data-cart-action]");
      if (!button) return;
      const productId = button.dataset.productId;
      if (button.dataset.cartAction === "remove") removeItem(productId);
      if (button.dataset.cartAction === "decrease") updateQuantity(productId, -1);
      if (button.dataset.cartAction === "increase") updateQuantity(productId, 1);
    });

    document.querySelector("#addFirstResult").addEventListener("click", () => {
      const [first] = searchProducts(productSearch.value);
      if (first) addToCart(first);
    });

    discountEl.addEventListener("input", () => run(renderCart));
    cashReceived.addEventListener("input", () => run(updateChange));
    paymentMethod.addEventListener("change", () => {
      cashField.classList.toggle("show", paymentMethod.value === "cash");
      run(updateChange);
    });

    document.querySelector("#finishSale").addEventListener("click", () => run(() => {
      Shop.assert(cart.size, "Adicione pelo menos um produto antes de fechar a venda.");
      const sale = saveClosedSale();
      // Clear the paid draft immediately after persistence, even if printing fails.
      cart.clear(); discountEl.value = 0; cashReceived.value = "";
      run(renderCart);
      saleNotice.textContent = `Venda #${sale.id.slice(0, 8)} salva com sucesso: ${formatter.format(sale.total)}.`;
      try { printSaleReceipt(sale); }
      catch { saleNotice.textContent += " Não foi possível imprimir. Reimprima na página de vendas."; }
    }));

    run(() => { products = loadProducts(); renderCatalog(); renderCart(); });
