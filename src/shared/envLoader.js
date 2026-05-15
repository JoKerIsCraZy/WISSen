'use strict';

const fs = require('node:fs');

/**
 * Parses a KEY=VALUE .env file into a plain object (no side effects).
 * Strips surrounding single- oder double-quotes, ignoriert volle Kommentar-
 * Zeilen (`# ...`) und blanke Zeilen.
 *
 * NICHT unterstützt (bewusst minimal gehalten — komplexere Cases bitte über
 * echte Shell-/Docker-ENV setzen):
 *   - Multi-Line-Values (heredoc-Style, `KEY="a\nb"`-Forms etc.)
 *   - Variable-Interpolation (`KEY=${OTHER}` bleibt als Literal `${OTHER}`)
 *   - Trailing inline-Comments (`KEY=foo # remark` ergibt Value `foo # remark`)
 *   - `export KEY=val`-Prefix (das `export ` wird als Teil des Key gewertet
 *     und matcht das Regex nicht)
 *   - Escape-Sequenzen innerhalb der Quotes (`\n`, `\t` bleiben literal)
 *
 * @param {string} envPath  Absoluter Pfad zur .env-Datei.
 * @returns {Record<string, string>}  Leeres Objekt wenn Datei fehlt/unlesbar.
 */
function parseEnvFile(envPath) {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  let content;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (_) {
    // .env nicht lesbar → ignorieren
    return out;
  }
  for (const line of content.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

// Reads .env at given path and applies it to process.env WITHOUT overwriting
// already-set vars (Docker env_file + shell env have priority).
function applyToProcess(envPath) {
  const parsed = parseEnvFile(envPath);
  for (const k of Object.keys(parsed)) {
    if (process.env[k] == null || process.env[k] === '') {
      process.env[k] = parsed[k];
    }
  }
}

module.exports = { parseEnvFile, applyToProcess };
