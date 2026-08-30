
    const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    const database = () => Shop.createStore(window.localStorage, DEFAULT_PRODUCTS);
    let productSnapshot;
    function run(action, target = formNotice) { return Shop.attempt(target, action); }

    const productForm = document.querySelector("#productForm");
    const productList = document.querySelector("#productList");
    const productSearch = document.querySelector("#productSearch");
    const formNotice = document.querySelector("#formNotice");
    const listNotice = document.querySelector("#listNotice");
    const importFile = document.querySelector("#importFile");

    function normalize(value) {
      return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }

    const escapeHtml = Shop.escapeHtml;

    function similarity(query, text) {
      const q = normalize(query);
      const t = normalize(text);
      if (!q) return 0;
      if (t.includes(q)) return 100 - Math.max(0, t.indexOf(q));
      const tokens = q.split(/\s+/).filter(Boolean);
      const matched = tokens.filter(token => t.includes(token) || token.split("").every(char => t.includes(char))).length;
      return Math.round((matched / Math.max(tokens.length, 1)) * 75);
    }

    function getProducts() { return database().readProducts(); }
    function saveProducts(products) { database().saveProducts(products); }

    function getSearchableText(product) {
      return `${product.code} ${product.barcode} ${product.name}`;
    }

    function searchProducts(query) {
      const products = getProducts();
      const q = normalize(query);
      if (!q) return products;
      return products
        .map(product => ({ product, score: Math.max(similarity(q, getSearchableText(product)), similarity(q, product.barcode), similarity(q, product.code)) }))
        .filter(item => item.score >= 35)
        .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
        .map(item => item.product);
    }

    function renderProducts() {
      const products = searchProducts(productSearch.value);
      if (!products.length) {
        productList.innerHTML = '<div class="empty">Nenhum produto encontrado.</div>';
        return;
      }

      productList.innerHTML = products.map(product => `
        <article class="product-card">
          <div class="product-header">
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              <div class="meta">Código ${escapeHtml(product.code || "-")} • EAN ${escapeHtml(product.barcode || "-")}</div>
            </div>
            <span class="status ${product.status === "inactive" ? "inactive" : ""}">${product.status === "inactive" ? "Inativo" : "Ativo"}</span>
          </div>
          <div class="row">
            <strong>${formatter.format(Number(product.price) || 0)}</strong>
            <span class="meta">Estoque: ${Number(product.stock) || 0}</span>
          </div>
          <div class="actions">
            <button class="small secondary" type="button" data-product-action="edit" data-product-id="${escapeHtml(product.id)}">Editar</button>
            <button class="small ${product.status === "inactive" ? "secondary" : "warning"}" type="button" data-product-action="toggle" data-product-id="${escapeHtml(product.id)}">${product.status === "inactive" ? "Reativar" : "Inativar"}</button>
          </div>
        </article>
      `).join("");
    }

    function clearForm() {
      productForm.reset();
      productSnapshot = undefined;
      document.querySelector("#editingId").value = "";
      document.querySelector("#stock").value = 0;
      document.querySelector("#status").value = "active";
    }

    function editProduct(id) {
      const product = getProducts().find(item => item.id === id);
      Shop.assert(product, "Produto não encontrado.");
      productSnapshot = JSON.stringify(product);
      document.querySelector("#editingId").value = product.id;
      document.querySelector("#code").value = product.code || "";
      document.querySelector("#barcode").value = product.barcode || "";
      document.querySelector("#name").value = product.name || "";
      document.querySelector("#price").value = product.price || 0;
      document.querySelector("#stock").value = product.stock || 0;
      document.querySelector("#status").value = product.status || "active";
      formNotice.textContent = `Editando ${product.name}.`;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function toggleProductStatus(id) {
      Shop.assert(getProducts().some(product => product.id === id), "Produto não encontrado.");
      const products = getProducts().map(product => product.id === id ? {
        ...product,
        status: product.status === "inactive" ? "active" : "inactive"
      } : product);
      saveProducts(products);
      run(renderProducts, listNotice);
      listNotice.textContent = "Status do produto atualizado.";
    }

    productForm.addEventListener("submit", event => {
      event.preventDefault();
      run(() => {
      const editingId = document.querySelector("#editingId").value;
      const code = document.querySelector("#code").value.trim();
      const barcode = document.querySelector("#barcode").value.trim();
      const products = getProducts();
      if (editingId) Shop.assert(JSON.stringify(products.find(item => item.id === editingId)) === productSnapshot, "O produto mudou. Abra a edição novamente.");
      const product = {
        id: editingId || code || barcode || String(Date.now()),
        code,
        barcode,
        name: document.querySelector("#name").value.trim(),
        price: Shop.cents(document.querySelector("#price").value, "Preço") / 100,
        stock: Math.max(0, Number(document.querySelector("#stock").value) || 0),
        status: document.querySelector("#status").value
      };

      const duplicated = products.some(item => item.id !== editingId && (item.code === product.code || (product.barcode && item.barcode === product.barcode)));
      if (duplicated) {
        formNotice.textContent = "Já existe produto com esse código ou EAN.";
        return;
      }

      const updated = editingId ? products.map(item => item.id === editingId ? product : item) : [product, ...products];
      saveProducts(updated);
      clearForm();
      run(renderProducts, listNotice);
      formNotice.textContent = "Produto salvo com sucesso.";
      });
    });

    function parseCsvLine(line, separator) {
      const values = [];
      let current = "";
      let quoted = false;
      for (const char of line) {
        if (char === '"') quoted = !quoted;
        else if (char === separator && !quoted) { values.push(current.trim()); current = ""; }
        else current += char;
      }
      values.push(current.trim());
      return values;
    }

    function importSpreadsheetText(text) {
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return 0;
      const separator = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
      const headers = parseCsvLine(lines[0], separator).map(normalize);
      const indexOf = names => names.map(name => headers.indexOf(normalize(name))).find(index => index >= 0);
      const indexes = {
        code: indexOf(["codigo", "código", "code"]),
        barcode: indexOf(["codigo ean", "código ean", "ean", "barcode"]),
        name: indexOf(["nome", "name", "produto"]),
        price: indexOf(["preco", "preço", "price"]),
        stock: indexOf(["estoque", "stock"]),
        status: indexOf(["status"])
      };

      const imported = lines.slice(1).map(line => {
        const columns = parseCsvLine(line, separator);
        const code = columns[indexes.code] || "";
        const barcode = columns[indexes.barcode] || "";
        return {
          id: code || barcode || String(Date.now() + Math.random()),
          code,
          barcode,
          name: columns[indexes.name] || "Produto sem nome",
          price: Shop.cents(String(columns[indexes.price] || "0").replace(",", "."), "Preço") / 100,
          stock: Number(columns[indexes.stock] || 0),
          status: normalize(columns[indexes.status]) === "inativo" || normalize(columns[indexes.status]) === "inactive" ? "inactive" : "active"
        };
      });

      Shop.validateProducts(imported);
      const current = getProducts();
      const merged = [...imported, ...current.filter(product => !imported.some(item => item.code === product.code || (item.barcode && item.barcode === product.barcode)))];
      saveProducts(merged);
      run(renderProducts, listNotice);
      return imported.length;
    }

    document.querySelector("#clearForm").addEventListener("click", clearForm);
    productSearch.addEventListener("input", () => run(renderProducts, listNotice));
    productList.addEventListener("click", event => {
      const button = event.target.closest("[data-product-action]");
      if (!button) return;
      if (button.dataset.productAction === "edit") run(() => editProduct(button.dataset.productId));
      if (button.dataset.productAction === "toggle") run(() => toggleProductStatus(button.dataset.productId), listNotice);
    });
    document.querySelector("#importButton").addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", event => {
      const [file] = event.target.files;
      if (!file) return;
      if (/\.xlsx?$/.test(file.name.toLowerCase())) {
        listNotice.textContent = "Arquivo Excel selecionado. Para importar sem biblioteca externa, salve a planilha como CSV e importe novamente.";
        importFile.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => { listNotice.textContent = "Não foi possível ler o arquivo."; };
      reader.onload = () => run(() => {
        const total = importSpreadsheetText(String(reader.result || ""));
        listNotice.textContent = `${total} produto(s) importado(s).`;
      }, listNotice);
      reader.readAsText(file, "utf-8");
    });

    run(renderProducts, listNotice);
