/* Isolated Quagga2 live-stream experiment. No product lookup or cart writes. */
(() => {
  'use strict';
  const names = ['start', 'stop', 'status', 'camera', 'diagnostics', 'viewport', 'code', 'format', 'stats', 'rearm', 'history'];
  const el = Object.fromEntries(names.map(name => [name, document.getElementById(`q-${name}`)]));
  let generation = 0, initializing = false, running = false, stopping = false, pendingStops = 0;
  let processedHandler = null, detectedHandler = null, stopPromise = Promise.resolve();
  let frames = 0, reads = 0, repeats = 0, candidate = '', matches = 0;
  let blocked = new Set();
  const message = text => { el.status.textContent = text; };
  const stats = () => { el.stats.textContent = `${reads} leituras · ${repeats} repetições bloqueadas`; };
  function buttons() {
    el.start.disabled = initializing || stopping || running;
    el.stop.disabled = !initializing && !running;
    el.rearm.disabled = !running || !blocked.size;
  }
  function detach() {
    if (!window.Quagga) return;
    if (processedHandler) Quagga.offProcessed(processedHandler);
    if (detectedHandler) Quagga.offDetected(detectedHandler);
    processedHandler = detectedHandler = null;
  }
  function stopTracks() {
    // Also stop tracks attached to the preview in case init finishes after close.
    const video = el.viewport.querySelector('video');
    video?.srcObject?.getTracks().forEach(track => track.stop());
  }
  function close(text = 'Câmera fechada.') {
    generation++; running = false; candidate = ''; matches = 0;
    detach(); stopTracks(); el.camera.disabled = true;
    pendingStops++; stopping = true; buttons(); message(text);
    stopPromise = stopPromise.then(async () => {
      try { if (window.Quagga) await Quagga.stop(); } catch { /* Release our tracks even if the library fails. */ }
      stopTracks();
    }).finally(() => { pendingStops--; stopping = pendingStops > 0; buttons(); });
    return stopPromise;
  }
  function valid(result) {
    return result?.codeResult && ['ean_13', 'code_128'].includes(result.codeResult.format)
      && typeof result.codeResult.code === 'string' && result.codeResult.code.length > 0;
  }
  function diagnostic(result) {
    const track = Quagga.CameraAccess?.getActiveTrack?.();
    let settings = {};
    try { settings = track?.getSettings?.() || {}; } catch { /* Optional diagnostics. */ }
    const size = settings.width && settings.height ? `${settings.width} × ${settings.height}` : 'resolução não informada';
    const found = valid(result) ? ` · Candidato: ${result.codeResult.code}` : '';
    el.diagnostics.textContent = `Quagga2 1.13.0 · Teste 1 · ${frames} quadros processados · ${size}${found}`;
    try {
      const canvas = Quagga.canvas?.dom?.overlay, ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (result?.box) Quagga.ImageDebug.drawPath(result.box, { x: 0, y: 1 }, ctx, { color: '#b4f084', lineWidth: 3 });
      }
    } catch { /* A diagnostic overlay must not interrupt decoding. */ }
  }
  async function open() {
    if (initializing || stopping || running) return;
    if (!window.isSecureContext) { message('Abra o endereço HTTPS da homologação para usar a câmera.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { message('A câmera não está disponível neste navegador.'); return; }
    if (!window.Quagga) { message('Quagga2 não carregou. Recarregue a página.'); return; }
    const token = ++generation;
    initializing = true; frames = reads = repeats = matches = 0; candidate = ''; blocked = new Set();
    stats(); el.history.replaceChildren(); el.code.textContent = 'Aguardando leitura';
    el.format.textContent = 'EAN-13 e Code 128 · QR Code ignorado.';
    el.diagnostics.textContent = 'Quagga2 1.13.0 · Teste 1 · Solicitando captura…';
    buttons(); message('Autorize a câmera para iniciar o teste.');
    const selected = el.camera.value;
    const config = {
      inputStream: { type: 'LiveStream', target: el.viewport, constraints: {
        ...(selected ? { deviceId: { exact: selected } } : { facingMode: 'environment' }),
        width: { ideal: 1920 }, height: { ideal: 1080 }
      } },
      numOfWorkers: 0, frequency: 10, locate: true,
      locator: { patchSize: 'medium', halfSample: false },
      decoder: { readers: ['ean_reader', 'code_128_reader'], multiple: false }
    };
    const initialized = async error => {
      initializing = false;
      if (token !== generation) { await close('Câmera fechada.'); return; }
      if (error) {
        const messages = { NotAllowedError: 'Permissão negada. Autorize a câmera nas configurações deste site.', NotFoundError: 'Nenhuma câmera disponível. Tente novamente com seleção automática.', OverconstrainedError: 'Câmera indisponível. Tente novamente com seleção automática.', NotReadableError: 'Câmera ocupada. Feche outros aplicativos e tente novamente.' };
        if (['NotFoundError', 'OverconstrainedError'].includes(error.name)) el.camera.value = '';
        await close(messages[error.name] || 'Quagga2 não conseguiu iniciar a captura. Tente fechar e abrir novamente.');
        return;
      }
      processedHandler = result => {
        if (token !== generation || !running) return;
        frames++; diagnostic(result);
        if (!valid(result)) { candidate = ''; matches = 0; }
        if (!reads && frames === 30) message('Câmera processando, ainda sem leitura confirmada. Ajuste a distância, a luz ou a câmera selecionada.');
      };
      detectedHandler = result => {
        if (token !== generation || !running || !valid(result)) return;
        const { code, format } = result.codeResult;
        if (code === candidate) matches++; else { candidate = code; matches = 1; }
        if (matches < 2) return;
        if (blocked.has(code)) { repeats++; stats(); return; }
        blocked.add(code); reads++; stats(); buttons();
        el.code.textContent = code; el.format.textContent = format;
        const item = document.createElement('li');
        item.textContent = `${new Date().toLocaleTimeString('pt-BR')} · ${code} · ${format}`;
        el.history.prepend(item);
        while (el.history.children.length > 30) el.history.lastElementChild.remove();
        message('Código confirmado em dois quadros. Retire a etiqueta antes de liberar nova leitura.');
      };
      Quagga.onProcessed(processedHandler); Quagga.onDetected(detectedHandler);
      running = true; buttons(); message('Quagga2 ativo. Aponte a câmera para as barras.');
      try { Quagga.start(); } catch { await close('Falha ao iniciar o leitor Quagga2. Tente novamente.'); return; }
      const track = Quagga.CameraAccess?.getActiveTrack?.();
      track?.addEventListener?.('ended', () => { if (token === generation) close('A câmera foi interrompida. Abra novamente.'); });
      // Camera setup is owned by Quagga. Device enumeration never blocks decoding.
      if (Quagga.CameraAccess?.enumerateVideoDevices) {
        Promise.resolve().then(() => Quagga.CameraAccess.enumerateVideoDevices()).then(devices => {
          if (token !== generation) return;
          const cameras = devices.filter(device => device.deviceId);
          el.camera.replaceChildren();
          const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Traseira automática'; el.camera.append(automatic);
          cameras.forEach((device, index) => {
            const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Câmera ${index + 1}`; el.camera.append(option);
          });
          const id = track?.getSettings?.().deviceId;
          el.camera.value = cameras.some(device => device.deviceId === id) ? id : '';
          el.camera.disabled = cameras.length < 2;
        }).catch(() => {});
      }
    };
    try { Quagga.init(config, error => { initialized(error).catch(() => close('Falha ao preparar o leitor. Tente novamente.')); }); }
    catch (error) { await initialized(error); }
  }
  el.start.addEventListener('click', open);
  el.stop.addEventListener('click', () => close());
  el.camera.addEventListener('change', async () => { if (running) { await close(); await open(); } });
  el.rearm.addEventListener('click', () => { blocked.clear(); candidate = ''; matches = 0; buttons(); message('Nova leitura liberada. Reapresente a etiqueta.'); });
  window.addEventListener('pagehide', () => close());
  document.addEventListener('visibilitychange', () => { if (document.hidden) close('Câmera encerrada ao sair da página. Abra novamente.'); });
})();
