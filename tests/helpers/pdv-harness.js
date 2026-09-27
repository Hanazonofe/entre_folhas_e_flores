'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/*
 * Building blocks for PDV/browser tests.
 *
 * `npm run test:scaffold` deliberately runs the generated acceptance-test
 * scaffolds in test/. They are not part of `npm test` until T-004 converts
 * them from ESM and replaces their explicit failing placeholders with real
 * assertions. Keeping that command separate makes the current gap visible
 * without weakening the regression gate.
 */

function createClock(initialNow = 0) {
  if (!Number.isFinite(initialNow)) throw new TypeError('initialNow deve ser um número finito');

  let now = initialNow;
  let nextId = 1;
  const timers = new Map();

  function setTimeout(callback, delay = 0) {
    if (typeof callback !== 'function') throw new TypeError('callback deve ser uma função');
    const id = nextId++;
    const wait = Number(delay);
    timers.set(id, { callback, at: now + (Number.isFinite(wait) ? Math.max(0, wait) : 0), id });
    return id;
  }

  function clearTimeout(id) {
    timers.delete(id);
  }

  function nextTimer(limit) {
    let selected = null;
    for (const timer of timers.values()) {
      if (timer.at > limit) continue;
      if (!selected || timer.at < selected.at || (timer.at === selected.at && timer.id < selected.id)) selected = timer;
    }
    return selected;
  }

  function advanceBy(milliseconds) {
    const duration = Number(milliseconds);
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError('milliseconds deve ser um número finito não negativo');
    const target = now + duration;
    let timer;
    while ((timer = nextTimer(target))) {
      timers.delete(timer.id);
      now = timer.at;
      timer.callback();
    }
    now = target;
  }

  function runAll() {
    while (timers.size) {
      let timer = null;
      for (const candidate of timers.values()) {
        if (!timer || candidate.at < timer.at || (candidate.at === timer.at && candidate.id < timer.id)) timer = candidate;
      }
      advanceBy(timer.at - now);
    }
  }

  return Object.freeze({
    now: () => now,
    setTimeout,
    clearTimeout,
    advanceBy,
    runAll,
    pending: () => timers.size
  });
}

function createDeferred() {
  let resolvePromise;
  let rejectPromise;
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = value => { if (!settled) { settled = true; resolve(value); } };
    rejectPromise = reason => { if (!settled) { settled = true; reject(reason); } };
  });

  return Object.freeze({
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
    get settled() { return settled; }
  });
}

function createControlledApi() {
  const requests = [];

  function call(path, options) {
    const deferred = createDeferred();
    const request = Object.freeze({ path, options, deferred });
    requests.push(request);
    return deferred.promise;
  }

  function requestAt(index) {
    const request = requests[index];
    if (!request) throw new RangeError(`requisição inexistente: ${index}`);
    return request;
  }

  return Object.freeze({
    requests,
    call,
    resolve(index, response) { requestAt(index).deferred.resolve(response); },
    reject(index, error) { requestAt(index).deferred.reject(error); },
    pending() { return requests.filter(request => !request.deferred.settled); }
  });
}

function flush() {
  return new Promise(resolve => setImmediate(resolve));
}

class FakeElement {
  constructor(id, options = {}) {
    this.id = id;
    this.value = options.value || '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.hidden = false;
    this.href = '';
    this.open = false;
    this.selectionStart = 0;
    this.selectionEnd = 0;
    this.dataset = options.dataset || {};
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) listener({ target: this, ...event });
  }

  matches(selector) {
    if (selector === 'input, textarea') return this.id === 'productSearch' || this.id === 'discount' || this.dataset.applied !== undefined || this.dataset.received !== undefined || this.id === 'saleNotes';
    if (selector === '[data-applied], [data-received]') return this.dataset.applied !== undefined || this.dataset.received !== undefined;
    return false;
  }

  setSelectionRange(start, end) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

/*
 * Minimal deterministic browser surface for pdv.js. It intentionally models
 * keydown before input, the ordering used by browsers and needed to prove that
 * scanner capture restores text fields before their input handlers apply data.
 */
function createPdvHarness(options = {}) {
  const clock = createClock();
  const api = createControlledApi();
  const elements = new Map();
  const ids = ['saleNotice', 'cartList', 'subtotal', 'finalTotal', 'finishSale', 'productSearch', 'catalogGrid', 'discount', 'paymentEditor', 'quoteNotice', 'quoteSale', 'addFirstResult', 'saleNotes', 'receiptLink'];
  for (const id of ids) elements.set(id, new FakeElement(id, { value: id === 'discount' ? '0' : '' }));
  const mainControls = [...elements.values()].filter(element => !['saleNotice', 'cartList', 'subtotal', 'finalTotal', 'catalogGrid', 'quoteNotice', 'receiptLink'].includes(element.id));
  const documentListeners = new Map();
  const observers = [];
  const document = {
    activeElement: null,
    documentElement: {},
    querySelector(selector) {
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      if (selector === 'dialog[open], [role="dialog"][aria-modal="true"]') return [...elements.values()].find(element => element.open || element.roleDialog) || null;
      return null;
    },
    querySelectorAll(selector) {
      return selector === 'main input, main select, main textarea, main button' ? mainControls : [];
    },
    addEventListener(type, listener) {
      const listeners = documentListeners.get(type) || [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
  };
  const payments = { set() {}, values() { return []; } };
  const session = new Map();
  if (options.pending) session.set('pdv-pending-checkout', JSON.stringify({ userId: 'operator', preview: [], body: { discount_cents: 0, notes: '', payments: [] } }));
  const context = {
    document,
    console,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    BarcodeScanner: {
      TemporalBarcodeClassifier: class DeterministicScanner extends require('../../barcode-scanner.js').TemporalBarcodeClassifier {
        constructor(options) { super({ ...options, now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout }); }
      }
    },
    PaymentEditor: function PaymentEditor() { return payments; },
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe() {} },
    sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) },
    crypto: { randomUUID: () => 'test-key' },
    API: {
      call: api.call,
      ready: async () => {}, header() {}, user: { id: 'operator' },
      esc: value => String(value), money: cents => `R$ ${Number(cents) / 100}`,
      cents: value => Math.round(Number(value) * 100),
      run: (_notice, action) => Promise.resolve().then(action).catch(error => { elements.get('saleNotice').textContent = error.message; }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../pdv.js'), 'utf8'), context, { filename: 'pdv.js' });

  function keydown(key, extra = {}) {
    const event = { key, defaultPrevented: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const listener of documentListeners.get('keydown') || []) listener(event);
    return event;
  }
  function type(text, interval = 20, field = document.activeElement) {
    for (const char of text) {
      keydown(char);
      if (field) { field.value += char; field.selectionStart = field.selectionEnd = field.value.length; field.dispatch('input'); }
      clock.advanceBy(interval);
    }
  }
  function openDialog() {
    const dialog = new FakeElement('dialog'); dialog.open = true; elements.set('dialog', dialog);
    for (const observer of observers) observer.callback();
    return dialog;
  }
  function closeDialog() { elements.delete('dialog'); for (const observer of observers) observer.callback(); }
  return { api, clock, document, elements, flush, keydown, type, openDialog, closeDialog, focus(id) { document.activeElement = elements.get(id) || null; return document.activeElement; } };
}

module.exports = { createClock, createDeferred, createControlledApi, createPdvHarness, flush };
