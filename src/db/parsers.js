'use strict';

function parseFach(fach) {
  const m = (fach || '').match(/^([A-Z0-9-]+)\s+(.+)$/);
  if (!m) return { code: '', name: fach || '' };
  return { code: m[1], name: m[2] };
}

function parseKuerzel(kuerzel) {
  const parts = (kuerzel || '').split(/\s*\/\s*/);
  const id = parts[0] || '';
  const code = parts[1] || '';
  const sem = code.match(/-S(\d+)-/);
  return {
    id,
    code,
    label: parts.slice(2).join(' / '),
    semester: sem ? 'S' + sem[1] : null
  };
}

function parseNote(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const clean = raw.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  return parseFloat(clean);
}

function parseDatum(ddmmyy) {
  const m = (ddmmyy || '').match(/^(\d{2})\.(\d{2})\.(\d{2,4})$/);
  if (!m) return ddmmyy || '';
  const year = m[3].length === 2 ? '20' + m[3] : m[3];
  return year + '-' + m[2] + '-' + m[1];
}

function parseZeit(zeit) {
  const m = (zeit || '').match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  if (!m) return { von: '', bis: '' };
  return { von: m[1], bis: m[2] };
}

function round1(n) {
  if (n == null || Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

// Bezeichnung wie "LB 1", "ZP 2" → { typ: 'LB'|'ZP'|'OTHER', nr: <int> }
// Tolerant gegen Bezeichnungen ohne / mit beschreibendem Zusatz:
//   "LB 1"            → LB, 1
//   "LB1"             → LB, 1
//   "LB Praxisarbeit" → LB, fallbackNr  (Bezeichnung ohne Zahl, Nr aus Spalte 1)
//   "LB - Vortrag"    → LB, fallbackNr
//   "LB"              → LB, fallbackNr
//   "Mündliche"       → OTHER, fallbackNr
//   "LBA"             → OTHER, fallbackNr  (Wortgrenze fehlt nach LB/ZP)
function classifyPruefung(bezeichnung, fallbackNr) {
  const trimmed = String(bezeichnung || '').trim();
  const m = trimmed.match(/^(LB|ZP)(?:\s*(\d+))?\b/i);
  const fbN = parseInt(fallbackNr, 10);
  const fbNr = Number.isFinite(fbN) ? fbN : 0;
  if (m) {
    const nr = m[2] ? parseInt(m[2], 10) : fbNr;
    return { typ: m[1].toUpperCase(), nr };
  }
  return { typ: 'OTHER', nr: fbNr };
}

function parseGewichtPct(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

module.exports = {
  parseFach,
  parseKuerzel,
  parseNote,
  parseDatum,
  parseZeit,
  round1,
  classifyPruefung,
  parseGewichtPct
};
