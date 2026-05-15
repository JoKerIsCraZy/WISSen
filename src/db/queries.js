'use strict';

// Lazy-evaluierter "ist frisch?"-Ausdruck. Liefert 1 wenn das Item entweder
// noch nie gesehen wurde oder erst innerhalb der letzten 24h erstmals gesehen
// wurde. Wird in getNoten/getStundenplan inline ins SELECT projiziert, damit
// der Frontend-Renderer ohne separate Anfrage entscheiden kann ob die Zeile
// gelb hervorgehoben wird.
const IS_FRESH_SQL = `
  CASE
    WHEN change_pending = 1
     AND (change_seen_at IS NULL
          OR datetime('now') < datetime(change_seen_at, '+24 hours'))
    THEN 1 ELSE 0
  END
`;

module.exports = {
  IS_FRESH_SQL
};
