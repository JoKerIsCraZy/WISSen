/**
 * Right-side log peek panel state. Single-instance store, rune-based.
 * Used by Rail, LogPeek and the global keyboard handler in +layout.svelte.
 */

class PeekState {
  open = $state(false);

  toggle(): void {
    this.open = !this.open;
  }

  show(): void {
    this.open = true;
  }

  hide(): void {
    this.open = false;
  }
}

export const peek = new PeekState();
