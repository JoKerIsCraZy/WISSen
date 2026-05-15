'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const FloorplanData = require('../../web/floorplans/data.js');
global.window = global.window || {};
global.window.FloorplanData = FloorplanData;

const { isOnlineRoom, roomToFloor, normalizeRoom, findHotspot } =
  require('../../web/floorplans/raumview.js');

test('isOnlineRoom: "Online" → true', () => {
  assert.equal(isOnlineRoom('Online'), true);
});

test('isOnlineRoom: "online (Teams)" → true', () => {
  assert.equal(isOnlineRoom('online (Teams)'), true);
});

test('isOnlineRoom: "ONLINE" → true', () => {
  assert.equal(isOnlineRoom('ONLINE'), true);
});

test('isOnlineRoom: empty string → false', () => {
  assert.equal(isOnlineRoom(''), false);
});

test('isOnlineRoom: null → false', () => {
  assert.equal(isOnlineRoom(null), false);
});

test('isOnlineRoom: undefined → false', () => {
  assert.equal(isOnlineRoom(undefined), false);
});

test('isOnlineRoom: "4.13" → false', () => {
  assert.equal(isOnlineRoom('4.13'), false);
});

test('roomToFloor: "4.13" → og4', () => {
  assert.equal(roomToFloor('4.13'), 'og4');
});

test('roomToFloor: "2.07" → og2', () => {
  assert.equal(roomToFloor('207'), 'og2');
});

test('roomToFloor: "4.13 Smart" → og4', () => {
  assert.equal(roomToFloor('4.13 Smart'), 'og4');
});

test('roomToFloor: "Raum 4.13" → og4', () => {
  assert.equal(roomToFloor('Raum 4.13'), 'og4');
});

test('roomToFloor: "Online" → null', () => {
  assert.equal(roomToFloor('Online'), null);
});

test('roomToFloor: null → null', () => {
  assert.equal(roomToFloor(null), null);
});

test('roomToFloor: empty string → null', () => {
  assert.equal(roomToFloor(''), null);
});

test('roomToFloor: "5.01" → null (only 2 and 4 OG exist)', () => {
  assert.equal(roomToFloor('5.01'), null);
});

test('normalizeRoom: "4.13 Smart" → "413"', () => {
  assert.equal(normalizeRoom('4.13 Smart'), '413');
});

test('normalizeRoom: "  4.09  " → "409"', () => {
  assert.equal(normalizeRoom('  4.09  '), '409');
});

test('normalizeRoom: "Online" → "Online"', () => {
  assert.equal(normalizeRoom('Online'), 'Online');
});

test('normalizeRoom: "Raum 2.07 (B)" → "2.07"', () => {
  assert.equal(normalizeRoom('Raum 2.07 (B)'), '207');
});

// Tocco delivers rooms in 3-digit form like "ZH 202".
test('normalizeRoom: "ZH 202" → "2.02"', () => {
  assert.equal(normalizeRoom('ZH 202'), '202');
});

test('normalizeRoom: "ZH 413" → "413"', () => {
  assert.equal(normalizeRoom('ZH 413'), '413');
});

test('normalizeRoom: "ZH 403" → "403"', () => {
  assert.equal(normalizeRoom('ZH 403'), '403');
});

test('normalizeRoom: "Zimmer 202" → "2.02"', () => {
  assert.equal(normalizeRoom('Zimmer 202'), '202');
});

test('normalizeRoom: bare "202" → "2.02"', () => {
  assert.equal(normalizeRoom('202'), '202');
});

test('normalizeRoom: "ZH202" no space → "2.02"', () => {
  assert.equal(normalizeRoom('ZH202'), '202');
});

test('normalizeRoom: "ZH 202 Zürich Zimmer 202" → "2.02"', () => {
  assert.equal(normalizeRoom('ZH 202 Zürich Zimmer 202'), '202');
});

test('normalizeRoom: "ON online" → "ON online" (online stays)', () => {
  assert.equal(normalizeRoom('ON online'), 'ON online');
});

test('normalizeRoom: 4-digit "1024" stays untouched', () => {
  assert.equal(normalizeRoom('Termin 1024'), 'Termin 1024');
});

test('roomToFloor: "ZH 202" → og2', () => {
  assert.equal(roomToFloor('ZH 202'), 'og2');
});

test('roomToFloor: "ZH 413" → og4', () => {
  assert.equal(roomToFloor('ZH 413'), 'og4');
});

test('roomToFloor: "ZH 403" → og4', () => {
  assert.equal(roomToFloor('ZH 403'), 'og4');
});

test('roomToFloor: "ZH 502" → null (no 5. OG)', () => {
  assert.equal(roomToFloor('ZH 502'), null);
});

test('roomToFloor: "ON online" → null', () => {
  assert.equal(roomToFloor('ON online'), null);
});

test('findHotspot: "ZH 202" on og2 returns 2.02 rect', () => {
  const h = findHotspot('og2', 'ZH 202');
  assert.ok(h, 'expected hotspot for ZH 202');
  assert.equal(h.left, 23);
});

test('findHotspot: "ZH 403" on og4 returns 4.03 rect', () => {
  const h = findHotspot('og4', 'ZH 403');
  assert.ok(h, 'expected hotspot for ZH 403');
});

test('findHotspot: "4.09" on og4 returns rect', () => {
  const h = findHotspot('og4', '4.09');
  assert.ok(h, 'expected hotspot for 4.09');
  assert.equal(typeof h.left, 'number');
  assert.equal(typeof h.top, 'number');
  assert.equal(typeof h.width, 'number');
  assert.equal(typeof h.height, 'number');
  assert.equal(h.left, 49);
  assert.equal(h.top, 0.9);
});

test('findHotspot: "2.08" on og2 returns rect', () => {
  const h = findHotspot('og2', '2.08');
  assert.ok(h);
  assert.equal(h.left, 51.9);
  assert.equal(h.width, 10.3);
});

test('findHotspot: extracts normalized room from raw input', () => {
  const h = findHotspot('og4', '4.13 Smart');
  assert.ok(h);
  assert.equal(h.left, 66.3);
});

test('findHotspot: unknown room → null', () => {
  assert.equal(findHotspot('og4', '9.99'), null);
});

test('findHotspot: room from wrong floor → null', () => {
  assert.equal(findHotspot('og2', '4.09'), null);
});

test('findHotspot: invalid floor key → null', () => {
  assert.equal(findHotspot('og9', '4.09'), null);
});
