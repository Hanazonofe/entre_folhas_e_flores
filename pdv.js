    const DEFAULT_PRODUCTS = [
      { id: "1", code: "1", barcode: "789000000001", name: "Suculenta Echeveria", price: 18.90, stock: 12, status: "active" },
      { id: "2", code: "2", barcode: "789000000002", name: "Rosa do Deserto", price: 49.90, stock: 8, status: "active" },
      { id: "3", code: "3", barcode: "789000000003", name: "Orquídea Phalaenopsis", price: 89.90, stock: 6, status: "active" },
      { id: "4", code: "4", barcode: "789000000004", name: "Samambaia Americana", price: 34.50, stock: 10, status: "active" },
      { id: "5", code: "5", barcode: "789000000005", name: "Vaso de Cerâmica Verde", price: 42.00, stock: 15, status: "active" },
      { id: "6", code: "6", barcode: "789000000006", name: "Terra Vegetal 2kg", price: 12.90, stock: 20, status: "active" },
      { id: "7", code: "7", barcode: "789000000007", name: "Adubo Orgânico", price: 16.00, stock: 18, status: "active" },
      { id: "8", code: "8", barcode: "789000000008", name: "Buquê de Girassóis", price: 75.00, stock: 5, status: "active" }
    ];

    const cart = new Map();
    const PRODUCTS_STORAGE_KEY = "entre-folhas-produtos";
    const SALES_STORAGE_KEY = "entre-folhas-vendas";
    const products = loadProducts();
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

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      })[character]);
    }

    function loadProducts() {
      try {
        const savedProducts = JSON.parse(localStorage.getItem(PRODUCTS_STORAGE_KEY)) || [];
        const source = savedProducts.length ? savedProducts : DEFAULT_PRODUCTS;
        return source
          .filter(product => product.status !== "inactive")
          .map(product => ({
            id: String(product.id || product.code || product.barcode),
            code: String(product.code || product.id || ""),
            barcode: String(product.barcode || product.ean || product.code || ""),
            name: product.name,
            price: Number(product.price) || 0,
            stock: Number(product.stock) || 0,
            status: product.status || "active"
          }));
      } catch {
        return DEFAULT_PRODUCTS;
      }
    }

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
      renderCart();
      productSearch.focus();
    }

    function updateQuantity(productId, delta) {
      const productKey = getProductKey(productId);
      const item = cart.get(productKey);
      if (!item) return;
      item.quantity += delta;
      if (item.quantity <= 0) cart.delete(productKey);
      renderCart();
    }

    function removeItem(productId) {
      cart.delete(getProductKey(productId));
      renderCart();
    }

    function getSubtotal() {
      return [...cart.values()].reduce((total, item) => total + item.price * item.quantity, 0);
    }

    function getDiscount() {
      return Math.max(0, Number(discountEl.value) || 0);
    }

    function getFinalTotal() {
      return Math.max(0, getSubtotal() - getDiscount());
    }

    function getSavedSales() {
      try {
        return JSON.parse(localStorage.getItem(SALES_STORAGE_KEY)) || [];
      } catch {
        return [];
      }
    }

    function saveClosedSale(total) {
      const received = paymentMethod.value === "cash" ? Number(cashReceived.value) || 0 : total;
      const sale = {
        id: window.crypto?.randomUUID ? window.crypto.randomUUID() : String(Date.now()),
        createdAt: new Date().toISOString(),
        status: "completed",
        paymentMethod: paymentMethod.value,
        paymentLabel: paymentMethod.options[paymentMethod.selectedIndex].text,
        subtotal: getSubtotal(),
        discount: getDiscount(),
        total,
        cashReceived: received,
        change: Math.max(0, received - total),
        items: [...cart.values()].map(item => ({
          id: item.id,
          code: item.code,
          barcode: item.barcode,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        }))
      };

      const sales = getSavedSales();
      sales.unshift(sale);
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
      return sale;
    }

    function getReceiptHtml(sale) {
      const rows = sale.items.map(item => `
        <tr>
          <td>
            <strong>${item.name}</strong><br>
            <small>Cód. ${item.code || item.id || "-"} • EAN ${item.barcode || "-"}</small>
          </td>
          <td>${item.quantity}</td>
          <td>${formatter.format(Number(item.price) || 0)}</td>
          <td>${formatter.format((Number(item.price) || 0) * Number(item.quantity || 0))}</td>
        </tr>
      `).join("");

      return `
        <!doctype html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Comprovante ${sale.id}</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            * { box-sizing: border-box; }
            body { width: 72mm; margin: 0 auto; font: 11px Arial, sans-serif; color: #111; }
            h1, p { margin: 0; text-align: center; }
            h1 { font-size: 15px; }
            .line { border-top: 1px dashed #111; margin: 8px 0; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { padding: 4px 0; text-align: left; vertical-align: top; }
            th:nth-child(1), td:nth-child(1) { width: 47%; padding-right: 3mm; }
            th:nth-child(2), td:nth-child(2) { width: 10%; text-align: center; }
            th:nth-child(3), td:nth-child(3) { width: 20%; padding-left: 2mm; text-align: right; white-space: nowrap; }
            th:nth-child(4), td:nth-child(4) { width: 23%; padding-left: 2.5mm; text-align: right; white-space: nowrap; }
            .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
            .total { font-weight: 700; font-size: 13px; }
            small { font-size: 9px; }
          </style>
        </head>
        <body>
          <h1>Entre Folhas e Flores</h1>
          <p>Comprovante de venda</p>
          <p>#${sale.id.slice(0, 8)} • ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(sale.createdAt))}</p>
          <div class="line"></div>
          <table>
            <thead><tr><th>Produto</th><th>Qtd</th><th>Un.</th><th>Total</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="line"></div>
          <div class="totals">
            <div><span>Subtotal</span><strong>${formatter.format(sale.subtotal)}</strong></div>
            <div><span>Desconto</span><strong>${formatter.format(sale.discount || 0)}</strong></div>
            <div class="total"><span>Total</span><strong>${formatter.format(sale.total)}</strong></div>
            <div><span>Pagamento</span><strong>${sale.paymentLabel}</strong></div>
            ${sale.paymentMethod === "cash" ? `<div><span>Recebido</span><strong>${formatter.format(sale.cashReceived || 0)}</strong></div><div><span>Troco</span><strong>${formatter.format(sale.change || 0)}</strong></div>` : ""}
          </div>
          <div class="line"></div>
          <p>Obrigado pela preferência!</p>
        </body>
        </html>
      `;
    }

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
              <small>${formatter.format(item.price)} cada • ${formatter.format(item.price * item.quantity)}</small>
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
      updateChange();
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
      if (paymentMethod.value !== "cash") {
        changeNotice.textContent = "";
        return;
      }
      const received = Number(cashReceived.value) || 0;
      const total = getFinalTotal();
      if (!received) {
        changeNotice.textContent = "Informe o valor recebido para calcular o troco.";
      } else if (received < total) {
        changeNotice.textContent = `Faltam ${formatter.format(total - received)}.`;
      } else {
        changeNotice.textContent = `Troco: ${formatter.format(received - total)}.`;
      }
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

    discountEl.addEventListener("input", renderCart);
    cashReceived.addEventListener("input", updateChange);
    paymentMethod.addEventListener("change", () => {
      cashField.classList.toggle("show", paymentMethod.value === "cash");
      updateChange();
    });

    document.querySelector("#finishSale").addEventListener("click", () => {
      const total = getFinalTotal();
      if (!cart.size) {
        saleNotice.textContent = "Adicione pelo menos um produto antes de fechar a venda.";
        return;
      }
      if (paymentMethod.value === "cash" && (Number(cashReceived.value) || 0) < total) {
        saleNotice.textContent = "O valor recebido em dinheiro é menor que o total final.";
        return;
      }
      const sale = saveClosedSale(total);
      printSaleReceipt(sale);
      saleNotice.innerHTML = `Venda <strong>#${sale.id.slice(0, 8)}</strong> fechada com ${paymentMethod.options[paymentMethod.selectedIndex].text}: ${formatter.format(total)}. <a href="vendas.html">Ver registro</a>`;
      cart.clear();
      discountEl.value = 0;
      cashReceived.value = "";
      renderCart();
    });

    renderCatalog();
    renderCart();
