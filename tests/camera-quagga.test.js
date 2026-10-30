const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function harness() {
  const nodes = {}, processed = new Set(), detected = new Set();
  const track = { stopped: 0, stop() { this.stopped++; }, getSettings: () => ({ width: 1920, height: 1080 }), addEventListener() {} };
  const video = { srcObject: { getTracks: () => [track] } };
  for (const name of ['start', 'stop', 'status', 'camera', 'diagnostics', 'viewport', 'code', 'format', 'stats', 'rearm', 'history']) {
    nodes[name] = { value: '', textContent: '', disabled: false, children: [], events: {},
      addEventListener(event, fn) { this.events[event] = fn; },
      querySelector() { return video; }, replaceChildren() { this.children = []; },
      append(item) { this.children.push(item); }, prepend(item) { this.children.unshift(item); }
    };
  }
  const q = { started: 0, stopped: 0,
    init(config, callback) { this.config = config; this.ready = callback; },
    start() { this.started++; }, stop() { this.stopped++; return Promise.resolve(); },
    onProcessed(fn) { processed.add(fn); }, offProcessed(fn) { processed.delete(fn); },
    onDetected(fn) { detected.add(fn); }, offDetected(fn) { detected.delete(fn); },
    CameraAccess: { getActiveTrack: () => track }
  };
  const document = { hidden: false, events: {}, getElementById: id => nodes[id.slice(2)], createElement: () => ({}), addEventListener(event, fn) { this.events[event] = fn; } };
  const window = { Quagga: q, isSecureContext: true, events: {}, addEventListener(event, fn) { this.events[event] = fn; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../camera-quagga.js'), 'utf8'), { document, window, Quagga: q, navigator: { mediaDevices: { getUserMedia() {} } }, Date, Set, Promise });
  return { nodes, q, track, window, document,
    async start() { await nodes.start.events.click(); q.ready(); await settle(); },
    emit(code, format = 'ean_13') {
      const result = code ? { codeResult: { code, format } } : null;
      [...processed].forEach(fn => fn(result));
      if (result) [...detected].forEach(fn => fn(result));
    }
  };
}

test('Quagga controla LiveStream e confirmação exige dois quadros consecutivos', async () => {
  const h = harness(); await h.start();
  assert.equal(h.q.config.inputStream.type, 'LiveStream');
  assert.equal(h.q.config.inputStream.target, h.nodes.viewport);
  assert.deepEqual(Array.from(h.q.config.decoder.readers), ['ean_reader', 'code_128_reader']);
  assert.equal(h.q.started, 1);
  h.emit('7896004762098'); assert.equal(h.nodes.history.children.length, 0);
  h.emit(null); h.emit('7896004762098'); assert.equal(h.nodes.history.children.length, 0);
  h.emit('7896004762098'); assert.equal(h.nodes.code.textContent, '7896004762098');
  assert.equal(h.nodes.history.children.length, 1);
  h.emit('7896004762098'); assert.equal(h.nodes.history.children.length, 1);
  h.nodes.rearm.events.click(); h.emit('7896004762098'); h.emit('7896004762098');
  assert.equal(h.nodes.history.children.length, 2);
});

test('códigos alfanuméricos e zeros são preservados; QR não produz leitura', async () => {
  const h = harness(); await h.start();
  h.emit('https://example.invalid', 'qr_code'); h.emit('https://example.invalid', 'qr_code');
  assert.equal(h.nodes.history.children.length, 0);
  h.emit('PLA0060', 'code_128'); h.emit('PLA0060', 'code_128');
  assert.equal(h.nodes.code.textContent, 'PLA0060');
  h.emit('00042', 'code_128'); h.emit('00042', 'code_128');
  assert.equal(h.nodes.code.textContent, '00042');
});

test('fechar durante permissão bloqueia reabertura concorrente e libera stream tardio', async () => {
  const h = harness(); await h.nodes.start.events.click();
  await h.nodes.stop.events.click();
  assert.equal(h.nodes.start.disabled, true);
  h.q.ready(); await settle();
  assert.equal(h.q.started, 0); assert.ok(h.track.stopped > 0);
  assert.equal(h.nodes.start.disabled, false);
});

test('fechar remove callbacks e impede resultado antigo após reabrir', async () => {
  const h = harness(); await h.start();
  // Keep a reference to a library callback to simulate a queued event.
  let oldCallback;
  h.q.onDetected = fn => { oldCallback = fn; };
  await h.nodes.stop.events.click(); await h.start();
  const callback = oldCallback;
  await h.nodes.stop.events.click();
  callback({ codeResult: { code: '00042', format: 'code_128' } });
  callback({ codeResult: { code: '00042', format: 'code_128' } });
  assert.equal(h.nodes.history.children.length, 0);
});

test('ocultar página libera câmera e permissão negada permite tentar novamente', async () => {
  const h = harness(); await h.start();
  h.document.hidden = true; h.document.events.visibilitychange(); await settle();
  assert.ok(h.track.stopped > 0); assert.equal(h.nodes.start.disabled, false);
  await h.nodes.start.events.click(); h.q.ready({ name: 'NotAllowedError' }); await settle();
  assert.match(h.nodes.status.textContent, /Permissão negada/);
  assert.equal(h.nodes.start.disabled, false);
});

test('HTTP inseguro não solicita captura', async () => {
  const h = harness(); h.window.isSecureContext = false;
  await h.nodes.start.events.click();
  assert.equal(h.q.config, undefined); assert.match(h.nodes.status.textContent, /HTTPS/);
});

test('bundle Quagga2 real carrega e expõe os leitores configurados', () => {
  const context = { window: {}, console, setTimeout, clearTimeout };
  vm.runInNewContext(fs.readFileSync(require.resolve('../quagga-decoder.js'), 'utf8'), context);
  assert.equal(typeof context.window.Quagga.init, 'function');
  assert.equal(typeof context.window.Quagga.Readers.EANReader, 'function');
  assert.equal(typeof context.window.Quagga.Readers.Code128Reader, 'function');
  // Canonical EAN-13 symbol for the sample label, with quiet zones and 3px modules.
  const symbol = '10101101110010111010111101001110001101001110101010100010010100001101100111001011101001001000101';
  const row = Array.from('000000000000' + symbol + '000000000000', bit => [Number(bit), Number(bit), Number(bit)]).flat();
  const result = new context.window.Quagga.Readers.EANReader({}, []).decodePattern(row);
  assert.equal(result.code, '7896004762098');
  assert.equal(result.format, 'ean_13');
});
