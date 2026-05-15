# Backend Optimize — Defer Queue

Aus dem 7-Domain-Audit ([PR #68](https://github.com/JoKerIsCraZy/WISSen/pull/68)).
**Schon erledigt:** 2 CRITICAL + 10 HIGH Quick Wins (s. PR #68 Commit-Liste).
**Offen:** ~128 Findings über alle 8 Audit-Domains.

Tabellen-Spalten: **Eff** = Effort (S < 30 min, M = 1–3 h, L > 1 d) · **Risk** = Regression-Risiko bei Fix.

---

## Top-15 nach ROI (Impact / Effort)

Was ich als nächstes angehen würde, sortiert nach Pay-off:

| # | Domain | Was | Eff | Risk |
|---|---|---|---|---|
| 1 | Scrape | Watchdog kann Browser direkt killen (`browser` aus `ensureLoggedIn` hochheben) | M | M |
| 2 | Scrape | Pool-Page-Health-Tracking: fehlerhafte Page droppen statt cascading failures | M | L |
| 3 | DB | Prepared Statements modul-scope hoisten (saveNoten / saveStundenplan / savePruefungen) | M | L |
| 4 | Tests | Unit-Tests für `scheduler.js` + `runScrape` maskSettings/logPushResult (pure) | S | L |
| 5 | Tests | `test/unit/pushValidate.test.js` — SSRF-Whitelist regression-protected | S | L |
| 6 | HTTP | `/api/version` Failure-TTL trennen (60s statt 1h bei Error) | S | L |
| 7 | HTTP | Body-Limits härten: 32k → 8k global, 4k für `/api/settings`, `/api/logs?limit` cap 1000 | S | L |
| 8 | HTTP | `/healthz/ready`: prepared-statement cachen + sensitive Felder auth-gated | S | L |
| 9 | Push | `/api/push/test` härten: eigener Limiter (3/min) + nur an caller-endpoint | S | M |
| 10 | Bot | `editMessage` Fallback nur bei spezifischen Errors (nicht bei 429) | S | L |
| 11 | Bot | `startScrapePoll`: rekursives `setTimeout` statt überlappendes `setInterval` | S | L |
| 12 | Bot | `state.lastMenuMessageId` + `multiMessageIds` bei `bot.stop()` zurücksetzen | S | L |
| 13 | Settings | Master-Key-Bootstrap-Race fixen (re-read nach rename) | S | L |
| 14 | HTTP | `marked.parse` output sanitize (DOMPurify / sanitize-html) | M | M |
| 15 | Settings | `coerce`: `Boolean("false")` statt-bug + `.trim()` für secrets | S | L |

---

## BE-1 — DB-Layer

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/db/schema.js` + `src/db/stats.js:239` | Partial-Index `idx_noten_pending` / `idx_sp_pending` auf `change_pending = 1` — `dismissAll` macht aktuell Full-Scan | S | L |
| `src/db/noten.js:243-250` | N+1 in `getKuerzelnNeedingDetailScrape`: per-`additionalKuerzelId` ein `lookupOne.get()`. Bei initialem Import 50+ Calls. Fix: `IN (?, ?, ?, …)`-Query | S | L |
| `src/db/{noten,stundenplan,pruefungen}.js` | Prepared Statements werden pro Aufruf neu erstellt. Lazy WeakMap<db, Statements> oder Modul-Scope-Cache | M | L |
| `src/db/pruefungen.js:155` + `src/db/noten.js:261` | `db.prepare(...)` inline im Hot-Path (`markFresh` in `savePruefungen`, `markDetailScraped`). Hoist auf Modul-Scope | S | L |

### Offene MEDIUM

- `reclassifyOtherPruefungen` läuft bei jedem `openOnce()` mit unindexiertem LIKE. Fix: `PRAGMA user_version`-Flag (einmal nach Migration deaktivieren) ODER Partial-Index auf `pruefung_typ = 'OTHER'`. **Eff:** S
- `idx_sp_dozent` / `idx_sp_klasse` haben keinen Konsumenten — tote Indizes mit UPSERT-Maintenance-Cost. Fix: droppen. **Eff:** S
- `getNoten` correlated Subquery für `prev_note` — skaliert linear mit Modul-Anzahl, bei N > 500 wäre Window-Function billiger. **Eff:** M (defer bis N > 500)
- `getStats` macht 5 separate prepared Statements pro Cache-Miss. Hoist + ggf. zu UNION ALL konsolidieren. **Eff:** S

### Offene LOW

- WAL-Checkpoint nicht explizit gemanaged (`PRAGMA wal_checkpoint(PASSIVE)` am Cycle-Ende)
- `clearStundenplan` löscht ohne weitere Schutzschicht (kein Audit-Trail)
- `idx_noten_fetched` nur teilweise nützlich
- Tests decken weder concurrent-Writer-Race noch `savePruefungen`-DELETE-Pfad ab

---

## BE-2 — HTTP-Layer

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/routes/status.js:88-103` | `/api/version` cached Fehler-Status mit voller 1h-TTL. Transienter GitHub-Error sperrt Update-Anzeige. Fix: getrennter Error-TTL (60–120 s) | S | L |
| `src/server.js:187-190` | Body-Limit 32 KB Default ist überdimensioniert. Fix: 8 KB global, 4 KB für `/api/settings` | S | L |
| `src/server.js:166` + `src/routes/status.js:75` | CSP `unsafe-inline` ist OK für SvelteKit-Bootstrap, aber `marked.parse(rawBody)` aus GitHub-Release-Body ohne Sanitizer ist potenzieller XSS-Vektor (second-order) | M | M |
| `src/server.js:203-254` | `/healthz/ready` ist unauthenticated + unrate-limited + macht DB-Prepare pro Request + leakt `lastError`/`lastStats`. Fix: prepared-statement cachen, sensible Felder nur mit Auth | S | L |

### Offene MEDIUM

- `/api/logs?limit` ohne Cap (Response-Size kann 10–20 MB werden). Fix: `Math.min(parseInt(...), 1000)`
- SSE keine per-IP-Begrenzung — ein Client kann alle 20 Slots verbrauchen
- Manual-Scrape-Cooldown wird in `state` gehalten, kein Reset bei Crash
- `/api/stundenplan/clear` ohne dedizierten Limiter (curl-Loop kann Stundenplan repeat zerstören)
- `/api/version` 5 s-Timeout + kein Retry-After-Backoff + kein Logging bei wiederholtem Fail
- `parseTrustProxy` akzeptiert beliebige Strings ohne Validierung
- `/api/events?lastEventId=0` kann Replay-DoS (bounded durch buffer, aber unnötig)
- Settings-Subscribe-Listener läuft sync in PATCH-Pfad, blockiert Response
- Boot-Race: `database = db.openOnce()` nach `/healthz/ready`-Definition (TDZ-Edge)

### Offene LOW

- `db.transaction()`-Wrapper statt manuelle `BEGIN/COMMIT/ROLLBACK`
- `req.ip` bei `TRUST_PROXY=true` spoofbar (Lockout-Bypass)
- Error-Handler verschluckt 4xx als 500 (z.B. JSON-Parse-Error wird 500)
- Helmet `Cross-Origin-Resource-Policy: same-origin` bricht PWA auf separater Origin
- `/api/events` kein Connect-Rate-Limit (nur Failure-Limiter)
- Token-via-Query-String `/api/events` leaked in proxy-logs (dokumentieren: `access_log off`)
- `clearStundenplan` kein Audit-Log, kein Push-Suppress nach Reset
- **Route-Integration-Tests fehlen komplett** (supertest)

---

## BE-3 — Scrape-Layer

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/runScrape.js:146-167` | Watchdog kann Browser nicht killen wenn Hang **vor** `scraped`-Assignment. `browser` aus `ensureLoggedIn` hochheben, `Promise.race` mit Watchdog-Reject | M | M |
| `src/scraper.js:966-978` | Pool-Page-State-Korruption nach mid-navigation throw. Nächster acquire bekommt kaputte Page → cascading "keine Prüfungs-Daten". Fix: bei Frame-detached / Target-closed Page droppen | M | L |
| `src/scraper.js:748-756` | `creating` counter bei drained-race: `await context.newPage()` kann nach `drain()` resolven, Page wird orphan. Fix: nach await `if (drained) close + throw` | S | L |
| `src/scraper.js:979-985` + `src/runScrape.js:326-328` | `browser.close()` ohne Timeout — kann hängen. Fix: `Promise.race` 10s + `browser.process()?.kill('SIGKILL')` | S | L |

### Offene MEDIUM

- Memory-Profile: 4 Pool-Pages + 2 Stage-1-Pages = ~600 MB peak. RAM-Log am Pool-Init + Hard-Cap 6 statt 8 in Erwägung
- Storage-State-Write nicht atomic — corrupt-file bei mid-write-crash. Fix: temp + rename
- Weekly-Detail-State-File: corruption-handling — parse `Number.isFinite(Date.parse(v))` validieren
- CLI runs sequential (kein Detail-Scrape) — dokumentieren oder `--with-details` Flag
- Detail-Phase: kein Backoff bei Tocco-Timeouts (`waitForToccoLoad` MAX_WAIT). Fix: nach 5 consecutive timeouts 30s cooldown
- **Test-Coverage-Lücke: Pool + parallel-fetch komplett untestet** (fixtures für parseDwrIdMap + parsePruefungen)
- Scheduler Timer-Drift bei DST-Transition / system-suspend

### Offene LOW

- `ensureWarm` WeakSet — concurrent same-page race ist strukturell unmöglich (Pool garantiert Exklusivität) — Kommentar ergänzen
- `setPageSize` parallel DOM-Mutation — bestätigt safe (per-Page CDP)
- DWR-Listener attach-timing — bestätigt korrekt
- `state` mutation in `runScrapeCycle` — single-writer, kein Race
- `pruneVergangen` data-loss — bestätigt safe
- `parseDwrIdMap` robustness — sanity-warning ist sufficient
- Login-Flow MFA blind spot — Diagnose-Message bei MFA-Prompt-Stall
- `parsePruefungen` stop-markers — komplett für aktuelle Tocco-Version

---

## BE-4 — SSE / Logger / State

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/sse.js:27` | `KNOWN_LOG_LEVELS` advertiset `debug`, aber `logger.js:34` `LEVELS` hat es nicht → silently zu `info` coerced. Fix: `debug` aus `KNOWN_LOG_LEVELS` raus | S | L |
| `src/routes/events.js:26-33` | `sseClients.add(res)` läuft NACH `replaySince`-loop. Theoretisches Window für verlorene Events. Fix: `add` vor `replay` | S | L |
| `src/{sse,logger,state}.js` + `routes/{events,logs}.js` | **Keine Tests für 5 Module.** Ring-Buffer-Eviction, subscribe-unsubscribe, broadcastSse-Serialization-Once, setPhase-no-op-on-same-phase, replaySince-Boundary | M | L |

### Offene MEDIUM

- `broadcastSse` synchrone Writes ohne Backpressure-Check — bei flaky-mobile-client Memory-Growth möglich
- `cleanup()` in events.js nicht idempotent-guarded (3 Pfade können feuern)
- 21st-connect 503 ohne Zombie-Eviction
- `/api/logs?limit` unbounded (gleicher Finding wie BE-2)
- `/api/logs` kein server-side level-filter
- `setInterval(ping, 15s)` pro Client (20 Timers statt 1 shared)

### Offene LOW

- `setPhase` short-circuit auf null→null bestätigt
- `statusPayload` ruft `settings.load()` 7×/scrape (cached, OK)
- `statusPayload.lastError` kann Credentials enthalten falls scraper-error sie embedded
- Token-Query-String `/api/events` Mitigation in deployment-docs
- `getLogs` returnt buffer-slice ohne deep-copy (`Object.freeze` als Safety)
- Logger-Subscribe-Order vor SSE-wiring
- Reconnect-storm SSE 60/15min vs EventSource exp-backoff
- `state` mutation einzelner globaler Singleton ohne Object.freeze
- Memory bounded (~250 KB worst case) — OK

---

## BE-5 — Settings / Crypto / Validation

### Offene MEDIUM

- `secretCrypto.js:53-88` Master-Key-Bootstrap-Race: zwei Prozesse starten gleichzeitig auf fresh-volume → loser keypair überschreibt. Fix: `fs.openSync(KEY_FILE, 'wx')` oder re-read nach rename
- `secretCrypto.js:78-79` Master-Key-File Mode 0600 silent no-op auf Windows — README-Hinweis
- **`pushValidate.js` keine Tests** — SSRF-Whitelist ist security-critical, 30 LOC Tests
- `pushValidate.js:8,24-26` bare-equality `fcm.googleapis.com` vs suffix-pattern `.notify.windows.com` Inkonsistenz
- `settings.js:335-340` Empty/whitespace-only secrets nicht symmetrisch (`"   "` passt durch)
- `shared/apiError.js` Callers passen `e.message` direkt → kann Pfade/Hostnames leaken
- `settings.js:243-245` `Boolean("false") === true` Bug bei String-Boolean (Env-Path safe, JSON-Path fragil)
- `pushValidate.js:14` B64URL_RE erlaubt `+/=` (technisch B64, nicht B64URL)

### Offene LOW

- `shared/envLoader.js:20` keine Inline-Comment-Behandlung (`VAR=foo # comment`)
- `envLoader` kein Multi-Line / `${VAR}`-Interpolation — dokumentieren
- `escapeHtml` not idempotent + nicht safe für unquoted attribute context — rename oder docs
- `loadEnv` / `envToSettings` reload pro `computeMerged()`
- `subscribe` listener catches silent — log warn statt swallow
- `filterUiPatch` loggt nicht unknown keys (nur Credentials)
- `telegramAllowedUserId` Number.isFinite — Channel-IDs könnten 13+ digits werden
- `encryptSettings` over `Object.create(null)` — funktioniert, docs ergänzen
- DEFAULTS `telegramAllowedUserId` Konsistenz

---

## BE-6 — Bot (Telegram)

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/bot/telegram.js:20-23,32-35` + `bot/notify.js:13-20` | Race auf `state.lastMenuMessageId` zwischen `send()` (Menu) und `sendPush()` (Notify). Fix: Mutex/queue oder Per-Chat-State-Map | M | M |
| `src/bot/screens.js:556-562` + `bot/index.js:72-82` | `startScrapePoll` Timer-Leak: `bot.stop()` ruft `stopScrapePoll()` nicht auf | S | L |
| `src/bot/screens.js:567-618` | `setInterval(tick, 2500)` überlappt API-Calls. Fix: rekursives `setTimeout` | S | L |
| `src/bot/telegram.js:77-92` | `editMessage`-Fallback zu `send()` bei JEDEM Error — auch bei 429 (verschlimmert rate-limit). Fix: nur bei "message not found / can't be edited" fallback | S | L |
| `src/bot/handlers.js:30-129` | `handleMessage` kein äußerer try/catch → User sieht keinen Fehler-Feedback wenn Screen-Render wirft | S | L |
| `src/bot/screens.js:114` | `screenModulDetail` Regex `[\w\-./:]+` zu lasch — Punkt/Slash/Colon erlaubt. Fix: `[A-Za-z0-9_\-]+` | S | L |

### Offene MEDIUM

- Allowed-User-Check für neue Update-Typen (channel_post, business_message, my_chat_member) — Whitelist-Pattern in `handleUpdate`
- `sendStundenplanAlle` kein Throttle zwischen Messages (~50ms sleep)
- `purgeMultiMessages` parallel ohne `await` — Race mit Folge-Send
- `escapeHtml(e.message)` für Error-Messages kann lange Stack-Traces / Newlines durchlassen
- `truncate` byte-Budget vs. suffix vs. auto-close-tags — Worst-Case-Overflow möglich
- `state` ist einziger globaler Module-Singleton — Tests müssen require.cache clearen
- `state.lastMenuMessageId` / `multiMessageIds` werden bei `bot.stop() + bot.start(newToken)` nicht zurückgesetzt
- `start()` `setMyCommands` fire-and-forget mit `.catch(() => {})` — Errors invisible
- `notify*` checken `state.running` aber nicht `state.token` (theoretisch null-window)

### Offene LOW

- Test-Coverage-Lücken: `handleUpdate` whitelist-reject, unknown-callback, `pollLoop` backoff-paths, `notifyGradeChanges` mit Special-Chars
- `pollLoop` Backoff kein Jitter
- `state.offset` persistiert nicht — restart re-processed ~24h alte Updates
- `screens.js` 681 Zeilen — `scrapePoll.js` + `multiMessage.js` ausgliedern
- `screenModulDetail` 2 DB-Queries pro Klick (single-user OK)
- `multiMessageIds` nicht chatId-keyed (single-user OK)

---

## BE-7 — Web-Push

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/push.js:59-66` | VAPID-Generation Race auf Parallel-Boot (zwei Prozesse generieren unterschiedliche Keypairs). Fix: `fs.openSync(VAPID_FILE, 'wx')` + EEXIST-fallthrough | S | L |
| `src/routes/push.js:67-82` | `/api/push/test` triggert `sendToAll` — DoS-Amplifikation. Fix: eigener strikter Limiter (3/min) + nur an caller-endpoint | S | M |

### Offene MEDIUM

- `last_seen` wird nie auf successful send aktualisiert — dead subs nicht agable
- Push-Body kann visible-notification-truncation überschreiten (kein 80-char-Cap auf suffix)
- `addSubscription` re-validiert nicht endpoint-host gegen allowlist — Defense-in-depth fragil
- `init()` failure-state: `_initialized` bleibt false, kein lastInitError im `/api/push/status`
- **Keine Tests für `push.js` send-paths** — `web-push` mockable

### Offene LOW

- `urgency: 'high'` hardcoded auf jedem Push (auch Test + Summary)
- `TTL: 86400` fine but not configurable
- VAPID-subject fallback `mailto:admin@example.com` ist non-resolvable placeholder
- `errors[]` from `sendToAll` nicht in `/api/push/test` Response surface (nur count)
- `getAllPushSubscriptions` reads every row (OK at single-user-scale)
- Kein iOS-Safari-`userVisibleOnly`-Doc-Comment in `push.js`
- `Promise.allSettled` in `notifyGradeChanges` per-modul branch discardet `errors` silent

---

## BE-8 — Cross-cutting / Tests / Tooling

### Offene HIGH

| Wo | Was | Eff | Risk |
|---|---|---|---|
| `src/scheduler.js:49,83` | `computeNextRun` + `nextWeeklyDetailRun` 0 Tests. Reine Funktionen, ~60 LOC Test-Coverage | S | L |
| `src/runScrape.js` | 435 Zeilen, 0 Tests. Watchdog-Pfade, `maskSettings`, `logPushResult` alle pure-genug für Tests | M | L |
| `src/pushValidate.js` | SSRF-Whitelist 0 Tests — security-critical, ~40 LOC | S | L |
| `package.json:19` | `npm run lint` ist Bash-only (Windows-broken) UND macht nur `node --check`. ESLint-Config wäre echter Lint | M | L |

### Offene MEDIUM

- `.env.example` fehlt `SCRAPE_TIMEOUT_MS`, `LOG_FORMAT`, `MIN_TOKEN_LENGTH`-Note
- `package.json:18` kein `test:coverage`-Script (Node 22 hat `--experimental-test-coverage` nativ)
- 7 Tests machen `process.chdir(tmpDir)` ohne `t.after`-Cleanup — temp-Verzeichnisse leaken
- `CONTRIBUTING.md:24-36` beschreibt alte Single-File-Struktur (vor `src/db/`, `src/bot/` Split)
- `DOCKER.md:31,73` falsche Versionen + falscher `ALLOW_UI_CREDENTIALS=false`-Default (eigentlich `true`)
- Keine `.husky/` pre-commit hooks (sw.js-bump-Rule wäre prädestiniert)
- `scheduler.js:147` weekly-overdue ungetestet (sieht H1 oben)
- Magic-Numbers verstreut: `MANUAL_SCRAPE_COOLDOWN_MS`, SSE-Ping `15000`, Bot-Backoff `30000`
- `package.json:20` postinstall `cd web-svelte && npm install` ist Dead-weight für Server-only-Setups
- Deps mit Caret-Ranges — bei Express 5.x / Helmet 8.x breaking-change-Risiko
- `npm audit` läuft nur on-push, kein scheduled cron

### Offene LOW

- Tests `process.stdout.write = () => true` Pattern ohne shared helper
- `package.json:18` `test`-Script fehlt `--experimental-sqlite`
- `.gitignore` `dist/` doppelt eingetragen
- `bot-lifecycle.test.js:80` 30ms-Wall-Clock-Assertion grenzwertig flaky
- CI `Verify dist artefact` checkt nur `dist/index.html`, nicht `_app/immutable/`
- `silentLogger`-Helper extrahieren (DRY)
- `web-svelte` `tsconfig` strict aber CI ruft `svelte-check` nicht
- Kein CLI-Script für test-coverage-View

---

## Vorgehen

Mein Vorschlag für die nächsten 3 Iterationen:

**Iteration 1 — „Foundation-Coverage"** (1 PR, S+M Effort):
- 3 Test-Suites (scheduler / pushValidate / runScrape-pure)
- BE-4 HIGH: `debug`-Level Inkonsistenz + SSE-add-before-replay
- `.env.example` + DOCKER.md/CONTRIBUTING.md syncen

**Iteration 2 — „Resilience"** (1 PR, M Effort):
- Watchdog Browser-Kill-Path (BE-3 HIGH #1)
- Pool-Page Health-Tracking (BE-3 HIGH #2)
- Pool-creating-Race + browser.close-Timeout (BE-3 HIGH #3+4)
- Bot: editMessage-Fallback nur bei spezifischen Errors, startScrapePoll → setTimeout

**Iteration 3 — „Polish + Tooling"** (1 PR, S Effort):
- DB Prepared-Statements hoisten + Partial-Indizes für change_pending
- HTTP Body-Limits härten + /api/logs cap + /api/version Failure-TTL
- ESLint setup + husky sw.js-bump-hook + test:coverage Script

Defer-Liste danach: low-priority polish + size-dependent Optimierungen (Window-Functions, Multi-User-State-Refactor).
