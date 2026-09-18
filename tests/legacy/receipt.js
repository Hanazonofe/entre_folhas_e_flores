Shop.receiptHtml = function (sale) {
      Shop.validateSales([sale]);
      const formatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
      const formatDate = value => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
      const rows = sale.items.map(item => `
        <tr>
          <td>
            <strong>${Shop.escapeHtml(item.name)}</strong><br>
            <small>Cód. ${Shop.escapeHtml(item.code || item.id || "-")} • EAN ${Shop.escapeHtml(item.barcode || "-")}</small>
          </td>
          <td>${Number(item.quantity)}</td>
          <td>${formatter.format(Number(item.price) || 0)}</td>
          <td>${formatter.format(Shop.cents(item.price) * Number(item.quantity) / 100)}</td>
        </tr>
      `).join("");

      return `
        <!doctype html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8">
          <title>Comprovante ${Shop.escapeHtml(sale.id)}</title>
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
            .sale-status { font-weight: bold; margin: 8px 0; border: 2px solid; padding: 6px; }
            td { overflow-wrap: anywhere; }
          </style>
        </head>
        <body>
          <h1>Entre Folhas e Flores</h1>
          <p>Comprovante de venda</p>
          <p class="sale-status">${sale.status === "cancelled" ? "VENDA CANCELADA" : Shop.statuses[sale.status]}</p>
          <p>#${Shop.escapeHtml(sale.id.slice(0, 8))} • ${formatDate(sale.createdAt)}</p>
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
            <div><span>Pagamento</span><strong>${Shop.escapeHtml(sale.paymentLabel)}</strong></div>
            ${sale.paymentMethod === "cash" ? `<div><span>Recebido</span><strong>${formatter.format(sale.cashReceived || 0)}</strong></div><div><span>Troco</span><strong>${formatter.format(sale.change || 0)}</strong></div>` : ""}
          </div>
          <div class="line"></div>
          <p>Obrigado pela preferência!</p>
        </body>
        </html>
      `;
    };
