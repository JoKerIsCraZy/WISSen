<script lang="ts">
  /**
   * /settings — Section-style Settings.
   *
   * Sections: Anmeldung, Automatik, Telegram, Erweitert.
   * Save via Speichern-Button oder Cmd/Ctrl+Enter aus jedem Eingabefeld.
   * DB-Reset: 2-stage confirm (kein native confirm()).
   *
   * Auf Server-Seite filtert filterUiPatch() Credentials weg, wenn
   * ALLOW_UI_CREDENTIALS=false ist. URLs/port sind nicht patchable.
   */

  import { onMount } from 'svelte';
  import {
    getSettings,
    updateSettings,
    clearStundenplan
  } from '$lib/api/endpoints';
  import { pushToast } from '$lib/stores/toast.svelte';
  import type {
    SettingsView,
    SettingsPatch,
    ScheduleMode
  } from '$lib/api/types';

  let current = $state<SettingsView | null>(null);
  let patch = $state<SettingsPatch>({});
  let loading = $state(true);
  let saving = $state(false);

  // DB-Reset (2-stage confirm) — persistent until user confirms or explicitly
  // cancels. Auto-revert is hostile and SR-invisible, so we keep state until
  // the user makes a decision.
  let dbResetState = $state<'idle' | 'confirming' | 'busy'>('idle');

  // Mirror "live" form values; bind:value writes through a setter helper that
  // updates `patch` only when the value actually differs from `current`.
  let formMsEmail = $state('');
  let formMsPassword = $state('');
  let formUserPk = $state('');
  let formAutoRun = $state(false);
  let formManualScrapeFullDetails = $state(false);
  let formScheduleMode = $state<ScheduleMode>('interval');
  let formScheduleDays = $state<number[]>([]);
  let formIntervalMinutes = $state(60);
  let formIntervalTimeFrom = $state('08:00');
  let formIntervalTimeTo = $state('20:00');
  let formScheduleTimes = $state<string[]>([]);
  let formTelegramEnabled = $state(false);
  let formTelegramToken = $state('');
  let formTelegramAllowedUserId = $state('');
  let formBaseUrl = $state('');
  let formSlowMo = $state(0);
  let formPort = $state(0);
  let formHeadless = $state(true);

  // Telegram section open state — opened on first hydrate if enabled or token
  // is set; otherwise stays closed. User can toggle freely afterward.
  let telegramOpen = $state(false);

  // Tracks ob Settings-View urspruenglich UI-Credentials erlaubte.
  const allowUiCreds = $derived(current?.allowUiCredentials !== false);

  async function load(): Promise<void> {
    loading = true;
    try {
      const view = await getSettings();
      hydrate(view);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      pushToast('error', `Settings laden fehlgeschlagen: ${msg}`);
    } finally {
      loading = false;
    }
  }

  function hydrate(view: SettingsView): void {
    const isFirstLoad = current === null;
    current = view;
    patch = {};
    formMsEmail = view.msEmail ?? '';
    formMsPassword = '';
    formUserPk = view.userPk ?? '';
    formAutoRun = !!view.autoRun;
    formManualScrapeFullDetails = !!view.manualScrapeFullDetails;
    formScheduleMode = view.scheduleMode === 'weekly' ? 'weekly' : 'interval';
    formScheduleDays = Array.isArray(view.scheduleDays) ? [...view.scheduleDays] : [];
    formIntervalMinutes = view.intervalMinutes || 60;
    formIntervalTimeFrom = view.intervalTimeFrom || '08:00';
    formIntervalTimeTo = view.intervalTimeTo || '20:00';
    formScheduleTimes = Array.isArray(view.scheduleTimes) ? [...view.scheduleTimes] : [];
    formTelegramEnabled = !!view.telegramEnabled;
    formTelegramToken = '';
    formTelegramAllowedUserId =
      view.telegramAllowedUserId != null ? String(view.telegramAllowedUserId) : '';
    formBaseUrl = view.baseUrl ?? '';
    formSlowMo = view.slowMo ?? 0;
    formPort = view.port ?? 0;
    formHeadless = !!view.headless;
    // Open Telegram section only on initial load — never collapse/auto-open
    // again on subsequent saves so user's manual collapse stays sticky.
    if (isFirstLoad && (view.telegramEnabled || view.telegramTokenSet)) {
      telegramOpen = true;
    }
  }

  /** Build PATCH payload from form state vs current. Empty secrets dropped. */
  function buildPatch(): SettingsPatch {
    if (!current) return {};
    const p: SettingsPatch = {};

    // Always-patchable
    if (formAutoRun !== current.autoRun) p.autoRun = formAutoRun;
    if (formManualScrapeFullDetails !== current.manualScrapeFullDetails) {
      p.manualScrapeFullDetails = formManualScrapeFullDetails;
    }
    if (formScheduleMode !== current.scheduleMode) p.scheduleMode = formScheduleMode;
    if (!arraysEqualNum(formScheduleDays, current.scheduleDays)) {
      p.scheduleDays = [...formScheduleDays].sort((a, b) => a - b);
    }
    if (formIntervalMinutes !== current.intervalMinutes) {
      p.intervalMinutes = clampInterval(formIntervalMinutes);
    }
    if (formIntervalTimeFrom !== current.intervalTimeFrom) p.intervalTimeFrom = formIntervalTimeFrom;
    if (formIntervalTimeTo !== current.intervalTimeTo) p.intervalTimeTo = formIntervalTimeTo;
    if (!arraysEqualStr(formScheduleTimes, current.scheduleTimes)) {
      p.scheduleTimes = formScheduleTimes
        .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
        .map(padTime);
    }
    if (formTelegramEnabled !== current.telegramEnabled) p.telegramEnabled = formTelegramEnabled;
    const tgUid = formTelegramAllowedUserId.trim() === '' ? null : Number(formTelegramAllowedUserId);
    if (tgUid !== current.telegramAllowedUserId) p.telegramAllowedUserId = tgUid;
    if (formHeadless !== current.headless) p.headless = formHeadless;
    if (formSlowMo !== current.slowMo) p.slowMo = Number(formSlowMo) || 0;

    // Credential-only Felder
    if (allowUiCreds) {
      if (formMsEmail.trim() !== (current.msEmail ?? '')) p.msEmail = formMsEmail.trim();
      if (formUserPk.trim() !== (current.userPk ?? '')) p.userPk = formUserPk.trim();
      if (formMsPassword.length > 0) p.msPassword = formMsPassword;
      if (formTelegramToken.length > 0) p.telegramToken = formTelegramToken;
    }

    return p;
  }

  function clampInterval(n: number): number {
    if (!Number.isFinite(n)) return 60;
    return Math.min(1440, Math.max(5, Math.round(n)));
  }

  function padTime(t: string): string {
    const [hh, mm] = t.split(':');
    return hh.padStart(2, '0') + ':' + (mm || '00').padStart(2, '0');
  }

  function arraysEqualNum(a: number[], b: number[] | undefined): boolean {
    if (!b) return a.length === 0;
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y);
    const sb = [...b].sort((x, y) => x - y);
    return sa.every((v, i) => v === sb[i]);
  }

  function arraysEqualStr(a: string[], b: string[] | undefined): boolean {
    if (!b) return a.length === 0;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }

  async function save(): Promise<void> {
    if (saving || !current) return;
    const built = buildPatch();
    if (Object.keys(built).length === 0) {
      pushToast('info', 'Keine Aenderungen.');
      return;
    }
    saving = true;
    try {
      const res = await updateSettings(built);
      hydrate(res.settings);
      const msg = res.rescheduled ? '✓ Gespeichert · Automatik neu geplant' : '✓ Gespeichert';
      pushToast('success', msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
      pushToast('error', `Fehler: ${msg}`);
    } finally {
      saving = false;
    }
  }

  // Cmd/Ctrl+Enter speichert. Hot path on every keystroke — keep the early
  // exits cheapest-first (key + modifier) so non-shortcut keys cost ~nothing.
  function onWindowKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Enter') return;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (loading || !current) return;
    const target = e.target as Element | null;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      e.preventDefault();
      void save();
    }
  }

  // ----- Day chips -----
  const DAY_CHIPS: ReadonlyArray<{ value: number; label: string }> = [
    { value: 1, label: 'Mo' },
    { value: 2, label: 'Di' },
    { value: 3, label: 'Mi' },
    { value: 4, label: 'Do' },
    { value: 5, label: 'Fr' },
    { value: 6, label: 'Sa' },
    { value: 0, label: 'So' }
  ];

  /**
   * WAI-ARIA APG: switch role must respond to Space. Enter is wired by the
   * default button click, but Space scrolls the page on a generic button —
   * so we intercept it and toggle the bound state via the supplied setter.
   */
  function onToggleKeydown(e: KeyboardEvent, setter: () => void): void {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      setter();
    }
  }

  function toggleDay(d: number): void {
    if (formScheduleDays.includes(d)) {
      formScheduleDays = formScheduleDays.filter((x) => x !== d);
    } else {
      formScheduleDays = [...formScheduleDays, d];
    }
  }

  // ----- Schedule times -----
  function addScheduleTime(): void {
    formScheduleTimes = [...formScheduleTimes, '08:00'];
  }
  function removeScheduleTime(idx: number): void {
    formScheduleTimes = formScheduleTimes.filter((_, i) => i !== idx);
  }
  function updateScheduleTime(idx: number, value: string): void {
    formScheduleTimes = formScheduleTimes.map((t, i) => (i === idx ? value : t));
  }

  // ----- Interval label -----
  // Recomputes only when formIntervalMinutes changes (slider drag); pure fn,
  // tiny allocation — kept inline.
  const intervalLabel = $derived(
    formIntervalMinutes < 60
      ? `alle ${formIntervalMinutes} min`
      : Number.isInteger(formIntervalMinutes / 60)
        ? `alle ${formIntervalMinutes / 60} h`
        : `alle ${(formIntervalMinutes / 60).toFixed(2)} h`
  );

  // ----- DB Reset (2-stage confirm) -----
  // No auto-revert: confirming state persists until the user either confirms
  // or explicitly cancels via the paired Abbrechen button.
  async function onDbReset(): Promise<void> {
    if (dbResetState === 'busy') return;
    if (dbResetState === 'idle') {
      dbResetState = 'confirming';
      return;
    }
    if (dbResetState === 'confirming') {
      dbResetState = 'busy';
      try {
        const res = await clearStundenplan();
        const n = typeof res.deleted === 'number' ? res.deleted : 0;
        pushToast(
          'success',
          `✓ Stundenplan zurueckgesetzt · ${n} Eintrag${n === 1 ? '' : 'e'} geloescht`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Unbekannter Fehler';
        pushToast('error', `Fehler: ${msg}`);
      } finally {
        dbResetState = 'idle';
      }
    }
  }

  function cancelDbReset(): void {
    if (dbResetState === 'confirming') dbResetState = 'idle';
  }

  // ----- Mount -----
  onMount(() => {
    void load();
  });
</script>

<svelte:head>
  <title>Einstellungen · WISSen</title>
</svelte:head>

<svelte:window onkeydown={onWindowKeydown} />

<div class="route__head">
  <h1 class="route__title">Einstellungen</h1>
  <span class="route__subtitle mono">⌘+Enter zum Speichern</span>
</div>

{#if loading}
  <div class="loading mono">laedt...</div>
{:else if current}
  <!-- ============ Anmeldung ============ -->
  <section class="sec">
    <header class="sec__head">
      <h2 class="sec__title">Anmeldung</h2>
      <span class="sec__hint">Microsoft-Konto, mit dem Tocco geoeffnet wird.</span>
    </header>

    <div class="rows">
      <div class="row">
        <label for="msEmail">MS-Email</label>
        <input
          id="msEmail"
          type="email"
          autocomplete="off"
          placeholder="name@schule.ch"
          bind:value={formMsEmail}
          disabled={!allowUiCreds}
        />
        {#if !allowUiCreds}
          <p class="hint">Wert nur via .env aenderbar.</p>
        {/if}
      </div>

      <div class="row">
        <label for="msPassword">MS-Passwort</label>
        <input
          id="msPassword"
          type="password"
          autocomplete="new-password"
          placeholder={current.passwordSet ? '••• (gesetzt, unveraendert)' : 'Passwort setzen'}
          bind:value={formMsPassword}
          disabled={!allowUiCreds}
        />
        <p class="hint">Wird nie zurueckgegeben, nur einmal speichern.</p>
      </div>

      <div class="row">
        <label for="userPk">Tocco User-PK</label>
        <input
          id="userPk"
          type="text"
          autocomplete="off"
          placeholder="z.B. 48391"
          bind:value={formUserPk}
          disabled={!allowUiCreds}
        />
        <p class="hint">
          Primaerschluessel deines Tocco-Benutzers. Steht in der URL nach dem Login als ?key=... (Network-Tab).
        </p>
      </div>
    </div>
  </section>

  <!-- ============ Automatik ============ -->
  <section class="sec">
    <header class="sec__head">
      <h2 class="sec__title">Automatik</h2>
      <span class="sec__hint">Auto-Run pollt nach Plan, sonst nur manuell.</span>
    </header>

    <div class="rows">
      <div class="row row--inline">
        <div class="row__main">
          <label for="autoRun">Auto-Run aktivieren</label>
          <p class="hint">Startet Scrape nach Zeitplan.</p>
        </div>
        <button
          type="button"
          class="toggle"
          role="switch"
          aria-checked={formAutoRun}
          aria-label="Auto-Run aktivieren"
          onclick={() => (formAutoRun = !formAutoRun)}
          onkeydown={(e) => onToggleKeydown(e, () => (formAutoRun = !formAutoRun))}
          id="autoRun"
        >
          <span class="toggle__track" class:toggle__track--on={formAutoRun}>
            <span class="toggle__thumb" class:toggle__thumb--on={formAutoRun}></span>
          </span>
        </button>
      </div>

      <div class="row row--inline">
        <div class="row__main">
          <label for="manualScrapeFullDetails">Manuell: alle Moduldetails</label>
          <p class="hint">
            Manueller Scrape zieht die Details aller Module neu, statt nur
            geaenderter. Auto-Run bleibt unveraendert.
          </p>
        </div>
        <button
          type="button"
          class="toggle"
          role="switch"
          aria-checked={formManualScrapeFullDetails}
          aria-label="Manueller Scrape: alle Moduldetails mitscrapen"
          onclick={() => (formManualScrapeFullDetails = !formManualScrapeFullDetails)}
          onkeydown={(e) =>
            onToggleKeydown(e, () => (formManualScrapeFullDetails = !formManualScrapeFullDetails))}
          id="manualScrapeFullDetails"
        >
          <span
            class="toggle__track"
            class:toggle__track--on={formManualScrapeFullDetails}
          >
            <span
              class="toggle__thumb"
              class:toggle__thumb--on={formManualScrapeFullDetails}
            ></span>
          </span>
        </button>
      </div>

      <div class="row">
        <fieldset class="row__fieldset">
          <legend class="row__label">Modus</legend>
          <div class="mode-switch" role="radiogroup" aria-label="Scheduler-Modus">
            <label class="mode-opt">
              <input
                type="radio"
                name="scheduleMode"
                value="interval"
                checked={formScheduleMode === 'interval'}
                onchange={() => (formScheduleMode = 'interval')}
              />
              <span>Intervall</span>
            </label>
            <label class="mode-opt">
              <input
                type="radio"
                name="scheduleMode"
                value="weekly"
                checked={formScheduleMode === 'weekly'}
                onchange={() => (formScheduleMode = 'weekly')}
              />
              <span>Wochenplan</span>
            </label>
          </div>
        </fieldset>
      </div>

      <!-- Wochentage gelten in BEIDEN Modi (siehe src/settings.js: "beide
           Modi: 0=So .. 6=Sa"). Im Intervall-Modus engt das die Tage ein,
           an denen der Auto-Run überhaupt feuert; im Wochenplan-Modus
           definiert es zusammen mit den Uhrzeiten das Schedule-Grid. -->
      <div class="row">
        <fieldset class="row__fieldset">
          <legend class="row__label">Wochentage</legend>
          <div class="day-chips" role="group" aria-label="Wochentage">
            {#each DAY_CHIPS as chip (chip.value)}
              <button
                type="button"
                class="day-chip"
                class:day-chip--on={formScheduleDays.includes(chip.value)}
                aria-pressed={formScheduleDays.includes(chip.value)}
                onclick={() => toggleDay(chip.value)}
              >
                {chip.label}
              </button>
            {/each}
          </div>
        </fieldset>
      </div>

      {#if formScheduleMode === 'interval'}
        <div class="row">
          <label for="intervalMinutes">Intervall</label>
          <div class="slider-wrap">
            <input
              id="intervalMinutes"
              type="range"
              min="5"
              max="1440"
              step="5"
              bind:value={formIntervalMinutes}
            />
            <span class="slider-label mono">{intervalLabel}</span>
          </div>
        </div>

        <div class="row">
          <span class="row__label">Zeitfenster</span>
          <div class="time-pair">
            <input type="time" bind:value={formIntervalTimeFrom} aria-label="von" />
            <span class="time-pair__sep mono">bis</span>
            <input type="time" bind:value={formIntervalTimeTo} aria-label="bis" />
          </div>
          <p class="hint">Ausserhalb pausiert Auto-Run.</p>
        </div>
      {:else}
        <div class="row">
          <span class="row__label">Uhrzeiten</span>
          <div class="time-list">
            {#each formScheduleTimes as t, i (i)}
              <div class="time-row">
                <input
                  type="time"
                  value={t}
                  oninput={(e) => updateScheduleTime(i, (e.currentTarget as HTMLInputElement).value)}
                  aria-label="Uhrzeit {i + 1}"
                />
                <button
                  type="button"
                  class="time-remove"
                  aria-label="Uhrzeit entfernen"
                  onclick={() => removeScheduleTime(i)}
                >
                  ×
                </button>
              </div>
            {/each}
            <button type="button" class="time-add" onclick={addScheduleTime}>
              + Uhrzeit hinzufuegen
            </button>
          </div>
        </div>
      {/if}
    </div>
  </section>

  <!-- ============ Telegram ============ -->
  <section class="sec">
    <button
      type="button"
      class="sec__head sec__head--clickable sec__head--btn"
      aria-expanded={telegramOpen}
      aria-controls="telegram-section"
      onclick={() => (telegramOpen = !telegramOpen)}
    >
      <h2 class="sec__title">
        <svg
          class="sec__chevron"
          class:sec__chevron--open={telegramOpen}
          viewBox="0 0 24 24"
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
        Telegram
      </h2>
      <span class="sec__hint">
        {current.telegramTokenSet ? 'Token gesetzt' : 'Optional'}
        {current.telegramEnabled ? ' · aktiv' : ''}
      </span>
    </button>

    {#if telegramOpen}
      <div id="telegram-section" class="rows">
        <div class="row row--inline">
          <div class="row__main">
            <label for="tgEnabled">Bot aktivieren</label>
            <p class="hint">Erwartet Token + erlaubte User-ID.</p>
          </div>
          <button
            type="button"
            class="toggle"
            role="switch"
            aria-checked={formTelegramEnabled}
            aria-label="Telegram-Bot aktivieren"
            onclick={() => (formTelegramEnabled = !formTelegramEnabled)}
            onkeydown={(e) => onToggleKeydown(e, () => (formTelegramEnabled = !formTelegramEnabled))}
            id="tgEnabled"
          >
            <span class="toggle__track" class:toggle__track--on={formTelegramEnabled}>
              <span class="toggle__thumb" class:toggle__thumb--on={formTelegramEnabled}></span>
            </span>
          </button>
        </div>

        <div class="row">
          <label for="tgToken">Bot-Token</label>
          <input
            id="tgToken"
            type="password"
            autocomplete="off"
            placeholder={current.telegramTokenSet ? '••• (gesetzt, unveraendert)' : '123456:ABC-DEF...'}
            bind:value={formTelegramToken}
            disabled={!allowUiCreds}
          />
          <p class="hint">
            1. Bei @BotFather → /newbot → Anweisungen folgen.
            2. Token kopieren.
            3. Hier einfuegen.
          </p>
        </div>

        <div class="row">
          <label for="tgUid">Erlaubte User-ID</label>
          <input
            id="tgUid"
            type="number"
            min="1"
            placeholder="123456789"
            bind:value={formTelegramAllowedUserId}
          />
          <p class="hint">Eigene User-ID via @userinfobot herausfinden.</p>
        </div>
      </div>
    {/if}
  </section>

  <!-- ============ Erweitert ============ -->
  <section class="sec">
    <details class="adv">
      <summary>
        <h2 class="sec__title">Erweitert</h2>
        <span class="sec__hint">Browser- und Server-Internas.</span>
      </summary>

      <div class="rows" style="margin-top:14px">
        <div class="row">
          <label for="baseUrl">Base-URL</label>
          <input id="baseUrl" type="url" value={formBaseUrl} disabled />
          <p class="hint">URLs sind via .env festgelegt.</p>
        </div>

        <div class="row">
          <label for="slowMo">slowMo (ms)</label>
          <input id="slowMo" type="number" min="0" max="2000" step="50" bind:value={formSlowMo} />
          <p class="hint">Verzoegerung pro Browser-Aktion. 0 = aus.</p>
        </div>

        <div class="row">
          <label for="port">Port</label>
          <input id="port" type="number" value={formPort} disabled />
          <p class="hint">Server-Port wird via .env gesetzt.</p>
        </div>

        <div class="row row--inline">
          <div class="row__main">
            <label for="headless">Headless</label>
            <p class="hint">Browser ohne sichtbares Fenster starten.</p>
          </div>
          <button
            type="button"
            class="toggle"
            role="switch"
            aria-checked={formHeadless}
            aria-label="Headless-Modus"
            onclick={() => (formHeadless = !formHeadless)}
            onkeydown={(e) => onToggleKeydown(e, () => (formHeadless = !formHeadless))}
            id="headless"
          >
            <span class="toggle__track" class:toggle__track--on={formHeadless}>
              <span class="toggle__thumb" class:toggle__thumb--on={formHeadless}></span>
            </span>
          </button>
        </div>
      </div>
    </details>
  </section>

  <!-- ============ Danger zone ============ -->
  <section class="sec sec--danger">
    <header class="sec__head">
      <h2 class="sec__title">Datenbank</h2>
      <span class="sec__hint">Stundenplan kann beim naechsten Scrape neu geladen werden.</span>
    </header>

    <div class="rows">
      <div class="row">
        <div class="db-reset" aria-live="polite">
          <button
            type="button"
            class="btn-danger"
            class:btn-danger--confirming={dbResetState === 'confirming'}
            disabled={dbResetState === 'busy'}
            onclick={() => void onDbReset()}
          >
            {#if dbResetState === 'idle'}
              DB Stundenplan zuruecksetzen
            {:else if dbResetState === 'confirming'}
              Wirklich? Klick erneut zum Bestaetigen
            {:else}
              Loesche...
            {/if}
          </button>
          {#if dbResetState === 'confirming'}
            <button
              type="button"
              class="btn-cancel"
              onclick={cancelDbReset}
            >
              Abbrechen
            </button>
          {/if}
        </div>
      </div>
    </div>
  </section>

  <!-- ============ Save bar ============ -->
  <div class="save-bar" aria-live="polite">
    <span class="save-bar__hint mono">⌘+Enter zum Speichern</span>
    <button
      type="button"
      class="btn-save"
      disabled={saving || loading}
      aria-busy={saving}
      onclick={() => void save()}
    >
      {saving ? 'Speichere...' : 'Speichern'}
    </button>
  </div>
{/if}

<style>
  .route__head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 22px; }
  .route__title { font-size: 22px; font-weight: 700; margin: 0; color: var(--text); letter-spacing: -0.01em; }
  .route__subtitle { color: var(--text-mute); font-size: 12px; }
  .loading { color: var(--text-dim); font-size: 13px; padding: 24px 0; }

  /* ===== Section list (NOT card-grid) ===== */
  .sec { padding: 0 0 24px 0; border-bottom: 1px solid var(--border); margin-bottom: 24px; }
  .sec:last-of-type { border-bottom: none; }
  .sec__head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 16px; }
  .sec__head--clickable { cursor: pointer; user-select: none; border-radius: var(--r-sm); padding: 4px 0; }
  .sec__head--clickable:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* When the head is rendered as a <button> for a11y (collapse triggers), kill
   * the default button chrome and stretch to full row width so click target
   * matches the visual header. */
  .sec__head--btn {
    appearance: none;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    width: 100%;
  }
  .sec__title {
    margin: 0; font-size: 12px; font-weight: 600;
    letter-spacing: 0.10em; text-transform: uppercase; color: var(--text-mute);
    display: inline-flex; align-items: baseline; gap: 8px;
  }
  .sec__chevron {
    color: var(--text-dim);
    flex-shrink: 0;
    transition: transform var(--t-fast) var(--ease);
  }
  .sec__chevron--open { transform: rotate(90deg); }
  .sec__hint { font-size: 12px; color: var(--text-dim); }

  /* ===== Rows ===== */
  .rows { display: flex; flex-direction: column; gap: 14px; }
  .row { display: flex; flex-direction: column; gap: 6px; }
  .row label,
  .row__label { font-size: 12px; color: var(--text-mute); font-weight: 500; }
  .row--inline { flex-direction: row; align-items: center; justify-content: space-between; gap: 14px; }
  .row__main { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
  .row__main label { font-size: 13px; color: var(--text); font-weight: 500; }

  /* Fieldset reset for grouped controls (Modus radios, Wochentage chips).
   * Native fieldset adds a border, padding, and a min-width: min-content rule
   * that breaks flex shrink — strip them all and let row layout drive sizing. */
  .row__fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  @media (max-width: 480px) {
    .row--inline { flex-direction: column; align-items: flex-start; }
  }

  /* ===== Inputs ===== */
  .row input[type='text'],
  .row input[type='email'],
  .row input[type='password'],
  .row input[type='url'],
  .row input[type='number'],
  .row input[type='time'] {
    background: var(--surface-2); border: 1px solid var(--border-soft);
    border-radius: var(--r-md); padding: 9px 12px; color: var(--text);
    font-size: 13px; width: 100%; color-scheme: dark;
    transition: border-color var(--t-fast) var(--ease), background var(--t-fast) var(--ease);
  }
  .row input:focus {
    outline: 0; border-color: var(--accent-border); background: var(--surface);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .row input:disabled { opacity: 0.6; cursor: not-allowed; }
  .hint { color: var(--text-dim); font-size: 12px; margin: 2px 0 0 0; line-height: 1.5; }

  /* ===== Toggle ===== */
  .toggle { display: inline-flex; align-items: center; background: none; border: none; padding: 4px; cursor: pointer; flex-shrink: 0; border-radius: 999px; }
  .toggle:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 999px;
  }
  .toggle__track {
    width: 36px; height: 20px; background: var(--surface-3);
    border: 1px solid var(--border); border-radius: 999px; position: relative;
    transition: background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  .toggle__track--on { background: var(--accent-soft); border-color: var(--accent-border); }
  .toggle__thumb {
    position: absolute; top: 1px; left: 1px; width: 16px; height: 16px;
    background: transparent; border: 1.5px solid var(--text-mute); border-radius: 50%;
    transition: transform var(--t-fast) var(--ease), background var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  .toggle__thumb--on { background: var(--accent); border-color: var(--accent); transform: translateX(16px); }

  /* ===== Mode switch ===== */
  .mode-switch {
    display: inline-flex; background: var(--surface-2);
    border: 1px solid var(--border-soft); border-radius: var(--r-md);
    padding: 3px; align-self: flex-start;
  }
  .mode-opt { position: relative; cursor: pointer; user-select: none; }
  .mode-opt input[type='radio'] { position: absolute; opacity: 0; pointer-events: none; }
  .mode-opt span {
    display: inline-block; padding: 5px 12px; border-radius: 6px;
    font-size: 13px; color: var(--text-mute);
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
  }
  .mode-opt input:checked + span { background: var(--accent); color: var(--accent-ink); font-weight: 600; }
  .mode-opt input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* ===== Slider ===== */
  .slider-wrap { display: flex; align-items: center; gap: 14px; }
  .slider-wrap input[type='range'] { flex: 1; accent-color: var(--accent); }
  .slider-label { font-size: 12px; color: var(--text); font-weight: 600; min-width: 96px; text-align: right; }

  /* ===== Time pair / chips / list ===== */
  .time-pair { display: flex; gap: 8px; align-items: center; }
  .time-pair input { flex: 1; }
  .time-pair__sep { color: var(--text-dim); font-size: 12px; }
  .day-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .day-chip {
    background: var(--surface-2); color: var(--text-mute);
    border: 1px solid var(--border-soft); padding: 5px 11px;
    border-radius: var(--r-md); font-size: 13px; cursor: pointer;
    font-family: var(--font-mono); letter-spacing: 0.02em;
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .day-chip:hover { background: var(--surface-3); }
  }
  .day-chip--on { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); font-weight: 600; }
  .time-list { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .time-row { display: flex; gap: 8px; align-items: center; }
  .time-row input { width: 110px; }
  .time-remove {
    background: var(--surface-2); color: var(--text-mute);
    border: 1px solid var(--border-soft); width: 28px; height: 28px;
    border-radius: var(--r-sm); font-size: 14px; line-height: 1; cursor: pointer;
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .time-remove:hover { background: var(--surface-3); color: var(--danger); }
  }
  .time-add {
    background: transparent; color: var(--text-mute);
    border: 1px dashed var(--border); border-radius: var(--r-sm);
    padding: 6px 12px; font-size: 12px; cursor: pointer;
    transition: color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .time-add:hover { color: var(--accent); border-color: var(--accent-border); }
  }

  /* ===== Erweitert (details) ===== */
  .adv { padding: 0; }
  .adv summary {
    cursor: pointer; user-select: none; list-style: none;
    display: flex; align-items: baseline; gap: 12px; padding: 0;
  }
  .adv summary::-webkit-details-marker { display: none; }
  .adv summary::before { content: '▸ '; color: var(--text-dim); font-size: 12px; }
  .adv[open] summary::before { content: '▾ '; }

  /* ===== Danger ===== */
  .sec--danger { border-bottom: none; }
  .db-reset { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .btn-danger {
    background: var(--surface-2); color: var(--danger);
    border: 1px solid var(--border); border-radius: var(--r-md);
    padding: 8px 14px; font-size: 13px; font-weight: 600;
    cursor: pointer; align-self: flex-start;
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .btn-danger:hover { background: var(--surface-3); }
  }
  .btn-danger--confirming { background: var(--danger); color: var(--accent-ink); border-color: var(--danger); }
  .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
  .btn-cancel {
    background: transparent; color: var(--text-mute);
    border: 1px solid var(--border-soft); border-radius: var(--r-md);
    padding: 8px 14px; font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: background var(--t-fast) var(--ease), color var(--t-fast) var(--ease), border-color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .btn-cancel:hover { background: var(--surface-3); color: var(--text); border-color: var(--border-strong); }
  }

  /* ===== Save bar =====
   * Sticky to the viewport bottom so the Speichern action stays in reach on
   * long forms. z-index stays low (10) so app-level Topbar/overlays win. */
  .save-bar {
    display: flex; align-items: center; justify-content: flex-end;
    gap: 14px; padding: 14px 0;
    border-top: 1px solid var(--border); margin-top: 8px;
    position: sticky; bottom: 0; z-index: 10;
    background: var(--surface);
  }
  .save-bar__hint { margin-right: auto; font-size: 12px; color: var(--text-dim); letter-spacing: 0.04em; }
  .btn-save {
    background: var(--accent); color: var(--accent-ink); border: none;
    border-radius: var(--r-md); padding: 9px 18px; font-size: 13px;
    font-weight: 600; letter-spacing: 0.02em; cursor: pointer;
    transition: transform var(--t-fast) var(--ease), opacity var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .btn-save:hover:not(:disabled) { transform: translateY(-1px); }
  }
  .btn-save:active:not(:disabled) { transform: scale(0.97); }
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

  @media (prefers-reduced-motion: reduce) {
    .toggle__track, .toggle__thumb, .mode-opt span, .day-chip,
    .btn-danger, .btn-cancel, .btn-save, .row input, .time-add, .time-remove,
    .sec__chevron {
      transition: none;
    }
    .btn-save:hover:not(:disabled),
    .btn-save:active:not(:disabled) { transform: none; }
  }
</style>
