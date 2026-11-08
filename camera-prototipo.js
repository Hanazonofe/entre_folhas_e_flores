/* Protótipo isolado: sem consulta HTTP e sem mutação do carrinho. */
(() => {
  'use strict';
  const el = Object.fromEntries(['start', 'stop', 'status', 'video', 'frame', 'code', 'format', 'stats', 'rearm', 'history', 'diagnostics', 'preview', 'photo', 'photo-result', 'camera', 'capture', 'snapshot', 'snapshot-caption', 'save-frame', 'save-reader', 'save-diagnostics', 'camera-status'].map(id => [id, document.getElementById(id)]));
  let generation = 0, stream = null, timer = null, audio = null;
  let blocked = new Set(), reads = 0, duplicates = 0;
  let attempts = 0, focus = 'automático do aparelho', photoGeneration = 0, releaseGeneration = 0;
  const preferenceKey = 'camera-mobile.preferred-device.v1';
  let savedCamera = '';
  try { savedCamera = window.localStorage?.getItem(preferenceKey) || ''; } catch { /* Storage is optional. */ }
  if (savedCamera) {
    const option = document.createElement('option'); option.value = savedCamera;
    option.textContent = 'Câmera escolhida anteriormente'; el.camera.append(option); el.camera.value = savedCamera;
    el['camera-status'].textContent = 'Sua câmera anterior será usada ao tocar em Abrir câmera.';
  }
  function rememberCamera(id) {
    savedCamera = id;
    try {
      if (id) window.localStorage?.setItem(preferenceKey, id);
      else window.localStorage?.removeItem(preferenceKey);
    } catch { /* Camera operation must not depend on storage. */ }
  }
  let cameraDiagnostic = {}, previousDeviceId = null;
  const optionalInfo = (track, method) => {
    try { return track?.[method]?.() || {}; } catch { return {}; }
  };
  function reportCamera(track) {
    const settings = optionalInfo(track, 'getSettings');
    const actual = settings.deviceId || null;
    const requested = cameraDiagnostic.requestedDeviceId;
    cameraDiagnostic.actualDeviceId = actual;
    cameraDiagnostic.actualLabel = track?.label || cameraDiagnostic.devices?.find(device => device.deviceId === actual)?.label || '';
    cameraDiagnostic.selectionResult = !requested ? 'automatic' : !actual ? 'unavailable' : actual === requested ? 'matched' : 'mismatch';
    cameraDiagnostic.changedFromPrevious = actual && cameraDiagnostic.previousDeviceId ? actual !== cameraDiagnostic.previousDeviceId : null;
    const requestedLabel = cameraDiagnostic.devices?.find(device => device.deviceId === requested)?.label || requested || 'Traseira automática';
    const actualLabel = cameraDiagnostic.actualLabel || actual || 'não informada';
    const verdict = { automatic: 'Seleção automática.', unavailable: 'O navegador não informou o identificador; não foi possível confirmar a seleção.', matched: 'Seleção confirmada pelo navegador.', mismatch: 'Atenção: o navegador informou uma câmera diferente da solicitada.' }[cameraDiagnostic.selectionResult];
    const change = cameraDiagnostic.changedFromPrevious === false ? ' Mesmo identificador da sessão anterior.' : cameraDiagnostic.changedFromPrevious === true ? ' Identificador diferente da sessão anterior.' : '';
    el['camera-status'].textContent = `Escolhida: ${requestedLabel}. Aberta: ${actualLabel}. ${verdict}${change} ${cameraDiagnostic.preferenceFallback || ''} Isso identifica o dispositivo exposto pelo navegador, sem comprovar qual lente física está em uso.`;
  }
  const hintsForBars = () => new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.CODE_128]], [ZXing.DecodeHintType.TRY_HARDER, true]]);
  const isUnreadable = error => error instanceof ZXing.NotFoundException || error instanceof ZXing.ChecksumException || error instanceof ZXing.FormatException;
  function decodeCanvas(canvas, reader, hints) {
    return reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas))), hints);
  }
  const status = text => { el.status.textContent = text; };
  const stats = () => { el.stats.textContent = `${reads} leituras · ${duplicates} repetições bloqueadas`; };
  function close(message = 'Câmera fechada.') {
    generation++;
    releaseGeneration++;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    el.video.pause();
    el.video.srcObject = null;
    if (audio) { audio.close().catch(() => {}); audio = null; }
    el.start.disabled = false;
    el.stop.disabled = true;
    el.rearm.disabled = true;
    el.camera.disabled = true;
    el.capture.disabled = true;
    status(message);
  }
  function beep() {
    if (!audio || audio.state !== 'running') return false;
    try {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + 0.13);
      return true;
    } catch { return false; }
  }
  function record(code, format, token) {
    if (token !== generation || !stream || typeof code !== 'string' || !code) return;
    if (blocked.has(code)) { duplicates++; stats(); return; }
    blocked.add(code); reads++;
    el.code.textContent = code;
    el.format.textContent = format;
    const item = document.createElement('li');
    item.textContent = `${new Date().toLocaleTimeString('pt-BR')} · ${code} · ${format}`;
    el.history.prepend(item);
    while (el.history.children.length > 30) el.history.lastElementChild.remove();
    el.rearm.disabled = false;
    stats();
    status(beep() ? 'Código lido. Retire a etiqueta antes de liberar outra leitura.' : 'Código lido (som indisponível). Retire a etiqueta antes de liberar outra leitura.');
  }
  function nativeReader(token) {
    const engine = { detector: null, pending: false };
    if (window.BarcodeDetector?.getSupportedFormats) {
      Promise.resolve().then(() => window.BarcodeDetector.getSupportedFormats()).then(supported => {
        if (token !== generation) return;
        const formats = ['ean_13', 'code_128'].filter(format => supported.includes(format));
        if (formats.length) engine.detector = new window.BarcodeDetector({ formats });
      }).catch(() => {});
    }
    return engine;
  }
  function scan(token, reader, hints, engine) {
    if (token !== generation || !stream) return;
    try {
      if (el.video.readyState >= 2 && el.video.videoWidth) {
        const width = Math.min(el.video.videoWidth, 1920);
        const height = Math.round(el.video.videoHeight * width / el.video.videoWidth);
        // Alternate the guide band and full frame: a visible label outside the band
        // must still have a chance to decode, including after an orientation change.
        const band = attempts % 2 === 0;
        el.frame.width = width; el.frame.height = Math.max(1, band ? Math.round(height / 2) : height);
        el.preview.style.aspectRatio = `${el.video.videoWidth} / ${el.video.videoHeight}`;
        const ctx = el.frame.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(el.video, 0, band ? el.video.videoHeight / 4 : 0, el.video.videoWidth, band ? el.video.videoHeight / 2 : el.video.videoHeight, 0, 0, width, el.frame.height);
        attempts++;
        el.capture.disabled = false;
        el.diagnostics.textContent = `Versão 9 · ${el.video.videoWidth} × ${el.video.videoHeight} · foco: ${focus} · leitor: ${engine.detector ? 'nativo + ZXing' : 'ZXing'} · ${attempts} quadros analisados`;
        // Native detection is optional and never blocks the JS loop. At most one
        // native request is outstanding; results from a closed session are ignored.
        if (engine.detector && !engine.pending) {
          engine.pending = true;
          const detector = engine.detector;
          const presentation = releaseGeneration;
          Promise.resolve().then(() => {
            if (token !== generation) return [];
            return detector.detect(el.frame);
          }).then(results => {
            if (presentation !== releaseGeneration) return;
            const found = results.find(result => ['ean_13', 'code_128'].includes(result.format) && typeof result.rawValue === 'string' && result.rawValue);
            if (found) record(found.rawValue, found.format === 'ean_13' ? 'EAN_13' : 'CODE_128', token);
          }).catch(() => { engine.detector = null; }).finally(() => { engine.pending = false; });
        }
        const result = decodeCanvas(el.frame, reader, hints);
        record(result.getText(), ZXing.BarcodeFormat[result.getBarcodeFormat()], token);
      }
    } catch (error) {
      if (!isUnreadable(error)) {
        close('Falha no decodificador. Feche e tente abrir novamente.');
        return;
      }
      if (!reads && attempts === 20) status('Ainda sem leitura. Experimente afastar a etiqueta para focar, melhorar a luz ou comparar com uma foto abaixo.');
    }
    if (token === generation) timer = setTimeout(() => scan(token, reader, hints, engine), 180);
  }
  async function openCamera() {
    let selectedCamera = el.camera.value || '';
    if (!selectedCamera) rememberCamera('');
    const previous = previousDeviceId;
    close();
    cameraDiagnostic = { requestedDeviceId: selectedCamera || null, previousDeviceId: previous, devices: [], enumerationStatus: 'pending' };
    el['camera-status'].textContent = 'Aguardando identificação da câmera…';
    if (!window.isSecureContext) return status('A câmera precisa de HTTPS confiável no celular. Abra o endereço HTTPS do PDV.');
    if (!navigator.mediaDevices?.getUserMedia) return status('Este navegador não disponibiliza a câmera. Tente Chrome no Android ou Safari no iPhone.');
    if (!window.ZXing) return status('O decodificador não carregou. Recarregue a página.');
    const token = generation;
    el.start.disabled = true; el.stop.disabled = false;
    blocked = new Set(); reads = duplicates = attempts = 0; stats();
    focus = 'automático do aparelho';
    el.snapshot.hidden = true; el['snapshot-caption'].textContent = '';
    el.diagnostics.textContent = 'Versão 9 · Aguardando primeiro quadro da câmera…';
    el.history.replaceChildren(); el.code.textContent = 'Aguardando leitura';
    el.format.textContent = 'EAN-13 e Code 128 · QR Code ignorado';
    status('Solicitando acesso à câmera…');
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) { audio = new Audio(); audio.resume().catch(() => {}); }
    } catch { audio = null; }
    try {
      const requestCamera = () => navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(selectedCamera ? { deviceId: { exact: selectedCamera } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } } });
      let incoming;
      try { incoming = await requestCamera(); }
      catch (error) {
        if (token !== generation) return;
        if (!selectedCamera || selectedCamera !== savedCamera || !['NotFoundError', 'OverconstrainedError'].includes(error.name)) throw error;
        rememberCamera(''); selectedCamera = ''; el.camera.value = '';
        cameraDiagnostic.preferenceFallback = 'A câmera salva não está disponível; usando seleção automática.';
        cameraDiagnostic.requestedDeviceId = null;
        incoming = await requestCamera();
      }
      if (token !== generation) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming;
      incoming.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (token === generation) close('A câmera foi interrompida. Abra novamente.'); }));
      el.video.srcObject = incoming;
      await el.video.play();
      if (token !== generation) return;
      try {
        const track = incoming.getVideoTracks()[0];
        if (track?.getCapabilities?.().focusMode?.includes('continuous') && track.applyConstraints) {
          // Some camera drivers delay this promise. Focusing is optional and must
          // not keep an already visible video from entering the decode loop.
          Promise.resolve().then(() => {
            if (token === generation) return track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          }).then(() => {
            if (token !== generation) return;
            const actual = track.getSettings?.().focusMode;
            focus = actual ? `${actual} (informado pela câmera)` : 'contínuo solicitado';
          }).catch(() => {});
        }
      } catch { /* Unsupported focus must not prevent scanning. */ }
      if (token !== generation) return;
      const activeTrack = incoming.getVideoTracks()[0];
      reportCamera(activeTrack);
      if (cameraDiagnostic.selectionResult === 'matched') rememberCamera(selectedCamera);
      previousDeviceId = cameraDiagnostic.actualDeviceId;
      try {
        const actualFocus = activeTrack?.getSettings?.().focusMode;
        if (actualFocus) focus = `${actualFocus} (informado pela câmera)`;
      } catch { /* Settings may be unavailable. */ }
      // Enumeration happens after permission so the browser can expose lens labels.
      // Keep scanning if enumeration is unsupported or fails.
      if (navigator.mediaDevices.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices().then(devices => {
          if (token !== generation) return;
          const cameras = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
          cameraDiagnostic.devices = cameras.map(device => ({ deviceId: device.deviceId, groupId: device.groupId || '', label: device.label || '' }));
          cameraDiagnostic.enumerationStatus = 'available';
          reportCamera(activeTrack);
          el.camera.replaceChildren();
          const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Traseira automática'; el.camera.append(automatic);
          cameras.forEach((device, index) => {
            const option = document.createElement('option'); option.value = device.deviceId;
            option.textContent = device.label || `Câmera ${index + 1}`; el.camera.append(option);
          });
          const currentId = activeTrack?.getSettings?.().deviceId;
          el.camera.value = selectedCamera || (cameras.some(camera => camera.deviceId === currentId) ? currentId : '');
          el.camera.disabled = cameras.length < 2;
        }).catch(() => { if (token === generation) cameraDiagnostic.enumerationStatus = 'failed'; });
      } else { cameraDiagnostic.enumerationStatus = 'unsupported'; }
      const hints = hintsForBars();
      status('Câmera aberta. Aponte as barras para a faixa central.');
      scan(token, new ZXing.MultiFormatReader(), hints, nativeReader(token));
    } catch (error) {
      if (token !== generation) return;
      if (error.name === 'OverconstrainedError' || error.name === 'NotFoundError') el.camera.value = '';
      const messages = { NotAllowedError: 'Permissão negada. Autorize a câmera nas configurações deste site e tente novamente.', NotFoundError: 'Nenhuma câmera disponível. Tente abrir novamente para usar a seleção automática.', OverconstrainedError: 'Essa câmera não está disponível. Tente abrir novamente para usar a seleção automática.', NotReadableError: 'Câmera ocupada ou indisponível. Feche outros aplicativos e tente novamente.' };
      el['camera-status'].textContent = 'Abertura não concluída; seleção de câmera não confirmada.';
      close(messages[error.name] || 'Não foi possível iniciar a câmera. Confira a permissão e tente novamente.');
    }
  }
  el.start.addEventListener('click', openCamera);
  el.stop.addEventListener('click', () => close());
  el.capture.addEventListener('click', () => {
    if (!stream || !attempts) return;
    el.snapshot.width = el.frame.width; el.snapshot.height = el.frame.height;
    el.snapshot.getContext('2d').drawImage(el.frame, 0, 0);
    el.snapshot.hidden = false;
    try {
      const capturedAt = new Date().toISOString();
      const basename = `camera-${capturedAt.replace(/[:.]/g, '-')}`;
      const original = document.createElement('canvas');
      original.width = el.video.videoWidth; original.height = el.video.videoHeight;
      original.getContext('2d').drawImage(el.video, 0, 0);
      const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
      reportCamera(stream.getVideoTracks()[0]);
      const metadata = { version: 9, capturedAt, focus, settings,
        camera: { ...cameraDiagnostic,
          capabilities: optionalInfo(stream.getVideoTracks()[0], 'getCapabilities'),
          constraints: optionalInfo(stream.getVideoTracks()[0], 'getConstraints') },
        original: { width: original.width, height: original.height },
        reader: { width: el.frame.width, height: el.frame.height, attempts },
        note: 'Quadro original capturado ao clicar; quadro do leitor da última análise, podendo ser de instante anterior.' };
      const downloads = [
        [el['save-frame'], original.toDataURL('image/png'), `${basename}-original.png`],
        [el['save-reader'], el.snapshot.toDataURL('image/png'), `${basename}-leitor.png`],
        [el['save-diagnostics'], `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata, null, 2))}`, `${basename}.json`]
      ];
      for (const [link, href, filename] of downloads) {
        link.href = href; link.download = filename; link.hidden = false;
      }
    } catch {
      for (const id of ['save-frame', 'save-reader', 'save-diagnostics']) el[id].hidden = true;
      el['snapshot-caption'].textContent = 'Não foi possível preparar os arquivos. Capture novamente.';
      return;
    }
    el['snapshot-caption'].textContent = `Quadro ${attempts}, ${el.frame.width} × ${el.frame.height}. Esta é a imagem enviada ao leitor. Use os links abaixo para salvar no aparelho antes de fechar a página. Confira se todas as barras e as margens claras estão nítidas.`;
  });
  el.camera.addEventListener('change', () => { if (stream) return openCamera(); });
  el.rearm.addEventListener('click', () => { releaseGeneration++; blocked.clear(); el.rearm.disabled = true; status('Nova leitura liberada manualmente. Reapresente a etiqueta.'); });
  el.photo.addEventListener('change', async () => {
    const file = el.photo.files?.[0];
    const request = ++photoGeneration;
    if (!file) return;
    close('Câmera fechada para analisar a foto.');
    if (!window.ZXing) { el['photo-result'].textContent = 'O decodificador não carregou. Recarregue a página.'; return; }
    if (file.size > 20 * 1024 * 1024) { el['photo-result'].textContent = 'Escolha uma foto de até 20 MB.'; return; }
    el['photo-result'].textContent = 'Analisando foto no aparelho…';
    try {
      // The server CSP permits data: images, but deliberately disallows blob:.
      // FileReader keeps the photo local while using the existing image policy.
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.onabort = () => reject(new Error('Leitura da foto cancelada'));
        reader.readAsDataURL(file);
      });
      if (request !== photoGeneration) return;
      const img = new Image();
      await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url; });
      if (request !== photoGeneration) return;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = decodeCanvas(canvas, new ZXing.MultiFormatReader(), hintsForBars());
      el['photo-result'].textContent = `Foto: ${result.getText()} · ${ZXing.BarcodeFormat[result.getBarcodeFormat()]}`;
    } catch (error) {
      if (request === photoGeneration) el['photo-result'].textContent = isUnreadable(error) ? 'Código não identificado nesta foto. Tente uma foto mais nítida, com todas as barras e as margens claras visíveis.' : 'Não foi possível analisar essa imagem. Tente uma foto JPG ou PNG.';
    }
  });
  window.addEventListener('pagehide', () => close());
  document.addEventListener('visibilitychange', () => { if (document.hidden) close('Câmera encerrada ao sair da página. Abra novamente para continuar.'); });
})();
