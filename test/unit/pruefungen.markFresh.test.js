'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function setup() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tocco-pruef-fresh-'));
  process.chdir(tmpDir);
  // Reset module cache so singleton starts fresh
  for (const k of Object.keys(require.cache)) {
    if (k.includes('wissen') && k.includes('src')) delete require.cache[k];
  }
  const db = require('../../src/db');
  const d = db.openOnce();
  // Seed a noten row
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw, change_pending)
          VALUES ('M1', 'Mathe', 'S1', 5.0, '5.0', 0)`);
  return { db, d };
}

test('savePruefungen sets change_pending=1 when ZP value changes', () => {
  const { db, d } = setup();
  // Initial pruefung
  db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.0 }
  ]);
  // Reset change_pending after the initial insert
  d.prepare('UPDATE noten SET change_pending=0 WHERE kuerzel_id=?').run('M1');
  // Change the value
  const result = db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.5 }
  ]);
  assert.strictEqual(result.changedEntries.length, 1);
  const row = d.prepare('SELECT change_pending FROM noten WHERE kuerzel_id=?').get('M1');
  assert.strictEqual(row.change_pending, 1, 'change_pending should be set when ZP changes');
  db.closeInstance();
});

test('savePruefungen does NOT set change_pending when nothing changes', () => {
  const { db, d } = setup();
  db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.0 }
  ]);
  d.prepare('UPDATE noten SET change_pending=0 WHERE kuerzel_id=?').run('M1');
  // Same data again — no change
  const result = db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.0 }
  ]);
  assert.strictEqual(result.changedEntries.length, 0);
  assert.strictEqual(result.addedEntries.length, 0);
  const row = d.prepare('SELECT change_pending FROM noten WHERE kuerzel_id=?').get('M1');
  assert.strictEqual(row.change_pending, 0, 'change_pending should stay 0 when nothing changed');
  db.closeInstance();
});

test('savePruefungen sets change_pending=1 when new ZP added', () => {
  const { db, d } = setup();
  db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.0 }
  ]);
  d.prepare('UPDATE noten SET change_pending=0 WHERE kuerzel_id=?').run('M1');
  const result = db.savePruefungen(d, 'M1', [
    { bezeichnung: 'ZP 1', pruefung_nr: 1, gewicht: '50%', bewertung: 4.0 },
    { bezeichnung: 'ZP 2', pruefung_nr: 2, gewicht: '50%', bewertung: 5.0 }
  ]);
  assert.strictEqual(result.addedEntries.length, 1);
  const row = d.prepare('SELECT change_pending FROM noten WHERE kuerzel_id=?').get('M1');
  assert.strictEqual(row.change_pending, 1, 'change_pending should be set when new ZP added');
  db.closeInstance();
});
