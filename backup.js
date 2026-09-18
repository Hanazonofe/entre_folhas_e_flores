/* Loaded on every business page. Import is replacement, never a merge. */
(() => {
  const panel = document.createElement("section");
  panel.className = "card";
  panel.style.gridColumn = "1 / -1";
  panel.innerHTML = `
    <h2>Backup local</h2>
    <p>Produtos e vendas ficam somente neste navegador. Guarde o arquivo em um local seguro; ele contém todo o histórico.</p>
    <button type="button" id="exportBackup">Exportar backup atual</button>
    <label for="backupFile">Selecionar backup JSON para substituir os dados</label>
    <input id="backupFile" type="file" accept=".json,application/json" />
    <p id="backupPreview">Selecione um arquivo para conferir seu conteúdo antes de restaurar.</p>
    <button type="button" id="restoreBackup" disabled>Substituir produtos e vendas</button>
    <p id="backupNotice" class="notice" role="status" aria-live="polite"></p>`;
  document.querySelector("main").append(panel);
  const notice = panel.querySelector("#backupNotice");
  const preview = panel.querySelector("#backupPreview");
  const restore = panel.querySelector("#restoreBackup");
  const fileInput = panel.querySelector("#backupFile");
  const database = () => Shop.createStore(window.localStorage, DEFAULT_PRODUCTS);
  let exportedFingerprint = null;
  let pending = null;
  let selection = 0;
  panel.querySelector("#exportBackup").addEventListener("click", () => Shop.attempt(notice, () => {
    exportedFingerprint = null;
    const backup = database().exportBackup();
    const url = URL.createObjectURL(new Blob([backup.text], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `entre-folhas-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.append(link);
    try { link.click(); exportedFingerprint = backup.fingerprint; }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    notice.textContent = "Download do backup iniciado. Confirme que o arquivo foi salvo antes de substituir os dados.";
    restore.disabled = !pending;
  }));
  fileInput.addEventListener("change", async () => {
    const currentSelection = ++selection;
    pending = null; restore.disabled = true;
    const [file] = fileInput.files;
    preview.textContent = "Selecione um arquivo para conferir seu conteúdo antes de restaurar.";
    if (!file) return;
    try {
      const parsed = Shop.parseBackup(await file.text());
      if (currentSelection !== selection) return;
      pending = parsed;
      preview.textContent = `${parsed.products.length} produto(s) e ${parsed.sales.length} venda(s). Exportado em ${new Date(parsed.exportedAt).toLocaleString("pt-BR")}. A restauração substituirá todos os produtos e vendas atuais.`;
      notice.textContent = exportedFingerprint ? "Confira os dados e guarde o backup exportado antes de continuar." : "Exporte primeiro um backup dos dados atuais para habilitar a substituição.";
      restore.disabled = !exportedFingerprint;
    } catch (error) {
      if (currentSelection === selection) notice.textContent = error.message || "Não foi possível ler o backup.";
    }
  });
  restore.addEventListener("click", () => Shop.attempt(notice, () => {
    Shop.assert(pending, "Selecione um backup válido.");
    const counts = `${pending.products.length} produto(s) e ${pending.sales.length} venda(s)`;
    if (!confirm(`Você guardou o backup atual? Substituir TODOS os produtos e vendas por ${counts}? Esta ação não mescla registros e descartará formulários e carrinho abertos nesta página.`)) return;
    database().importBackup(pending, exportedFingerprint);
    notice.textContent = "Backup restaurado com sucesso. Recarregando a página.";
    location.reload();
  }));
})();
