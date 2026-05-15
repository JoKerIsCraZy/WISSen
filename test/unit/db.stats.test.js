'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Need to chdir BEFORE requiring db (schema.js uses process.cwd() for default path).
// Singleton-State im db-Modul ist module-level, deshalb pro Test einen frischen
// tmpdir + closeInstance am Ende.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-'));
process.chdir(tmpDir);
const db = require('../../src/db');
const { getNotenStats, getStundenplanStats } = require('../../src/db/stats');

test('getNotenStats on empty DB returns null avg', () => {
  const d = db.openOnce();
  const r = getNotenStats(d);
  assert.strictEqual(r.avgNote, null);
  assert.deepStrictEqual(r.avgBySemester, {});
  assert.strictEqual(r.lastFetchedNoten, null);
  db.closeInstance();
});

test('getStundenplanStats on empty DB returns null lastFetched', () => {
  const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats2-'));
  process.chdir(tmpDir2);
  const d = db.openOnce();
  const r = getStundenplanStats(d);
  assert.strictEqual(r.lastFetchedStundenplan, null);
  db.closeInstance();
});

test('getNotenStats with sample data', () => {
  const tmpDir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats3-'));
  process.chdir(tmpDir3);
  const d = db.openOnce();
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('M1', 'Mathe', 'S1', 5.5, '5.5'),
                 ('M2', 'Physik', 'S1', 4.5, '4.5'),
                 ('M3', 'Chemie', 'S2', 5.0, '5.0')`);
  const r = getNotenStats(d);
  assert.strictEqual(r.avgNote, 5.0);
  assert.strictEqual(r.avgBySemester.S1, 5.0);
  assert.strictEqual(r.avgBySemester.S2, 5.0);
  assert.ok(r.lastFetchedNoten); // truthy ISO string
  db.closeInstance();
});
