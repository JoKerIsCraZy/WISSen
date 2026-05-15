'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { apiError } = require('../shared/apiError');
const { validatePushSubscription } = require('../pushValidate');
const { makeLogPushResult } = require('../runScrape');

// Test-Push verbraucht FCM/Mozilla/Apple-Quota UND kann (legacy-Verhalten) an
// alle Subscriptions fan-outen. Ein laxer Limiter würde aus jedem authentifi-
// zierten Operator-Token eine DoS-Amplifikation gegen sämtliche Devices machen.
// 3/min/IP ist genug für interaktive Tests im Settings-Screen, fängt aber
// Script-Loops hart ab.
const TEST_LIMIT_PER_MIN = 3;
const TEST_PUSH_TTL_SECONDS = 60;

module.exports = function pushRoutes(deps) {
  const router = express.Router();
  const { db, logger, database, push, ratelimits } = deps;
  const logPushResult = makeLogPushResult(logger);

  const testLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: TEST_LIMIT_PER_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => apiError(res, 429, 'Push-Test-Rate überschritten (3/min)')
  });

  // ---------- Web-Push (PWA) ----------
  // VAPID public key — auch ohne Auth abrufbar wäre OK, aber wir lassen die
  // globale auth-middleware drüber walten (kein Geheimnis, aber einheitlich).
  router.get('/api/push/vapid-key', (req, res) => {
    if (!push) return apiError(res, 503, 'Web-Push nicht initialisiert');
    res.json({ publicKey: push.getPublicKey() });
  });

  // Read-only Diagnose-Endpoint — siehe push.getStatus(). Liegt hinter der
  // globalen Auth-Middleware (/api/*), damit operatives Personal den Public-Key
  // und Subscription-Counter abfragen kann ohne Log-Grepping.
  router.get('/api/push/status', (req, res) => {
    if (!push) return apiError(res, 503, 'Web-Push nicht initialisiert');
    try {
      const status = push.getStatus();
      res.json(status);
    } catch (e) {
      logger.log('⚠️  /api/push/status fehlgeschlagen: ' + (e && e.message), 'warn');
      apiError(res, 500, 'Push-Status nicht verfügbar');
    }
  });

  router.post('/api/push/subscribe', ratelimits.pushLimiter, (req, res) => {
    if (!push) return apiError(res, 503, 'Web-Push nicht initialisiert');
    const sub = req.body && req.body.subscription;
    const reason = validatePushSubscription(sub);
    if (reason) {
      logger.log('⚠️  Push-Subscribe abgelehnt: ' + reason, 'warn');
      return apiError(res, 400, 'Ungültige Subscription: ' + reason);
    }
    const ua = (req.get('user-agent') || '').slice(0, 200);
    try {
      push.addSubscription(database, sub, ua);
      const total = db.countPushSubscriptions(database);
      logger.log('🔔 Push-Subscription registriert (total ' + total + ')');
      res.json({ ok: true, total });
    } catch (e) {
      logger.log('⚠️  Push-Subscribe fehlgeschlagen: ' + (e && e.message), 'warn');
      apiError(res, 500, 'Subscription konnte nicht gespeichert werden');
    }
  });

  router.delete('/api/push/subscribe', ratelimits.pushLimiter, (req, res) => {
    if (!push) return apiError(res, 503, 'Web-Push nicht initialisiert');
    const endpoint = req.body && req.body.endpoint;
    // Nur Format-Check — die Whitelist trifft nur für SUBSCRIBE zu (sonst kämen
    // Legacy-Endpoints nie wieder weg, falls die Allowlist mal enger wird).
    if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 1024) {
      return apiError(res, 400, 'endpoint required');
    }
    const removed = push.removeSubscription(database, endpoint);
    res.json({ ok: true, removed });
  });

  // POST /api/push/test
  //   Body: { endpoint?: string }
  // Wenn `endpoint` mitgegeben wird, geht der Test-Push NUR an genau diese
  // Subscription (gegen DoS-Amplifikation). Ohne `endpoint` Legacy-Fallback an
  // alle Subscriptions — pflegt Abwärtskompatibilität für ältere Settings-UI-
  // Builds. TTL = 60s damit ein Operator-Test nicht 24h später erneut
  // zugestellt wird falls das Device offline war.
  router.post('/api/push/test', testLimiter, async (req, res) => {
    if (!push) return apiError(res, 503, 'Web-Push nicht initialisiert');
    const wantEndpoint = req.body && typeof req.body.endpoint === 'string'
      ? req.body.endpoint
      : null;
    try {
      let r;
      if (wantEndpoint) {
        if (!wantEndpoint || wantEndpoint.length > 1024) {
          return apiError(res, 400, 'endpoint invalid');
        }
        r = await push.sendToEndpoint({
          title: 'WISSen',
          body: 'Test-Benachrichtigung — alles läuft! ✓',
          url: '/mobile/',
          tag: 'test'
        }, wantEndpoint, undefined, { ttl: TEST_PUSH_TTL_SECONDS });
      } else {
        r = await push.sendToAll({
          title: 'WISSen',
          body: 'Test-Benachrichtigung — alles läuft! ✓',
          url: '/mobile/',
          tag: 'test'
        }, undefined, { ttl: TEST_PUSH_TTL_SECONDS });
      }
      logPushResult('test', r);
      // Sanitized error array — only status code + short reason category,
      // never raw err.message (can leak FCM-internal paths / tokens).
      const errors = (r.errors || []).map((e) => ({
        status: typeof e.status === 'number' ? e.status : 0,
        reason: typeof e.reason === 'string' ? e.reason : 'unknown'
      }));
      res.json({
        ok: true,
        sent: r.sent,
        removed: r.removed,
        errors
      });
    } catch (e) {
      // M2: e.message NICHT an den Client durchreichen (web-push-Fehler können
      // FCM-interne Pfade enthalten) — Volltext nur ins Log.
      logger.log('Push-Test fehlgeschlagen: ' + (e && e.message ? e.message : e), 'error');
      apiError(res, 500, 'Push-Test fehlgeschlagen');
    }
  });

  return router;
};
