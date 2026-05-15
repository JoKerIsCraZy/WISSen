'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Each test uses a fresh tmpdir via process.chdir to isolate settings.json.
// Forces module re-require so the cache state is fresh per test.
function setupTmp() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-settings-cache-'));
  process.chdir(tmpDir);
  delete require.cache[require.resolve('../../src/settings')];
  return require('../../src/settings');
}

test('load() returns cached value on second call', () => {
  const settings = setupTmp();
  const a = settings.load();
  const b = settings.load();
  assert.strictEqual(a, b, 'load() should return same reference when cache is valid');
});

test('save() invalidates cache so next load() rebuilds', () => {
  const settings = setupTmp();
  const a = settings.load();
  settings.save({ intervalMinutes: 42 });
  const b = settings.load();
  assert.notStrictEqual(a, b, 'load() should return new reference after save()');
  assert.strictEqual(b.intervalMinutes, 42);
});

test('subscribe receives new and old settings on save', () => {
  const settings = setupTmp();
  let receivedNew = null;
  let receivedOld = null;
  const unsub = settings.subscribe((n, o) => { receivedNew = n; receivedOld = o; });
  const oldVal = settings.load().intervalMinutes;
  settings.save({ intervalMinutes: 99 });
  assert.strictEqual(receivedOld.intervalMinutes, oldVal);
  assert.strictEqual(receivedNew.intervalMinutes, 99);
  unsub();
});
