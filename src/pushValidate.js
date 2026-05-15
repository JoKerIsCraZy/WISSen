'use strict';

// Validiert eine Push-Subscription. Whitelist der erlaubten Push-Service-Hosts
// verhindert SSRF — sonst könnte ein Angreifer mit gestohlenem API-Token meinen
// Server arbitrary HTTP-Requests an interne Adressen schicken lassen
// (webpush.sendNotification → POST an subscription.endpoint).
//
// Flat-Liste kanonischer Hostnamen. Der Matcher unten akzeptiert exakte
// Übereinstimmung ODER ein Suffix mit führendem Punkt (Subdomain). Dadurch
// matchen z.B. 'foo.notify.windows.com' UND 'notify.windows.com', aber NICHT
// 'fcm.googleapis.com.attacker.com' (kein führender Punkt → kein Match).
const ALLOWED_PUSH_HOSTS = Object.freeze([
  'fcm.googleapis.com',                  // Chrome / Brave / Edge (Android & Desktop)
  'updates.push.services.mozilla.com',   // Firefox
  'notify.windows.com',                  // Edge Legacy / Windows
  'web.push.apple.com',                  // Safari iOS 16.4+ / macOS (Web-Push-Endpoint)
  'push.apple.com'                       // Apple Push (Subdomain-Cover)
]);

// Strenges B64URL ohne Padding: nur A-Z, a-z, 0-9, _ und - sind erlaubt.
// '+', '/' und '=' sind STANDARD-Base64 und im Web-Push-Standard (RFC 8291)
// nicht zulässig. Tighten verhindert Format-Drift in fremden Subscriptions.
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

function validatePushSubscription(sub) {
  if (!sub || typeof sub !== 'object') return 'subscription required';
  if (typeof sub.endpoint !== 'string' || !sub.endpoint) return 'endpoint required';
  if (sub.endpoint.length > 1024) return 'endpoint too long';
  let url;
  try { url = new URL(sub.endpoint); } catch (_) { return 'invalid endpoint URL'; }
  if (url.protocol !== 'https:') return 'endpoint must be HTTPS';
  // Defense-in-depth: explizit kein Port — Push-Services laufen alle auf 443
  // (Default). Ein explizit gesetzter Port wäre Indikator für custom-/spoof-
  // Endpoint, oder DNS-Rebinding-Versuch.
  if (url.port !== '') return 'endpoint must not specify a port';
  const host = url.hostname.toLowerCase();
  const hostAllowed = ALLOWED_PUSH_HOSTS.some(h =>
    host === h || host.endsWith('.' + h)
  );
  if (!hostAllowed) return 'endpoint host not allowed';
  if (!sub.keys || typeof sub.keys !== 'object') return 'keys required';
  if (typeof sub.keys.p256dh !== 'string' || !sub.keys.p256dh) return 'p256dh required';
  if (sub.keys.p256dh.length > 256 || !B64URL_RE.test(sub.keys.p256dh)) return 'p256dh invalid';
  if (typeof sub.keys.auth !== 'string' || !sub.keys.auth) return 'auth required';
  if (sub.keys.auth.length > 64 || !B64URL_RE.test(sub.keys.auth)) return 'auth invalid';
  return null;
}

module.exports = { validatePushSubscription, ALLOWED_PUSH_HOSTS };
