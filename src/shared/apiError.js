'use strict';

/**
 * Sendet eine standardisierte JSON-Error-Response.
 *
 * ⚠️  Sicherheitswarnung: Der `message`-Parameter wird unverändert im Response-
 * Body ausgegeben. Caller MÜSSEN eine statische, vom Operator vordefinierte
 * Nachricht übergeben (z.B. 'invalid input', 'unauthorized', 'db unavailable').
 *
 * NICHT erlaubt: `e.message` direkt durchreichen — Exception-Texte aus Express,
 * better-sqlite3, web-push etc. enthalten regelmässig:
 *   - Datei-Pfade (`ENOENT: no such file or directory, open '/opt/...'`)
 *   - Hostnames inkl. interner DNS-Namen
 *   - SQL-Snippets mit Spalten-/Tabellennamen
 *   - Stack-Frames
 * Diese können einem Angreifer wertvolle Recon-Info geben (Pfad-Layout,
 * Server-Version, DB-Schema).
 *
 * Wenn du den Original-Error brauchst: serverseitig via `logger.log(err)` loggen
 * und an `apiError` einen generischen Code wie 'internal error' übergeben.
 *
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message  Statische, user-safe Nachricht — KEIN `e.message`.
 */
function apiError(res, status, message) {
  return res.status(status).json({ error: message, status });
}

module.exports = { apiError };
