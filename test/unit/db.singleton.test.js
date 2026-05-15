'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const db = require('../../src/db');

test('openOnce returns same instance on second call', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-singleton-'));
  process.chdir(tmpDir);
  // simulate clean state
  const a = db.openOnce();
  const b = db.openOnce();
  assert.strictEqual(a, b);
  assert.strictEqual(db.getInstance(), a);
  db.closeInstance();
});

test('getInstance throws when not initialized', () => {
  // After closeInstance in previous test
  assert.throws(() => db.getInstance(), /not initialized/);
});

test('closeInstance is idempotent', () => {
  db.closeInstance(); // already null — should not throw
  db.closeInstance();
});
