/* Helpers for the WISS floorplan view.
 * Ported from web/floorplans/raumview.js — behavior must match exactly.
 *
 * Tocco delivers room labels in several shapes:
 *   "4.13", "Raum 4.13", "4.13 Smart"             (dotted)
 *   "ZH 202", "Zimmer 202", "ZH202"               (3-digit, optional prefix)
 *   "ZH 202 Zürich Zimmer 202"                    (full description)
 * We collapse the 3-digit form into the dotted form first, then read
 * floor + room from a single regex.
 */

import { FLOORPLAN_DATA, type Hotspot } from './data';

const ROOM_DOTTED_RE = /(\d)\.(\d{1,2})/;
const ROOM_TRIDIGIT_RE = /(?<![.\d])(\d)(\d{2})(?!\d)/;

export const FLOOR_LABELS = { og4: '4. OG', og2: '2. OG' } as const;
export const FLOOR_ALT = { og4: '4. Obergeschoss', og2: '2. Obergeschoss' } as const;
export type FloorKey = keyof typeof FLOOR_LABELS;

export interface HotspotRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function isOnlineRoom(raum: string | null | undefined): boolean {
  if (raum === null || raum === undefined) return false;
  return /online/i.test(String(raum));
}

function toDottedRoom(raum: string | null | undefined): string {
  if (raum === null || raum === undefined) return '';
  return String(raum).replace(ROOM_TRIDIGIT_RE, '$1.$2');
}

export function normalizeRoom(raum: string | null | undefined): string {
  if (raum === null || raum === undefined) return '';
  const converted = toDottedRoom(raum).trim();
  const match = converted.match(ROOM_DOTTED_RE);
  if (match) {
    let num = match[2];
    if (num.length === 1) num = '0' + num;
    // Canonical form: "XYY" without dot — matches the data.ts hotspot
    // codes the user moved to ("403" not "4.03"). The dotted form is
    // only an intermediate during input parsing.
    return match[1] + num;
  }
  // Already dotless? Pad single-digit room number ("28" → "208").
  const m2 = converted.match(/^(\d)(\d{1,2})$/);
  if (m2) {
    const n = m2[2];
    return m2[1] + (n.length === 1 ? '0' + n : n);
  }
  return converted;
}

export function roomToFloor(raum: string | null | undefined): FloorKey | null {
  if (raum === null || raum === undefined) return null;
  if (isOnlineRoom(raum)) return null;
  const converted = toDottedRoom(raum);
  const match = converted.match(ROOM_DOTTED_RE);
  if (!match) return null;
  const digit = match[1];
  if (digit === '4') return 'og4';
  if (digit === '2') return 'og2';
  return null;
}

export function findHotspot(
  floor: FloorKey | null | undefined,
  raum: string | null | undefined
): HotspotRect | null {
  if (!floor || !FLOORPLAN_DATA[floor]) return null;
  const hotspots: Hotspot[] = FLOORPLAN_DATA[floor].hotspots || [];
  const needle = normalizeRoom(raum);
  if (!needle) return null;
  for (let i = 0; i < hotspots.length; i++) {
    if (hotspots[i].room === needle) {
      return {
        left: hotspots[i].left,
        top: hotspots[i].top,
        width: hotspots[i].width,
        height: hotspots[i].height
      };
    }
  }
  return null;
}

/* True when the hotspot represents a numbered classroom (e.g. "413", "207").
 * Anything else (Treppenhaus, Toilette, Aufenthalt, Terrasse, etc.) is utility. */
const CLASSROOM_RE = /^\d{3}$/;
export function isClassroom(room: string): boolean {
  return CLASSROOM_RE.test(room);
}
export function isUtility(room: string): boolean {
  return !CLASSROOM_RE.test(room);
}

/* Render order: utilities first (lowest), classrooms second, active last (top).
 * Mirrors raumview.js so the active room z-stacks above its neighbours. */
export function orderHotspots(hotspots: Hotspot[], activeRoom: string): Hotspot[] {
  const ordered: Hotspot[] = [];
  for (let u = 0; u < hotspots.length; u++) {
    if (!CLASSROOM_RE.test(hotspots[u].room)) ordered.push(hotspots[u]);
  }
  for (let c = 0; c < hotspots.length; c++) {
    if (CLASSROOM_RE.test(hotspots[c].room) && hotspots[c].room !== activeRoom) {
      ordered.push(hotspots[c]);
    }
  }
  for (let a = 0; a < hotspots.length; a++) {
    if (hotspots[a].room === activeRoom) ordered.push(hotspots[a]);
  }
  return ordered;
}
