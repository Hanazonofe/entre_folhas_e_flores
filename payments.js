/* Shared payment editor for checkout and administrative sale edits. */
class PaymentEditor {
  constructor(root) {
    this.root = root; this.serial = 0;
    root.innerHTML = '<h3>Pagamentos</h3><div class="payment-rows"></div><button type="button" class="secondary" data-add-payment>Adicionar pagamento</button><p class="payment-summary" aria-live="polite"></p>';
    root.querySelector('[data-add-payment]').addEventListener('click', () => this.add());
    root.addEventListener('input', () => this.summary());
  }
  add(payment = {method:'credit',applied_cents:0,received_cents:0}) {
    const row = document.createElement('div'); row.className = 'payment-row';
    const id = ++this.serial;
    row.innerHTML = `<label>Meio ${id}<select data-method>${Object.entries(PaymentEditor.labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Valor aplicado ${id}<input data-applied type="number" min="0.01" step="0.01" required></label><label data-cash-label>Recebido em dinheiro ${id}<input data-received type="number" min="0" step="0.01"></label><button type="button" class="secondary" data-remove>Remover pagamento ${id}</button><span data-change></span>`;
    row.querySelector('[data-method]').value = payment.method;
    row.querySelector('[data-applied]').value = (payment.applied_cents / 100).toFixed(2);
    row.querySelector('[data-received]').value = payment.method === 'cash' ? (payment.received_cents / 100).toFixed(2) : '';
    const update = () => { const cash = row.querySelector('[data-method]').value === 'cash'; row.querySelector('[data-cash-label]').hidden = !cash; row.querySelector('[data-received]').required = cash; this.summary(); };
    row.querySelector('[data-method]').addEventListener('change', () => { row.querySelector('[data-received]').value = ''; update(); });
    row.querySelector('[data-remove]').addEventListener('click', () => { row.remove(); this.summary(); });
    this.root.querySelector('.payment-rows').append(row); update();
  }
  set(payments) { this.root.querySelector('.payment-rows').replaceChildren(); payments.forEach(row => this.add(row)); this.summary(); }
  values() {
    return [...this.root.querySelectorAll('.payment-row')].map(row => {
      const method = row.querySelector('[data-method]').value;
      const applied_cents = API.cents(row.querySelector('[data-applied]').value);
      const received_cents = method === 'cash' ? API.cents(row.querySelector('[data-received]').value) : applied_cents;
      if (applied_cents <= 0) throw new Error('Cada parcela precisa ter um valor positivo.');
      if (received_cents < applied_cents) throw new Error('Valor recebido em dinheiro insuficiente.');
      return {method,applied_cents,received_cents};
    });
  }
  summary() {
    const target = this.root.querySelector('.payment-summary');
    this.root.querySelectorAll('[data-change]').forEach(el => { el.textContent = ''; });
    try {
      const rows = this.values();
      if (rows.filter(row => row.method === 'cash').length > 1) throw new Error('Use somente uma parcela em dinheiro.');
      target.textContent = `Aplicado: ${API.money(rows.reduce((sum,row)=>sum+row.applied_cents,0))} · Troco: ${API.money(rows.reduce((sum,row)=>sum+row.received_cents-row.applied_cents,0))}`;
    } catch(error) { target.textContent = error.message; }
  }
}
PaymentEditor.labels = {credit:'Cartão de crédito',debit:'Débito',pix:'Pix',cash:'Dinheiro'};
