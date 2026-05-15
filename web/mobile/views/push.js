/* ============================================================
   WISSen — Web-Push helpers (used by Settings → Benachrichtigungen)
   Split out of views/settings.js to keep that file under the line cap.
   These run when the user toggles Push or hits the test button — diag
   text + status copy is updated by mutating elements in the settings DOM.

   Depends on globals from mobile.js shell:
     - apiFetch, toast, registerServiceWorker, lastSWError
   ============================================================ */
'use strict';

async function refreshDiag() {
  const el = document.getElementById('pushDiag');
  if (!el) return;
  const info = pushSupportInfo();
  const lines = [];
  lines.push('URL:           ' + location.origin);
  lines.push('SecureContext: ' + (window.isSecureContext ? '✓ ja' : '✗ nein (HTTPS fehlt!)'));
  lines.push('serviceWorker: ' + (info.hasSW ? '✓ vorhanden' : '✗ fehlt'));
  lines.push('PushManager:   ' + (info.hasPM ? '✓ vorhanden' : '✗ fehlt'));
  lines.push('Notification:  ' + (info.hasNotif ? '✓ vorhanden' : '✗ fehlt'));
  lines.push('isStandalone:  ' + (info.isStandalone ? '✓ PWA installiert' : '✗ Browser-Tab'));

  if (info.hasSW) {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/mobile/');
      if (reg) {
        const state = (reg.active && reg.active.state)
                    || (reg.installing && reg.installing.state + ' (installing)')
                    || (reg.waiting && reg.waiting.state + ' (waiting)')
                    || 'unknown';
        lines.push('SW-Status:     ✓ aktiv (' + state + ')');
        lines.push('SW-Scope:      ' + reg.scope);
      } else {
        lines.push('SW-Status:     ✗ NICHT registriert');
      }
    } catch (e) {
      lines.push('SW-Status:     ✗ Fehler: ' + (e.message || e));
    }
  }
  if (lastSWError) {
    lines.push('');
    lines.push('Letzter SW-Fehler:');
    lines.push('  ' + lastSWError);
  }
  el.textContent = lines.join('\n');
}

function pushSupportInfo() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
                    || window.navigator.standalone === true;
  const hasSW = 'serviceWorker' in navigator;
  const hasPM = 'PushManager' in window;
  const hasNotif = 'Notification' in window;
  const fullySupported = hasSW && hasPM && hasNotif;
  return { isIOS, isAndroid, isStandalone, hasSW, hasPM, hasNotif, fullySupported };
}

function pushSupported() {
  return pushSupportInfo().fullySupported;
}

async function refreshPushStatus() {
  const status = document.getElementById('pushStatus');
  const cb = document.getElementById('pushToggle');
  if (!status || !cb) return;

  const info = pushSupportInfo();
  status.removeAttribute('data-state');

  // iOS-Sonderfall: Notification + PushManager existieren NUR in der
  // installierten PWA (Home-Screen). Im Safari-Tab fehlen die APIs komplett.
  if (info.isIOS && !info.isStandalone) {
    status.dataset.state = 'info';
    status.innerHTML =
      '📱 <strong>iOS:</strong> Push funktioniert nur in der installierten PWA.<br>' +
      '<strong>So gehts:</strong><br>' +
      '1. Diese Seite in <strong>Safari</strong> öffnen<br>' +
      '2. Teilen-Symbol <span class="m-push-icon">⬆︎</span> antippen<br>' +
      '3. „<em>Zum Home-Bildschirm</em>" wählen<br>' +
      '4. WISSen-Icon vom Home-Screen öffnen<br>' +
      '5. Hier zurück zu Settings → Push aktivieren';
    cb.disabled = true;
    return;
  }

  if (!info.fullySupported) {
    const missing = [
      !info.hasSW ? 'ServiceWorker' : null,
      !info.hasPM ? 'PushManager' : null,
      !info.hasNotif ? 'Notification' : null
    ].filter(Boolean).join(', ');
    status.dataset.state = 'err';
    status.textContent = '⚠️ Dieser Browser unterstützt kein Web-Push (fehlt: ' + missing + ').';
    cb.disabled = true;
    return;
  }

  if (!window.isSecureContext && location.hostname !== 'localhost') {
    status.dataset.state = 'err';
    status.textContent = '⚠️ Push benötigt HTTPS.';
    cb.disabled = true;
    return;
  }

  const perm = Notification.permission;
  let isSubscribed = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/mobile/');
    if (reg) {
      let sub = await reg.pushManager.getSubscription();
      if (sub && perm === 'granted') {
        // VAPID-Drift Auto-Heal: prüfe ob die existierende Subscription noch
        // an den aktuellen Server-VAPID-Key gebunden ist. Nach einem Container-
        // Recreate ohne data-Volume regeneriert push.js neue Keys, FCM lehnt
        // dann jeden Push-Request der alten Subscription mit 401/403 ab — ohne
        // Auto-Repair fühlt sich das wie "Push kommt nur wenn App offen ist"
        // an, weil der lokale showNotification beim Test sichtbar ist aber
        // serverseitige Pushes nie ankommen.
        sub = await repairSubscriptionIfStale(reg, sub);
      }
      isSubscribed = !!sub;
    }
  } catch (_) {}

  cb.checked = isSubscribed && perm === 'granted';
  if (perm === 'denied') {
    status.dataset.state = 'err';
    status.textContent = '🚫 Push wurde im Browser abgelehnt — bitte in den Browser-Einstellungen freigeben.';
    cb.disabled = true;
  } else if (isSubscribed) {
    status.dataset.state = 'ok';
    status.textContent = '✅ Push aktiviert für dieses Gerät.';
    cb.disabled = false;
  } else {
    status.removeAttribute('data-state');
    status.textContent = 'Push noch nicht eingerichtet.';
    cb.disabled = false;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

function uint8ToUrlBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Vergleicht den applicationServerKey der existierenden Subscription mit dem
// aktuellen Server-VAPID-Key. Bei Drift: alte Subscription unsubscriben,
// neue subscriben, Server informieren. Returnt die (ggf. neue) Subscription
// oder null wenn das Repair fehlschlägt.
async function repairSubscriptionIfStale(reg, sub) {
  try {
    const opts = sub.options || {};
    const oldKey = opts.applicationServerKey;
    if (!oldKey) return sub; // ohne lokalen Key kein Vergleich möglich
    const oldKeyB64 = uint8ToUrlBase64(new Uint8Array(oldKey));

    let serverKey = null;
    try {
      const r = await apiFetch('/api/push/vapid-key');
      serverKey = r && r.publicKey;
    } catch (_) {
      return sub; // Server nicht erreichbar — alte Subscription behalten
    }
    if (!serverKey || serverKey === oldKeyB64) return sub;

    // Drift: alte Subscription ist tot. Lokal unsubscriben und neu anlegen.
    const oldEndpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch (_) {}
    try {
      await apiFetch('/api/push/subscribe', { method: 'DELETE', body: { endpoint: oldEndpoint } });
    } catch (_) { /* Server-Cleanup ist optional, läuft beim nächsten 401 eh */ }

    const fresh = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(serverKey)
    });
    await apiFetch('/api/push/subscribe', { method: 'POST', body: { subscription: fresh.toJSON() } });
    return fresh;
  } catch (_) {
    return null;
  }
}

async function enablePush() {
  if (!pushSupported()) { toast('Browser unterstützt kein Push', 'err'); return false; }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('Push wurde abgelehnt', 'err');
    return false;
  }

  let reg = await navigator.serviceWorker.getRegistration('/mobile/');
  if (!reg) {
    try {
      reg = await navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' });
    } catch (e) {
      toast('Service-Worker-Registrierung fehlgeschlagen', 'err');
      return false;
    }
  }
  await navigator.serviceWorker.ready;

  let { publicKey } = await apiFetch('/api/push/vapid-key');
  if (!publicKey) { toast('VAPID-Key fehlt', 'err'); return false; }

  let sub;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    // Brave deaktiviert per Default die FCM-Anbindung — typischer Fehler:
    // "Registration failed - push service error" oder "AbortError"
    const isBrave = (navigator.brave && typeof navigator.brave.isBrave === 'function')
                 || /push service error|Registration failed/i.test(msg);
    if (isBrave) {
      const status = document.getElementById('pushStatus');
      if (status) {
        status.dataset.state = 'err';
        status.innerHTML = '🚫 Push-Subscribe fehlgeschlagen.<br>' +
          '<strong>Brave-Browser:</strong> öffne <code>brave://settings/privacy</code>, ' +
          'aktiviere „<em>Google-Dienste für Push-Nachrichten verwenden</em>", ' +
          'starte Brave neu und versuche es erneut. ' +
          'Alternativ Chrome / Edge / Firefox / Safari verwenden.';
      }
      toast('Push in Brave deaktiviert — siehe Hinweis oben', 'err');
    } else {
      toast('Push-Subscribe fehlgeschlagen: ' + msg, 'err');
    }
    return false;
  }

  try {
    await apiFetch('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
    toast('Push aktiviert');
    return true;
  } catch (e) {
    if (!e.silent) toast(e.message || 'Server-Subscribe fehlgeschlagen', 'err');
    try { await sub.unsubscribe(); } catch (_) {}
    return false;
  }
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/mobile/');
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try {
      await apiFetch('/api/push/subscribe', { method: 'DELETE', body: { endpoint } });
    } catch (_) {}
    toast('Push deaktiviert');
  } catch (e) {
    toast('Deaktivieren fehlgeschlagen', 'err');
  }
}
