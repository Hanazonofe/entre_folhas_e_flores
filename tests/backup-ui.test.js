const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const Shop = require('../store');
function ui() {
  const data = new Map(); const elements = new Map(); const downloads = [];
  let reloads = 0, confirmations = 0, accepted = true;
  function element(id) {
    if (!elements.has(id)) {
      const handlers = new Map();
      elements.set(id, { innerHTML: '', textContent: '', style: {}, disabled: false, files: [],
        querySelector: element, append() {}, remove() {},
        addEventListener(type, action) { handlers.set(type, action); },
        async dispatch(type) { return handlers.get(type)?.(); },
        click() { if (id.startsWith('a')) downloads.push(this.download); }
      });
    }
    return elements.get(id);
  }
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
  const context = vm.createContext({ Shop, DEFAULT_PRODUCTS: [], window: { localStorage: storage },
    document: { createElement: element, querySelector: element, body: element('body') },
    Blob, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} }, setTimeout: action => action(), Date,
    location: { reload: () => { reloads++; } }, confirm: () => { confirmations++; return accepted; }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../backup.js'), 'utf8'), context);
  return { element, data, storage, downloads, confirm: value => { accepted = value; }, get reloads() { return reloads; }, get confirmations() { return confirmations; } };
}
const backup = { version: 1, exportedAt: '2026-08-30T12:00:00.000Z', products: [{ id:'new', name:'<img src=x onerror=alert(1)>', price:1, stock:2, status:'active' }], sales: [] };
async function select(app, text) { app.element('#backupFile').files = [{ text: async () => text }]; await app.element('#backupFile').dispatch('change'); }

test('backup UI previews counts, requires download and explicit confirmation before replacing', async () => {
  const app = ui(); await select(app, JSON.stringify(backup));
  assert.match(app.element('#backupPreview').textContent, /1 produto\(s\) e 0 venda/);
  assert.equal(app.element('#restoreBackup').disabled, true);
  await app.element('#exportBackup').dispatch('click');
  assert.equal(app.downloads.length, 1); assert.equal(app.element('#restoreBackup').disabled, false);
  app.confirm(false); await app.element('#restoreBackup').dispatch('click');
  assert.equal(app.data.size, 0); assert.equal(app.reloads, 0);
  app.confirm(true); await app.element('#restoreBackup').dispatch('click');
  assert.equal(app.confirmations, 2); assert.equal(app.reloads, 1);
  assert.deepEqual(JSON.parse(app.data.get(Shop.KEYS.products)), backup.products);
});
test('malformed file clears pending selection; no data is touched', async () => {
  const app = ui(); await app.element('#exportBackup').dispatch('click');
  await select(app, JSON.stringify(backup)); await select(app, '{');
  assert.equal(app.element('#restoreBackup').disabled, true);
  assert.match(app.element('#backupNotice').textContent, /JSON válido/);
  await app.element('#restoreBackup').dispatch('click');
  assert.match(app.element('#backupNotice').textContent, /Selecione/); assert.equal(app.data.size, 0);
});
test('UI reports changed data since export and prevents replacement', async () => {
  const app = ui(); await select(app, JSON.stringify(backup));
  await app.element('#exportBackup').dispatch('click');
  app.storage.setItem(Shop.KEYS.products, JSON.stringify(backup.products));
  const before = new Map(app.data);
  await app.element('#restoreBackup').dispatch('click');
  assert.match(app.element('#backupNotice').textContent, /Exporte/);
  assert.deepEqual(app.data, before); assert.equal(app.reloads, 0);
});
test('slow previous file read cannot replace a newer selection', async () => {
  const app = ui(); let resolve;
  app.element('#backupFile').files = [{ text: () => new Promise(r => { resolve = r; }) }];
  const first = app.element('#backupFile').dispatch('change');
  await select(app, '{'); resolve(JSON.stringify(backup)); await first;
  assert.equal(app.element('#restoreBackup').disabled, true);
  assert.match(app.element('#backupNotice').textContent, /JSON válido/);
});
