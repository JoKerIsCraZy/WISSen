'use strict';

const express = require('express');
const { apiError } = require('../shared/apiError');
const { getStundenplanStats } = require('../db/stats');

module.exports = function stundenplanRoutes(deps) {
  const router = express.Router();
  const { db, logger, database, ratelimits } = deps;

  // ---------- Stundenplan: Cleanup (alle Einträge löschen) ----------
  // Destruktive Aktion — wird vom UI-Button getriggert, dort gibt's eine
  // Bestätigung. Token-Auth via Middleware ist bereits aktiv für /api/*.
  // Zusätzlich scrapeLimiter (5/5min) anhängen damit ein curl-Loop nicht
  // den Stundenplan in Schleife zerstören kann — die Aktion ist genauso
  // destruktiv wie ein Scrape-Trigger, also same budget.
  router.post('/api/stundenplan/clear', ratelimits.scrapeLimiter, (req, res) => {
    try {
      const deleted = db.clearStundenplan(database);
      logger.log(`🧹 Stundenplan zurückgesetzt — ${deleted} Einträge gelöscht`, 'info');
      res.json({ deleted });
    } catch (e) {
      logger.log('DB error at POST /api/stundenplan/clear: ' + (e && e.message ? e.message : e), 'error');
      apiError(res, 500, 'Ein Datenbankfehler ist aufgetreten');
    }
  });

  // ---------- Stundenplan ----------
  router.get('/api/stundenplan', (req, res) => {
    const filters = {};
    const limitParam = parseInt(req.query.limit, 10);
    if (Number.isFinite(limitParam) && limitParam > 0) filters.limit = limitParam;

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (req.query.from != null) {
      const f = String(req.query.from);
      if (!dateRe.test(f)) return apiError(res, 400, 'Ungültiger from-Parameter (YYYY-MM-DD erwartet)');
      filters.from = f;
    }
    if (req.query.to != null) {
      const t = String(req.query.to);
      if (!dateRe.test(t)) return apiError(res, 400, 'Ungültiger to-Parameter (YYYY-MM-DD erwartet)');
      filters.to = t;
    }

    try {
      const rows = db.getStundenplan(database, filters);
      // Slim getStundenplanStats statt fettes getStats — 1 Query statt 7.
      const stats = getStundenplanStats(database);

      res.json({
        rows,
        count: rows.length,
        fetchedAt: stats.lastFetchedStundenplan || null
      });
    } catch (e) {
      logger.log('DB error at GET /api/stundenplan: ' + (e && e.message ? e.message : e), 'error');
      apiError(res, 500, 'Ein Datenbankfehler ist aufgetreten');
    }
  });

  return router;
};
