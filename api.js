/* Same-origin API; no successful sales or catalogs are stored in the browser. */
const API = (() => {
  let csrf = '', user = null, authentication = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = cents => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(cents / 100);
  const cents = value => {
    const raw = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new Error('Informe um valor não negativo com até duas casas decimais.');
    const [whole, fraction = ''] = raw.split('.');
    const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (!Number.isSafeInteger(result)) throw new Error('Valor muito grande.');
    return result;
  };
  const date = value => new Date(value).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'});
  async function request(path, options = {}) {
    let response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      response = await fetch('/api' + path, {credentials:'same-origin', cache:'no-store', ...options, signal:controller.signal,
        headers: {'Content-Type':'application/json', 'X-CSRF-Token':csrf, ...options.headers}});
    } catch { clearTimeout(timeout); const error = new Error('Servidor indisponível. A operação não foi confirmada. Mantenha esta página aberta e tente novamente.'); error.status = 0; throw error; }
    let data;
    try { data = await response.json(); } catch { const error = new Error('Resposta incompleta do servidor. Tente novamente com o mesmo pedido.'); error.status = 0; throw error; }
    finally { clearTimeout(timeout); }
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map(row => `${row.loc.slice(1).join('.')}: ${row.msg}`).join('; ') : data.detail;
      const error = new Error(detail || 'Operação não concluída.'); error.status = response.status; throw error;
    }
    return data;
  }
  async function login(login, password) {
    const result = await request('/auth/login', {method:'POST', body:JSON.stringify({login,password})});
    user = result.user; csrf = result.csrf_token; return user;
  }
  async function authenticate() {
    if (authentication) return authentication;
    authentication = new Promise(resolve => {
      const dialog = document.createElement('dialog'); dialog.className = 'auth-dialog';
      dialog.innerHTML = '<form><h2>Entrar no sistema local</h2><label>Login<input name="login" required autocomplete="username"></label><label>Senha<input name="password" type="password" required autocomplete="current-password"></label><p role="alert"></p><button>Entrar</button></form>';
      document.body.append(dialog); dialog.showModal();
      dialog.addEventListener('cancel', event => event.preventDefault());
      dialog.querySelector('form').addEventListener('submit', async event => {
        event.preventDefault(); const button = dialog.querySelector('button'); button.disabled = true;
        try { await login(dialog.querySelector('[name=login]').value, dialog.querySelector('[name=password]').value); dialog.close(); dialog.remove(); resolve(user); }
        catch (error) { dialog.querySelector('[role=alert]').textContent = error.message; }
        finally { button.disabled = false; }
      });
    }).finally(() => { authentication = null; });
    return authentication;
  }
  async function ready() {
    try { const result = await request('/auth/me'); user = result.user; csrf = result.csrf_token; }
    catch (error) { if (error.status === 401) await authenticate(); else throw error; }
    return user;
  }
  async function call(path, options = {}) {
    try { return await request(path, options); }
    catch (error) {
      if (error.status !== 401) throw error;
      const priorId = user?.id;
      await authenticate();
      if (priorId && priorId !== user.id) { const changed = new Error('Usuário diferente. Volte à conta anterior para resolver o pedido pendente ou recarregue uma página sem operação pendente.'); changed.status = 0; throw changed; }
      return request(path, {...options, headers:{...options.headers, 'X-CSRF-Token':csrf}});
    }
  }
  async function run(notice, action) {
    notice.textContent = 'Carregando…';
    try { return await action(); } catch (error) { notice.textContent = error.message; }
  }
  function confirm(message) {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.innerHTML = '<p></p><form method="dialog"><button value="no" class="secondary">Voltar</button> <button value="yes">Confirmar</button></form>';
      dialog.querySelector('p').textContent = message;
      document.body.append(dialog); dialog.addEventListener('close', () => { const yes = dialog.returnValue === 'yes'; dialog.remove(); resolve(yes); }); dialog.showModal();
    });
  }
  function header() {
    const nav = document.querySelector('nav');
    if (!nav || document.querySelector('#accountBar')) return;
    const bar = document.createElement('span'); bar.id = 'accountBar';
    bar.innerHTML = `<span>${esc(user.name)} (${user.role === 'admin' ? 'administrador' : 'operador'})</span> <a href="admin.html">Minha conta${user.role === 'admin' ? ' / Administração' : ''}</a> <button type="button" id="logout">Sair</button>`;
    nav.append(bar);
    bar.querySelector('button').addEventListener('click', async () => {
      if (sessionStorage.getItem('pdv-pending-checkout')) { if(await confirm('Há uma venda pendente. Para entrar na conta que iniciou esse pedido, confirme. A venda pendente será preservada.')){await authenticate();location.reload();}return; }
      try { await call('/auth/logout', {method:'POST', body:'{}'}); location.href = 'login.html'; }
      catch (error) { await confirm(error.message); }
    });
  }
  return {esc,money,cents,date,request,call,ready,login,run,confirm,header,get user(){return user;}};
})();
