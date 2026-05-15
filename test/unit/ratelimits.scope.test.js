'use strict';

// Verifies the globalLimiter is scoped to /api/* and does NOT count static-
// asset requests like /mobile/css/views.css, /assets/logo.png, /floorplans/*
// or /_app/immutable/* against the 300/5min budget. Mounting the limiter
// globally (no path prefix) was the original bug: a single PWA cold-load
// would burn 20-40 slots and cause user-visible 429s within a few refreshes.
//
// We exercise the exact mount pattern from server.js (`app.use('/api/', limiter)`)
// and confirm:
//   1. /api/* responses carry RateLimit-* headers (limiter ran)
//   2. /mobile/*, /assets/*, /floorplans/*, /_app/* don't carry them
//   3. Static-asset 429-burning is impossible: 400 static requests still 200

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');

const ratelimitsFactory = require('../../src/ratelimits');

function makeApp() {
  const app = express();
  const fakeLogger = { log: () => {} };
  const ratelimits = ratelimitsFactory.create({ logger: fakeLogger });

  // Mirror server.js:258 exactly
  app.use('/api/', ratelimits.globalLimiter);

  // API + static routes both registered so we can compare header presence
  app.get('/api/noten', (req, res) => res.json({ ok: true }));
  app.get('/api/events', (req, res) => res.json({ ok: true })); // SSE-skip path
  app.get('/mobile/css/views.css', (req, res) => res.type('css').send('/* css */'));
  app.get('/assets/logo.png', (req, res) => res.type('png').send('binary'));
  app.get('/floorplans/data.js', (req, res) => res.type('js').send('// js'));
  app.get('/_app/immutable/chunks/foo.js', (req, res) => res.type('js').send('// js'));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('globalLimiter runs on /api/* (RateLimit-* headers present)', async () => {
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    const res = await get(port, '/api/noten');
    assert.strictEqual(res.status, 200);
    // express-rate-limit draft-7 standardHeaders => `ratelimit-limit`, `ratelimit-remaining`
    assert.ok(
      res.headers['ratelimit'] != null,
      'expected RateLimit-Limit header on /api/* response'
    );
  } finally {
    server.close();
  }
});

test('globalLimiter does NOT run on /mobile/* static assets', async () => {
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    const res = await get(port, '/mobile/css/views.css');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      res.headers['ratelimit'],
      undefined,
      'static asset must NOT carry RateLimit-* headers (limiter would have set them)'
    );
  } finally {
    server.close();
  }
});

test('globalLimiter does NOT run on /assets/* static files', async () => {
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    const res = await get(port, '/assets/logo.png');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers['ratelimit'], undefined);
  } finally {
    server.close();
  }
});

test('globalLimiter does NOT run on /floorplans/* or /_app/immutable/* (Svelte build assets)', async () => {
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    const r1 = await get(port, '/floorplans/data.js');
    const r2 = await get(port, '/_app/immutable/chunks/foo.js');
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r1.headers['ratelimit-limit'], undefined);
    assert.strictEqual(r2.headers['ratelimit-limit'], undefined);
  } finally {
    server.close();
  }
});

test('static-asset flood does NOT burn the API rate-limit budget', async () => {
  // Regression: pre-fix, 400 static-asset hits would exhaust 300/5min and
  // the NEXT /api/* call would 429. With the /api/-scoped mount, static
  // traffic is invisible to the counter and /api/* stays at full budget.
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    for (let i = 0; i < 400; i += 1) {
      const res = await get(port, '/mobile/css/views.css');
      assert.strictEqual(res.status, 200, `request ${i} failed unexpectedly`);
    }
    // Budget should still be full for /api/*
    const apiRes = await get(port, '/api/noten');
    assert.strictEqual(apiRes.status, 200);
    // express-rate-limit draft-7 combined header format:
    //   `RateLimit: limit=300, remaining=299, reset=300`
    // Remaining is total - 1 (the only /api/* call so far).
    const rl = apiRes.headers['ratelimit'] || '';
    const m = rl.match(/remaining=(\d+)/);
    assert.ok(m, `expected remaining=N in ratelimit header, got: ${rl}`);
    assert.strictEqual(m[1], '299', `expected remaining=299 (full budget), got remaining=${m[1]}`);
  } finally {
    server.close();
  }
});

test('/api/events stays exempt from globalLimiter (skip predicate)', async () => {
  const app = makeApp();
  const { server, port } = await listen(app);
  try {
    const res = await get(port, '/api/events');
    assert.strictEqual(res.status, 200);
    // skip: true => the limiter middleware exits before setting headers
    assert.strictEqual(res.headers['ratelimit'], undefined);
  } finally {
    server.close();
  }
});
