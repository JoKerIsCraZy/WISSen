/**
 * Toast queue. Each toast is auto-dismissed after `ttl` ms (default 2500).
 * Use `pushToast(kind, msg)` from anywhere; <Toast /> in +layout.svelte
 * renders the queue.
 */

export type ToastKind = 'success' | 'warn' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title?: string;
  msg: string;
  ttl: number;
}

let nextId = 1;

class ToastState {
  items = $state<Toast[]>([]);

  push(kind: ToastKind, msg: string, opts: { title?: string; ttl?: number } = {}): number {
    const id = nextId++;
    const ttl = opts.ttl ?? 2500;
    const toast: Toast = { id, kind, msg, title: opts.title, ttl };
    this.items = [...this.items, toast];
    if (typeof window !== 'undefined' && ttl > 0) {
      window.setTimeout(() => this.dismiss(id), ttl);
    }
    return id;
  }

  dismiss(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }

  clear(): void {
    this.items = [];
  }
}

export const toast = new ToastState();

export function pushToast(
  kind: ToastKind,
  msg: string,
  opts: { title?: string; ttl?: number } = {}
): number {
  return toast.push(kind, msg, opts);
}

export function dismissToast(id: number): void {
  toast.dismiss(id);
}
