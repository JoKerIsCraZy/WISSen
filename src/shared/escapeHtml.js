'use strict';

/**
 * Minimal HTML-Entity-Escape für `&`, `<`, `>`, `"`, `'`.
 *
 * ✅ Safe für:
 *   - Text-Content innerhalb von Elementen (`<p>${escapeHtml(x)}</p>`)
 *   - Attribut-Werte in QUOTED-Attributen (`<a title="${escapeHtml(x)}">`)
 *
 * ❌ NICHT safe für:
 *   - Unquoted attribute context (`<a title=${escapeHtml(x)}>`) — Spaces,
 *     `=` und Slash breaken den Parser, sind aber nicht escaped.
 *   - `<script>`-Inhalte — JS-Strings brauchen JSON-Stringify oder dedizierten
 *     JS-Escape; HTML-Entities werden vom JS-Parser nicht interpretiert.
 *   - `<style>`-Inhalte — CSS-Parser unterstützt keine HTML-Entities.
 *   - URL-Kontexte (`href=`, `src=`) — zusätzlich URL-Encoding + Protokoll-
 *     Whitelist (kein `javascript:`) nötig.
 *   - `srcdoc`-Attribut — wird zweimal HTML-geparst.
 *
 * Funktion ist NICHT idempotent: `escapeHtml(escapeHtml('&'))` ergibt
 * `&amp;amp;`. Niemals auf bereits-escapeten Strings erneut aufrufen.
 *
 * @param {unknown} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

module.exports = { escapeHtml };
