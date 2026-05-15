'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Singleton-DB-State + module-level Memo-Cache → pro Test fresh tmpdir +
// closeInstance + invalidateStatsCache am Anfang/Ende.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache-'));
process.chdir(tmpDir);

const db = require('../../src/db');
const {
  getStats,
  getNotenStats,
  getStundenplanStats,
  invalidateStatsCache
} = require('../../src/db/stats');

test('getStats memoizes within TTL (returns same object instance)', () => {
  invalidateStatsCache();
  const d = db.openOnce();
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('K1', 'Mathe', 'S1', 5.5, '5.5')`);

  const first = getStats(d);
  const second = getStats(d);

  // === Identität, nicht nur Wert-Gleichheit: Cache muss den Object-Ref reusen.
  assert.strictEqual(first, second, 'second call must return cached instance');

  // Plausibilitätscheck auf den konsolidierten Aggregate-Pfad
  assert.strictEqual(first.notenCount, 1);
  assert.strictEqual(first.notenWithGradeCount, 1);
  assert.strictEqual(first.avgNote, 5.5);

  invalidateStatsCache();
  db.closeInstance();
});

test('getStats returns fresh data after invalidateStatsCache', () => {
  invalidateStatsCache();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache2-'));
  process.chdir(tmp);
  const d = db.openOnce();

  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('A1', 'F1', 'S1', 4.0, '4.0')`);
  const first = getStats(d);
  assert.strictEqual(first.notenCount, 1);

  // Ohne Invalidate würde der Cache greifen → notenCount blieb 1
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('A2', 'F2', 'S1', 5.0, '5.0')`);
  const cached = getStats(d);
  assert.strictEqual(cached, first, 'should be cached without invalidate');
  assert.strictEqual(cached.notenCount, 1, 'cached result must not see new row');

  invalidateStatsCache();
  const fresh = getStats(d);
  assert.notStrictEqual(fresh, first, 'after invalidate must be new instance');
  assert.strictEqual(fresh.notenCount, 2, 'fresh fetch must see both rows');

  invalidateStatsCache();
  db.closeInstance();
});

test('getNotenStats memoizes within TTL', () => {
  invalidateStatsCache();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache3-'));
  process.chdir(tmp);
  const d = db.openOnce();
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('K1', 'F', 'S1', 5.0, '5.0')`);

  const first = getNotenStats(d);
  const second = getNotenStats(d);
  assert.strictEqual(first, second);
  assert.strictEqual(first.avgNote, 5.0);

  invalidateStatsCache();
  const third = getNotenStats(d);
  assert.notStrictEqual(third, first);

  invalidateStatsCache();
  db.closeInstance();
});

test('getStundenplanStats memoizes within TTL', () => {
  invalidateStatsCache();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache4-'));
  process.chdir(tmp);
  const d = db.openOnce();
  d.exec(`INSERT INTO stundenplan (datum_iso, zeit_von, zeit_bis, veranstaltung, klasse)
          VALUES ('2026-05-12', '08:00', '09:00', 'Mathe', 'INF-1')`);

  const first = getStundenplanStats(d);
  const second = getStundenplanStats(d);
  assert.strictEqual(first, second);
  assert.ok(first.lastFetchedStundenplan, 'must have ISO timestamp');

  invalidateStatsCache();
  const third = getStundenplanStats(d);
  assert.notStrictEqual(third, first);

  invalidateStatsCache();
  db.closeInstance();
});

test('invalidateStatsCache clears all three caches at once', () => {
  invalidateStatsCache();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache5-'));
  process.chdir(tmp);
  const d = db.openOnce();
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw)
          VALUES ('K1', 'F', 'S1', 5.0, '5.0')`);
  d.exec(`INSERT INTO stundenplan (datum_iso, zeit_von, zeit_bis, veranstaltung, klasse)
          VALUES ('2026-05-12', '08:00', '09:00', 'Mathe', 'INF-1')`);

  const stats1 = getStats(d);
  const noten1 = getNotenStats(d);
  const sp1 = getStundenplanStats(d);

  invalidateStatsCache();

  const stats2 = getStats(d);
  const noten2 = getNotenStats(d);
  const sp2 = getStundenplanStats(d);

  assert.notStrictEqual(stats2, stats1, 'getStats cache cleared');
  assert.notStrictEqual(noten2, noten1, 'getNotenStats cache cleared');
  assert.notStrictEqual(sp2, sp1, 'getStundenplanStats cache cleared');

  invalidateStatsCache();
  db.closeInstance();
});

test('getStats consolidated aggregate query returns correct shape', () => {
  invalidateStatsCache();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wissen-stats-cache6-'));
  process.chdir(tmp);
  const d = db.openOnce();

  // 3 Noten mit Wert, 1 ohne — testet noten_count vs noten_with_grade trennung
  d.exec(`INSERT INTO noten (kuerzel_id, fach_name, semester, note, note_raw) VALUES
            ('A', 'Fa', 'S1', 5.0, '5.0'),
            ('B', 'Fb', 'S1', 4.0, '4.0'),
            ('C', 'Fc', 'S2', 6.0, '6.0'),
            ('D', 'Fd', 'S2', NULL, '')`);

  const r = getStats(d);
  assert.strictEqual(r.notenCount, 4);
  assert.strictEqual(r.notenWithGradeCount, 3);
  assert.strictEqual(r.avgNote, 5.0);
  assert.strictEqual(r.avgBySemester.S1, 4.5);
  assert.strictEqual(r.avgBySemester.S2, 6.0);
  assert.ok(r.lastFetchedNoten);
  assert.strictEqual(r.changedRecent, 0);
  assert.strictEqual(r.stundenplanUpcoming, 0);

  invalidateStatsCache();
  db.closeInstance();
});
