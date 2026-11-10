/* Camera capture only; sale mutations and confirmations belong to the caller. */
(() => {
  'use strict';
  class CameraScanner {
    constructor({video, select, rearm, onScan, onStatus, onStop}) {
      Object.assign(this, {video, select, rearm, onScan, onStatus, onStop});
      this.generation = 0; this.blocked = new Set(); this.key = 'camera-mobile.preferred-device.v1';
      this.preference = '';
      try { this.preference = localStorage.getItem(this.key) || ''; } catch { /* Optional. */ }
      this.canvas = document.createElement('canvas');
      select.addEventListener('change', () => { if (this.stream) return this.open(select.value, true); });
      rearm.addEventListener('click', () => { if (!this.stream) return; this.blocked.clear(); rearm.disabled = true; onStatus('Nova leitura liberada. Aponte para o produto desejado.'); });
    }
    stop() {
      this.generation++; clearTimeout(this.timer);
      this.stream?.getTracks().forEach(track => track.stop()); this.stream = null;
      this.video.pause(); this.video.srcObject = null;
      this.blocked.clear(); this.select.disabled = true; this.rearm.disabled = true;
      if (this.audio) { this.audio.close().catch(() => {}); this.audio = null; }
    }
    async open(deviceId = this.preference, switching = false) {
      this.stop();
      if (switching) this.onStop?.();
      const token = this.generation;
      this.onStatus('Solicitando câmera…');
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Câmera indisponível. Use HTTPS confiável e autorize a câmera, ou continue pela busca manual.');
        if (!window.ZXing) throw new Error('Leitor não carregado. Recarregue a página ou use a busca manual.');
        try { const Audio = window.AudioContext || window.webkitAudioContext; if (Audio) { this.audio = new Audio(); this.audio.resume().catch(() => {}); } } catch { /* Visual confirmation remains available. */ }
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId ? {deviceId:{exact:deviceId}} : {facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1080}}});
        } catch (error) {
          if (token !== this.generation) return;
          if (deviceId && ['NotFoundError','OverconstrainedError'].includes(error.name)) {
            this.preference = ''; try { localStorage.removeItem(this.key); } catch { /* Optional. */ }
            return this.open('', switching);
          }
          throw error;
        }
        if (token !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
        this.stream = stream; this.video.srcObject = stream;
        const track = stream.getVideoTracks()[0];
        track.addEventListener?.('ended', () => { if (token === this.generation) { this.stop(); this.onStop?.(); this.onStatus('A câmera foi interrompida. Feche e abra o leitor novamente.'); } });
        await this.video.play(); if (token !== this.generation) return;
        const current = track.getSettings?.().deviceId;
        if (deviceId && current && deviceId !== current) throw new Error('O navegador abriu outra câmera. Selecione a câmera desejada novamente.');
        if (deviceId && current === deviceId) { this.preference = deviceId; try { localStorage.setItem(this.key,deviceId); } catch { /* Optional. */ } }
        try {
          if (track.getCapabilities?.().focusMode?.includes('continuous')) Promise.resolve(track.applyConstraints({advanced:[{focusMode:'continuous'}]})).catch(() => {});
        } catch { /* Focusing cannot block reading. */ }
        if (navigator.mediaDevices.enumerateDevices) navigator.mediaDevices.enumerateDevices().then(devices => {
          if (token !== this.generation) return;
          this.select.replaceChildren();
          const auto = document.createElement('option'); auto.value = ''; auto.textContent = 'Traseira automática'; this.select.append(auto);
          devices.filter(d => d.kind === 'videoinput' && d.deviceId).forEach((d,i) => { const option = document.createElement('option'); option.value = d.deviceId; option.textContent = d.label || `Câmera ${i+1}`; this.select.append(option); });
          this.select.value = current || ''; this.select.disabled = false;
        }).catch(() => {});
        const reader = new ZXing.MultiFormatReader();
        const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.CODE_128]],[ZXing.DecodeHintType.TRY_HARDER,true]]);
        this.onStatus('Aponte para o código. Para repetir um produto, use Ler novamente.');
        const scan = () => {
          if (token !== this.generation || !this.stream) return;
          try {
            if (this.video.readyState >= 2 && this.video.videoWidth) {
              this.canvas.width = this.video.videoWidth; this.canvas.height = this.video.videoHeight;
              this.canvas.getContext('2d',{willReadFrequently:true}).drawImage(this.video,0,0);
              const result = reader.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(this.canvas))),hints);
              const code = result.getText(), format = result.getBarcodeFormat();
              if ([ZXing.BarcodeFormat.EAN_13,ZXing.BarcodeFormat.CODE_128].includes(format) && typeof code === 'string' && code && !this.blocked.has(code)) {
                this.blocked.add(code); this.rearm.disabled = false; this.onScan(code);
              }
            }
          } catch (error) {
            if (![ZXing.NotFoundException,ZXing.ChecksumException,ZXing.FormatException].some(Type => error instanceof Type)) {
              this.stop(); this.onStop?.(); this.onStatus('Falha no leitor. Feche e abra novamente, ou use a busca manual.'); return;
            }
          }
          if (token === this.generation) this.timer = setTimeout(scan,180);
        };
        scan();
      } catch (error) {
        if (token !== this.generation) return;
        this.stop(); this.onStop?.();
        this.onStatus(error.name === 'NotAllowedError' ? 'Permissão negada. Autorize a câmera nas configurações do navegador ou use a busca manual.' : error.message || 'Câmera indisponível. Use a busca manual.');
      }
    }
    confirm() {
      try {
        if (this.audio?.state !== 'running') return;
        const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
        oscillator.frequency.value = 880; gain.gain.setValueAtTime(0.08,this.audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001,this.audio.currentTime+0.12);
        oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime+0.13);
      } catch { /* Visual success does not depend on sound. */ }
    }
  }
  window.CameraScanner = CameraScanner;
})();
