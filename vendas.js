    const SALES_STORAGE_KEY = "entre-folhas-vendas";
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const paymentLabels = { credit: "Cartão de crédito", debit: "Débito", pix: "Pix", cash: "Dinheiro" };

    const salesList = document.querySelector("#salesList");
    const summaryGrid = document.querySelector("#summaryGrid");
    const searchSales = document.querySelector("#searchSales");
    const statusFilter = document.querySelector("#statusFilter");
    const totalDateFilter = document.querySelector("#totalDateFilter");
    const notice = document.querySelector("#notice");
    const editModal = document.querySelector("#editModal");
    const editForm = document.querySelector("#editForm");
    const editItems = document.querySelector("#editItems");
    const editSubtotal = document.querySelector("#editSubtotal");
    const editTotal = document.querySelector("#editTotal");
    const expandedSales = new Set();

    function normalize(value) {
      return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }

    function getSales() {
      try {
        return JSON.parse(localStorage.getItem(SALES_STORAGE_KEY)) || [];
      } catch {
        return [];
      }
    }

    function saveSales(sales) {
      localStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(sales));
    }

    function formatDate(isoDate) {
      return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(isoDate));
    }

    function getSaleDateKey(isoDate) {
      const date = new Date(isoDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function formatDateOnly(dateKey) {
      const [year, month, day] = dateKey.split("-");
      return `${day}/${month}/${year}`;
    }

    function getSaleSubtotal(sale) {
      return sale.items.reduce((total, item) => total + Number(item.price) * Number(item.quantity), 0);
    }

    function getStatusLabel(status) {
      return ({ completed: "Concluída", edited: "Alterada", cancelled: "Cancelada" })[status] || "Concluída";
    }

    function getFilteredSales() {
      const query = normalize(searchSales.value);
      const status = statusFilter.value;
      const totalDate = totalDateFilter.value;
      return getSales().filter(sale => {
        const text = normalize([
          sale.id,
          sale.status,
          sale.paymentLabel,
          sale.items.map(item => `${item.name} ${item.code || ""} ${item.barcode || ""}`).join(" ")
        ].join(" "));
        const matchesQuery = !query || text.includes(query);
        const matchesStatus = status === "all" || sale.status === status;
        const matchesDate = !totalDate || getSaleDateKey(sale.createdAt) === totalDate;
        return matchesQuery && matchesStatus && matchesDate;
      });
    }

    function renderSummary(sales) {
      const activeSales = sales.filter(sale => sale.status !== "cancelled");
      const currentTotal = activeSales.reduce((total, sale) => total + Number(sale.total || 0), 0);
      const totalsByPayment = activeSales.reduce((totals, sale) => {
        totals[sale.paymentMethod] = (totals[sale.paymentMethod] || 0) + Number(sale.total || 0);
        return totals;
      }, {});

      summaryGrid.innerHTML = `
        <section class="summary-card">
          <span class="meta">Total atual das vendas listadas${totalDateFilter.value ? ` em ${formatDateOnly(totalDateFilter.value)}` : ""}</span>
          <strong>${formatter.format(currentTotal)}</strong>
          <span class="meta">Canceladas não entram no total.</span>
        </section>
        <section class="summary-card">
          <span class="meta">Total por meio de pagamento</span>
          <div class="payment-totals">
            ${Object.entries(paymentLabels).map(([method, label]) => `
              <div class="payment-pill">
                <span>${label}</span>
                <strong>${formatter.format(totalsByPayment[method] || 0)}</strong>
              </div>
            `).join("")}
          </div>
        </section>
      `;
    }

    function toggleSale(id) {
      if (expandedSales.has(id)) {
        expandedSales.delete(id);
      } else {
        expandedSales.add(id);
      }
      renderSales();
    }

    function renderSales() {
      const sales = getFilteredSales();
      renderSummary(sales);
      if (!sales.length) {
        salesList.innerHTML = '<div class="empty">Nenhuma venda encontrada. Feche uma venda na tela de PDV para criar o primeiro registro.</div>';
        return;
      }

      salesList.innerHTML = sales.map(sale => {
        const expanded = expandedSales.has(sale.id);
        const itemCount = sale.items.reduce((total, item) => total + Number(item.quantity), 0);
        return `
        <article class="sale-card ${expanded ? "expanded" : ""}">
          <button class="sale-toggle" type="button" onclick="toggleSale('${sale.id}')" aria-expanded="${expanded}" aria-controls="sale-details-${sale.id}">
            <div class="sale-header sale-summary">
              <div>
                <h3>Venda #${sale.id.slice(0, 8)}</h3>
                <div class="meta">Feita em ${formatDate(sale.createdAt)} • ${sale.paymentLabel} • ${itemCount} item(ns)</div>
                ${sale.updatedAt ? `<div class="meta">Última alteração em ${formatDate(sale.updatedAt)}</div>` : ""}
              </div>
              <div class="actions">
                <span class="status ${sale.status}">${getStatusLabel(sale.status)}</span>
                <strong class="total-final">${formatter.format(sale.total)}</strong>
                <span class="chevron" aria-hidden="true">⌄</span>
              </div>
            </div>
          </button>

          <div class="sale-details" id="sale-details-${sale.id}">
            <div class="items">
              ${sale.items.map(item => `
                <div class="item-line">
                  <div><strong>${item.name}</strong><br><span class="meta">Cód. ${item.code || item.id || "-"} • EAN ${item.barcode || "-"} • ${formatter.format(Number(item.price))} cada</span></div>
                  <strong>${item.quantity} un. • ${formatter.format(Number(item.price) * Number(item.quantity))}</strong>
                </div>
              `).join("")}
            </div>

            ${sale.notes ? `<p><strong>Observações:</strong> ${sale.notes}</p>` : ""}

            <div class="totals">
              <div class="row"><span>Subtotal</span><strong>${formatter.format(sale.subtotal)}</strong></div>
              <div class="row"><span>Desconto</span><strong>${formatter.format(sale.discount || 0)}</strong></div>
              ${sale.paymentMethod === "cash" ? `<div class="row"><span>Recebido</span><strong>${formatter.format(sale.cashReceived || sale.total)}</strong></div><div class="row"><span>Troco</span><strong>${formatter.format(sale.change || 0)}</strong></div>` : ""}
              <div class="row total-final"><span>Total</span><span>${formatter.format(sale.total)}</span></div>
            </div>

            <div class="actions">
              <button class="small secondary" type="button" onclick="printSaleReceipt('${sale.id}')">Imprimir</button>
              <button class="small secondary" type="button" onclick="openEdit('${sale.id}')" ${sale.status === "cancelled" ? "disabled" : ""}>Alterar</button>
              <button class="small warning" type="button" onclick="cancelSale('${sale.id}')" ${sale.status === "cancelled" ? "disabled" : ""}>Cancelar</button>
            </div>
          </div>
        </article>
      `}).join("");
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
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 3px 0; text-align: left; vertical-align: top; }
            th:nth-child(n+2), td:nth-child(n+2) { text-align: right; }
            .totals div { display: flex; justify-content: space-between; margin: 3px 0; }
            .total { font-weight: 700; font-size: 13px; }
            small { font-size: 9px; }
          </style>
        </head>
        <body>
          <h1>Entre Folhas e Flores</h1>
          <p>Comprovante de venda</p>
          <p>#${sale.id.slice(0, 8)} • ${formatDate(sale.createdAt)}</p>
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

    function printSaleReceipt(id) {
      const sale = getSales().find(item => item.id === id);
      if (!sale) return;
      const receiptWindow = window.open("", "_blank", "width=380,height=700");
      if (!receiptWindow) {
        notice.textContent = "O navegador bloqueou a abertura do comprovante para impressão.";
        return;
      }
      receiptWindow.addEventListener("load", () => receiptWindow.print(), { once: true });
      receiptWindow.document.open();
      receiptWindow.document.write(getReceiptHtml(sale));
      receiptWindow.document.close();
    }

    function cancelSale(id) {
      if (!confirm("Tem certeza que deseja cancelar esta venda?")) return;
      const sales = getSales().map(sale => sale.id === id ? {
        ...sale,
        status: "cancelled",
        updatedAt: new Date().toISOString(),
        notes: `${sale.notes ? `${sale.notes}\n` : ""}Venda cancelada.`
      } : sale);
      saveSales(sales);
      notice.textContent = "Venda cancelada com sucesso.";
      renderSales();
    }

    function openEdit(id) {
      const sale = getSales().find(item => item.id === id);
      if (!sale) return;
      document.querySelector("#saleId").value = sale.id;
      document.querySelector("#editPayment").value = sale.paymentMethod;
      document.querySelector("#editDiscount").value = sale.discount || 0;
      document.querySelector("#editNotes").value = sale.notes || "";
      editItems.innerHTML = sale.items.map((item, index) => `
        <div class="edit-grid">
          <div>
            <label for="item-name-${index}">Produto</label>
            <input id="item-name-${index}" data-field="name" data-index="${index}" value="${item.name}" />
          </div>
          <div>
            <label for="item-qty-${index}">Qtd.</label>
            <input id="item-qty-${index}" data-field="quantity" data-index="${index}" type="number" min="1" step="1" value="${item.quantity}" />
          </div>
          <div>
            <label for="item-price-${index}">Preço</label>
            <input id="item-price-${index}" data-field="price" data-index="${index}" type="number" min="0" step="0.01" value="${item.price}" />
          </div>
        </div>
      `).join("");
      editModal.dataset.items = JSON.stringify(sale.items);
      updateEditTotals();
      editModal.classList.add("show");
    }

    function getEditedItems() {
      const original = JSON.parse(editModal.dataset.items || "[]");
      return original.map((item, index) => ({
        ...item,
        name: document.querySelector(`[data-index="${index}"][data-field="name"]`).value.trim() || item.name,
        quantity: Math.max(1, Number(document.querySelector(`[data-index="${index}"][data-field="quantity"]`).value) || 1),
        price: Math.max(0, Number(document.querySelector(`[data-index="${index}"][data-field="price"]`).value) || 0)
      }));
    }

    function updateEditTotals() {
      const subtotal = getEditedItems().reduce((total, item) => total + item.price * item.quantity, 0);
      const discount = Math.max(0, Number(document.querySelector("#editDiscount").value) || 0);
      editSubtotal.textContent = formatter.format(subtotal);
      editTotal.textContent = formatter.format(Math.max(0, subtotal - discount));
    }

    editForm.addEventListener("input", updateEditTotals);
    editForm.addEventListener("submit", event => {
      event.preventDefault();
      const id = document.querySelector("#saleId").value;
      const items = getEditedItems();
      const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0);
      const discount = Math.max(0, Number(document.querySelector("#editDiscount").value) || 0);
      const total = Math.max(0, subtotal - discount);
      const paymentMethod = document.querySelector("#editPayment").value;

      const sales = getSales().map(sale => sale.id === id ? {
        ...sale,
        items,
        subtotal,
        discount,
        total,
        paymentMethod,
        paymentLabel: paymentLabels[paymentMethod],
        status: "edited",
        updatedAt: new Date().toISOString(),
        notes: document.querySelector("#editNotes").value.trim()
      } : sale);

      saveSales(sales);
      editModal.classList.remove("show");
      notice.textContent = "Venda alterada com sucesso.";
      renderSales();
    });

    document.querySelector("#closeModal").addEventListener("click", () => editModal.classList.remove("show"));
    searchSales.addEventListener("input", renderSales);
    statusFilter.addEventListener("change", renderSales);
    totalDateFilter.addEventListener("change", renderSales);
    renderSales();
