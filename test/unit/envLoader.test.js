'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseEnvFile, applyToProcess } = require('../../src/shared/envLoader');

function tmpEnv(content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, content, { encoding: 'utf8', flag: 'wx' });
  return { file, dir };
}

test('parseEnvFile returns {} for missing file', () => {
  assert.deepEqual(parseEnvFile('/nonexistent/path/to/.env'), {});
});

test('parseEnvFile parses simple KEY=value lines', (t) => {
  const { file, dir } = tmpEnv('FOO=bar\nBAZ=qux\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  const result = parseEnvFile(file);
  assert.equal(result.FOO, 'bar');
  assert.equal(result.BAZ, 'qux');
});

test('parseEnvFile strips surrounding double quotes', (t) => {
  const { file, dir } = tmpEnv('FOO="hello world"\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  assert.equal(parseEnvFile(file).FOO, 'hello world');
});

test('parseEnvFile strips surrounding single quotes', (t) => {
  const { file, dir } = tmpEnv("FOO='hello world'\n");
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  assert.equal(parseEnvFile(file).FOO, 'hello world');
});

test('parseEnvFile keeps unmatched/internal quotes intact', (t) => {
  const { file, dir } = tmpEnv('FOO=he"llo\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  assert.equal(parseEnvFile(file).FOO, 'he"llo');
});

test('parseEnvFile skips # comments', (t) => {
  const { file, dir } = tmpEnv('# comment line\nFOO=bar\n# another\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  const result = parseEnvFile(file);
  assert.equal(result.FOO, 'bar');
  assert.equal(Object.keys(result).length, 1);
});

test('parseEnvFile skips blank lines', (t) => {
  const { file, dir } = tmpEnv('\n\nFOO=bar\n\nBAZ=qux\n\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  const result = parseEnvFile(file);
  assert.equal(result.FOO, 'bar');
  assert.equal(result.BAZ, 'qux');
});

test('parseEnvFile handles CRLF line endings', (t) => {
  const { file, dir } = tmpEnv('FOO=bar\r\nBAZ=qux\r\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  const result = parseEnvFile(file);
  assert.equal(result.FOO, 'bar');
  assert.equal(result.BAZ, 'qux');
});

test('parseEnvFile returns {} for unreadable path (file under /dev/null)', () => {
  // /dev/null/foo cannot exist as a real file → existsSync false → {}.
  assert.deepEqual(parseEnvFile('/dev/null/foo'), {});
});

test('parseEnvFile ignores malformed lines (no =)', (t) => {
  const { file, dir } = tmpEnv('NOT_A_PAIR\nFOO=bar\n');
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
  });
  const result = parseEnvFile(file);
  assert.equal(result.FOO, 'bar');
  assert.equal(result.NOT_A_PAIR, undefined);
});

test('applyToProcess does NOT overwrite existing env vars', (t) => {
  const key = 'WISSEN_TEST_KEEP_' + Date.now();
  const { file, dir } = tmpEnv(`${key}=overwrite\n`);
  process.env[key] = 'kept';
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
    delete process.env[key];
  });
  applyToProcess(file);
  assert.equal(process.env[key], 'kept');
});

test('applyToProcess DOES set when env var is unset', (t) => {
  const key = 'WISSEN_TEST_SET_' + Date.now();
  const { file, dir } = tmpEnv(`${key}=fromfile\n`);
  delete process.env[key];
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
    delete process.env[key];
  });
  applyToProcess(file);
  assert.equal(process.env[key], 'fromfile');
});

test('applyToProcess DOES set when env var is empty string', (t) => {
  const key = 'WISSEN_TEST_EMPTY_' + Date.now();
  const { file, dir } = tmpEnv(`${key}=fromfile\n`);
  process.env[key] = '';
  t.after(() => {
    fs.unlinkSync(file);
    fs.rmdirSync(dir);
    delete process.env[key];
  });
  applyToProcess(file);
  assert.equal(process.env[key], 'fromfile');
});

test('applyToProcess silently no-ops for non-existent file', () => {
  // Should not throw.
  assert.doesNotThrow(() => applyToProcess('/nonexistent/path/to/.env'));
});
