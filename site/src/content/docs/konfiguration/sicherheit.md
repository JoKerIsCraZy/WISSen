---
title: Sicherheit
description: Auth, Anti-Brute-Force, Encryption-at-Rest, Reverse-Proxy, Backup-Strategien.
---

WISSen verwaltet **deine echten WISS-Zugangsdaten** und **deine Noten**. Sicherheit ist daher ernst gemeint.

## Authentifizierung

### Bearer-Token

Alle `/api/*`-Routen brauchen einen Bearer-Token im `Authorization`-Header:

```bash
curl -H "Authorization: Bearer $API_TOKEN" http://localhost:3000/api/noten
```

Der Token wird beim ersten Start auto-generiert (32 zufällige Bytes) und in `data/.api-token` abgelegt.

### Query-String-Auth (eingeschränkt)

`?token=…` ist **nur** auf `/api/events` erlaubt (EventSource kann keine Header setzen). Auf allen anderen Routen wird Query-Token abgewiesen — damit der Token nicht in Reverse-Proxy-Logs, Browser-History oder Referrer-Headern landet.

## Anti-Brute-Force (drei Schichten)

| Schicht | Limit | Lockout |
|---|---|---|
| Kurz | 10 Fehlversuche / 15 min | 15 min |
| Mittel | 50 Fehlversuche / 6 h | 6 h |
| SSE-spezifisch | 60 Fehlversuche / 15 min | (toleriert EventSource-Reconnect-Storms) |

Implementiert in `src/ratelimits.js` mit `express-rate-limit`.

## SSRF-Schutz

- **Tocco-URLs** nur via ENV-Variablen setzbar — kein UI-Zugriff
- **Push-Endpoints** auf Whitelist beschränkt: FCM (Google), Mozilla Autopush, Apple, Windows Notification Service

## Settings-Encryption (At-Rest)

Sensible Werte in `data/settings.json` (`msPassword`, `telegramToken`) werden mit **AES-256-GCM** verschlüsselt.

- **Master-Key:** 32 zufällige Bytes, beim ersten Start auto-generiert in `data/.master-key` (Mode `0600`)
- **Format-Versioning:** `enc:v1:<iv>:<ct>:<tag>` — erlaubt künftige Algo-Wechsel
- **Lazy Migration:** Bestands-Plaintext-Werte werden beim nächsten Save migriert

### Was geschützt ist

✅ Backup-Leaks (wenn `.master-key` separat gesichert)
✅ Volume-Snapshots
✅ Casual File-Sharing

### Was NICHT geschützt ist

❌ Shell-Access auf den laufenden Host (Master-Key liegt neben den Daten)
❌ Memory-Dumps
❌ Container-Escape

## Reverse-Proxy + TLS

Für öffentliche Exposition **immer** Reverse-Proxy mit TLS davor.

### Caddy (einfachster Weg)

```caddyfile
wissen.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Caddy holt automatisch ein Let's-Encrypt-Zertifikat.

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name wissen.example.com;

  ssl_certificate /etc/letsencrypt/live/wissen.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/wissen.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE braucht Buffering aus
    proxy_buffering off;
    proxy_cache off;
  }
}
```

### Traefik (mit Compose-Labels)

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.wissen.rule=Host(`wissen.example.com`)"
  - "traefik.http.routers.wissen.entrypoints=websecure"
  - "traefik.http.routers.wissen.tls.certresolver=letsencrypt"
  - "traefik.http.services.wissen.loadbalancer.server.port=3000"
```

### TRUST_PROXY korrekt setzen

| Setup | `TRUST_PROXY` |
|---|---|
| Direkt (kein Proxy) | `loopback` |
| 1 Reverse-Proxy davor | `1` (Default) |
| Cloudflare → nginx → app | `2` |
| **Niemals** | `true` (IP-Spoofing) |

## Backup-Verschlüsselung

Das App-interne Encryption-Layer schützt `settings.json` gegen versehentliche `data/`-Leaks. Für **echte** Backup-Sicherheit das Backup zusätzlich verschlüsseln:

### restic — incremental, deduplicated, AES-256

```bash
restic init --repo /backups/wissen
restic -r /backups/wissen backup ./data --exclude 'data/.master-key'
```

### borg — incremental, deduplicated

```bash
borg init --encryption=repokey /backups/wissen
borg create /backups/wissen::$(date +%Y%m%d) ./data --exclude '*/.master-key'
```

### gpg — single-shot tarball

```bash
tar czf - data | gpg --symmetric --cipher-algo AES256 -o wissen-backup-$(date +%Y%m%d).tar.gz.gpg
```

:::danger[Master-Key]
Der Master-Key (`data/.master-key`) entweder:
- Vom Backup **ausschließen** UND separat ans sichere Ort sichern, **oder**
- Mit drinlassen — dann sind die `settings.json`-Secrets nur durch die Backup-Passphrase geschützt
:::

## Was in `data/` liegt

| Datei | Inhalt | Sensibel? |
|---|---|---|
| `wissen.db` | SQLite mit Noten + Stundenplan | Persönliche Daten |
| `settings.json` | Settings (verschlüsselt: msPassword, telegramToken) | Ja |
| `.api-token` | API-Bearer-Token | Ja |
| `.master-key` | AES-256-GCM Master-Key | **Sehr** |
| `vapid.json` | Web-Push VAPID-Keys | Ja |
| `.weekly-detail-at` | Wochen-Check-Marker | Nein |

`data/` **niemals** veröffentlichen — auch nicht Read-Only.

## Content-Security-Policy

Helmet-CSP mit `script-src 'self' 'unsafe-inline'`. Hintergrund: SvelteKit `adapter-static` prerendert Inline-Bootstrap-Skripte zur Build-Zeit. Migration zu strikter CSP ist als TODO im Code dokumentiert.
