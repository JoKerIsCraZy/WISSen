---
title: Stundenplan & Noten
description: Wie der Scraper deine Noten und deinen Stundenplan holt — und was er damit anstellt.
---

Der Scraper-Layer ist das Herzstück von WISSen.

## Wie der Scraper funktioniert

1. **Playwright startet Chromium** (Headless oder sichtbar)
2. **Microsoft-SSO-Login** mit deinen `MS_EMAIL` + `MS_PASSWORD`
3. **Tocco-Noten-Seite** wird geladen + DOM extrahiert
4. **Tocco-Stundenplan-Seite** wird geladen + DOM extrahiert
5. **DB-Diff:** neue / geänderte Einträge werden erkannt
6. **History wird angehängt** (append-only, nichts wird überschrieben)
7. **Push-Notifications** für die Differenz werden ausgelöst

## Scrape-Modi

### Intervall-Modus (Default)

Alle X Minuten ein vollständiger Scrape. Konfigurierbar im UI oder via Settings:

```json
{
  "scheduler": {
    "mode": "interval",
    "intervalMinutes": 30
  }
}
```

### Wochenplan-Modus

Detaillierter Scrape (mit ZP/LB-Refresh) **einmal pro Woche**, ansonsten leichter Refresh. Spart Last auf dem Tocco-Portal.

```json
{
  "scheduler": {
    "mode": "weekly",
    "weeklyDay": "monday",
    "weeklyHour": 4
  }
}
```

Marker-Datei: `data/.weekly-detail-at` (löschen + Restart erzwingt erneuten Wochen-Check).

### Manueller Scrape

- **Dashboard:** `/scrape` → „Jetzt scrapen"
- **Telegram:** `/scrape` mit Live-Phase-Anzeige
- **API:** `POST /api/scrape`

## Noten

### Was wird gespeichert

| Feld | Quelle |
|---|---|
| Modul-Code (z. B. `M114`) | Tocco-Modulname |
| Modulname | Tocco-Beschreibung |
| Aktuelle Note | Tocco-Übersicht |
| Trend | Vergleich mit `noten_history` |
| Frisch-Marker | `change_pending` + `change_seen_at` |

### LB / ZP / Sonstige

Pro Modul werden **alle Bewertungen** (`noten_pruefungen`-Tabelle) extrahiert:

| Typ | Beschreibung |
|---|---|
| **LB** (Lernbeurteilung) | Zwischen-Bewertungen mit Gewicht |
| **ZP** (Zwischenprüfung) | Größere Prüfungen |
| **OTHER** | Alles andere (Prüfungs-Vorbereitung, IPA-Komponenten) |

Jede Bewertung wird mit ihrem **Gewicht** gespeichert — der IPA-Rechner im Dashboard nutzt das für Prognosen.

### History

Jede Notenänderung wird in `noten_history` (Modul-Note) und `pruefungen_history` (LB / ZP) **append-only** archiviert. So siehst du auch nachträglich noch:

> Note ging von 4.5 → 5.0 am 2026-04-12 14:32

## Stundenplan

### Was wird gespeichert

| Feld | Inhalt |
|---|---|
| `start` / `end` | Datum + Uhrzeit |
| `subject` | Modulname / Lektion |
| `room` | Raum (z. B. „W420") |
| `teacher` | Dozent:in |
| `room_change` | Marker bei Raumwechsel |

### Online-Lektionen

Termine ohne festen Raum (z. B. Online-Unterricht via Teams) werden als **„Online"** markiert. Wechsel von Online → Offline und umgekehrt löst ebenfalls einen Push aus.

### Stundenplan löschen + neu

Wenn der Stundenplan altdatig wirkt:

1. Dashboard → `/stundenplan` → „DB zurücksetzen"
2. Manueller Scrape — die Tabelle wird komplett neu aufgebaut

## DB-Schema (Kurzfassung)

| Tabelle | Inhalt |
|---|---|
| `noten` | Stammdaten + aktuelle Note + Frisch-Marker |
| `noten_history` | Append-only Verlauf jeder Modulnoten-Änderung |
| `noten_pruefungen` | LB / ZP / OTHER pro Modul mit Gewicht |
| `pruefungen_history` | Append-only Verlauf jeder ZP/LB-Änderung |
| `stundenplan` | Termine + Raumwechsel-Marker |
| `push_subscriptions` | PWA-Push-Subscriptions |

Detailliertes Schema: [Architektur](/referenz/architektur/).

## Performance

- Ein voller Scrape dauert typisch **10–20 Sekunden** (abhängig vom Tocco-Portal)
- DB-Operationen sind **Singleton** seit v1.0.0 — kein Connection-Spam
- Migrations + Reclassification laufen **einmal beim Boot**, nicht bei jedem Request
