'use strict';

const express = require('express');
const { apiError } = require('../shared/apiError');

module.exports = function statsRoutes(deps) {
  const router = express.Router();
  const { db, logger, database } = deps;

  // ---------- Stats ----------
  router.get('/api/stats', (req, res) => {
    try {
      const stats = db.getStats(database);
      res.json(stats);
    } catch (e) {
      logger.log('DB error at GET /api/stats: ' + (e && e.message ? e.message : e), 'error');
      apiError(res, 500, 'Ein Datenbankfehler ist aufgetreten');
    }
  });

  return router;
};
