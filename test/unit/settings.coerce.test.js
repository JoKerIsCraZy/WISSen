'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { coerce, getDefaults } = require('../../src/settings');

const DEFAULTS = getDefaults();

test('coerce strips unknown keys', () => {
  assert.deepEqual(Object.keys(coerce({ foo: 1, bar: 'x' })), []);
});

test('coerce returns empty object for null/undefined/non-object', () => {
  assert.deepEqual(Object.keys(coerce(null)), []);
  assert.deepEqual(Object.keys(coerce(undefined)), []);
  assert.deepEqual(Object.keys(coerce(42)), []);
  assert.deepEqual(Object.keys(coerce('str')), []);
});

test('coerce blocks __proto__/constructor/prototype keys', () => {
  const out = coerce({ __proto__: { polluted: true }, constructor: 'x', prototype: 'y' });
  assert.equal(out.__proto__, undefined);
  assert.equal(out.constructor, undefined);
  assert.equal(out.prototype, undefined);
  // Make sure no enumerable keys leaked.
  assert.deepEqual(Object.keys(out), []);
});

test('coerce intervalMinutes: invalid → DEFAULTS', () => {
  assert.equal(coerce({ intervalMinutes: 'abc' }).intervalMinutes, DEFAULTS.intervalMinutes);
  assert.equal(coerce({ intervalMinutes: -5 }).intervalMinutes, DEFAULTS.intervalMinutes);
  assert.equal(coerce({ intervalMinutes: 0 }).intervalMinutes, DEFAULTS.intervalMinutes);
  assert.equal(coerce({ intervalMinutes: NaN }).intervalMinutes, DEFAULTS.intervalMinutes);
});

test('coerce intervalMinutes: "30" string → 30', () => {
  assert.equal(coerce({ intervalMinutes: '30' }).intervalMinutes, 30);
});

test('coerce intervalMinutes: floors floats', () => {
  assert.equal(coerce({ intervalMinutes: 30.7 }).intervalMinutes, 30);
});

test('coerce slowMo: negative → 0', () => {
  assert.equal(coerce({ slowMo: -10 }).slowMo, 0);
});

test('coerce slowMo: non-numeric → 0', () => {
  assert.equal(coerce({ slowMo: 'abc' }).slowMo, 0);
  assert.equal(coerce({ slowMo: NaN }).slowMo, 0);
});

test('coerce slowMo: valid value preserved', () => {
  assert.equal(coerce({ slowMo: 100 }).slowMo, 100);
  assert.equal(coerce({ slowMo: 0 }).slowMo, 0);
  assert.equal(coerce({ slowMo: '50' }).slowMo, 50);
});

test('coerce port: non-numeric → DEFAULTS.port', () => {
  assert.equal(coerce({ port: 'foo' }).port, DEFAULTS.port);
  assert.equal(coerce({ port: 0 }).port, DEFAULTS.port);
  assert.equal(coerce({ port: -1 }).port, DEFAULTS.port);
});

test('coerce port: valid value preserved', () => {
  assert.equal(coerce({ port: 8080 }).port, 8080);
  assert.equal(coerce({ port: '4000' }).port, 4000);
});

test('coerce autoRun: strict boolean coercion', () => {
  // Strict: nur explizite true/'true'/1/'1' wird truthy.
  // 'yes', 'no', 'false', 'off' etc. wären zu mehrdeutig — strict-coerce
  // verhindert dass ein UI-Bug oder API-Fehlbedienung zu einer impliziten
  // Aktivierung wird (z.B. PATCH body { autoRun: 'false' } → früher true!).
  assert.equal(coerce({ autoRun: true }).autoRun, true);
  assert.equal(coerce({ autoRun: 'true' }).autoRun, true);
  assert.equal(coerce({ autoRun: 1 }).autoRun, true);
  assert.equal(coerce({ autoRun: '1' }).autoRun, true);
  assert.equal(coerce({ autoRun: 'yes' }).autoRun, false);
  assert.equal(coerce({ autoRun: 'false' }).autoRun, false);
  assert.equal(coerce({ autoRun: 0 }).autoRun, false);
  assert.equal(coerce({ autoRun: '' }).autoRun, false);
  assert.equal(coerce({ autoRun: null }).autoRun, false);
  assert.equal(coerce({ autoRun: false }).autoRun, false);
});

test('coerce headless: strict boolean coercion', () => {
  assert.equal(coerce({ headless: true }).headless, true);
  assert.equal(coerce({ headless: 'true' }).headless, true);
  assert.equal(coerce({ headless: 1 }).headless, true);
  assert.equal(coerce({ headless: 'yes' }).headless, false);
  assert.equal(coerce({ headless: 0 }).headless, false);
  assert.equal(coerce({ headless: '' }).headless, false);
});

test('coerce telegramEnabled: strict boolean coercion', () => {
  assert.equal(coerce({ telegramEnabled: true }).telegramEnabled, true);
  assert.equal(coerce({ telegramEnabled: 'true' }).telegramEnabled, true);
  assert.equal(coerce({ telegramEnabled: 1 }).telegramEnabled, true);
  assert.equal(coerce({ telegramEnabled: 'yes' }).telegramEnabled, false);
  assert.equal(coerce({ telegramEnabled: false }).telegramEnabled, false);
  assert.equal(coerce({ telegramEnabled: null }).telegramEnabled, false);
});

test('coerce scheduleMode: anything not "weekly" → "interval"', () => {
  assert.equal(coerce({ scheduleMode: 'weekly' }).scheduleMode, 'weekly');
  assert.equal(coerce({ scheduleMode: 'interval' }).scheduleMode, 'interval');
  assert.equal(coerce({ scheduleMode: 'foo' }).scheduleMode, 'interval');
  assert.equal(coerce({ scheduleMode: '' }).scheduleMode, 'interval');
  assert.equal(coerce({ scheduleMode: null }).scheduleMode, 'interval');
  assert.equal(coerce({ scheduleMode: 42 }).scheduleMode, 'interval');
});

test('coerce scheduleDays: filters non-integers', () => {
  // Note: Number(null) === 0 (passes integer filter), Number('x') === NaN, Number(2.5) === 2.5 (filtered).
  assert.deepEqual(coerce({ scheduleDays: [1, 'x', 2.5, null, 3] }).scheduleDays, [0, 1, 3]);
});

test('coerce scheduleDays: clamps to 0..6', () => {
  assert.deepEqual(coerce({ scheduleDays: [-1, 0, 5, 7, 10] }).scheduleDays, [0, 5]);
});

test('coerce scheduleDays: dedupes and sorts', () => {
  assert.deepEqual(coerce({ scheduleDays: [3, 1, 1, 2, 3, 0] }).scheduleDays, [0, 1, 2, 3]);
});

test('coerce scheduleDays: non-array → empty array', () => {
  assert.deepEqual(coerce({ scheduleDays: 'mon' }).scheduleDays, []);
  assert.deepEqual(coerce({ scheduleDays: null }).scheduleDays, []);
});

test('coerce scheduleTimes: validates HH:MM format', () => {
  assert.deepEqual(coerce({ scheduleTimes: ['08:00', 'foo', '12:30'] }).scheduleTimes, ['08:00', '12:30']);
});

test('coerce scheduleTimes: normalizes "9:5" → "09:05"', () => {
  assert.deepEqual(coerce({ scheduleTimes: ['9:05'] }).scheduleTimes, ['09:05']);
});

test('coerce scheduleTimes: filters out-of-range like "25:00"', () => {
  assert.deepEqual(coerce({ scheduleTimes: ['25:00', '23:59', '12:60'] }).scheduleTimes, ['23:59']);
});

test('coerce scheduleTimes: dedupes and sorts', () => {
  assert.deepEqual(
    coerce({ scheduleTimes: ['16:00', '08:00', '08:00', '16:00'] }).scheduleTimes,
    ['08:00', '16:00']
  );
});

test('coerce scheduleTimes: non-array → empty array', () => {
  assert.deepEqual(coerce({ scheduleTimes: '08:00' }).scheduleTimes, []);
});

test('coerce intervalTimeFrom: HH:MM normalization', () => {
  // Regex requires 2-digit minutes; "7:05" → "07:05".
  assert.equal(coerce({ intervalTimeFrom: '7:05' }).intervalTimeFrom, '07:05');
  assert.equal(coerce({ intervalTimeFrom: '08:00' }).intervalTimeFrom, '08:00');
});

test('coerce intervalTimeFrom: invalid → DEFAULTS', () => {
  assert.equal(coerce({ intervalTimeFrom: 'foo' }).intervalTimeFrom, DEFAULTS.intervalTimeFrom);
  assert.equal(coerce({ intervalTimeFrom: '25:00' }).intervalTimeFrom, DEFAULTS.intervalTimeFrom);
  assert.equal(coerce({ intervalTimeFrom: '12:60' }).intervalTimeFrom, DEFAULTS.intervalTimeFrom);
});

test('coerce intervalTimeTo: HH:MM normalization', () => {
  // Regex requires 2-digit minutes; "9:05" → "09:05".
  assert.equal(coerce({ intervalTimeTo: '9:05' }).intervalTimeTo, '09:05');
  assert.equal(coerce({ intervalTimeTo: '20:00' }).intervalTimeTo, '20:00');
});

test('coerce intervalTimeTo: invalid → DEFAULTS', () => {
  assert.equal(coerce({ intervalTimeTo: 'bar' }).intervalTimeTo, DEFAULTS.intervalTimeTo);
  assert.equal(coerce({ intervalTimeTo: '99:99' }).intervalTimeTo, DEFAULTS.intervalTimeTo);
});

test('coerce telegramAllowedUserId: empty string → null', () => {
  assert.equal(coerce({ telegramAllowedUserId: '' }).telegramAllowedUserId, null);
});

test('coerce telegramAllowedUserId: null preserved as null', () => {
  assert.equal(coerce({ telegramAllowedUserId: null }).telegramAllowedUserId, null);
});

test('coerce telegramAllowedUserId: positive int preserved', () => {
  assert.equal(coerce({ telegramAllowedUserId: 12345 }).telegramAllowedUserId, 12345);
  assert.equal(coerce({ telegramAllowedUserId: '67890' }).telegramAllowedUserId, 67890);
});

test('coerce telegramAllowedUserId: invalid/negative → null', () => {
  assert.equal(coerce({ telegramAllowedUserId: 'abc' }).telegramAllowedUserId, null);
  assert.equal(coerce({ telegramAllowedUserId: -5 }).telegramAllowedUserId, null);
  assert.equal(coerce({ telegramAllowedUserId: 0 }).telegramAllowedUserId, null);
});

test('coerce string fields stay as strings even when given numbers', () => {
  const out = coerce({
    msEmail: 12345,
    msPassword: 99,
    userPk: 7,
    baseUrl: 100,
    notenUrl: 200,
    stundenplanUrl: 300,
    telegramToken: 400
  });
  assert.equal(out.msEmail, '12345');
  assert.equal(out.msPassword, '99');
  assert.equal(out.userPk, '7');
  assert.equal(out.baseUrl, '100');
  assert.equal(out.notenUrl, '200');
  assert.equal(out.stundenplanUrl, '300');
  assert.equal(out.telegramToken, '400');
  assert.equal(typeof out.msEmail, 'string');
  assert.equal(typeof out.telegramToken, 'string');
});
