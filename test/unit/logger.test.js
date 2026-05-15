'use strict';

/**
 * Tests fuer src/logger.js.
 *
 * Der Output-Modus (pretty vs. json) wird beim Modul-Load via LOG_FORMAT
 * gesetzt. Deshalb laufen die Output-Tests in Child-Prozessen, damit jeder
 * Modus eine eigene frische Modul-Instanz bekommt.
 *
 * In-Process getestet: ring-buffer, subscribe/unsubscribe, normalize-Logik.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LOGGER_PATH = path.resolve(__dirname, '..', '..', 'src', 'logger.js');

// ---------- In-Process: API-Verhalten (kein stdout-Snapshot) ----------

test('logger: log() returns entry with ts/level/message', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  // stdout temporaer schlucken, damit Test-Output sauber bleibt.
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const entry = logger.log('hello', 'info');
    assert.equal(entry.level, 'info');
    assert.equal(entry.message, 'hello');
    assert.match(entry.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  } finally {
    process.stdout.write = origWrite;
  }
});

test('logger: unknown level falls back to info', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const entry = logger.log('x', 'bogus');
    assert.equal(entry.level, 'info');
  } finally {
    process.stdout.write = origWrite;
  }
});

test('logger: ring-buffer caps at MAX_ENTRIES (oldest dropped)', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    for (let i = 0; i < 600; i++) logger.log(`m${i}`, 'info');
    const all = logger.getLogs(1000);
    assert.equal(all.length, 500, 'buffer must cap at 500');
    // Neueste am Ende, aelteste vorne — m100 ist erster ueberlebender.
    assert.equal(all[0].message, 'm100');
    assert.equal(all[all.length - 1].message, 'm599');
  } finally {
    process.stdout.write = origWrite;
  }
});

test('logger: subscribe receives entries, unsubscribe stops delivery', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const received = [];
    const off = logger.subscribe((e) => received.push(e.message));
    logger.log('a');
    logger.log('b');
    off();
    logger.log('c');
    assert.deepEqual(received, ['a', 'b']);
  } finally {
    process.stdout.write = origWrite;
  }
});

test('logger: normalizeMessage handles null/Error/objects', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    assert.equal(logger.log(null).message, '');
    assert.equal(logger.log(undefined).message, '');
    const err = new Error('boom');
    const e = logger.log(err);
    assert.ok(e.message.includes('boom'));
    const obj = logger.log({ k: 'v' });
    assert.equal(obj.message, '{"k":"v"}');
  } finally {
    process.stdout.write = origWrite;
  }
});

// ---------- Child-Prozess: stdout-Format ----------

function runChild(env, code) {
  const result = spawnSync(process.execPath, ['-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8'
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

test('logger: default mode writes ANSI-coloured pretty line', () => {
  const code = `const l = require(${JSON.stringify(LOGGER_PATH)}); l.log('hello pretty', 'info');`;
  // Sicherstellen, dass LOG_FORMAT nicht von der Test-Umgebung geerbt wird.
  const env = { LOG_FORMAT: '' };
  const { stdout, status } = runChild(env, code);
  assert.equal(status, 0);
  // ANSI-Cyan (\x1b[36m) und Reset (\x1b[0m) muessen vorhanden sein.
  assert.ok(stdout.includes('\x1b[36m'), 'expected ANSI cyan in pretty mode');
  assert.ok(stdout.includes('\x1b[0m'), 'expected ANSI reset in pretty mode');
  assert.ok(stdout.includes('hello pretty'), 'expected message text');
  assert.ok(stdout.includes('INFO'), 'expected level tag');
});

test('logger: LOG_FORMAT=json writes single-line JSON without ANSI', () => {
  const code = `const l = require(${JSON.stringify(LOGGER_PATH)}); l.log('hello json', 'info');`;
  const { stdout, status } = runChild({ LOG_FORMAT: 'json' }, code);
  assert.equal(status, 0);
  // Kein ANSI-Code im JSON-Modus.
  assert.ok(!stdout.includes('\x1b['), 'JSON mode must not emit ANSI codes');
  // Genau eine Zeile.
  const lines = stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'expected exactly one log line');
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.msg, 'hello json');
  assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
});

test('logger: LOG_FORMAT=JSON (case-insensitive) also activates JSON mode', () => {
  const code = `const l = require(${JSON.stringify(LOGGER_PATH)}); l.log('case', 'warn');`;
  const { stdout, status } = runChild({ LOG_FORMAT: 'JSON' }, code);
  assert.equal(status, 0);
  const lines = stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.level, 'warn');
  assert.equal(parsed.msg, 'case');
});

test('logger: LOG_FORMAT=pretty (explicit) keeps pretty output', () => {
  const code = `const l = require(${JSON.stringify(LOGGER_PATH)}); l.log('explicit pretty', 'error');`;
  const { stdout, status } = runChild({ LOG_FORMAT: 'pretty' }, code);
  assert.equal(status, 0);
  assert.ok(stdout.includes('\x1b['), 'pretty mode must emit ANSI codes');
  assert.ok(stdout.includes('ERROR'), 'expected ERROR level tag');
  assert.ok(stdout.includes('explicit pretty'));
});

test('logger: JSON mode preserves message text for all levels', () => {
  const code = `
    const l = require(${JSON.stringify(LOGGER_PATH)});
    l.log('a', 'info');
    l.log('b', 'warn');
    l.log('c', 'error');
    l.log('d', 'progress');
  `;
  const { stdout, status } = runChild({ LOG_FORMAT: 'json' }, code);
  assert.equal(status, 0);
  const lines = stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 4);
  const parsed = lines.map((l) => JSON.parse(l));
  assert.deepEqual(parsed.map((p) => p.level), ['info', 'warn', 'error', 'progress']);
  assert.deepEqual(parsed.map((p) => p.msg), ['a', 'b', 'c', 'd']);
});

// ---------- Neue Tests: BE-4 LOW #9 + Listener-Isolation ----------

test('logger: returned entry is frozen (Object.isFrozen true)', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const entry = logger.log('immutable', 'info');
    assert.equal(Object.isFrozen(entry), true, 'entry must be frozen');
    // Strict-Mode assignment muss throwen (Test-Datei laeuft via 'use strict').
    assert.throws(() => { entry.message = 'mutated'; }, TypeError);
    // Buffer-Eintrag ist dieselbe Referenz und ebenfalls frozen.
    const all = logger.getLogs(1);
    assert.equal(Object.isFrozen(all[0]), true);
  } finally {
    process.stdout.write = origWrite;
  }
});

test('logger: listener error in one subscriber does not kill others', () => {
  delete require.cache[require.resolve(LOGGER_PATH)];
  const logger = require(LOGGER_PATH);
  logger.clear();
  const origWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const received = [];
    logger.subscribe(() => { throw new Error('boom'); });
    logger.subscribe((e) => received.push(e.message));
    logger.log('still-delivered', 'info');
    assert.deepEqual(received, ['still-delivered']);
  } finally {
    process.stdout.write = origWrite;
  }
});
