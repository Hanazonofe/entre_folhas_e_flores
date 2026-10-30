/* Protótipo isolado: sem consulta HTTP e sem mutação do carrinho. */
(() => {
  'use strict';
  const el = Object.fromEntries(['start', 'stop', 'status', 'video', 'frame', 'code', 'format', 'stats', 'rearm', 'history', 'diagnostics', 'preview', 'photo', 'photo-result'].map(id => [id, document.getElementById(id)]));
  let generation = 0, stream = null, timer = null, audio = null;
  let blocked = new Set(), reads = 0, duplicates = 0;
  let attempts = 0, focus = 'automático do aparelho', photoGeneration = 0;
  const hintsForBars = () => new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.CODE_128]], [ZXing.DecodeHintType.TRY_HARDER, true]]);
  const isUnreadable = error => error instanceof ZXing.NotFoundException || error instanceof ZXing.ChecksumException || error instanceof ZXing.FormatException;
  function decodeCanvas(canvas, reader, hints) {
    return reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas))), hints);
  }
  const status = text => { el.status.textContent = text; };
  const stats = () => { el.stats.textContent = `${reads} leituras · ${duplicates} repetições bloqueadas`; };
  function close(message = 'Câmera fechada.') {
    generation++;
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    el.video.pause();
    el.video.srcObject = null;
    if (audio) { audio.close().catch(() => {}); audio = null; }
    el.start.disabled = false;
    el.stop.disabled = true;
    el.rearm.disabled = true;
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
  function scan(token, reader, hints) {
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
        el.diagnostics.textContent = `Versão 2 · ${el.video.videoWidth} × ${el.video.videoHeight} · foco: ${focus} · ${attempts} quadros analisados`;
        const result = decodeCanvas(el.frame, reader, hints);
        const code = result.getText();
        if (blocked.has(code)) { duplicates++; stats(); }
        else {
          blocked.add(code); reads++;
          el.code.textContent = code;
          const format = ZXing.BarcodeFormat[result.getBarcodeFormat()];
          el.format.textContent = format;
          const item = document.createElement('li');
          item.textContent = `${new Date().toLocaleTimeString('pt-BR')} · ${code} · ${format}`;
          el.history.prepend(item);
          while (el.history.children.length > 30) el.history.lastElementChild.remove();
          el.rearm.disabled = false;
          stats();
          status(beep() ? 'Código lido. Retire a etiqueta antes de liberar outra leitura.' : 'Código lido (som indisponível). Retire a etiqueta antes de liberar outra leitura.');
        }
      }
    } catch (error) {
      if (!isUnreadable(error)) {
        close('Falha no decodificador. Feche e tente abrir novamente.');
        return;
      }
      if (!reads && attempts === 20) status('Ainda sem leitura. Experimente afastar a etiqueta para focar, melhorar a luz ou comparar com uma foto abaixo.');
    }
    if (token === generation) timer = setTimeout(() => scan(token, reader, hints), 180);
  }
  el.start.addEventListener('click', async () => {
    close();
    if (!window.isSecureContext) return status('A câmera precisa de HTTPS confiável no celular. Abra o endereço HTTPS do PDV.');
    if (!navigator.mediaDevices?.getUserMedia) return status('Este navegador não disponibiliza a câmera. Tente Chrome no Android ou Safari no iPhone.');
    if (!window.ZXing) return status('O decodificador não carregou. Recarregue a página.');
    const token = generation;
    el.start.disabled = true; el.stop.disabled = false;
    blocked = new Set(); reads = duplicates = attempts = 0; stats();
    focus = 'automático do aparelho';
    el.history.replaceChildren(); el.code.textContent = 'Aguardando leitura';
    el.format.textContent = 'EAN-13 e Code 128 · QR Code ignorado';
    status('Solicitando acesso à câmera…');
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) { audio = new Audio(); audio.resume().catch(() => {}); }
    } catch { audio = null; }
    try {
      const incoming = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (token !== generation) { incoming.getTracks().forEach(track => track.stop()); return; }
      stream = incoming;
      incoming.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (token === generation) close('A câmera foi interrompida. Abra novamente.'); }));
      el.video.srcObject = incoming;
      await el.video.play();
      if (token !== generation) return;
      try {
        const track = incoming.getVideoTracks()[0];
        if (track?.getCapabilities?.().focusMode?.includes('continuous') && track.applyConstraints) {
          await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
          if (token !== generation) return;
          focus = 'contínuo solicitado';
        }
      } catch { /* Unsupported focus must not prevent scanning. */ }
      if (token !== generation) return;
      const hints = hintsForBars();
      status('Câmera aberta. Aponte as barras para a faixa central.');
      scan(token, new ZXing.MultiFormatReader(), hints);
    } catch (error) {
      if (token !== generation) return;
      const messages = { NotAllowedError: 'Permissão negada. Autorize a câmera nas configurações deste site e tente novamente.', NotFoundError: 'Nenhuma câmera disponível neste aparelho.', NotReadableError: 'Câmera ocupada ou indisponível. Feche outros aplicativos e tente novamente.' };
      close(messages[error.name] || 'Não foi possível iniciar a câmera. Confira a permissão e tente novamente.');
    }
  });
  el.stop.addEventListener('click', () => close());
  el.rearm.addEventListener('click', () => { blocked.clear(); el.rearm.disabled = true; status('Nova leitura liberada manualmente. Reapresente a etiqueta.'); });
  el.photo.addEventListener('change', async () => {
    const file = el.photo.files?.[0];
    const request = ++photoGeneration;
    if (!file) return;
    close('Câmera fechada para analisar a foto.');
    if (!window.ZXing) { el['photo-result'].textContent = 'O decodificador não carregou. Recarregue a página.'; return; }
    if (file.size > 20 * 1024 * 1024) { el['photo-result'].textContent = 'Escolha uma foto de até 20 MB.'; return; }
    el['photo-result'].textContent = 'Analisando foto no aparelho…';
    const url = URL.createObjectURL(file);
    try {
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
    } finally { URL.revokeObjectURL(url); }
  });
  window.addEventListener('pagehide', () => close());
  document.addEventListener('visibilitychange', () => { if (document.hidden) close('Câmera encerrada ao sair da página. Abra novamente para continuar.'); });
})();
