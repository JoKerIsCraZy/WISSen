'use strict';

/**
 * Unit-Tests für push.getStatus() — der Read-only-Diagnose-Snapshot, der
 * vom /api/push/status-Endpoint zurückgegeben wird.
 *
 * Wir testen:
 *  1. Shape des Rückgabewerts (enabled, publicKey, subscriptionCount,
 *     vapidMismatchRemovedIn24h)
 *  2. Defensives Verhalten ohne DB-Singleton (subscriptionCount = 0,
 *     kein Throw)
 *  3. Subscription-Count spiegelt countPushSubscriptions wider
 *  4. vapidMismatchRemovedIn24h inkrementiert sich nach _recordVapidMismatchRemoval
 *
 * Hinweis: push.js requirt web-push direkt — das Modul muss installiert sein.
 * Im Worktree wird es über das parent node_modules aufgelöst.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// chdir BEFORE requiring push/db — schema.js und push.js nutzen process.cwd()
// für DB-Pfad bzw. data/vapid.json. Pro Test-Suite einen frischen tmpdir
// damit Singleton-State und VAPID-File aus früheren Test-Runs nicht stören.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tocco-push-status-'));
process.chdir(tmpDir);

// Module-Cache leeren, damit der db-Singleton und der push-Modul-State
// (insb. _vapidMismatchRemovals24h und _initialized) frisch starten.
for (const k of Object.keys(require.cache)) {
  if (k.includes('wissen') && k.includes('src')) delete require.cache[k];
}

const push = require('../../src/push');

test('getStatus returns expected shape without DB instance', () => {
  // Kein openOnce() — DB-Singleton ist nicht initialisiert.
  // getStatus muss defensiv subscriptionCount=0 liefern statt zu werfen.
  const status = push.getStatus();
  assert.strictEqual(typeof status, 'object');
  assert.ok(status !== null);
  assert.strictEqual(typeof status.enabled, 'boolean');
  assert.ok('publicKey' in status);
  assert.strictEqual(typeof status.subscriptionCount, 'number');
  assert.strictEqual(typeof status.vapidMismatchRemovedIn24h, 'number');
  assert.strictEqual(status.subscriptionCount, 0);
});

test('getStatus enabled=true and publicKey set after init', () => {
  // init() wird intern von getPublicKey() getriggert — getStatus ruft das auf.
  const status = push.getStatus();
  assert.strictEqual(status.enabled, true);
  assert.strictEqual(typeof status.publicKey, 'string');
  assert.ok(status.publicKey.length > 0, 'publicKey sollte nicht leer sein');
});

test('getStatus subscriptionCount reflects DB state', () => {
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tocco-push-status2-'));
  process.chdir(tmpDir2);
  // Cache invalidieren für frischen DB-Singleton in neuem tmpdir.
  for (const k of Object.keys(require.cache)) {
    if (k.includes('wissen') && k.includes('src')) delete require.cache[k];
  }
  const push2 = require('../../src/push');
  const db2 = require('../../src/db');

  const d = db2.openOnce();
  // Initial: leer
  let status = push2.getStatus();
  assert.strictEqual(status.subscriptionCount, 0);

  // Eine Sub einfügen
  db2.addPushSubscription(d, {
    endpoint: 'https://example.com/push/abc',
    keys: { p256dh: 'p256dh-key-value', auth: 'auth-key-value' }
  }, 'ua-test');

  status = push2.getStatus();
  assert.strictEqual(status.subscriptionCount, 1);

  // Zweite Sub
  db2.addPushSubscription(d, {
    endpoint: 'https://example.com/push/def',
    keys: { p256dh: 'p256dh-key-2', auth: 'auth-key-2' }
  }, 'ua-test-2');

  status = push2.getStatus();
  assert.strictEqual(status.subscriptionCount, 2);

  db2.closeInstance();
});

test('vapidMismatchRemovedIn24h increments after __test_recordVapidMismatchRemoval', () => {
  const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'tocco-push-status3-'));
  process.chdir(tmpDir3);
  for (const k of Object.keys(require.cache)) {
    if (k.includes('wissen') && k.includes('src')) delete require.cache[k];
  }
  const push3 = require('../../src/push');

  const before = push3.getStatus().vapidMismatchRemovedIn24h;
  assert.strictEqual(before, 0, 'frischer State sollte 0 Removals haben');

  push3.__test_recordVapidMismatchRemoval();
  assert.strictEqual(push3.getStatus().vapidMismatchRemovedIn24h, before + 1);

  push3.__test_recordVapidMismatchRemoval();
  push3.__test_recordVapidMismatchRemoval();
  assert.strictEqual(push3.getStatus().vapidMismatchRemovedIn24h, before + 3);
});
