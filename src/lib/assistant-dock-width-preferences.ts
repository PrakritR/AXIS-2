/**
 * Per-manager PropLane Assistant dock width.
 *
 * When the assistant is pinned into its docked right-side rail
 * (`assistant-display-preferences.ts`), the manager can drag its inner edge to
 * make the rail wider or narrower. This stores that chosen width.
 *
 * Storage mirrors {@link file://./assistant-display-preferences.ts} exactly:
 * per-user localStorage, override-only (the default width stores nothing, so a
 * future default change still reaches everyone who never dragged), plus a window
 * event so a mounted rail re-reads. Pure UI preference, no server consumer — the
 * trade-off is that it is per-device, not per-account, the same deliberate call
 * the display-mode module made.
 */

/** Rail width bounds, in px. Below the min the chat cramps; above the max it starves the page. */
export const DOCK_WIDTH_MIN = 288;
export const DOCK_WIDTH_MAX = 640;
/** Sits between the old responsive 336px (`lg`) / 368px (`xl`) fixed widths. */
export const DOCK_WIDTH_DEFAULT = 360;

const STORAGE_KEY_PREFIX = "axis:assistant-dock-width:v1";

/** Dispatched on `window` after any write so mounted surfaces re-read. */
export const ASSISTANT_DOCK_WIDTH_EVENT = "axis:assistant-dock-width";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

/** Clamp to [min, max] and round; a non-finite value falls back to the default. */
export function clampDockWidth(width: number): number {
  if (!Number.isFinite(width)) return DOCK_WIDTH_DEFAULT;
  return Math.round(Math.min(DOCK_WIDTH_MAX, Math.max(DOCK_WIDTH_MIN, width)));
}

/**
 * The manager's stored rail width, or the default. Safe on the server and before
 * hydration — both return the default. Any stored value is re-clamped on read so
 * a shrunk-in bound can never serve an out-of-range width.
 */
export function readAssistantDockWidth(userId: string | null | undefined): number {
  if (!userId || typeof window === "undefined") return DOCK_WIDTH_DEFAULT;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (raw === null) return DOCK_WIDTH_DEFAULT;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? DOCK_WIDTH_DEFAULT : clampDockWidth(parsed);
  } catch {
    return DOCK_WIDTH_DEFAULT;
  }
}

/** Persist the rail width and notify listeners. No-op on the server. */
export function setAssistantDockWidth(
  userId: string | null | undefined,
  width: number,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const clamped = clampDockWidth(width);
    if (clamped === DOCK_WIDTH_DEFAULT) {
      // Back to the default — drop the override entirely.
      window.localStorage.removeItem(storageKey(userId));
    } else {
      window.localStorage.setItem(storageKey(userId), String(clamped));
    }
    window.dispatchEvent(new Event(ASSISTANT_DOCK_WIDTH_EVENT));
  } catch {
    // Storage full / disabled — the preference silently no-ops rather than throwing.
  }
}
