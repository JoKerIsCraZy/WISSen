'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { parseTrustProxy } = require('../../src/auth');

test('parseTrustProxy unset → default 1', () => {
  assert.strictEqual(parseTrustProxy(undefined), 1);
  assert.strictEqual(parseTrustProxy(null), 1);
  assert.strictEqual(parseTrustProxy(''), 1);
});

test('parseTrustProxy integer string → number', () => {
  assert.strictEqual(parseTrustProxy('0'), 0);
  assert.strictEqual(parseTrustProxy('1'), 1);
  assert.strictEqual(parseTrustProxy('2'), 2);
});

test('parseTrustProxy "true"/"false" → boolean', () => {
  assert.strictEqual(parseTrustProxy('true'), true);
  assert.strictEqual(parseTrustProxy('false'), false);
});

test('parseTrustProxy "loopback" → "loopback"', () => {
  assert.strictEqual(parseTrustProxy('loopback'), 'loopback');
});

test('parseTrustProxy CIDR list → array', () => {
  assert.deepStrictEqual(
    parseTrustProxy('10.0.0.0/8,127.0.0.1'),
    ['10.0.0.0/8', '127.0.0.1']
  );
});

test('parseTrustProxy single CIDR → string', () => {
  assert.strictEqual(parseTrustProxy('192.168.0.0/16'), '192.168.0.0/16');
});
