'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml } = require('../../src/shared/escapeHtml');

test('escapeHtml: & → &amp;', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml: < → &lt;', () => {
  assert.equal(escapeHtml('a < b'), 'a &lt; b');
});

test('escapeHtml: > → &gt;', () => {
  assert.equal(escapeHtml('a > b'), 'a &gt; b');
});

test('escapeHtml: " → &quot;', () => {
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
});

test("escapeHtml: ' → &#39;", () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml: all five in one string', () => {
  assert.equal(
    escapeHtml(`& < > " '`),
    '&amp; &lt; &gt; &quot; &#39;'
  );
});

test('escapeHtml: null → empty string', () => {
  assert.equal(escapeHtml(null), '');
});

test('escapeHtml: undefined → empty string', () => {
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml: number coerced to string', () => {
  assert.equal(escapeHtml(42), '42');
});

test('escapeHtml: zero coerced to "0"', () => {
  assert.equal(escapeHtml(0), '0');
});

test('escapeHtml: object coerced to string', () => {
  assert.equal(escapeHtml({}), '[object Object]');
});

test('escapeHtml: empty string → empty string', () => {
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml: plain text unchanged', () => {
  assert.equal(escapeHtml('hello world'), 'hello world');
});

test('escapeHtml: already-escaped &amp; → &amp;amp; (double-escape)', () => {
  // Double-escape is correct behavior: escapeHtml is not idempotent.
  assert.equal(escapeHtml('&amp;'), '&amp;amp;');
});

test('escapeHtml: HTML tag fully escaped', () => {
  assert.equal(escapeHtml('<script>alert("x")</script>'),
    '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
});

test('escapeHtml: boolean coerced to string', () => {
  assert.equal(escapeHtml(true), 'true');
  assert.equal(escapeHtml(false), 'false');
});
