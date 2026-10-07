(function attachBarcodeScanner(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.BarcodeScanner = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createBarcodeScanner() {
  'use strict';

  const DEFAULTS = Object.freeze({
    maxIntervalMs: 35,
    silenceMs: 80,
    minLength: 5,
    maxLength: 100,
    enterProtectionMs: 150,
  });

  class TemporalBarcodeClassifier {
    constructor(options = {}) {
      this.options = { ...DEFAULTS, ...options };
      this.onScan = options.onScan || (() => {});
      this.onManual = options.onManual || (() => {});
      this.now = options.now || (() => Date.now());
      this.setTimeout = options.setTimeout || ((callback, delay) => setTimeout(callback, delay));
      this.clearTimeout = options.clearTimeout || (timer => clearTimeout(timer));
      this.buffer = '';
      this.lastCharacterAt = null;
      this.timer = null;
      this.sequenceId = 0;
      this.protectEnterUntil = null;
    }

    handleKey(key, at = this.now()) {
      if (key === 'Shift') return { kind: 'ignored' };

      if (key === 'Enter') return this._handleEnter(at);

      if (!/^\d$/.test(key)) {
        this._finishManual();
        this.protectEnterUntil = null;
        return { kind: 'manual' };
      }

      this.protectEnterUntil = null;
      if (this.buffer && at - this.lastCharacterAt > this.options.maxIntervalMs) {
        // A slow interval disqualifies the whole sequence. In particular, its
        // suffix must never become a second scanner candidate.
        this.buffer += key;
        this.lastCharacterAt = at;
        this._finishManual();
        return { kind: 'manual' };
      }

      this.buffer += key;
      this.lastCharacterAt = at;
      if (this.buffer.length > this.options.maxLength) {
        this._finishManual();
        return { kind: 'manual' };
      }
      this._scheduleSilence();
      return { kind: 'candidate' };
    }

    cancel() {
      this._clearTimer();
      this.buffer = '';
      this.lastCharacterAt = null;
      this.sequenceId += 1;
      this.protectEnterUntil = null;
    }

    _handleEnter(at) {
      if (this.buffer) {
        if (this.buffer.length >= this.options.minLength) return this._finishScan(at);
        this._finishManual();
        return { kind: 'manual' };
      }
      if (this.protectEnterUntil !== null && at <= this.protectEnterUntil) {
        return { kind: 'protected-enter' };
      }
      this.protectEnterUntil = null;
      return { kind: 'manual' };
    }

    _scheduleSilence() {
      this._clearTimer();
      const sequenceId = ++this.sequenceId;
      this.timer = this.setTimeout(() => {
        if (sequenceId !== this.sequenceId || !this.buffer) return;
        const elapsed = this.now() - this.lastCharacterAt;
        if (elapsed < this.options.silenceMs) {
          this._scheduleSilence();
          return;
        }
        if (this.buffer.length >= this.options.minLength) this._finishScan(this.now());
        else this._finishManual();
      }, this.options.silenceMs);
    }

    _finishScan(at) {
      const code = this.buffer;
      this._clearTimer();
      this.buffer = '';
      this.lastCharacterAt = null;
      this.sequenceId += 1;
      this.protectEnterUntil = at + this.options.enterProtectionMs;
      this.onScan(code);
      return { kind: 'scan', code };
    }

    _finishManual() {
      if (!this.buffer) return;
      const text = this.buffer;
      this._clearTimer();
      this.buffer = '';
      this.lastCharacterAt = null;
      this.sequenceId += 1;
      this.onManual(text);
    }

    _clearTimer() {
      if (this.timer !== null) this.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  return { TemporalBarcodeClassifier, DEFAULTS };
}));
