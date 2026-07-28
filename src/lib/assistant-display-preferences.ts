/**
 * Per-manager PropLane Assistant display mode.
 *
 * The assistant has two presentations, both driven by the SAME conversation loop
 * (`useAssistantConversation`), the same auth-gated `/api/agent/chat` endpoint,
 * and the same preview→confirm gate. This preference only decides which one is
 * on screen:
 *
 * - `"popup"` (DEFAULT) — the floating FAB + popup panel, the only surface a
 *   manager who never touches this setting ever sees.
 * - `"docked"` — a full-height right-side rail pinned beside the portal content
 *   on `lg`+ viewports. Below `lg` there is no room for the rail, so the
 *   FAB/popup stays the assistant regardless of the stored mode.
 *
 * Storage mirrors {@link file://./dashboard-preferences.ts}: per-user
 * localStorage, override-only (the default mode stores nothing, so a future
 * default change still reaches everyone who never opted in), plus a window event
 * so an open portal reacts to a change made anywhere in the tree. This is a pure
 * UI preference with no server-side consumer, so it is deliberately
 * localStorage-backed rather than a `notification-preferences.ts`-style row —
 * no round-trip, no schema, and a first paint that never flashes the wrong
 * surface. The trade-off: it is per-device, not per-account.
 */

export type AssistantDisplayMode = "popup" | "docked";

/** The assistant is a floating popup unless the manager explicitly pins it. */
export const DEFAULT_ASSISTANT_DISPLAY_MODE: AssistantDisplayMode = "popup";

const STORAGE_KEY_PREFIX = "axis:assistant-display-mode:v1";

/** Dispatched on `window` after any write so mounted surfaces re-read. */
export const ASSISTANT_DISPLAY_MODE_EVENT = "axis:assistant-display-mode";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function isDisplayMode(value: unknown): value is AssistantDisplayMode {
  return value === "popup" || value === "docked";
}

/**
 * The manager's stored display mode, or the `popup` default. Safe to call on the
 * server and before hydration — both return the default.
 */
export function readAssistantDisplayMode(
  userId: string | null | undefined,
): AssistantDisplayMode {
  if (!userId || typeof window === "undefined") return DEFAULT_ASSISTANT_DISPLAY_MODE;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return isDisplayMode(raw) ? raw : DEFAULT_ASSISTANT_DISPLAY_MODE;
  } catch {
    return DEFAULT_ASSISTANT_DISPLAY_MODE;
  }
}

/** Persist the display mode and notify listeners. No-op on the server. */
export function setAssistantDisplayMode(
  userId: string | null | undefined,
  mode: AssistantDisplayMode,
): void {
  if (!userId || typeof window === "undefined" || !isDisplayMode(mode)) return;
  try {
    if (mode === DEFAULT_ASSISTANT_DISPLAY_MODE) {
      // Back to the default — drop the override entirely.
      window.localStorage.removeItem(storageKey(userId));
    } else {
      window.localStorage.setItem(storageKey(userId), mode);
    }
    window.dispatchEvent(new Event(ASSISTANT_DISPLAY_MODE_EVENT));
  } catch {
    // Storage full / disabled — the preference silently no-ops rather than throwing.
  }
}
