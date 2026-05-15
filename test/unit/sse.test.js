'use strict';

/**
 * Tests fuer src/sse.js.
 *
 * Deckt: broadcastSse-Serialisierung, Ring-Buffer-Cap, replaySince-Boundary,
 * setPhase no-op bei gleicher Phase, SSE_LOG_LEVEL env-parse.
 *
 * Jeder Test laedt das Modul frisch (delete require.cache) damit module-scope
 * state (sseClients, ringBuffer, lastEventId, SSE_LOG_LEVELS) isoliert ist.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SSE_PATH = path.resolve(__dirname, '..', '..', 'src', 'sse.js');

function freshSse() {
  delete require.cache[require.resolve(SSE_PATH)];
  return require(SSE_PATH);
}

// Stub-res-Objekt: minimal write-collector + writableLength=0.
function makeStubRes() {
  const writes = [];
  return {
    writes,
    writableLength: 0,
    write(chunk) { writes.push(chunk); return true; },
    end() {}
  };
}

test('sse: broadcastSse writes serialized payload to all clients in sseClients', () => {
  const sse = freshSse();
  const a = makeStubRes();
  const b = makeStubRes();
  sse.sseClients.add(a);
  sse.sseClients.add(b);
  sse.broadcastSse('log', { msg: 'hi' });
  assert.equal(a.writes.length, 1);
  assert.equal(b.writes.length, 1);
  assert.match(a.writes[0], /^id: 1\nevent: log\ndata: \{"msg":"hi"\}\n\n$/);
  assert.equal(a.writes[0], b.writes[0]);
  sse.sseClients.delete(a);
  sse.sseClients.delete(b);
});

test('sse: ring-buffer caps at SSE_RING_BUFFER_SIZE (oldest dropped)', () => {
  const sse = freshSse();
  for (let i = 0; i < 60; i++) sse.broadcastSse('log', { n: i });
  // SSE_RING_BUFFER_SIZE = 50. Nach 60 Pushes muessen die ersten 10 weg sein.
  // replaySince(0) -> [] (Guard), aber replaySince(1) returnt alle > id 1.
  const after10 = sse.replaySince(10);
  // Eintraege mit id 11..60 muessen erhalten sein, id 1..10 dropped.
  assert.equal(after10.length, 50);
  assert.equal(after10[0].id, 11);
  assert.equal(after10[after10.length - 1].id, 60);
});

test('sse: replaySince returns only events with id > lastId', () => {
  const sse = freshSse();
  sse.broadcastSse('log', { n: 1 });
  sse.broadcastSse('log', { n: 2 });
  sse.broadcastSse('log', { n: 3 });
  const missed = sse.replaySince(1);
  assert.equal(missed.length, 2);
  assert.equal(missed[0].id, 2);
  assert.equal(missed[1].id, 3);
  // lastId <= 0 / non-finite -> empty (DoS-Guard).
  assert.deepEqual(sse.replaySince(0), []);
  assert.deepEqual(sse.replaySince(NaN), []);
  assert.deepEqual(sse.replaySince(-5), []);
});

test('sse: setPhase no-ops when phase unchanged (no broadcast)', () => {
  const sse = freshSse();
  const client = makeStubRes();
  sse.sseClients.add(client);
  const fakeSettings = { load: () => ({ autoRun: true, intervalMinutes: 60 }) };
  const fakeState = { running: false, lastRun: null, nextRun: null, lastError: null,
                      currentPhase: 'login', phaseStartedAt: '2026-01-01T00:00:00Z' };
  sse.setPhase(fakeState, fakeSettings, 'login'); // same -> no-op
  assert.equal(client.writes.length, 0, 'no broadcast when phase unchanged');
  sse.setPhase(fakeState, fakeSettings, 'noten'); // change -> broadcast
  assert.equal(client.writes.length, 1);
  assert.equal(fakeState.currentPhase, 'noten');
  sse.sseClients.delete(client);
});

test('sse: SSE_LOG_LEVEL env-parse handles valid + garbage values', () => {
  // Valid CSV -> Set mit nur bekannten Levels.
  const validCode = `
    process.env.SSE_LOG_LEVEL = 'info,warn,progress';
    const s = require(${JSON.stringify(SSE_PATH)});
    let captured;
    s.wireLoggerToSse({ subscribe: (fn) => { captured = fn; } });
    const got = [];
    captured({ level: 'info', message: 'a' });
    captured({ level: 'progress', message: 'b' });
    captured({ level: 'error', message: 'c' }); // nicht in Set -> filtered
    const stubs = [];
    s.sseClients.add({ writableLength: 0, write: (c) => stubs.push(c), end: () => {} });
    s.broadcastSse('ping', 1);
    process.stdout.write('STUBCOUNT=' + stubs.length);
  `;
  const r1 = spawnSync(process.execPath, ['-e', validCode], { encoding: 'utf8' });
  assert.equal(r1.status, 0, r1.stderr);

  // Garbage env -> fallback auf safe-default (info,warn,error). 'debug' ist
  // KEIN bekannter Level mehr (BE-4 HIGH #1 fix).
  const garbageCode = `
    process.env.SSE_LOG_LEVEL = 'xxx,yyy,debug';
    const s = require(${JSON.stringify(SSE_PATH)});
    let captured;
    s.wireLoggerToSse({ subscribe: (fn) => { captured = fn; } });
    const writes = [];
    s.sseClients.add({ writableLength: 0, write: (c) => writes.push(c), end: () => {} });
    captured({ level: 'info', message: 'a' });   // default-fallback enthaelt info
    captured({ level: 'debug', message: 'b' });  // 'debug' filtered (nicht im fallback)
    process.stdout.write('WRITES=' + writes.length);
  `;
  const r2 = spawnSync(process.execPath, ['-e', garbageCode], { encoding: 'utf8' });
  assert.equal(r2.status, 0, r2.stderr);
  assert.ok(r2.stdout.includes('WRITES=1'), 'fallback must include info but filter debug: ' + r2.stdout);
});
