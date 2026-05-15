/**
 * logger.js — In-Memory Ring-Buffer + Pub/Sub-Logger.
 *
 * Buffer: Letzte 500 Entries. Entry-Form: { ts, level, message }.
 * Levels: 'info' | 'warn' | 'error' | 'progress'.
 *
 * API:
 *   log(message, level='info')    → fügt Eintrag hinzu, printed stdout, emits
 *   getLogs(limit=200)            → Array (neueste am Ende)
 *   subscribe(listener)           → returns unsubscribe fn
 *   clear()                       → leert Buffer
 *
 * Output-Format:
 *   Default (LOG_FORMAT unset/pretty) → ANSI-farbiges Pretty-Printing.
 *   LOG_FORMAT=json                   → eine JSON-Zeile pro Eintrag
 *                                       ({ts, level, msg}), keine ANSI-Codes.
 */

const MAX_ENTRIES = 500;

// ---------- Output-Modus ----------
const LOG_FORMAT = (process.env.LOG_FORMAT || 'pretty').toLowerCase();
const JSON_LOGS = LOG_FORMAT === 'json';

// ---------- ANSI Farben ----------
const COLORS = {
  info:     '\x1b[36m',  // cyan
  warn:     '\x1b[33m',  // yellow
  error:    '\x1b[31m',  // red
  progress: '\x1b[90m',  // gray
  reset:    '\x1b[0m'
};

const LEVELS = new Set(['info', 'warn', 'error', 'progress']);

// ---------- State ----------
const buffer = [];           // FIFO: neueste am Ende
const listeners = new Set();

// ---------- Helpers ----------
function normalizeLevel(level) {
  return LEVELS.has(level) ? level : 'info';
}

function normalizeMessage(msg) {
  if (msg == null) return '';
  if (typeof msg === 'string') return msg;
  if (msg instanceof Error) return msg.stack || msg.message || String(msg);
  try { return JSON.stringify(msg); } catch (_) { return String(msg); }
}

function printEntry(entry) {
  if (JSON_LOGS) {
    // Single-line JSON, niemals ANSI-Codes. Feldnamen kompakt für Log-Aggregatoren.
    const payload = {
      ts: entry.ts,
      level: entry.level,
      msg: entry.message
    };
    try {
      process.stdout.write(JSON.stringify(payload) + '\n');
    } catch (_) {
      // Fallback: minimaler, garantiert serialisierbarer Eintrag.
      process.stdout.write(JSON.stringify({ ts: entry.ts, level: entry.level, msg: String(entry.message) }) + '\n');
    }
    return;
  }
  const color = COLORS[entry.level] || COLORS.info;
  const time = entry.ts.slice(11, 19); // HH:MM:SS
  const tag = entry.level.toUpperCase().padEnd(8);
  // progress-Zeilen bleiben in stdout lesbar, aber gedimmt
  process.stdout.write(`${color}[${time}] ${tag}${COLORS.reset} ${entry.message}\n`);
}

function emit(entry) {
  for (const l of listeners) {
    try { l(entry); } catch (_) { /* listener-Fehler isolieren */ }
  }
}

// ---------- Public API ----------
function log(message, level = 'info') {
  const entry = {
    ts: new Date().toISOString(),
    level: normalizeLevel(level),
    message: normalizeMessage(message)
  };
  // Frozen entry: getLogs() returnt slice() ohne deep-copy. Object.freeze
  // verhindert dass Konsumenten (z.B. Subscriber, SSE-Forwarder, /api/logs-
  // Antwort) den Eintrag im Buffer versehentlich mutieren.
  Object.freeze(entry);
  buffer.push(entry);
  // shift() ist O(n) wie splice(), aber leichter zu lesen — Hot-Path-Effekt
  // vernachlässigbar bei MAX_ENTRIES=500.
  while (buffer.length > MAX_ENTRIES) buffer.shift();
  printEntry(entry);
  emit(entry);
  return entry;
}

function getLogs(limit = 200) {
  const n = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 200;
  if (buffer.length <= n) return buffer.slice();
  return buffer.slice(buffer.length - n);
}

function subscribe(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clear() {
  buffer.length = 0;
}

module.exports = { log, getLogs, subscribe, clear };
