'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeEvaluate } = require('../../src/scraper');

// Mock-Page Helper: liefert eine Page-Stub-Instanz, deren evaluate()
// nach einem konfigurierbaren Skript Werte liefert oder Fehler wirft.
function mockPage(scenario) {
  let call = 0;
  return {
    calls: () => call,
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    evaluate: async (fn, arg) => {
      const step = scenario[call++];
      if (!step) throw new Error('mockPage: no more scripted steps');
      if (step.throw) throw step.throw;
      return typeof step.value === 'function' ? step.value(fn, arg) : step.value;
    }
  };
}

test('safeEvaluate: returns value on first try when no error', async () => {
  const page = mockPage([{ value: 42 }]);
  const result = await safeEvaluate(page, () => 42);
  assert.equal(result, 42);
  assert.equal(page.calls(), 1);
});

test('safeEvaluate: passes single arg to page.evaluate', async () => {
  const page = mockPage([{ value: (fn, arg) => arg * 2 }]);
  const result = await safeEvaluate(page, x => x, 21);
  assert.equal(result, 42);
});

test('safeEvaluate: retries on "Execution context was destroyed"', async () => {
  const err = new Error('page.evaluate: Execution context was destroyed, most likely because of navigation');
  const page = mockPage([
    { throw: err },
    { value: 'ok' }
  ]);
  const result = await safeEvaluate(page, () => 'ok');
  assert.equal(result, 'ok');
  assert.equal(page.calls(), 2);
});

test('safeEvaluate: retries on "Cannot find context with specified id"', async () => {
  const err = new Error('Cannot find context with specified id');
  const page = mockPage([
    { throw: err },
    { value: 'ok' }
  ]);
  const result = await safeEvaluate(page, () => 'ok');
  assert.equal(result, 'ok');
});

test('safeEvaluate: retries on "Frame was detached"', async () => {
  const err = new Error('Frame was detached during navigation');
  const page = mockPage([
    { throw: err },
    { value: 'ok' }
  ]);
  const result = await safeEvaluate(page, () => 'ok');
  assert.equal(result, 'ok');
});

test('safeEvaluate: gives up after 3 attempts and throws last error', async () => {
  const err = new Error('Execution context was destroyed');
  const page = mockPage([
    { throw: err },
    { throw: err },
    { throw: err }
  ]);
  await assert.rejects(
    () => safeEvaluate(page, () => 'ok'),
    /Execution context was destroyed/
  );
  assert.equal(page.calls(), 3);
});

test('safeEvaluate: does NOT retry on non-transient errors', async () => {
  const err = new TypeError('foo is not a function');
  const page = mockPage([{ throw: err }]);
  await assert.rejects(
    () => safeEvaluate(page, () => 'ok'),
    /foo is not a function/
  );
  assert.equal(page.calls(), 1, 'should fail fast, no retry');
});

test('safeEvaluate: does NOT retry on "Target closed" (page is gone)', async () => {
  const err = new Error('Target closed');
  const page = mockPage([{ throw: err }]);
  await assert.rejects(
    () => safeEvaluate(page, () => 'ok'),
    /Target closed/
  );
  assert.equal(page.calls(), 1);
});

test('safeEvaluate: succeeds on second retry (3rd attempt)', async () => {
  const err = new Error('Execution context was destroyed');
  const page = mockPage([
    { throw: err },
    { throw: err },
    { value: 'finally' }
  ]);
  const result = await safeEvaluate(page, () => 'finally');
  assert.equal(result, 'finally');
  assert.equal(page.calls(), 3);
});

test('safeEvaluate: distinguishes undefined arg from no arg', async () => {
  // page.evaluate(fn) vs page.evaluate(fn, undefined) — both should work,
  // but we want to verify rest-arg handling doesn't break the no-arg case.
  let receivedArgsCount;
  const page = {
    waitForLoadState: async () => {},
    waitForTimeout: async () => {},
    evaluate: async function (...args) {
      receivedArgsCount = args.length;
      return 'ok';
    }
  };
  await safeEvaluate(page, () => 'ok');
  assert.equal(receivedArgsCount, 1, 'no arg case → only fn passed');

  await safeEvaluate(page, () => 'ok', 'arg');
  assert.equal(receivedArgsCount, 2, 'with arg case → fn + arg passed');
});
