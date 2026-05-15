<script lang="ts">
  /* FloorPlan — Svelte port of RaumView.create() from web/floorplans/raumview.js.
   *
   * Two modes:
   *   - 'inline' (default): full plan with caption pill underneath.
   *   - 'strip':   200px ambient horizontal strip (prototype dashboard-v2 pattern).
   *
   * Behaviour parity:
   *   - normalizeRoom + roomToFloor + findHotspot match the legacy JS exactly.
   *   - Render order mirrors raumview.js (utilities → classrooms → active on top).
   *   - data-mounted flips after a double rAF so the dot scale-in animation has
   *     a starting state. Reduced-motion drops the pulse + transition.
   */
  import { FLOORPLAN_DATA, type Hotspot } from './data';
  import {
    FLOOR_LABELS,
    FLOOR_ALT,
    isOnlineRoom,
    isUtility,
    normalizeRoom,
    orderHotspots,
    roomToFloor,
    type FloorKey,
    type HotspotRect
  } from './helpers';

  interface Props {
    raum: string | null | undefined;
    mode?: 'inline' | 'strip';
    showLabel?: boolean;
  }

  let {
    raum,
    mode = 'inline',
    showLabel
  }: Props = $props();

  /* showLabel default: inline shows caption, strip hides (caption baked into card). */
  const effectiveShowLabel = $derived(
    showLabel === undefined ? mode === 'inline' : showLabel
  );

  const floor = $derived<FloorKey | null>(roomToFloor(raum));
  const normalized = $derived(normalizeRoom(raum));
  const floorEntry = $derived(floor ? FLOORPLAN_DATA[floor] : null);

  const hotspots = $derived<Hotspot[]>(floorEntry ? floorEntry.hotspots : []);
  const ordered = $derived(orderHotspots(hotspots, normalized));

  const activeHotspot = $derived<HotspotRect | null>(
    floor && floorEntry && normalized
      ? (() => {
          for (const h of hotspots) {
            if (h.room === normalized) {
              return { left: h.left, top: h.top, width: h.width, height: h.height };
            }
          }
          return null;
        })()
      : null
  );

  const dotLeft = $derived(
    activeHotspot ? activeHotspot.left + activeHotspot.width / 2 : 0
  );
  const dotTop = $derived(
    activeHotspot ? activeHotspot.top + activeHotspot.height / 2 : 0
  );

  const stageAspect = $derived(floorEntry ? floorEntry.aspectRatio.replace('/', ' / ') : '');
  const stageAriaLabel = $derived(
    floor && normalized ? `${FLOOR_ALT[floor]} — Raum ${normalized}` : ''
  );

  /* True only when both floor + a real hotspot resolve. */
  const showFloor = $derived(floor !== null && floorEntry !== null);
  const showDot = $derived(showFloor && activeHotspot !== null);

  /* Empty-state copy: distinguish online lessons from unparseable rooms. */
  const emptyMsg = $derived(
    isOnlineRoom(raum)
      ? 'Online-Lektion'
      : !raum
        ? 'Aktuell keine Lektion'
        : 'Aktuell keine Lektion'
  );

  /* Caption when floor resolved but hotspot did not (e.g. data drift). */
  const missingHotspotMsg = $derived(
    showFloor && !activeHotspot && normalized ? `${normalized} nicht verfügbar` : ''
  );

  /* Double rAF trick so the dot transitions in from its starting state. */
  let mounted = $state(false);
  $effect(() => {
    let id1: number | null = null;
    let id2: number | null = null;
    id1 = requestAnimationFrame(() => {
      id1 = null;
      id2 = requestAnimationFrame(() => {
        id2 = null;
        mounted = true;
      });
    });
    return () => {
      if (id1 !== null) cancelAnimationFrame(id1);
      if (id2 !== null) cancelAnimationFrame(id2);
    };
  });

</script>

<div
  class="floorplan"
  class:floorplan--empty={!showFloor}
  data-mode={mode}
  data-floor={floor ?? undefined}
  data-mounted={mounted ? 'true' : 'false'}
>
  {#if showFloor && floorEntry}
    <div
      class="floorplan__stage"
      style:aspect-ratio={mode === 'inline' ? stageAspect : undefined}
      role="img"
      aria-label={stageAriaLabel}
    >
      {#each ordered as h (h.room)}
        <div
          class="floorplan__room"
          class:floorplan__room--utility={isUtility(h.room)}
          class:floorplan__room--active={h.room === normalized}
          style:left="{h.left}%"
          style:top="{h.top}%"
          style:width="{h.width}%"
          style:height="{h.height}%"
        >
          <span class="floorplan__room-label">{h.room}</span>
        </div>
      {/each}

      {#if showDot}
        <div
          class="floorplan__dot"
          style:left="{dotLeft}%"
          style:top="{dotTop}%"
          aria-hidden="true"
        >
          <span class="floorplan__dot-pulse" aria-hidden="true"></span>
          <span class="floorplan__dot-core" aria-hidden="true"></span>
        </div>
      {/if}
    </div>

    {#if effectiveShowLabel}
      <div class="floorplan__caption">
        <span class="floorplan__floor-tag">{floor ? FLOOR_LABELS[floor] : ''}</span>
        {#if activeHotspot}
          <span class="floorplan__room-name">{normalized}</span>
        {:else if missingHotspotMsg}
          <span class="floorplan__room-name floorplan__room-name--missing">{missingHotspotMsg}</span>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="floorplan__empty-msg">{emptyMsg}</div>
  {/if}
</div>

<style>
  /* FloorPlan — shared floorplan view (desktop + mobile, inline + strip).
   * Dark navy aesthetic matching the dashboard.
   * Both floors stay in the blue family; og2 leans slightly warmer (hue 245),
   * og4 slightly cooler (hue 258), so identification reads before any label.
   * Active room rides on the brand accent and glows. */


  .floorplan {
    --rv-accent: oklch(72% 0.13 250);
    --rv-accent-soft: oklch(72% 0.13 250 / 0.16);
    --rv-accent-glow: oklch(72% 0.13 250 / 0.42);

    --rv-bg: oklch(18% 0.012 252);
    --rv-bg-2: oklch(22% 0.015 252);
    --rv-edge: oklch(36% 0.022 250);

    --rv-room: oklch(28% 0.018 252);
    --rv-room-line: oklch(48% 0.045 250);
    --rv-utility-stripe: oklch(48% 0.045 250 / 0.22);

    --rv-ink: oklch(92% 0.012 250);
    --rv-ink-mute: oklch(66% 0.02 250);

    --rv-shadow: 0 10px 28px oklch(0% 0 0 / 0.45);
    --rv-radius: 14px;

    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: var(--rv-ink);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }

  /* Subtle hue split per floor — same dark blue family, distinguishable. */
  .floorplan[data-floor='og2'] {
    --rv-bg: oklch(18% 0.014 245);
    --rv-bg-2: oklch(22% 0.018 245);
    --rv-edge: oklch(36% 0.026 245);
    --rv-room: oklch(28% 0.022 245);
    --rv-room-line: oklch(48% 0.052 245);
    --rv-utility-stripe: oklch(48% 0.052 245 / 0.24);
  }

  .floorplan[data-floor='og4'] {
    --rv-bg: oklch(18% 0.012 258);
    --rv-bg-2: oklch(22% 0.017 258);
    --rv-edge: oklch(36% 0.024 258);
    --rv-room: oklch(28% 0.02 258);
    --rv-room-line: oklch(48% 0.048 258);
    --rv-utility-stripe: oklch(48% 0.048 258 / 0.24);
  }

  .floorplan__stage {
    position: relative;
    width: 100%;
    border-radius: var(--rv-radius);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 50% 0%,
        oklch(100% 0 0 / 0.04) 0.5px,
        transparent 1.2px
      ) 0 0 / 22px 22px,
      linear-gradient(180deg, var(--rv-bg) 0%, var(--rv-bg-2) 100%);
    box-shadow:
      inset 0 0 0 1px var(--rv-edge),
      inset 0 0 80px oklch(0% 0 0 / 0.35),
      var(--rv-shadow);
  }

  /* Strip mode: ambient 200px-tall horizontal band, no fixed aspect ratio.
   * Stage stretches to fill and clips overflow; rooms stay percentage-positioned. */
  .floorplan[data-mode='strip'] {
    gap: 0;
  }
  .floorplan[data-mode='strip'] .floorplan__stage {
    height: 200px;
    width: 100%;
    aspect-ratio: auto;
  }

  .floorplan__room {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--rv-room);
    border: 1px solid var(--rv-room-line);
    color: var(--rv-ink);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 3px;
    overflow: hidden;
    user-select: none;
    box-shadow:
      0 1px 0 oklch(0% 0 0 / 0.35),
      inset 0 1px 0 oklch(100% 0 0 / 0.05);
    transition:
      background 220ms cubic-bezier(0.23, 1, 0.32, 1),
      border-color 220ms cubic-bezier(0.23, 1, 0.32, 1),
      box-shadow 220ms cubic-bezier(0.23, 1, 0.32, 1);
  }

  .floorplan__room-label {
    padding: 0 4px;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    max-width: 100%;
    pointer-events: none;
  }

  /* Utility rooms (Treppenhaus, Toilette, Aufenthalt, Terrasse, etc.):
   * 45° hatch + dashed border — architectural convention for service spaces. */
  .floorplan__room--utility {
    background:
      repeating-linear-gradient(
        135deg,
        var(--rv-utility-stripe),
        var(--rv-utility-stripe) 3px,
        transparent 3px,
        transparent 7px
      ),
      var(--rv-room);
    border: 1px dashed oklch(from var(--rv-room-line) l c h / 0.65);
    color: var(--rv-ink-mute);
    font-style: italic;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0;
    box-shadow: none;
  }

  /* Active room: brand accent with strong glow. Wayfinding pop. */
  .floorplan__room--active {
    background: linear-gradient(
      180deg,
      oklch(72% 0.13 250 / 0.3) 0%,
      oklch(72% 0.13 250 / 0.45) 100%
    );
    border: 1.5px solid var(--rv-accent);
    color: oklch(96% 0.04 250);
    font-weight: 700;
    font-size: 12px;
    font-style: normal;
    letter-spacing: 0.03em;
    z-index: 1;
    box-shadow:
      0 0 0 4px var(--rv-accent-soft),
      0 8px 22px var(--rv-accent-glow);
  }

  .floorplan__room--active .floorplan__room-label {
    /* Label sits above the dot — give it air. */
    transform: translateY(-22%);
  }

  /* Pulse + dot. Motion stays per Emil principles: ease-out, transform/opacity
   * only, staggered after parent mount, reduced-motion respected below. */
  .floorplan__dot {
    position: absolute;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 2;
  }

  .floorplan__dot-pulse,
  .floorplan__dot-core {
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .floorplan__dot-pulse {
    width: 28px;
    height: 28px;
    background: oklch(72% 0.13 250 / 0.4);
    animation: floorplan-pulse 1.6s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }

  .floorplan__dot-core {
    width: 14px;
    height: 14px;
    background: var(--rv-accent);
    box-shadow:
      0 0 0 2.5px oklch(18% 0.012 252 / 0.95),
      0 2px 10px oklch(72% 0.13 250 / 0.6);
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.6);
    transition:
      transform 220ms cubic-bezier(0.23, 1, 0.32, 1) 80ms,
      opacity 220ms cubic-bezier(0.23, 1, 0.32, 1) 80ms;
  }

  .floorplan[data-mounted='true'] .floorplan__dot-core {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  @keyframes floorplan-pulse {
    0%   { transform: translate(-50%, -50%) scale(1);   opacity: 0.7;  }
    70%  { transform: translate(-50%, -50%) scale(1.9); opacity: 0;    }
    100% { transform: translate(-50%, -50%) scale(1.9); opacity: 0;    }
  }

  /* Caption pill — sits below the stage, dark surface like the dashboard. */
  .floorplan__caption {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 14px;
    background: oklch(24% 0.012 250);
    border: 1px solid oklch(34% 0.014 250);
    border-radius: 999px;
    align-self: flex-start;
    font-size: 13px;
    line-height: 1.2;
    box-shadow: 0 2px 8px oklch(0% 0 0 / 0.25);
  }

  .floorplan__floor-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--rv-accent-soft);
    color: var(--rv-accent);
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .floorplan__room-name {
    font-weight: 700;
    color: var(--rv-ink);
    letter-spacing: 0.01em;
  }

  .floorplan__room-name--missing {
    color: var(--rv-ink-mute);
    font-weight: 600;
  }

  /* Strip mode hides the caption block — strips have their own caption baked
   * in by the surrounding card (see prototypes/dashboard-v2.html .floor-strip). */
  .floorplan[data-mode='strip'] .floorplan__caption {
    display: none;
  }

  /* Empty state — same dark surface so it doesn't break the dashboard's mood. */
  .floorplan--empty {
    padding: 28px 20px;
    background: linear-gradient(180deg, oklch(22% 0.014 250) 0%, oklch(20% 0.014 250) 100%);
    border-radius: var(--rv-radius);
    border: 1px solid oklch(34% 0.016 250);
    box-shadow: var(--rv-shadow);
    text-align: center;
  }

  /* Strip-mode empty state matches the prototype's .floor-strip__empty:
   * fills the strip and centers the message instead of stacking a card. */
  .floorplan--empty[data-mode='strip'] {
    height: 200px;
    padding: 0;
    display: grid;
    place-items: center;
  }

  .floorplan__empty-msg {
    color: var(--rv-ink-mute);
    font-size: 14px;
    line-height: 1.4;
    letter-spacing: 0.02em;
  }

  @media (prefers-reduced-motion: reduce) {
    .floorplan__dot-pulse {
      animation: none;
      opacity: 0.55;
    }
    .floorplan__dot-core {
      transition: opacity 150ms ease;
      transform: translate(-50%, -50%);
    }
    .floorplan[data-mounted='true'] .floorplan__dot-core {
      transform: translate(-50%, -50%);
      opacity: 1;
    }
    .floorplan__room {
      transition: none;
    }
  }
</style>
