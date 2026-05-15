'use strict';

// ---------- Push subscriptions ----------
function addPushSubscription(db, sub, ua) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    throw new Error('invalid subscription');
  }
  const stmt = db.prepare(
    'INSERT INTO push_subscriptions (endpoint, p256dh, auth, ua) VALUES (?, ?, ?, ?) ' +
    'ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, ' +
    '  auth = excluded.auth, ua = excluded.ua, last_seen = CURRENT_TIMESTAMP'
  );
  stmt.run(sub.endpoint, sub.keys.p256dh, sub.keys.auth, (ua || '').slice(0, 200));
}

function removePushSubscription(db, endpoint) {
  if (!endpoint) return 0;
  const stmt = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
  const r = stmt.run(endpoint);
  return r.changes || 0;
}

function getAllPushSubscriptions(db) {
  return db.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions'
  ).all();
}

function countPushSubscriptions(db) {
  return db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions').get().c || 0;
}

// Single-endpoint lookup — used by /api/push/test to send only to the caller
// (avoids DoS-amplification via the legacy fan-out behaviour). Returns a
// subscription-shaped object compatible with web-push.sendNotification, or
// `null` if the endpoint is unknown.
function getPushSubscriptionByEndpoint(db, endpoint) {
  if (!endpoint) return null;
  const row = db.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE endpoint = ?'
  ).get(endpoint);
  return row || null;
}

// Refresh `last_seen` after a successful push send. Lets future cleanup-jobs
// distinguish actively-reachable subscriptions from long-dead ones — without
// this, `last_seen` only ever reflects the subscribe-/UA-refresh moment.
function touchPushSubscription(db, endpoint) {
  if (!endpoint) return 0;
  const stmt = db.prepare(
    'UPDATE push_subscriptions SET last_seen = CURRENT_TIMESTAMP WHERE endpoint = ?'
  );
  const r = stmt.run(endpoint);
  return r.changes || 0;
}

module.exports = {
  addPushSubscription,
  removePushSubscription,
  getAllPushSubscriptions,
  countPushSubscriptions,
  getPushSubscriptionByEndpoint,
  touchPushSubscription
};
