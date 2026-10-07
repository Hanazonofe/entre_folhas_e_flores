/* Shared payment editor for checkout and administrative sale edits. */
class PaymentEditor {
  constructor(root, totalCents = null) {
    this.root = root; this.serial = 0; this.totalCents = Number.isInteger(totalCents) ? totalCents : null;
    root.innerHTML = '<h3>Pagamentos</h3><div class="payment-rows"></div><div class="payment-actions"><button type="button" class="secondary" data-add-payment>Adicionar pagamento</button><button type="button" class="secondary" data-recalculate>Recalcular</button></div><p class="payment-summary" data-payment-summary aria-live="polite"></p><p class="payment-error" data-payment-error role="alert"></p>';
    root.querySelector('[data-add-payment]').addEventListener('click', () => this.add());
    root.querySelector('[data-recalculate]').addEventListener('click', () => this.summary());
  }
  setTotal(totalCents) {
    if (!Number.isInteger(totalCents) || totalCents < 0) throw new TypeError('O total da venda deve ser informado em centavos inteiros.');
    this.totalCents = totalCents; this.summary();
  }
  add(payment = {method:'credit',applied_cents:0,received_cents:0}) {
    const row = document.createElement('div'); row.className = 'payment-row'; const id = ++this.serial;
    row.innerHTML = `<label>Meio ${id}<select data-method>${Object.entries(PaymentEditor.labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Valor aplicado ${id}<input data-applied type="number" min="0.01" step="0.01" required></label><label data-cash-label>Recebido em dinheiro ${id}<input data-received type="number" min="0" step="0.01"></label><button type="button" class="secondary" data-remove>Remover pagamento ${id}</button><span data-change></span>`;
    row.querySelector('[data-method]').value = payment.method;
    row.querySelector('[data-applied]').value = (payment.applied_cents / 100).toFixed(2);
    row.lastValidApplied = payment.applied_cents > 0 ? payment.applied_cents : null;
    row.querySelector('[data-received]').value = payment.method === 'cash' ? (payment.received_cents / 100).toFixed(2) : '';
    const update = () => { const cash = row.querySelector('[data-method]').value === 'cash'; row.querySelector('[data-cash-label]').hidden = !cash; row.querySelector('[data-received]').required = cash; this.summary(); };
    row.querySelector('[data-method]').addEventListener('change', () => { row.querySelector('[data-received]').value = ''; update(); });
    row.querySelector('[data-applied]').addEventListener('input', () => this.onAppliedInput(row));
    row.querySelector('[data-received]').addEventListener('input', update);
    row.querySelector('[data-remove]').addEventListener('click', () => { row.remove(); this.redistributeFirst(); });
    this.root.querySelector('.payment-rows').append(row); update();
  }
  set(payments, totalCents = this.totalCents) {
    if (totalCents !== null && totalCents !== undefined) this.setTotal(totalCents);
    this.root.querySelector('.payment-rows').replaceChildren(); payments.forEach(row => this.add(row)); this.summary();
  }
  hasPayments() { return this.root.querySelectorAll('.payment-row').length > 0; }
  cents(value) { try { return API.cents(value); } catch { return NaN; } }
  appliedRows() { return [...this.root.querySelectorAll('.payment-row')].map(row => ({row,cents:this.cents(row.querySelector('[data-applied]').value)})); }
  onAppliedInput(row) {
    const rows=this.appliedRows();
    if(rows[0]?.row===row) {
      const amount=rows[0].cents;
      if(Number.isSafeInteger(amount) && amount>0 && (this.totalCents===null || amount<=this.totalCents)) row.lastValidApplied=amount;
      return this.summary();
    }
    this.redistributeFirst();
  }
  redistributeFirst() {
    const rows=this.appliedRows();
    if(!rows.length || this.totalCents===null) return this.summary();
    if(rows.length===1) { this.setApplied(rows[0].row,this.totalCents); return this.summary(); }
    const others=rows.slice(1).reduce((sum,entry)=>sum+entry.cents,0);
    if(Number.isFinite(others) && others<=this.totalCents) this.setApplied(rows[0].row,this.totalCents-others);
    else if(others>this.totalCents && rows[0].row.lastValidApplied!==null) this.setApplied(rows[0].row,rows[0].row.lastValidApplied);
    this.summary();
  }
  setApplied(row,cents) { row.querySelector('[data-applied]').value=(cents/100).toFixed(2); if(cents>0) row.lastValidApplied=cents; }
  values() {
    const values=[...this.root.querySelectorAll('.payment-row')].map(row=>{
      const method=row.querySelector('[data-method]').value, applied_cents=API.cents(row.querySelector('[data-applied]').value), received_cents=method==='cash'?API.cents(row.querySelector('[data-received]').value):applied_cents;
      if(applied_cents<=0) throw new Error('Cada parcela precisa ter um valor positivo.');
      if(this.totalCents!==null && applied_cents>this.totalCents) throw new Error('O valor de um meio não pode ser maior que o total da venda.');
      if(received_cents<applied_cents) throw new Error('Valor recebido em dinheiro insuficiente.');
      return {method,applied_cents,received_cents};
    });
    if(values.filter(row=>row.method==='cash').length>1) throw new Error('Use somente uma parcela em dinheiro.');
    if(this.totalCents!==null && values.reduce((sum,row)=>sum+row.applied_cents,0)!==this.totalCents) throw new Error('A soma dos pagamentos deve ser igual ao total.');
    return values;
  }
  summary() {
    const summary=this.root.querySelector('[data-payment-summary]'), error=this.root.querySelector('[data-payment-error]'), rows=this.appliedRows(), applied=rows.reduce((sum,entry)=>sum+entry.cents,0), difference=this.totalCents===null||!Number.isFinite(applied)?null:this.totalCents-applied;
    error.textContent='';
    if(this.totalCents!==null && rows.some(entry=>entry.cents>this.totalCents)) error.textContent='O valor de um meio não pode ser maior que o total da venda.';
    else if(this.totalCents!==null && rows.length>1 && rows.slice(1).reduce((sum,entry)=>sum+entry.cents,0)>this.totalCents) error.textContent='Os demais meios excedem o total da venda.';
    for(const entry of rows) {
      const change=entry.row.querySelector('[data-change]'), cash=entry.row.querySelector('[data-method]').value==='cash', received=this.cents(entry.row.querySelector('[data-received]').value);
      change.textContent=cash && Number.isFinite(received) && Number.isFinite(entry.cents) && received>=entry.cents ? `Troco: ${API.money(received-entry.cents)}` : '';
    }
    if(!error.textContent) { try { this.values(); } catch(validation) { error.textContent=validation.message; } }
    if(difference===null) summary.textContent='Informe valores monetários válidos.';
    else if(difference>0) summary.textContent=`Faltam ${API.money(difference)}`;
    else if(difference<0) summary.textContent=`Excedem ${API.money(-difference)}`;
    else summary.textContent='Valores conferem';
  }
}
PaymentEditor.labels = {credit:'Cartão de crédito',debit:'Débito',pix:'Pix',cash:'Dinheiro'};
