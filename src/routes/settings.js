'use strict';

const express = require('express');
const { maskSettings } = require('../runScrape');
const { nextWeeklyDetailRun } = require('../scheduler');

module.exports = function settingsRoutes(deps) {
  const router = express.Router();
  const { state, settings, logger, bot, runScrapeCycle, ALLOW_UI_CREDENTIALS } = deps;

  // ---------- Settings ----------
  router.get('/api/settings', (req, res) => {
    res.json(maskSettings(settings.load(), ALLOW_UI_CREDENTIALS));
  });

  router.patch('/api/settings', async (req, res) => {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};

    // Allowlist-Filter (vor save) — entfernt URLs/Port, sowie Credentials wenn ALLOW_UI_CREDENTIALS=false
    const filtered = (typeof settings.filterUiPatch === 'function')
      ? settings.filterUiPatch(body, ALLOW_UI_CREDENTIALS)
      : body;

    const before = settings.load();
    const merged = settings.save(filtered);
    const rescheduled = (before.autoRun !== merged.autoRun)
      || (before.intervalMinutes !== merged.intervalMinutes)
      || (before.intervalTimeFrom !== merged.intervalTimeFrom)
      || (before.intervalTimeTo !== merged.intervalTimeTo)
      || (before.scheduleMode !== merged.scheduleMode)
      || (JSON.stringify(before.scheduleDays) !== JSON.stringify(merged.scheduleDays))
      || (JSON.stringify(before.scheduleTimes) !== JSON.stringify(merged.scheduleTimes));

    // Bot neu-starten wenn Telegram-Config sich geändert hat
    const tgChanged = before.telegramEnabled !== merged.telegramEnabled
                   || before.telegramToken !== merged.telegramToken
                   || before.telegramAllowedUserId !== merged.telegramAllowedUserId;
    if (tgChanged) {
      // WICHTIG: bot.stop() awaiten, sonst race condition mit dem neuen
      // bot.start() — die alte long-poll-getUpdates-Anfrage (timeout 30s)
      // läuft sonst parallel mit dem neuen Token weiter und kann den neuen
      // Bot überstimmen oder mit altem Token gegen Telegram pollen.
      try { await bot.stop(); } catch (_) {}
      if (merged.telegramEnabled && merged.telegramToken && merged.telegramAllowedUserId) {
        bot.start({
          token: merged.telegramToken,
          allowedUserId: merged.telegramAllowedUserId,
          logger,
          triggerScrape: async () => {
            if (state.running) return { triggered: false, reason: 'bereits aktiv' };
            runScrapeCycle('telegram').catch(() => {});
            return { triggered: true };
          },
          getStatus: () => ({
            running: state.running,
            lastRun: state.lastRun,
            nextRun: state.nextRun,
            lastError: state.lastError,
            enabled: settings.load().autoRun,
            intervalMinutes: settings.load().intervalMinutes,
            currentPhase: state.currentPhase,
            phaseStartedAt: state.phaseStartedAt,
            lastStats: state.lastStats,
            lastWeeklyDetailAt: state.lastWeeklyDetailAt,
            nextWeeklyRun: state.weeklyTimer ? nextWeeklyDetailRun().toISOString() : null
          })
        }).catch(e => logger.log('Telegram-Bot Neustart fehlgeschlagen: ' + e.message, 'error'));
      }
    }

    res.json({
      settings: maskSettings(merged, ALLOW_UI_CREDENTIALS),
      rescheduled,
      botRestarted: tgChanged
    });
  });

  return router;
};
