'use strict';

/**
 * Unit-Tests für src/push.js — send-paths, gone-classification, mismatch
 * counter, body-length cap, sendToAll aggregation.
 *
 * Strategie:
 *   1. web-push wird via require.cache vor dem ersten Require von push.js
 *      durch einen Stub ersetzt (sendNotification ist konfigurierbar pro Test).
 *   2. DB-Singleton wird auf einen Fake-Handle gesetzt, dessen prepare/run/
 *      get/all Calls die `last_seen`-Aktualisierung sichtbar machen.
 *   3. Pro Test wird der Modul-Cache invalidiert + ein frischer tmpdir
 *      gesetzt, damit VAPID-File und _initialized aus früheren Tests nicht
 *      durchschlagen.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const WEB_PUSH_PATH = require.resolve('web-push');

// Absoluter Pfad zum src/-Verzeichnis dieses Repos — robust gegen den Namen
// des Checkout-Ordners. Lokal heisst er evtl. "wissen", auf GitHub-CI
// dagegen "WISSen"; ein Substring-Filter auf "wissen" wäre dort ein
// No-op und würde den Modul-Cache zwischen Test-Dateien lecken lassen.
const SRC_DIR = path.resolve(__dirname, '..', '..', 'src') + path.sep;

function freshTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-push-test-'));
  process.chdir(dir);
  return dir;
}

function clearTocco() {
  // Alle src-Module dieses Repos invalidieren — über den absoluten SRC_DIR
  // statt über einen Ordnernamen-Substring, damit es unabhängig vom
  // Checkout-Verzeichnis (z.B. "WISSen" auf CI) funktioniert.
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(SRC_DIR)) {
      delete require.cache[k];
    }
  }
  // Auch den web-push-Stub aus dem Cache werfen, damit ein neuer Stub pro Test
  // gesetzt werden kann.
  if (require.cache[WEB_PUSH_PATH]) delete require.cache[WEB_PUSH_PATH];
}

function installWebPushStub(sendNotificationImpl) {
  const stub = {
    generateVAPIDKeys: () => ({
      publicKey: 'B' + 'A'.repeat(86),     // 87-char placeholder
      privateKey: 'A'.repeat(43)
    }),
    setVapidDetails: () => {},
    sendNotification: sendNotificationImpl
  };
  require.cache[WEB_PUSH_PATH] = {
    id: WEB_PUSH_PATH,
    filename: WEB_PUSH_PATH,
    loaded: true,
    exports: stub
  };
  return stub;
}

// In-Memory Fake-DB. Speichert touch-Calls, damit Tests assertieren können dass
// last_seen nach einem 200 wirklich aktualisiert wird. Bietet das Subset der
// API, das push.js / dbPush effektiv aufruft.
function makeFakeDb(subs) {
  const touched = [];
  const removed = [];
  const handle = {
    prepare(sql) {
      // SELECT * FROM push_subscriptions WHERE endpoint = ?
      if (/SELECT .* FROM push_subscriptions WHERE endpoint = \?/.test(sql)) {
        return {
          get: (ep) => subs.find(s => s.endpoint === ep) || undefined
        };
      }
      // SELECT * FROM push_subscriptions
      if (/SELECT .* FROM push_subscriptions$/.test(sql)) {
        return { all: () => subs.slice() };
      }
      // SELECT COUNT(*)
      if (/SELECT COUNT/.test(sql)) {
        return { get: () => ({ c: subs.length }) };
      }
      // UPDATE last_seen
      if (/UPDATE push_subscriptions SET last_seen/.test(sql)) {
        return {
          run: (ep) => {
            touched.push(ep);
            return { changes: 1 };
          }
        };
      }
      // DELETE
      if (/DELETE FROM push_subscriptions/.test(sql)) {
        return {
          run: (ep) => {
            removed.push(ep);
            const idx = subs.findIndex(s => s.endpoint === ep);
            if (idx >= 0) subs.splice(idx, 1);
            return { changes: idx >= 0 ? 1 : 0 };
          }
        };
      }
      // INSERT ... ON CONFLICT — not exercised in this file
      return { run: () => ({ changes: 0 }), get: () => undefined, all: () => [] };
    }
  };
  return { handle, touched, removed };
}

function loadPushWithStub({ sendNotificationImpl, subs }) {
  clearTocco();
  installWebPushStub(sendNotificationImpl);
  const push = require('../../src/push');
  const db = require('../../src/db');
  const fake = makeFakeDb(subs);
  // db-Singleton überschreiben — getInstance wird in sendOne/sendToAll
  // mehrfach aufgerufen.
  db.getInstance = () => fake.handle;
  return { push, db, fake };
}

function makeSub(suffix) {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/' + suffix,
    p256dh: 'p' + suffix,
    auth: 'a' + suffix
  };
}

test('sendOne: 200 → ok=true + last_seen touched', async () => {
  freshTmp();
  const sub = makeSub('ok-200');
  const { push, fake } = loadPushWithStub({
    sendNotificationImpl: async () => ({ statusCode: 201 }),
    subs: [sub]
  });
  const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  const r = await push.sendOne(subscription, { title: 't', body: 'b' });
  assert.deepStrictEqual(r, { ok: true });
  assert.deepStrictEqual(fake.touched, [sub.endpoint], 'last_seen must be touched on success');
});

test('sendOne: 404 → gone=true', async () => {
  freshTmp();
  const sub = makeSub('gone-404');
  const err = Object.assign(new Error('Not Found'), { statusCode: 404 });
  const { push, fake } = loadPushWithStub({
    sendNotificationImpl: async () => { throw err; },
    subs: [sub]
  });
  const r = await push.sendOne(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { title: 't', body: 'b' }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.gone, true);
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(fake.touched, [], 'last_seen must NOT be touched on permanent failure');
});

test('sendOne: 410 → gone=true', async () => {
  freshTmp();
  const sub = makeSub('gone-410');
  const err = Object.assign(new Error('Gone'), { statusCode: 410 });
  const { push } = loadPushWithStub({
    sendNotificationImpl: async () => { throw err; },
    subs: [sub]
  });
  const r = await push.sendOne(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { title: 't', body: 'b' }
  );
  assert.strictEqual(r.gone, true);
  assert.strictEqual(r.status, 410);
});

test('sendOne: 401 → transient=true, gone=false, mismatch-counter incremented', async () => {
  freshTmp();
  const sub = makeSub('mismatch-401');
  const err = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  const { push } = loadPushWithStub({
    sendNotificationImpl: async () => { throw err; },
    subs: [sub]
  });
  const before = push.getStatus().vapidMismatchRemovedIn24h;
  const r = await push.sendOne(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { title: 't', body: 'b' }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.gone, false);
  assert.strictEqual(r.transient, true);
  assert.strictEqual(r.reason, 'vapid-mismatch');
  assert.strictEqual(r.status, 401);
  assert.strictEqual(push.getStatus().vapidMismatchRemovedIn24h, before + 1);
});

test('sendOne: 403 → transient=true, gone=false', async () => {
  freshTmp();
  const sub = makeSub('mismatch-403');
  const err = Object.assign(new Error('Forbidden'), { statusCode: 403 });
  const { push } = loadPushWithStub({
    sendNotificationImpl: async () => { throw err; },
    subs: [sub]
  });
  const r = await push.sendOne(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { title: 't', body: 'b' }
  );
  assert.strictEqual(r.gone, false);
  assert.strictEqual(r.transient, true);
  assert.strictEqual(r.status, 403);
});

test('sendOne: 500 → gone=false (other non-2xx)', async () => {
  freshTmp();
  const sub = makeSub('error-500');
  const err = Object.assign(new Error('Server Error'), { statusCode: 500 });
  const { push } = loadPushWithStub({
    sendNotificationImpl: async () => { throw err; },
    subs: [sub]
  });
  const r = await push.sendOne(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    { title: 't', body: 'b' }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.gone, false);
  assert.strictEqual(r.status, 500);
  assert.notStrictEqual(r.transient, true, '500 ist nicht als transient klassifiziert');
});

test('capBody truncates >120 chars with ellipsis suffix', () => {
  freshTmp();
  const { push } = loadPushWithStub({
    sendNotificationImpl: async () => ({ statusCode: 201 }),
    subs: []
  });
  const longBody = 'x'.repeat(200);
  const capped = push.__test_capBody(longBody);
  assert.ok(capped.length <= 120, 'capped body must be <=120 chars, got ' + capped.length);
  assert.ok(capped.endsWith('…'), 'capped body must end with ellipsis');
  // Sanity: short bodies pass through.
  assert.strictEqual(push.__test_capBody('short'), 'short');
});

test('notifyGradeChanges produces body capped at ~120 chars', async () => {
  freshTmp();
  const sentPayloads = [];
  const { push } = loadPushWithStub({
    sendNotificationImpl: async (subscription, payload) => {
      sentPayloads.push(JSON.parse(payload));
      return { statusCode: 201 };
    },
    subs: [makeSub('cap-1')]
  });
  // Construct a kuerzel with a huge fach_name + pruefungen-diff suffix that
  // would blow past 120 chars without capBody.
  const gradeChanges = [{
    type: 'changed',
    kuerzel_id: 'k1',
    kuerzel_code: 'WISS-' + 'X'.repeat(80),
    fach_name: 'Sehr langer Modulname mit ' + 'Y'.repeat(60),
    prev_note: 4.7,
    new_note: 4.85
  }];
  const pcByKuerzel = {
    k1: [
      { pruefung_typ: 'ZP', pruefung_nr: 1, prev_bewertung: 4.0, new_bewertung: 4.5 },
      { pruefung_typ: 'LB', pruefung_nr: 2, prev_bewertung: 5.0, new_bewertung: 5.5 }
    ]
  };
  await push.notifyGradeChanges(gradeChanges, undefined, pcByKuerzel);
  assert.strictEqual(sentPayloads.length, 1);
  const body = sentPayloads[0].body;
  assert.ok(body.length <= 120, 'body must be <=120 chars, got ' + body.length + ': ' + body);
});

test('sendToAll aggregates partial failures via Promise.allSettled', async () => {
  freshTmp();
  const subs = [makeSub('ok'), makeSub('gone'), makeSub('transient'), makeSub('error')];
  const { push } = loadPushWithStub({
    sendNotificationImpl: async (subscription) => {
      const ep = subscription.endpoint;
      if (ep.endsWith('/ok')) return { statusCode: 201 };
      if (ep.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      if (ep.endsWith('/transient')) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
      if (ep.endsWith('/error')) throw Object.assign(new Error('Boom'), { statusCode: 500 });
      throw new Error('unknown endpoint in test');
    },
    subs
  });
  const r = await push.sendToAll({ title: 't', body: 'b' });
  assert.strictEqual(r.sent, 1, 'one 201 response');
  assert.strictEqual(r.removed, 1, 'one 410 response removed');
  // 403 (transient) + 500 (other) both surface in errors[].
  assert.strictEqual(r.errors.length, 2, 'two non-permanent failures surface in errors');
  const statuses = r.errors.map(e => e.status).sort();
  assert.deepStrictEqual(statuses, [403, 500]);
});
