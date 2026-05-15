---
title: Docker Deployment
description: Production-ready Deployment mit Docker Compose, Health-Checks und Updates.
---

Vollständiger Leitfaden für Docker-basiertes Hosting — von Build bis Production.

## Quick-Start: Compose

```bash
git clone https://github.com/JoKerIsCraZy/wissen.git
cd wissen

cp .env.example .env
# .env editieren: MS_EMAIL, MS_PASSWORD (Pflicht), API_TOKEN (optional)

docker compose up -d
docker compose logs -f wissen
```

Stoppen: `docker compose down`.

## Image bauen (statt pullen)

```bash
docker build -t wissen .
```

### Multi-Stage Build

1. **base** — Playwright + Node-Runtime (`mcr.microsoft.com/playwright:v1.50.0-jammy`)
2. **deps** — `npm ci --omit=dev`
3. **runtime** — Copy deps + app, läuft als Non-Root-User `app`

Vorteile: schnellere Rebuilds, kleineres Final-Image, Non-Root-User.

## Volumes

Mount `data/` für Persistenz:

```yaml
volumes:
  - ./data:/app/data
```

Inhalt von `data/`:

- `wissen.db` — SQLite-Datenbank (auto-erzeugt)
- `settings.json` — Persistente Settings + verschlüsselte Credentials
- `.api-token` — Auto-generiertes Token (falls `API_TOKEN` nicht in `.env`)
- `.master-key` — AES-256-GCM Master-Key für Settings-Encryption (Mode 0600)
- `vapid.json` — Web-Push VAPID-Keys

## Health-Checks

```bash
docker ps  # STATUS = healthy / unhealthy

# Manuell:
docker exec wissen node -e "require('http').get('http://127.0.0.1:3000/healthz', r => console.log(r.statusCode))"
```

Mit `restart: unless-stopped` startet der Container automatisch neu wenn Health-Check fehlschlägt.

## Networking

### Default — LAN-offen
```yaml
ports:
  - "3000:3000"
```

### Localhost-only (empfohlen für Reverse-Proxy davor)
```yaml
ports:
  - "127.0.0.1:3000:3000"
```

## Production-Checkliste

- [ ] `.env` mit Production-Secrets befüllt
- [ ] `.env` ist in `.gitignore` (nie committen!)
- [ ] `data/` existiert und ist beschreibbar
- [ ] Reverse-Proxy mit TLS davor (Caddy / Traefik / nginx)
- [ ] `TRUST_PROXY` korrekt gesetzt
- [ ] Backup-Strategie für `data/` definiert

## Updates

```bash
# Image pullen (wenn Registry-basiert)
docker compose pull

# Oder lokal rebuilden
docker compose build

# Restart mit Zero-Downtime
docker compose up -d --no-deps --build wissen
```

## Backups

```bash
# SQLite-Snapshot (die DB ist klein, das geht zur Laufzeit)
tar -czf data-backup-$(date +%Y%m%d).tar.gz ./data

# Restore
tar -xzf data-backup-20260424.tar.gz
docker compose restart
```

Für richtig sichere Backups: **restic** oder **borg** mit Verschlüsselung — siehe [Sicherheit](/konfiguration/sicherheit/#backup-verschlüsselung).

## Chromium-Sandbox-Probleme

Wenn du im Log siehst: `The Chromium sandbox is not available`:

**Option A — Compose-Cap (sicherer):**
```yaml
security_opt:
  - seccomp=unconfined
cap_add:
  - SYS_ADMIN
```

**Option B — `--no-sandbox` (weniger sicher):**
```bash
PLAYWRIGHT_CHROMIUM_ARGS=--no-sandbox
```

Bevorzuge Option A.
