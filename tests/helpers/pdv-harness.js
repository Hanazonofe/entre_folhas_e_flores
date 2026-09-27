'use strict';

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

module.exports = { createClock, createDeferred, createControlledApi };
