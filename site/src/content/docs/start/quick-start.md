---
title: Quick Start (Docker)
description: In unter 60 Sekunden lokal laufen — ein Docker-Befehl, fertig.
---

Der schnellste Weg: ein einziger Docker-Befehl.

## Voraussetzungen

- Docker installiert (Desktop oder Engine)
- WISS-Schulaccount mit Microsoft-SSO (`name@schule.ch`)

## Container starten

:::caution
Ersetze `MS_EMAIL` und `MS_PASSWORD` durch deine echten WISS-Zugangsdaten.
:::

```bash
docker run -d --name wissen --restart unless-stopped -p 3000:3000 \
  -e MS_EMAIL="dein.name@schule.ch" \
  -e MS_PASSWORD="DEIN_PASSWORT" \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/jokeriscrazy/wissen:latest
```

## API-Token holen

Beim ersten Start wird automatisch ein API-Token generiert. Hole es mit:

```bash
docker logs wissen | grep AUTO-GENERATED
```

## Dashboard öffnen

→ **<http://localhost:3000>** im Browser öffnen, Token einloggen, fertig.

## Windows / PowerShell

```powershell
docker run -d --name wissen --restart unless-stopped -p 3000:3000 `
  -e MS_EMAIL="dein.name@schule.ch" `
  -e MS_PASSWORD="DEIN_PASSWORT" `
  -v "${PWD}/data:/app/data" `
  ghcr.io/jokeriscrazy/wissen:latest
```

## Docker Compose

```bash
git clone https://github.com/JoKerIsCraZy/wissen.git
cd wissen
cp .env.example .env       # Werte eintragen
docker compose up -d
```

## Nächste Schritte

- 📱 [Mobile-App auf Handy installieren](/features/mobile-pwa/)
- 🔔 [Push-Benachrichtigungen aktivieren](/features/push/)
- 💬 [Telegram-Bot einrichten](/features/telegram/)
- 🔒 [Sicherheit: Reverse-Proxy + TLS](/konfiguration/sicherheit/)
