'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

// Race-condition Regressionstest: bot.stop() muss ein awaitable Promise zurückgeben,
// das erst resolved wenn die long-poll getUpdates-Anfrage tatsächlich abgeschlossen
// ist — sonst kann settings-reconfig den Bot mit neuem Token neu starten während die
// alte Schleife noch mit altem Token gegen Telegram pollt.

function setupBot() {
  // Cache leeren damit jeder Test einen frischen Bot bekommt
  for (const k of Object.keys(require.cache)) {
    if (k.includes('src/bot') || k.includes('src\\bot')) delete require.cache[k];
  }
  const bot = require('../../src/bot');
  const state = require('../../src/bot/state');
  return { bot, state };
}

// Fetch mit kontrolliertem Verhalten ersetzen; pollLoop blockiert dann auf unserem
// Promise statt echte Telegram-Requests abzusetzen.
function installFakeFetch(opts) {
  const original = global.fetch;
  const pending = [];
  global.fetch = (url) => {
    if (typeof url === 'string' && url.includes('/getMe')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { username: 'fake_bot' } })
      });
    }
    if (typeof url === 'string' && url.includes('/setMyCommands')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: true })
      });
    }
    // getUpdates: simuliere long-poll der erst nach opts.pollDelay ms returnt
    let resolve;
    const p = new Promise(r => { resolve = r; });
    pending.push(resolve);
    setTimeout(() => {
      resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: [] })
      });
    }, opts.pollDelay);
    return p;
  };
  return { restore: () => { global.fetch = original; }, pending };
}

test('stop() returns a promise that awaits the in-flight poll loop', async () => {
  const { bot, state } = setupBot();
  const fake = installFakeFetch({ pollDelay: 50 });

  try {
    await bot.start({
      token: 'test-token',
      allowedUserId: 12345,
      logger: { log: () => {} }
    });

    // Eine Microtask warten damit die pollLoop wirklich angelaufen ist
    await new Promise(r => setImmediate(r));
    assert.strictEqual(state.running, true, 'bot should be running after start');

    const stopStart = Date.now();
    const stopPromise = bot.stop();
    assert.ok(typeof stopPromise.then === 'function', 'stop() must return a thenable');
    // running-Flag muss sofort umgelegt werden
    assert.strictEqual(state.running, false, 'state.running flips synchronously');

    await stopPromise;
    const elapsed = Date.now() - stopStart;
    // stopPromise sollte erst resolven wenn die laufende getUpdates-Anfrage
    // abgeschlossen ist (~50ms). Wenn stop() unawaitable wäre, würde es
    // sofort returnen (< 10ms).
    assert.ok(elapsed >= 30, `stop() should await poll drain, elapsed=${elapsed}ms`);
  } finally {
    fake.restore();
    // Sicherheits-Reset für andere Tests
    state.running = false;
  }
});

test('stop() before start() returns resolved promise without throwing', async () => {
  const { bot } = setupBot();
  const result = bot.stop();
  assert.ok(typeof result.then === 'function');
  await result; // sollte nicht hängen
});

test('stop() is idempotent — double-stop does not throw', async () => {
  const { bot, state } = setupBot();
  const fake = installFakeFetch({ pollDelay: 20 });

  try {
    await bot.start({
      token: 'test-token',
      allowedUserId: 12345,
      logger: { log: () => {} }
    });
    await new Promise(r => setImmediate(r));

    const first = bot.stop();
    const second = bot.stop();
    await Promise.all([first, second]);
    assert.strictEqual(state.running, false);
  } finally {
    fake.restore();
    state.running = false;
  }
});
