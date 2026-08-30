    const database = () => Shop.createStore(window.localStorage, DEFAULT_PRODUCTS);
    const escapeHtml = Shop.escapeHtml;
    let editingSnapshot;
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const paymentLabels = Shop.payments;

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

    function getSales() { return database().readSales(); }
    function run(action) { return Shop.attempt(editModal.classList.contains("show") ? document.querySelector("#editNotice") : notice, action); }

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
      const currentTotal = activeSales.reduce((total, sale) => total + Shop.cents(sale.total), 0) / 100;
      const totalsByPayment = activeSales.reduce((totals, sale) => {
        totals[sale.paymentMethod] = (totals[sale.paymentMethod] || 0) + Shop.cents(sale.total);
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
                <strong>${formatter.format((totalsByPayment[method] || 0) / 100)}</strong>
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
      run(renderSales);
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
          <button class="sale-toggle" type="button" data-sale-action="toggle" data-sale-id="${escapeHtml(sale.id)}" aria-expanded="${expanded}" aria-controls="sale-details-${escapeHtml(sale.id)}">
            <div class="sale-header sale-summary">
              <div>
                <h3>Venda #${escapeHtml(sale.id.slice(0, 8))}</h3>
                <div class="meta">Feita em ${formatDate(sale.createdAt)} • ${escapeHtml(sale.paymentLabel)} • ${itemCount} item(ns)</div>
                ${sale.updatedAt ? `<div class="meta">Última alteração em ${formatDate(sale.updatedAt)}</div>` : ""}
              </div>
              <div class="actions">
                <span class="status ${escapeHtml(sale.status)}">${getStatusLabel(sale.status)}</span>
                <strong class="total-final">${formatter.format(sale.total)}</strong>
                <span class="chevron" aria-hidden="true">⌄</span>
              </div>
            </div>
          </button>

          <div class="sale-details" id="sale-details-${escapeHtml(sale.id)}">
            <div class="items">
              ${sale.items.map(item => `
                <div class="item-line">
                  <div><strong>${escapeHtml(item.name)}</strong><br><span class="meta">Cód. ${escapeHtml(item.code || item.id || "-")} • EAN ${escapeHtml(item.barcode || "-")} • ${formatter.format(Number(item.price))} cada</span></div>
                  <strong>${Number(item.quantity)} un. • ${formatter.format(Shop.cents(item.price) * Number(item.quantity) / 100)}</strong>
                </div>
              `).join("")}
            </div>

            ${sale.notes ? `<p><strong>Observações:</strong> ${escapeHtml(sale.notes)}</p>` : ""}

            <details class="sale-history">
              <summary>Histórico de alterações (${(sale.history || []).length})</summary>
              <p class="meta">Registro local: pode ser manipulado fora da aplicação e não identifica um usuário autenticado.</p>
              ${(sale.history || []).map(event => `<details><summary>${escapeHtml(({ created: "Criação", edited: "Edição", cancelled: "Cancelamento", reactivated: "Reativação" })[event.type])} • ${formatDate(event.at)}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(JSON.stringify(event.changes, null, 2))}</pre></details>`).join("") || '<p>Sem eventos registrados nesta versão. As observações antigas foram preservadas.</p>'}
            </details>
            <div class="totals">
              <div class="row"><span>Subtotal</span><strong>${formatter.format(sale.subtotal)}</strong></div>
              <div class="row"><span>Desconto</span><strong>${formatter.format(sale.discount || 0)}</strong></div>
              ${sale.paymentMethod === "cash" ? `<div class="row"><span>Recebido</span><strong>${formatter.format(sale.cashReceived ?? sale.total)}</strong></div><div class="row"><span>Troco</span><strong>${formatter.format(sale.change || 0)}</strong></div>` : ""}
              <div class="row total-final"><span>Total</span><span>${formatter.format(sale.total)}</span></div>
            </div>

            <div class="actions">
              <button class="small secondary" type="button" data-sale-action="print" data-sale-id="${escapeHtml(sale.id)}">Imprimir</button>
              <button class="small secondary" type="button" data-sale-action="edit" data-sale-id="${escapeHtml(sale.id)}" ${sale.status === "cancelled" ? "disabled" : ""}>Alterar</button>
              ${sale.status === "cancelled"
                ? `<button class="small secondary" type="button" data-sale-action="reactivate" data-sale-id="${escapeHtml(sale.id)}">Reativar</button>`
                : `<button class="small warning" type="button" data-sale-action="cancel" data-sale-id="${escapeHtml(sale.id)}">Cancelar</button>`}
            </div>
          </div>
        </article>
      `}).join("");
    }

    const getReceiptHtml = Shop.receiptHtml;

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
      database().updateSale(id, sale => Shop.transition(sale, "cancelled"));
      notice.textContent = "Venda cancelada com sucesso.";
      run(renderSales);
    }

    function reactivateSale(id) {
      if (!confirm("Tem certeza que deseja reativar esta venda?")) return;
      database().updateSale(id, sale => Shop.transition(sale, "reactivated"));
      notice.textContent = "Venda reativada com sucesso.";
      run(renderSales);
    }

    function openEdit(id) {
      const sale = getSales().find(item => item.id === id);
      Shop.assert(sale, "Venda não encontrada.");
      Shop.assert(sale.status !== "cancelled", "Reative a venda antes de alterá-la.");
      editingSnapshot = JSON.stringify(sale);
      document.querySelector("#editNotice").textContent = "";
      document.querySelector("#editCashReceived").value = sale.paymentMethod === "cash" ? (sale.cashReceived ?? "") : "";
      document.querySelector("#saleId").value = sale.id;
      document.querySelector("#editPayment").value = sale.paymentMethod;
      document.querySelector("#editDiscount").value = sale.discount || 0;
      document.querySelector("#editNotes").value = sale.notes || "";
      editItems.innerHTML = sale.items.map((item, index) => `
        <div class="edit-grid">
          <div>
            <label for="item-name-${index}">Produto</label>
            <input id="item-name-${index}" data-field="name" data-index="${index}" value="${escapeHtml(item.name)}" />
          </div>
          <div>
            <label for="item-qty-${index}">Qtd.</label>
            <input id="item-qty-${index}" data-field="quantity" data-index="${index}" type="number" min="1" step="1" value="${escapeHtml(item.quantity)}" />
          </div>
          <div>
            <label for="item-price-${index}">Preço</label>
            <input id="item-price-${index}" data-field="price" data-index="${index}" type="number" min="0" step="0.01" value="${escapeHtml(item.price)}" />
          </div>
        </div>
      `).join("");
      editModal.dataset.items = JSON.stringify(sale.items);
      editModal.classList.add("show");
      run(updateEditTotals);
    }

    function getEditedItems() {
      const original = JSON.parse(editModal.dataset.items || "[]");
      return original.map((item, index) => ({
        ...item,
        name: document.querySelector(`[data-index="${index}"][data-field="name"]`).value.trim() || item.name,
        quantity: Shop.quantity(document.querySelector(`[data-index="${index}"][data-field="quantity"]`).value),
        price: Shop.cents(document.querySelector(`[data-index="${index}"][data-field="price"]`).value, "Preço") / 100
      }));
    }

    function updateEditTotals() {
      document.querySelector("#editChange").textContent = "";
      const values = Shop.totals(getEditedItems(), document.querySelector("#editDiscount").value || "0");
      editSubtotal.textContent = formatter.format(values.subtotal);
      editTotal.textContent = formatter.format(values.total);
      const isCash = document.querySelector("#editPayment").value === "cash";
      document.querySelector("#editCashField").hidden = !isCash;
      document.querySelector("#editCashReceived").required = isCash;
      document.querySelector("#editNotice").textContent = "";
      const raw = document.querySelector("#editCashReceived").value;
      document.querySelector("#editChange").textContent = !isCash ? "" : raw === "" ? "Informe o valor recebido." : `Troco: ${formatter.format(Shop.payment("cash", values.total, raw).change)}`;
    }

    editForm.addEventListener("input", () => run(updateEditTotals));
    document.querySelector("#editPayment").addEventListener("change", () => {
      document.querySelector("#editCashReceived").value = "";
      document.querySelector("#editChange").textContent = "";
      run(updateEditTotals);
    });
    editForm.addEventListener("submit", event => {
      event.preventDefault();
      run(() => {
        const id = document.querySelector("#saleId").value;
        database().updateSale(id, sale => Shop.edit(sale, {
          items: getEditedItems(),
          discount: document.querySelector("#editDiscount").value || "0",
          paymentMethod: document.querySelector("#editPayment").value,
          cashReceived: document.querySelector("#editCashReceived").value,
          notes: document.querySelector("#editNotes").value.trim()
        }), editingSnapshot);
        editModal.classList.remove("show");
        notice.textContent = "Venda alterada com sucesso.";
        run(renderSales);
      });
    });

    salesList.addEventListener("click", event => {
      const button = event.target.closest("[data-sale-action]");
      if (!button) return;
      const actions = { toggle: toggleSale, print: printSaleReceipt, edit: openEdit, cancel: cancelSale, reactivate: reactivateSale };
      if (Object.hasOwn(actions, button.dataset.saleAction)) run(() => actions[button.dataset.saleAction](button.dataset.saleId));
    });
    document.querySelector("#closeModal").addEventListener("click", () => editModal.classList.remove("show"));
    searchSales.addEventListener("input", () => run(renderSales));
    statusFilter.addEventListener("change", () => run(renderSales));
    totalDateFilter.addEventListener("change", () => run(renderSales));
    run(renderSales);

