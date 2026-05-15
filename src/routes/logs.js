'use strict';

const express = require('express');

module.exports = function logsRoutes(deps) {
  const router = express.Router();
  const { logger } = deps;

  // ---------- Logs ----------
  router.get('/api/logs', (req, res) => {
    // Cap auf 1000: Response-Size bleibt bei ~max-Entries × ~2 KB unter 2 MB.
    // Default bleibt 200 für kompatibles Frontend-Verhalten.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
    let logs = logger.getLogs(limit);

    // Optionaler server-seitiger Level-Filter: ?level=warn,error filtert
    // direkt im Backend, damit das Frontend bei 1000-Entry-Buffern nicht
    // selbst filtern muss. Unbekannte Level-Strings werden einfach
    // nicht-matchen — leeres Array statt 400, weil das UI tolerant sein soll.
    const levelParam = req.query.level;
    if (levelParam) {
      const allowed = new Set(String(levelParam).split(',').map(s => s.trim()));
      logs = logs.filter(e => allowed.has(e.level));
    }

    res.json({ logs });
  });

  return router;
};
