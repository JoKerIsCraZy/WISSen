# Beitragen zu WISSen

Danke für dein Interesse! Dieses Dokument erklärt, wie du das Projekt lokal aufsetzt und Beiträge einreichst.

## Lokale Entwicklung

```bash
git clone <repo>
cd wissen
cp .env.example .env          # Werte eintragen (MS_EMAIL, MS_PASSWORD)
npm install
npm run setup                 # Playwright Chromium installieren
npm run serve                 # HTTP-Server auf :3000 starten
# oder einmal-Scrape:
npm start
```

> Tipp: `HEADLESS=false` in `.env` setzen, damit der Browser sichtbar ist — hilfreich beim Debuggen von Login-Problemen.

## Projektstruktur

Siehe `README.md#architektur` für den aktuellen Verzeichnisbaum. Quick map:

- `src/` Server-Code (modulare Unterordner: `db/`, `bot/`, `routes/`, `shared/`)
- `web-svelte/` SvelteKit-V2-Frontend (Build → `dist/`)
- `web/` Legacy Vanilla-JS Mobile-PWA + shared `floorplans/`
- `test/unit/` Unit-Tests (`node --test`)
- `claude_docs/` Interne Doc (gitignored, für Claude-Code-Workflows)

`data/` wird nie committet — sie enthält Secrets und Session-Cookies.

## Pre-Commit Hooks (optional)

Das Repo enthält einen `.husky/pre-commit`-Hook, der:

1. Den Mobile-PWA-Service-Worker-Cache-Bump erzwingt (wenn `web/mobile/*` geändert
   wird, muss `web/mobile/sw.js` mit VERSION-Inkrement mitgestaged sein).
2. `npm test` vor dem Commit ausführt.

Husky wird automatisch via `npm install` aktiviert (über das `prepare`-Script).
Falls Husky nicht installiert ist, ist der Hook ein No-op — keine Blockade.

Manuelle Aktivierung:

```bash
npx husky install
```

## Issues & Pull Requests

1. **Issue erstellen** — beschreibe das Problem oder die Feature-Idee kurz. Bitte vorher prüfen, ob es bereits ein offenes Issue gibt.
2. **Fork** des Repos erstellen, einen Feature-Branch anlegen (`git checkout -b feat/mein-feature`).
3. Änderungen implementieren.
4. **Pull Request** gegen `main` öffnen — kurze Beschreibung, was geändert wurde und warum.

Für Bugfixes reicht meist ein kleines reproduzierbares Beispiel im Issue.

## Code-Style

- **Sprache:** CommonJS (`require`/`module.exports`), kein Build-Schritt.
- **Dateigrösse:** max. ~400 Zeilen pro Datei; lieber mehrere kleine Module.
- **Fehlerbehandlung:** Fehler immer explizit behandeln — nie still verschlucken.
- **Keine externen Linter-Configs** im Repo; orientiere dich am bestehenden Stil der Dateien in `src/`.
- **Keine Secrets** in Commits — `.env`, `data/` und `*.png` sind gitignored.
- **Immutability:** Objekte nicht in-place ändern, sondern neue Objekte zurückgeben (wie in `settings.js` praktiziert).

Kurz: lies zwei, drei bestehende Dateien in `src/` durch — der Stil ist konsistent und selbsterklärend.

## Lizenz

Mit einem Pull Request stimmst du zu, dass dein Beitrag unter der [MIT License](LICENSE) dieses Projekts veröffentlicht wird.
