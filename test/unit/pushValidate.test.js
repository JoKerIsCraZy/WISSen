'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePushSubscription } = require('../../src/pushValidate');

// B64URL-Werte, die durch den strikten /^[A-Za-z0-9_-]+$/-Filter durchkommen.
// Bewusst niedrige Entropie (lesbare Fixture-Strings, keine Zufalls-Optik) —
// das sind KEINE echten Credentials und der Secret-Scanner soll nicht anschlagen.
const VALID_P256DH = 'test-p256dh-fixture-not-a-real-key-0000000000000000';
const VALID_AUTH = 'test-auth-fixture-value';

function makeSub(overrides = {}) {
  return {
    endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
    keys: { p256dh: VALID_P256DH, auth: VALID_AUTH },
    ...overrides
  };
}

test('valid FCM endpoint (Chrome) → null', () => {
  assert.equal(validatePushSubscription(makeSub()), null);
});

test('valid Mozilla endpoint → null', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc123' })),
    null
  );
});

test('valid Apple endpoint (web.push.apple.com subdomain) → null', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://api.web.push.apple.com/v3/abc' })),
    null
  );
});

test('valid Apple endpoint (push.apple.com subdomain) → null', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://api.push.apple.com/v3/abc' })),
    null
  );
});

test('valid Windows endpoint → null', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://db5p.notify.windows.com/w/?token=AwYAAA' })),
    null
  );
});

test('SSRF: domain-suffix attack rejected', () => {
  // Klassischer Bypass-Versuch: fcm.googleapis.com.attacker.com endet auf
  // .attacker.com, NICHT auf .fcm.googleapis.com.
  const res = validatePushSubscription(makeSub({
    endpoint: 'https://fcm.googleapis.com.attacker.com/fcm/send/x'
  }));
  assert.equal(res, 'endpoint host not allowed');
});

test('http:// endpoint rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'http://fcm.googleapis.com/fcm/send/x' })),
    'endpoint must be HTTPS'
  );
});

test('SSRF: localhost rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://localhost/fcm/send/x' })),
    'endpoint host not allowed'
  );
});

test('SSRF: 127.0.0.1 rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://127.0.0.1/fcm/send/x' })),
    'endpoint host not allowed'
  );
});

test('SSRF: private IP 192.168.1.1 rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://192.168.1.1/fcm/send/x' })),
    'endpoint host not allowed'
  );
});

test('explicit port rejected (defense-in-depth)', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'https://fcm.googleapis.com:8443/fcm/send/x' })),
    'endpoint must not specify a port'
  );
});

test('endpoint > 1024 chars rejected', () => {
  const longEndpoint = 'https://fcm.googleapis.com/fcm/send/' + 'a'.repeat(1100);
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: longEndpoint })),
    'endpoint too long'
  );
});

test('missing keys.p256dh → "p256dh required"', () => {
  const sub = makeSub();
  delete sub.keys.p256dh;
  assert.equal(validatePushSubscription(sub), 'p256dh required');
});

test('missing keys.auth → "auth required"', () => {
  const sub = makeSub();
  delete sub.keys.auth;
  assert.equal(validatePushSubscription(sub), 'auth required');
});

test('p256dh containing "/" rejected (strict B64URL)', () => {
  assert.equal(
    validatePushSubscription(makeSub({ keys: { p256dh: 'abc/def', auth: VALID_AUTH } })),
    'p256dh invalid'
  );
});

test('p256dh containing "=" rejected (strict B64URL, no padding)', () => {
  assert.equal(
    validatePushSubscription(makeSub({ keys: { p256dh: 'abcdef==', auth: VALID_AUTH } })),
    'p256dh invalid'
  );
});

test('p256dh containing "+" rejected (strict B64URL)', () => {
  assert.equal(
    validatePushSubscription(makeSub({ keys: { p256dh: 'abc+def', auth: VALID_AUTH } })),
    'p256dh invalid'
  );
});

test('auth containing standard-base64 chars rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ keys: { p256dh: VALID_P256DH, auth: 'abc+def/==' } })),
    'auth invalid'
  );
});

test('empty endpoint rejected', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: '' })),
    'endpoint required'
  );
});

test('missing keys object → "keys required"', () => {
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x' };
  assert.equal(validatePushSubscription(sub), 'keys required');
});

test('null/undefined/non-object subscription → "subscription required"', () => {
  assert.equal(validatePushSubscription(null), 'subscription required');
  assert.equal(validatePushSubscription(undefined), 'subscription required');
  assert.equal(validatePushSubscription('foo'), 'subscription required');
  assert.equal(validatePushSubscription(42), 'subscription required');
});

test('malformed endpoint URL → "invalid endpoint URL"', () => {
  assert.equal(
    validatePushSubscription(makeSub({ endpoint: 'not a url' })),
    'invalid endpoint URL'
  );
});
