<script lang="ts">
  /* Search inputs (number + name) + filter chips for /noten.
   * Two separate query bindings so the user can target either the module
   * number ("122") or the module name ("Abläufe...") on its own. The
   * `searchInputEl` ref points at the NAME input — that's the canonical
   * "main search" target the global '/' shortcut focuses.
   */
  interface Props {
    queryNumber: string;
    queryName: string;
    activeSemester: Set<'S1' | 'S2'>;
    activeNoteState: Set<'has' | 'none'>;
    searchInputEl: HTMLInputElement | null;
    onClear: () => void;
  }

  let {
    queryNumber = $bindable(),
    queryName = $bindable(),
    activeSemester = $bindable(),
    activeNoteState = $bindable(),
    searchInputEl = $bindable(),
    onClear,
  }: Props = $props();

  function toggleSemester(s: 'S1' | 'S2'): void {
    const next = new Set(activeSemester);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    activeSemester = next;
  }

  function toggleNoteState(k: 'has' | 'none'): void {
    const next = new Set(activeNoteState);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    activeNoteState = next;
  }

  function onNumberKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && queryNumber) {
      e.preventDefault();
      queryNumber = '';
    }
  }
  function onNameKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && queryName) {
      e.preventDefault();
      queryName = '';
    }
  }
</script>

<div class="toolbar">
  <!-- Module-number filter: short input, mono-spaced, dedicated. -->
  <div class="search search--number">
    <span class="search__lbl mono" aria-hidden="true">#</span>
    <input
      bind:value={queryNumber}
      onkeydown={onNumberKey}
      type="search"
      placeholder="Nr."
      aria-label="Nach Modulnummer filtern"
      inputmode="numeric"
      class="mono"
    />
  </div>

  <!-- Module-name filter: wide input, '/' shortcut target. -->
  <div class="search search--name">
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
    <input
      bind:this={searchInputEl}
      bind:value={queryName}
      onkeydown={onNameKey}
      type="search"
      placeholder="Modul suchen..."
      aria-label="Nach Modulname filtern"
      data-search
    />
    <span class="search__kbd" aria-hidden="true">/</span>
  </div>

  <div class="chips" role="group" aria-label="Filter">
    <button
      type="button"
      class="chip"
      class:is-active={activeSemester.has('S1')}
      aria-pressed={activeSemester.has('S1')}
      onclick={() => toggleSemester('S1')}
    >
      <span class="chip__dot" aria-hidden="true"></span>S1
    </button>
    <button
      type="button"
      class="chip"
      class:is-active={activeSemester.has('S2')}
      aria-pressed={activeSemester.has('S2')}
      onclick={() => toggleSemester('S2')}
    >
      <span class="chip__dot" aria-hidden="true"></span>S2
    </button>
    <button
      type="button"
      class="chip"
      class:is-active={activeNoteState.has('has')}
      aria-pressed={activeNoteState.has('has')}
      onclick={() => toggleNoteState('has')}
    >
      <span class="chip__dot" aria-hidden="true"></span>Mit Note
    </button>
    <button
      type="button"
      class="chip"
      class:is-active={activeNoteState.has('none')}
      aria-pressed={activeNoteState.has('none')}
      onclick={() => toggleNoteState('none')}
    >
      <span class="chip__dot" aria-hidden="true"></span>Ohne Note
    </button>
    {#if activeSemester.size + activeNoteState.size + (queryNumber ? 1 : 0) + (queryName ? 1 : 0) > 0}
      <button type="button" class="chip chip--clear" onclick={onClear}>
        Zurücksetzen
      </button>
    {/if}
  </div>
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-soft);
  }

  .search {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    color: var(--text-mute);
    transition:
      border-color var(--t-fast) var(--ease),
      background var(--t-fast) var(--ease);
  }
  /* Module-number filter: short, mono input. Glyph "#" leads as a label. */
  .search--number {
    min-width: 110px;
    flex: 0 0 auto;
  }
  .search--number .search__lbl {
    color: var(--text-dim);
    font-size: 13px;
    font-weight: 600;
  }
  /* Module-name filter: wide, fills remaining horizontal space. */
  .search--name {
    min-width: 220px;
    flex: 1;
    max-width: 380px;
  }
  .search:focus-within {
    border-color: var(--accent-border);
    background: var(--surface);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .search input {
    background: transparent;
    border: 0;
    outline: 0;
    color: var(--text);
    width: 100%;
    font-size: 13px;
  }
  /* Keyboard fallback: parent `.search:focus-within` paints the accent
   * ring, but if that style doesn't reach the user (high-contrast mode,
   * forced colors, plugins stripping box-shadow) the input still gets a
   * visible focus indicator. Pointer focus stays clean via :focus-visible. */
  .search input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .search input::placeholder { color: var(--text-dim); }
  /* Hide the native clear button — we handle Esc ourselves. */
  .search input::-webkit-search-cancel-button { display: none; }
  .search__kbd {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-dim);
    background: var(--surface-2);
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid var(--border-soft);
    letter-spacing: 0.04em;
  }

  /* ---------- Chips (multi-select, combinable) ---------- */
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 999px;
    background: var(--bg-elev);
    border: 1px solid var(--border);
    color: var(--text-mute);
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0.02em;
    transition:
      background var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      border-color var(--t-fast) var(--ease);
  }
  @media (hover: hover) and (pointer: fine) {
    .chip:hover {
      color: var(--text);
      border-color: var(--border-strong, #3a4152);
    }
  }
  /* Form-plus-color: filled dot when active, hollow ring when inactive. */
  .chip__dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid currentColor;
    opacity: 0.55;
    transition:
      background-color var(--t-fast) var(--ease),
      border-color var(--t-fast) var(--ease),
      opacity var(--t-fast) var(--ease);
  }
  .chip.is-active {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .chip.is-active .chip__dot {
    background: var(--accent);
    border-color: var(--accent);
    opacity: 1;
  }
  .chip--clear {
    background: transparent;
    border-color: var(--border-soft);
    color: var(--text-dim);
  }
  @media (hover: hover) and (pointer: fine) {
    .chip--clear:hover {
      color: var(--text);
      background: var(--surface-2);
    }
  }

  /* ---------- Touch-friendly tap targets ----------
   * Coarse pointers (touch screens) get a 44px minimum so chips clear the
   * iOS HIG / WCAG target-size threshold. Fine pointers keep the dense
   * 26px height which suits a desktop toolbar. */
  @media (pointer: coarse) {
    .chip { min-height: 44px; }
  }

  /* ---------- Reduced motion ---------- */
  @media (prefers-reduced-motion: reduce) {
    .chip { transition: none; }
    .search { transition: none; }
  }
</style>
