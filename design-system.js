'use strict';
const demoDialog = document.querySelector('#demoDialog');
document.querySelector('#openDemo').addEventListener('click', () => demoDialog.showModal());
document.querySelector('#showCancel').addEventListener('click', () => {
  const notice = document.querySelector('#actionNotice');
  notice.textContent = 'Exemplo: antes de cancelar uma venda, apresente a consequência e peça confirmação. Nenhum dado foi alterado.';
  notice.hidden = false;
});
document.querySelector('#demoForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = document.querySelector('#demoName');
  const error = document.querySelector('#nameError');
  const notice = document.querySelector('#formNotice');
  const valid = input.value.trim().length > 0;
  input.setAttribute('aria-invalid', String(!valid));
  error.hidden = valid;
  notice.hidden = false;
  notice.className = valid ? 'ds-alert ds-alert-success' : 'ds-alert ds-alert-danger';
  notice.textContent = valid ? 'Exemplo validado. Nenhum produto foi cadastrado.' : 'Confira o campo nome do produto.';
  if (!valid) input.focus();
});
