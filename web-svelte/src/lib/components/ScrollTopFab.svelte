<script lang="ts">
  import { onMount } from 'svelte';

  /* Floating "scroll to top" pill. Renders into the layout's `.main` scroll
   * container (not the window — the layout sticky-positions Topbar/Rail and
   * gives `.main` overflow-y:auto, so window.scrollY is always 0 on desktop).
   * Visibility threshold and smooth-scroll behavior follow the project's
   * existing motion vocabulary. */
  interface Props {
    threshold?: number;
  }
  let { threshold = 400 }: Props = $props();

  let visible = $state(false);
  let scrollEl: HTMLElement | null = null;

  function update(): void {
    if (!scrollEl) return;
    visible = scrollEl.scrollTop > threshold;
  }

  function scrollTop(): void {
    if (!scrollEl) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollEl.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  onMount(() => {
    scrollEl = document.querySelector<HTMLElement>('.main');
    if (!scrollEl) return;
    update();
    scrollEl.addEventListener('scroll', update, { passive: true });
    return () => {
      scrollEl?.removeEventListener('scroll', update);
    };
  });
</script>

<button
  type="button"
  class="fab"
  class:is-visible={visible}
  aria-label="Nach oben scrollen"
  title="Nach oben"
  onclick={scrollTop}
  tabindex={visible ? 0 : -1}
  aria-hidden={!visible}
>
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="18 15 12 9 6 15"/>
  </svg>
</button>

<style>
  .fab {
    position: fixed;
    right: 24px;
    bottom: 24px;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-mute);
    display: grid;
    place-items: center;
    box-shadow: var(--shadow-md);
    z-index: 30;
    opacity: 0;
    transform: translateY(8px) scale(0.96);
    pointer-events: none;
    cursor: pointer;
    transition:
      opacity 180ms var(--ease),
      transform 180ms var(--ease),
      background var(--t-fast) var(--ease),
      color var(--t-fast) var(--ease),
      border-color var(--t-fast) var(--ease);
  }
  .fab.is-visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }
  @media (hover: hover) and (pointer: fine) {
    .fab:hover {
      background: var(--surface-3);
      color: var(--text);
      border-color: var(--border-strong, var(--border));
    }
  }
  .fab:active {
    transform: translateY(0) scale(0.94);
  }
  .fab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .fab {
      transition: opacity 120ms linear;
      transform: none;
    }
    .fab.is-visible { transform: none; }
    .fab:active { transform: none; }
  }
  /* Stay clear of the MobileTabBar (~64px tall + safe-area) when on mobile. */
  @media (max-width: 720px) {
    .fab {
      right: 16px;
      bottom: calc(80px + env(safe-area-inset-bottom));
    }
  }
</style>
