/* Cart transport belongs to one live top-level browsing context and one account.
 * It never stores billing fields or grants authority to submit a sale. */
const SaleNavigation = (() => {
  'use strict';
  const CONTEXT = 'pdv-cart-context-v1', SNAPSHOT = 'pdv-cart-navigation-v1';
  let contextId = null, userId = null, releaseLease = null, acquiring = null, available = false;
  let restore = null, lifecycle = 0;
  const navigationType = () => performance.getEntriesByType('navigation')[0]?.type || 'navigate';
  const salePage = () => location.pathname.endsWith('/pdv.html');
  function discard() { try { sessionStorage.removeItem(SNAPSHOT); return true; } catch { return false; } }
  function rows(value) {
    if (!Array.isArray(value) || value.length > 1000) throw new Error('Carrinho salvo inválido.');
    const ids = new Set();
    let total = 0;
    return value.map(row => {
      if (!row || typeof row.id !== 'string' || !row.id.length || row.id.length > 200 || ids.has(row.id) ||
          typeof row.name !== 'string' || row.name.length > 1000 || typeof row.code !== 'string' || row.code.length > 200 ||
          !Number.isSafeInteger(row.price_cents) || row.price_cents < 0 || !Number.isSafeInteger(row.quantity) || row.quantity < 1 ||
          !Number.isSafeInteger(row.quantity * row.price_cents)) throw new Error('Carrinho salvo inválido.');
      total += row.quantity * row.price_cents;
      if (!Number.isSafeInteger(total)) throw new Error('Carrinho salvo inválido.');
      ids.add(row.id);
      return {id:row.id,name:row.name,code:row.code,price_cents:row.price_cents,quantity:row.quantity};
    });
  }
  async function identify(account) {
    if (userId && userId !== account) { discard(); restore?.([]); }
    userId = account;
    if (releaseLease) return available;
    if (acquiring) return acquiring;
    const generation = ++lifecycle;
    acquiring = new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled = true; resolve(value); } };
      (async () => {
        try {
          if (!navigator.locks?.request) { discard(); return done(false); }
          contextId = sessionStorage.getItem(CONTEXT);
          if (!contextId || !/^[a-zA-Z0-9-]{8,100}$/.test(contextId)) contextId = crypto.randomUUID();
          async function acquire(id, copied = false) {
            await navigator.locks.request('garden-cart:' + id, {ifAvailable:true}, async lock => {
              if (!lock) {
                if (copied) return done(false);
                discard();
                contextId = crypto.randomUUID();
                return acquire(contextId, true);
              }
              if (generation !== lifecycle) return done(false);
              sessionStorage.setItem(CONTEXT, id);
              available = true;
              await new Promise(release => { releaseLease = release; done(true); });
            });
          }
          await acquire(contextId);
        } catch { available = false; discard(); done(false); }
      })();
    }).finally(() => { acquiring = null; });
    return acquiring;
  }
  function read() {
    if (!available || !userId || !contextId) return [];
    try {
      const raw = sessionStorage.getItem(SNAPSHOT);
      if (!raw) return [];
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || saved.userId !== userId || saved.contextId !== contextId) { discard(); return []; }
      return rows(saved.items);
    } catch { discard(); return []; }
  }
  function save(items) {
    if (!available || !userId || !contextId) return false;
    try {
      const clean = rows(items.map(row => ({...row,code:String(row.code || '')})));
      if (!clean.length) return discard();
      const payload = JSON.stringify({version:1,userId,contextId,items:clean});
      sessionStorage.setItem(SNAPSHOT, payload);
      return sessionStorage.getItem(SNAPSHOT) === payload;
    } catch { return false; }
  }
  async function connect(account, callback) {
    restore = callback;
    await identify(account);
    if (salePage() && navigationType() === 'reload') discard();
    return read();
  }
  function clear() { discard(); }
  function logout() { discard(); userId = null; restore?.([]); }
  window.addEventListener('pagehide', () => {
    // Web Locks prevent BFCache in some engines unless released here.
    ++lifecycle; available = false;
    releaseLease?.(); releaseLease = null; acquiring = null;
  });
  window.addEventListener('pageshow', async event => {
    if (!event.persisted || !userId) return;
    try {
      await API.ready();
      await identify(API.user.id);
      restore?.(read());
    } catch { restore?.([]); }
  });
  return {identify,connect,save,read,clear,logout,get available(){return available;}};
})();
