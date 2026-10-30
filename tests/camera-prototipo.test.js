const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(getUserMedia) {
  const nodes = {};
  const draws = [], urls = { created: 0, revoked: 0 };
  const media = { getUserMedia };
  for (const id of ['start', 'stop', 'status', 'video', 'frame', 'code', 'format', 'stats', 'rearm', 'history', 'diagnostics', 'preview', 'photo', 'photo-result', 'camera', 'capture', 'snapshot', 'snapshot-caption']) {
    nodes[id] = { disabled: false, textContent: '', children: [], events: {}, style: {},
      addEventListener(event, fn) { this.events[event] = fn; },
      pause() {}, play: async () => {},
      replaceChildren() { this.children = []; },
      prepend(item) { this.children.unshift(item); },
      append(item) { this.children.push(item); },
      click() { return this.events.click?.(); },
      getContext() { return { drawImage(...args) { draws.push(args); } }; }
    };
  }
  nodes.video.readyState = 2; nodes.video.videoWidth = 640; nodes.video.videoHeight = 480;
  const tracks = { stopped: 0, stop() { this.stopped++; }, addEventListener() {} };
  const stream = { getTracks: () => [tracks], getVideoTracks: () => [tracks] };
  const frames = []; let nextFrame = null;
  class NotFound extends Error {}
  const reader = { decode() { const code = frames.shift(); if (!code) throw new NotFound(); return { getText: () => code, getBarcodeFormat: () => 1 }; } };
  const document = { hidden: false, events: {}, getElementById: id => nodes[id], createElement: tag => tag === 'canvas' ? { getContext: () => ({ drawImage() {} }) } : {}, addEventListener(event, fn) { this.events[event] = fn; } };
  const window = { isSecureContext: true, events: {}, addEventListener(event, fn) { this.events[event] = fn; } };
  const ZXing = { MultiFormatReader: function () { return reader; }, HTMLCanvasElementLuminanceSource: function () {}, BinaryBitmap: function () {}, HybridBinarizer: function () {}, DecodeHintType: {}, BarcodeFormat: { 1: 'CODE_128' }, NotFoundException: NotFound, ChecksumException: class extends Error {}, FormatException: class extends Error {} };
  window.ZXing = ZXing;
  media.getUserMedia ||= async () => stream;
  vm.runInNewContext(fs.readFileSync(require.resolve('../camera-prototipo.js'), 'utf8'), {
    document, window, navigator: { mediaDevices: media }, ZXing,
    URL: { createObjectURL() { urls.created++; return 'blob:local'; }, revokeObjectURL() { urls.revoked++; } },
    Image: class { naturalWidth = 960; naturalHeight = 1280; set src(value) { this.onload(); } },
    setTimeout(fn) { nextFrame = fn; return 1; }, clearTimeout() { nextFrame = null; }, Date, Map, Set
  });
  return { nodes, tracks, stream, frames, window, document, draws, urls, media, tick() { const fn = nextFrame; nextFrame = null; if (fn) fn(); } };
}

test('código mantido e quadros sem leitura não liberam repetição; liberação manual permite nova leitura', async () => {
  const h = harness(); h.frames.push('00042');
  await h.nodes.start.events.click();
  h.frames.push('00042', null, '00042'); h.tick(); h.tick(); h.tick();
  assert.equal(h.nodes.history.children.length, 1);
  assert.equal(h.nodes.code.textContent, '00042');
  assert.equal(h.nodes.stats.textContent, '1 leituras · 2 repetições bloqueadas');
  h.nodes.rearm.events.click(); h.frames.push('00042'); h.tick();
  assert.equal(h.nodes.history.children.length, 2);
  h.nodes.stop.events.click(); assert.equal(h.tracks.stopped, 1);
});

test('fechar enquanto permissão está pendente libera stream tardio sem iniciar captura', async () => {
  let resolve;
  const h = harness(() => new Promise(r => { resolve = r; }));
  const pending = h.nodes.start.events.click();
  h.nodes.stop.events.click(); resolve(h.stream); await pending;
  assert.equal(h.tracks.stopped, 1);
  assert.equal(h.nodes.video.srcObject, null);
  assert.equal(h.nodes.history.children.length, 0);
});

test('ocultar a página libera a câmera e impede leituras posteriores', async () => {
  const h = harness(); await h.nodes.start.events.click();
  h.document.hidden = true; h.document.events.visibilitychange();
  h.frames.push('PLA0060'); h.tick();
  assert.equal(h.tracks.stopped, 1);
  assert.equal(h.nodes.history.children.length, 0);
  assert.equal(h.nodes.start.disabled, false);
});

test('permissão negada orienta e permite tentar novamente', async () => {
  const h = harness(async () => { throw Object.assign(new Error(), { name: 'NotAllowedError' }); });
  await h.nodes.start.events.click();
  assert.match(h.nodes.status.textContent, /Permissão negada/);
  assert.equal(h.nodes.start.disabled, false);
  assert.equal(h.nodes.stop.disabled, true);
});

test('HTTP inseguro não solicita câmera', async () => {
  let calls = 0; const h = harness(async () => { calls++; });
  h.window.isSecureContext = false; await h.nodes.start.events.click();
  assert.equal(calls, 0); assert.match(h.nodes.status.textContent, /HTTPS/);
});

test('alterna faixa e quadro inteiro, mantendo proporção real da prévia em retrato', async () => {
  const h = harness(); h.nodes.video.videoWidth = 1080; h.nodes.video.videoHeight = 1920;
  await h.nodes.start.events.click();
  assert.equal(h.draws[0][2], 480);
  h.tick();
  assert.equal(h.draws[1][2], 0);
  assert.equal(h.draws[1][4], 1920);
  assert.equal(h.nodes.preview.style.aspectRatio, '1080 / 1920');
  assert.match(h.nodes.diagnostics.textContent, /2 quadros analisados/);
});

test('foco contínuo quando disponível; erro no ajuste não encerra captura', async () => {
  const h = harness(); let calls = 0;
  h.tracks.getCapabilities = () => ({ focusMode: ['continuous'] });
  h.tracks.applyConstraints = async constraints => { calls++; assert.equal(constraints.advanced[0].focusMode, 'continuous'); throw new Error('unsupported'); };
  await h.nodes.start.events.click();
  assert.equal(calls, 1); assert.equal(h.tracks.stopped, 0);
  assert.match(h.nodes.diagnostics.textContent, /quadros analisados/);
});

test('análise de foto fecha captura, mantém resultado separado e libera URL local', async () => {
  const h = harness(); await h.nodes.start.events.click();
  h.nodes.photo.files = [{ size: 1000 }]; h.frames.push('7896004762098');
  await h.nodes.photo.events.change();
  assert.equal(h.tracks.stopped, 1);
  assert.equal(h.nodes['photo-result'].textContent, 'Foto: 7896004762098 · CODE_128');
  assert.equal(h.nodes.history.children.length, 0);
  assert.equal(h.urls.created, 1); assert.equal(h.urls.revoked, 1);
});

test('foto sem código informa falha sem sucesso e libera URL local', async () => {
  const h = harness(); h.nodes.photo.files = [{ size: 1000 }];
  await h.nodes.photo.events.change();
  assert.match(h.nodes['photo-result'].textContent, /Código não identificado/);
  assert.equal(h.urls.revoked, 1);
});

test('lista lentes após permissão e usa dispositivo escolhido ao reabrir', async () => {
  const h = harness(); let chosen;
  h.media.enumerateDevices = async () => [{ kind: 'videoinput', deviceId: 'main', label: 'Traseira principal' }, { kind: 'videoinput', deviceId: 'wide', label: 'Traseira ampla' }];
  h.tracks.getSettings = () => ({ deviceId: 'main', focusMode: 'continuous' });
  await h.nodes.start.events.click(); await Promise.resolve();
  assert.equal(h.nodes.camera.disabled, false);
  assert.equal(h.nodes.camera.value, 'main');
  assert.match(h.nodes.diagnostics.textContent, /continuous/);
  h.nodes.camera.value = 'wide';
  h.media.getUserMedia = async constraints => { chosen = constraints.video.deviceId.exact; return h.stream; };
  await h.nodes.start.events.click();
  assert.equal(chosen, 'wide');
});

async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

test('leitor nativo recebe só barras e ignora QR retornado junto ao EAN', async () => {
  const h = harness(); let formats;
  h.window.BarcodeDetector = class {
    static async getSupportedFormats() { return ['qr_code', 'ean_13', 'code_128']; }
    constructor(options) { formats = Array.from(options.formats); }
    async detect() { return [{ format: 'qr_code', rawValue: 'https://invalid.example/' }, { format: 'ean_13', rawValue: '7896004762098' }]; }
  };
  await h.nodes.start.events.click(); await settle(); h.tick(); await settle();
  assert.deepEqual(formats, ['ean_13', 'code_128']);
  assert.equal(h.nodes.code.textContent, '7896004762098');
  assert.equal(h.nodes.format.textContent, 'EAN_13');
  assert.equal(h.nodes.history.children.length, 1);
});

test('resposta nativa após fechar ou liberar leitura não produz resultado tardio', async () => {
  for (const cancel of ['stop', 'rearm']) {
    const h = harness(); let resolve;
    h.window.BarcodeDetector = class {
      static async getSupportedFormats() { return ['ean_13']; }
      detect() { return new Promise(r => { resolve = r; }); }
    };
    await h.nodes.start.events.click(); await settle(); h.tick(); await settle();
    h.nodes[cancel].events.click();
    resolve([{ format: 'ean_13', rawValue: '7896004762098' }]); await settle();
    assert.equal(h.nodes.history.children.length, 0);
  }
});

test('detecção nativa pendente não bloqueia ZXing nem inicia pedidos concorrentes', async () => {
  const h = harness(); let calls = 0;
  h.window.BarcodeDetector = class {
    static async getSupportedFormats() { return ['ean_13']; }
    detect() { calls++; return new Promise(() => {}); }
  };
  await h.nodes.start.events.click(); await settle(); h.tick(); await settle();
  h.frames.push('PLA0060'); h.tick(); await settle();
  assert.equal(h.nodes.code.textContent, 'PLA0060');
  assert.equal(calls, 1);
  h.nodes.stop.events.click();
});

test('falha da API nativa mantém leitura pelo ZXing', async () => {
  const h = harness();
  h.window.BarcodeDetector = class {
    static async getSupportedFormats() { return ['ean_13']; }
    async detect() { throw new Error('indisponível'); }
  };
  await h.nodes.start.events.click(); await settle(); h.tick(); await settle();
  h.frames.push('PLA0060'); h.tick();
  assert.equal(h.nodes.code.textContent, 'PLA0060');
  assert.equal(h.tracks.stopped, 0);
});

test('mostra cópia do quadro analisado sem interromper a captura', async () => {
  const h = harness(); await h.nodes.start.events.click();
  h.nodes.capture.events.click();
  assert.equal(h.nodes.snapshot.hidden, false);
  assert.equal(h.nodes.snapshot.width, 640);
  assert.equal(h.nodes.snapshot.height, 240);
  assert.equal(h.draws.at(-1)[0], h.nodes.frame);
  assert.equal(h.tracks.stopped, 0);
});

test('ajuste de foco pendente não impede iniciar processamento dos quadros', async () => {
  const h = harness();
  h.tracks.getCapabilities = () => ({ focusMode: ['continuous'] });
  h.tracks.applyConstraints = () => new Promise(() => {});
  h.frames.push('7896004762098');
  await h.nodes.start.events.click();
  assert.equal(h.nodes.code.textContent, '7896004762098');
  assert.match(h.nodes.diagnostics.textContent, /1 quadros analisados/);
  h.nodes.stop.events.click();
});
