/* Shared local data rules. No stock movements and no server synchronization. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Shop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const KEYS = { products: "entre-folhas-produtos", sales: "entre-folhas-vendas" };
  const JOURNAL = "entre-folhas-backup-recovery-v1";
  const payments = { credit: "Cartão de crédito", debit: "Débito", pix: "Pix", cash: "Dinheiro" };
  const statuses = { completed: "Concluída", edited: "Alterada", cancelled: "Cancelada" };
  const clone = value => JSON.parse(JSON.stringify(value));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const text = (value, field, required = false) => assert(typeof value === "string" && (!required || value.trim()), `${field} inválido.`);
  const optionalText = (value, field) => { if (value !== undefined) text(value, field); };
  const date = value => assert(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)), "Data inválida.");
  function number(value, field) {
    assert((typeof value === "number" || (typeof value === "string" && value.trim() !== "")) && Number.isFinite(Number(value)) && Number(value) >= 0, `${field} deve ser um número finito e não negativo.`);
    return Number(value);
  }
  function cents(value, field = "Valor") {
    const n = number(value, field);
    const result = Math.round((n + Number.EPSILON) * 100);
    assert(Number.isSafeInteger(result), `${field} excede o limite permitido.`);
    return result;
  }
  function quantity(value) {
    const n = number(value, "Quantidade");
    assert(Number.isSafeInteger(n) && n > 0, "Quantidade deve ser um inteiro positivo.");
    return n;
  }
  function itemsValid(items) {
    assert(Array.isArray(items) && items.length > 0, "A venda precisa ter itens.");
    items.forEach(item => {
      assert(object(item), "Item inválido.");
      text(item.id, "Identificador do item", true);
      text(item.name, "Nome do item", true);
      optionalText(item.code, "Código"); optionalText(item.barcode, "EAN");
      cents(item.price, "Preço"); quantity(item.quantity);
    });
  }
  function totals(items, discount = 0) {
    itemsValid(items);
    const subtotal = items.reduce((sum, item) => sum + cents(item.price, "Preço") * quantity(item.quantity), 0);
    assert(Number.isSafeInteger(subtotal), "Subtotal excede o limite permitido.");
    const discountCents = cents(discount, "Desconto");
    return { subtotal: subtotal / 100, discount: discountCents / 100, total: Math.max(0, subtotal - discountCents) / 100 };
  }
  function payment(method, total, received) {
    assert(Object.hasOwn(payments, method), "Meio de pagamento inválido.");
    const totalCents = cents(total, "Total");
    const receivedCents = method === "cash" ? cents(received, "Valor recebido") : totalCents;
    assert(receivedCents >= totalCents, "O valor recebido em dinheiro é menor que o total final.");
    return { paymentMethod: method, paymentLabel: payments[method], cashReceived: receivedCents / 100, change: method === "cash" ? (receivedCents - totalCents) / 100 : 0 };
  }
  function validateProduct(product) {
    assert(object(product), "Produto inválido.");
    text(product.id, "Identificador do produto", true); text(product.name, "Nome do produto", true);
    optionalText(product.code, "Código"); optionalText(product.barcode, "EAN");
    cents(product.price, "Preço");
    // Only validate representation. Stock availability is outside this change.
    assert((typeof product.stock === "number" || (typeof product.stock === "string" && product.stock.trim() !== "")) && Number.isFinite(Number(product.stock)), "Estoque inválido.");
    assert(["active", "inactive"].includes(product.status), "Status de produto inválido.");
  }
  function validateSale(sale, allowHistory = true) {
    assert(object(sale), "Venda inválida.");
    text(sale.id, "Identificador da venda", true); date(sale.createdAt);
    if (sale.updatedAt !== undefined) date(sale.updatedAt);
    assert(Object.hasOwn(statuses, sale.status), "Status de venda inválido.");
    assert(Object.hasOwn(payments, sale.paymentMethod), "Meio de pagamento inválido.");
    text(sale.paymentLabel, "Descrição do pagamento");
    itemsValid(sale.items);
    for (const key of ["subtotal", "total"]) cents(sale[key], key);
    for (const key of ["discount", "cashReceived", "change"]) if (sale[key] !== undefined) cents(sale[key], key);
    optionalText(sale.notes, "Observações"); optionalText(sale.statusBeforeCancellation, "Status anterior");
    if (sale.history !== undefined) {
      assert(allowHistory && Array.isArray(sale.history), "Histórico inválido.");
      const ids = new Set();
      sale.history.forEach(event => {
        assert(object(event), "Evento inválido."); text(event.id, "Identificador do evento", true); date(event.at);
        assert(!ids.has(event.id), "Identificador de evento duplicado."); ids.add(event.id);
        assert(["created", "edited", "cancelled", "reactivated"].includes(event.type), "Tipo de evento inválido.");
        assert(object(event.changes), "Alterações do evento inválidas.");
        if (event.type === "created") assert(event.changes.before === null, "Evento de criação inválido.");
        else { validateSale(event.changes.before, false); assert(event.changes.before.id === sale.id, "Venda do evento inválida."); }
        validateSale(event.changes.after, false);
        assert(event.changes.after.id === sale.id, "Venda do evento inválida.");
      });
    }
  }
  function validateList(list, validator) {
    assert(Array.isArray(list), "Os dados precisam ser uma lista.");
    const ids = new Set();
    list.forEach(record => { validator(record); assert(!ids.has(record.id), "Identificador duplicado."); ids.add(record.id); });
    return list;
  }
  const validateProducts = list => validateList(list, validateProduct);
  const validateSales = list => validateList(list, validateSale);
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function id() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function snapshot(sale) { const { history, ...fields } = sale; return clone(fields); }
  function recordEvent(before, after, type, at = new Date().toISOString()) {
    const result = clone(after);
    result.history = [...clone(before?.history || []), { id: id(), type, at, changes: { before: before ? snapshot(before) : null, after: snapshot(after) } }];
    validateSale(result);
    return result;
  }
  function transition(sale, action, at = new Date().toISOString()) {
    validateSale(sale);
    const next = clone(sale);
    if (action === "cancelled") {
      assert(sale.status !== "cancelled", "Esta venda já está cancelada.");
      next.statusBeforeCancellation = sale.status; next.status = "cancelled";
    } else if (action === "reactivated") {
      assert(sale.status === "cancelled", "Esta venda não está cancelada.");
      next.status = ["completed", "edited"].includes(sale.statusBeforeCancellation) ? sale.statusBeforeCancellation : "completed";
      delete next.statusBeforeCancellation;
    } else throw new Error("Operação inválida.");
    next.updatedAt = at;
    return recordEvent(sale, next, action, at);
  }
  function edit(sale, fields, at = new Date().toISOString()) {
    validateSale(sale); assert(sale.status !== "cancelled", "Reative a venda antes de alterá-la.");
    const values = totals(fields.items, fields.discount);
    text(fields.notes, "Observações");
    const next = { ...sale, items: clone(fields.items), ...values, ...payment(fields.paymentMethod, values.total, fields.cashReceived), notes: fields.notes, status: "edited", updatedAt: at };
    return recordEvent(sale, next, "edited", at);
  }
  function create(fields, at = new Date().toISOString()) {
    const values = totals(fields.items, fields.discount);
    const sale = { id: id(), createdAt: at, status: "completed", items: clone(fields.items), ...values, ...payment(fields.paymentMethod, values.total, fields.cashReceived) };
    return recordEvent(null, sale, "created", at);
  }
  function parseBackup(raw) {
    let backup; try { backup = JSON.parse(raw); } catch { throw new Error("Arquivo de backup não é um JSON válido."); }
    assert(object(backup) && backup.version === 1, "Versão de backup não suportada.");
    date(backup.exportedAt); validateProducts(backup.products); validateSales(backup.sales);
    return backup;
  }
  function createStore(storage, defaultProducts = []) {
    validateProducts(defaultProducts);
    function restoreRaw(raw) {
      for (const kind of ["products", "sales"]) {
        if (raw[kind] === null) storage.removeItem(KEYS[kind]);
        else storage.setItem(KEYS[kind], raw[kind]);
      }
    }
    function recover() {
      const raw = storage.getItem(JOURNAL);
      if (raw === null) return;
      let undo;
      try { undo = JSON.parse(raw); } catch { throw new Error("Registro de recuperação inválido. Preserve os dados e procure suporte."); }
      assert(object(undo) && ["products", "sales"].every(key => undo[key] === null || typeof undo[key] === "string"), "Registro de recuperação inválido.");
      try { restoreRaw(undo); storage.removeItem(JOURNAL); }
      catch { throw new Error("Recuperação pendente. Libere espaço/acesso ao armazenamento e tente novamente; nenhuma nova gravação foi permitida."); }
    }
    function rawSnapshot() { recover(); return { products: storage.getItem(KEYS.products), sales: storage.getItem(KEYS.sales) }; }
    function decode(raw, kind) {
      const fallback = kind === "products" ? defaultProducts : [];
      let data;
      try { data = raw === null ? clone(fallback) : JSON.parse(raw); (kind === "products" ? validateProducts : validateSales)(data); }
      catch (error) { throw new Error(`Dados de ${kind === "products" ? "produtos" : "vendas"} inválidos. Nada foi sobrescrito. ${error.message}`); }
      return data;
    }
    function readAll() { const raw = rawSnapshot(); return { products: decode(raw.products, "products"), sales: decode(raw.sales, "sales") }; }
    function save(kind, records) {
      readAll(); // Never overwrite or bypass corrupt data in either collection.
      (kind === "products" ? validateProducts : validateSales)(records);
      try { storage.setItem(KEYS[kind], JSON.stringify(records)); }
      catch { throw new Error("Não foi possível salvar. A operação não foi concluída; confira o espaço e a permissão de armazenamento."); }
    }
    function updateSale(saleId, transform, expected) {
      const sales = readAll().sales;
      const index = sales.findIndex(sale => sale.id === saleId);
      assert(index !== -1, "Venda não encontrada. Atualize a página.");
      if (expected !== undefined) assert(JSON.stringify(sales[index]) === expected, "A venda mudou desde a abertura do formulário. Feche e abra a edição novamente.");
      const next = transform(clone(sales[index]));
      sales[index] = next; save("sales", sales); return next;
    }
    function exportBackup() {
      const data = readAll();
      return { text: JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2), fingerprint: JSON.stringify(data) };
    }
    function importBackup(backup, exportedFingerprint) {
      parseBackup(JSON.stringify(backup));
      assert(exportedFingerprint && exportedFingerprint === JSON.stringify(readAll()), "Exporte um backup dos dados atuais antes de substituir. Os dados podem ter mudado desde a última exportação.");
      const undo = rawSnapshot();
      try { storage.setItem(JOURNAL, JSON.stringify(undo)); }
      catch { throw new Error("Não foi possível preparar a recuperação. Nenhum dado foi substituído."); }
      try {
        storage.setItem(KEYS.products, JSON.stringify(backup.products));
        storage.setItem(KEYS.sales, JSON.stringify(backup.sales));
        storage.removeItem(JOURNAL);
      } catch {
        try { restoreRaw(undo); storage.removeItem(JOURNAL); }
        catch { throw new Error("Importação falhou; recuperação pendente. Não use o PDV até liberar o armazenamento e recarregar a página."); }
        throw new Error("Importação não concluída. Os dados anteriores foram restaurados.");
      }
    }
    return { readAll, readProducts: () => readAll().products, readSales: () => readAll().sales, saveProducts: rows => save("products", rows), saveSales: rows => save("sales", rows), updateSale, exportBackup, importBackup };
  }
  // UI errors remain visible without clearing drafts, carts or file selection.
  function attempt(notice, action) {
    try { return action(); }
    catch (error) { notice.textContent = error.message || "Operação não concluída."; return undefined; }
  }
  return { KEYS, JOURNAL, payments, statuses, clone, assert, cents, quantity, totals, payment, validateProducts, validateSales, escapeHtml, id, transition, edit, create, parseBackup, createStore, attempt };
});
