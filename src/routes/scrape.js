'use strict';

const express = require('express');

const MANUAL_SCRAPE_COOLDOWN_MS = 60 * 1000;
const STUCK_THRESHOLD_MS = 15 * 60 * 1000;  // > 15 min in derselben Phase = stuck

module.exports = function scrapeRoutes(deps) {
  const router = express.Router();
  const { state, runScrapeCycle, ratelimits } = deps;

  // ---------- Scrape-Trigger ----------
  router.post('/api/scrape', ratelimits.scrapeLimiter, async (req, res) => {
    const now = Date.now();

    // Stuck-Detection: wenn state.running seit > 15 min in derselben Phase,
    // ist das mit hoher Wahrscheinlichkeit ein hängender Scrape (Browser-
    // Crash mit unsauberem state-Reset, Watchdog-Hänger, etc.). In dem Fall
    // ignorieren wir BEIDE Locks (running + cooldown), damit der User aus
    // dem Lockout rauskommt. Der eigentliche Scrape-Trigger setzt state.running
    // dann auf den frischen Cycle.
    const stuckMs = state.running && state.phaseStartedAt
      ? now - Date.parse(state.phaseStartedAt)
      : 0;
    const isStuck = state.running && stuckMs > STUCK_THRESHOLD_MS;

    if (state.running && !isStuck) {
      return res.json({ triggered: false, reason: 'already_running' });
    }

    // Cooldown: 60s zwischen manuellen Triggern — auch für authorisierte User,
    // damit versehentliches Spammen nicht Login-Drosselung bei MS auslöst.
    // Race-frei: wir vergleichen Date.now() gegen einen absoluten "locked-until"
    // Timestamp und SETZEN den Lock SOFORT bevor wir async dispatchen — so
    // sehen parallele Requests den Lock direkt (kein TOCTOU-Fenster).
    // Stuck-Case: Cooldown ebenfalls ignorieren — sonst kommt der User
    // 60s nach dem Stuck-Detect noch immer nicht durch.
    if (!isStuck && now < state.scrapeLockedUntil) {
      const retryInSec = Math.ceil((state.scrapeLockedUntil - now) / 1000);
      return res.status(429).json({
        triggered: false,
        reason: 'cooldown',
        retryInSec
      });
    }
    state.scrapeLockedUntil = now + MANUAL_SCRAPE_COOLDOWN_MS;

    // Kick off; return immediately
    runScrapeCycle('manual').catch(() => { /* state.lastError is already set */ });
    res.json({ triggered: true, ...(isStuck ? { stuckReset: true } : {}) });
  });

  return router;
};
