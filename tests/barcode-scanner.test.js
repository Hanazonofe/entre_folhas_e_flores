const test = require('node:test');
const assert = require('node:assert/strict');
const { TemporalBarcodeClassifier } = require('../barcode-scanner.js');

function createClock() {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimeout(callback, delay) {
      const id = ++nextId;
      timers.set(id, { callback, at: time + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const target = time + ms;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.at <= target)
          .sort(([, a], [, b]) => a.at - b.at)[0];
        if (!due) break;
        const [id, timer] = due;
        timers.delete(id);
        time = timer.at;
        timer.callback();
      }
      time = target;
    },
  };
}

function setup() {
  const clock = createClock();
  const scans = [];
  const manual = [];
  const scanner = new TemporalBarcodeClassifier({
    now: clock.now,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    onScan: code => scans.push(code),
    onManual: text => manual.push(text),
  });
  return { clock, scanner, scans, manual };
}

function type(scanner, clock, text, interval = 35) {
  for (const [index, char] of [...text].entries()) {
    scanner.handleKey(char);
    if (index < text.length - 1) clock.advance(interval);
  }
}

test('@spec:AC-001 reconhece uma leitura rápida sem foco na busca e sem Enter', () => {
  const { clock, scanner, scans } = setup();
  type(scanner, clock, '12345', 35);

  assert.deepEqual(scans, []);
  clock.advance(79);
  assert.deepEqual(scans, []);
  clock.advance(1);
  assert.deepEqual(scans, ['12345']);
});

test('@spec:AC-006 entrega o código interno completo, preservando zeros e sem prefixo', () => {
  const { clock, scanner, scans } = setup();
  type(scanner, clock, '000123', 34);
  clock.advance(80);

  assert.deepEqual(scans, ['000123']);
  assert.notEqual(scans[0], '00012');
});

test('@spec:AC-008 classifica digitação lenta como manual e nunca como leitura', () => {
  const { clock, scanner, scans, manual } = setup();
  type(scanner, clock, '12345', 36);
  scanner.handleKey('Enter');

  assert.deepEqual(scans, []);
  assert.deepEqual(manual, ['12', '34', '5']);
});

test('@spec:AC-009 não promove digitação manual fora da busca a leitura automática', () => {
  const { clock, scanner, scans, manual } = setup();
  type(scanner, clock, '98765', 36);
  clock.advance(80);

  assert.deepEqual(scans, []);
  assert.deepEqual(manual, ['98', '76', '5']);
});

test('finaliza uma vez e consome Enter tardio após o silêncio', () => {
  const { clock, scanner, scans } = setup();
  type(scanner, clock, '12345', 20);
  clock.advance(80);
  assert.equal(scanner.handleKey('Enter').kind, 'protected-enter');
  assert.deepEqual(scans, ['12345']);
});

test('não aproveita como leitura o sufixo de uma sequência desqualificada', () => {
  const { clock, scanner, scans, manual } = setup();
  scanner.handleKey('1');
  clock.advance(36);
  scanner.handleKey('23456'[0]);
  type(scanner, clock, '3456', 20);
  clock.advance(80);

  assert.deepEqual(scans, []);
  assert.deepEqual(manual, ['12', '3456']);
});
