const PENDING_NOTICE_KEY = "axis:pending-notice";

/**
 * Long enough to survive a signup redirect and a slow first paint, short enough
 * that a notice queued on a path that never navigated cannot resurface an hour
 * later attached to an unrelated page.
 */
export const PENDING_NOTICE_TTL_MS = 10 * 60 * 1000;

/** The vendor portal — where a vendor-signup notice is delivered and rendered. */
export const VENDOR_PORTAL_PATH = "/vendor";

export type PendingNotice = {
  message: string;
  /** Route the notice belongs to — it is only delivered at or below this path. */
  pathPrefix: string;
};

type StoredNotice = PendingNotice & { expiresAt: number };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function pathMatches(currentPath: string, prefix: string): boolean {
  const path = currentPath.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const scope = prefix.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  return scope === "/" || path === scope || path.startsWith(`${scope}/`);
}

/**
 * Hand a message to the NEXT page load.
 *
 * A toast cannot survive a `window.location.replace` — the signup flows
 * navigate that way, so anything shown just before one is destroyed before it
 * is read. Queue it here and let the destination render it as a notice the
 * reader dismisses themselves.
 */
export function queuePendingNotice(notice: PendingNotice, now: number = Date.now()): void {
  const message = notice.message.trim();
  const pathPrefix = notice.pathPrefix.trim();
  if (!message || !pathPrefix || !canUseStorage()) return;
  try {
    const stored: StoredNotice = { message, pathPrefix, expiresAt: now + PENDING_NOTICE_TTL_MS };
    window.sessionStorage.setItem(PENDING_NOTICE_KEY, JSON.stringify(stored));
  } catch {
    /* storage disabled — the message is best-effort, never a blocker */
  }
}

/**
 * Atomic read-and-clear, so a delivered notice can never render twice.
 *
 * A stale notice is discarded rather than shown. One addressed to a different
 * route is LEFT in place — the reader simply is not its destination, and
 * dropping it there would lose a notice the right page would have shown.
 */
export function takePendingNotice(currentPath: string, now: number = Date.now()): string | null {
  if (!canUseStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_NOTICE_KEY);
    if (!raw) return null;

    const stored = JSON.parse(raw) as Partial<StoredNotice> | null;
    const message = typeof stored?.message === "string" ? stored.message.trim() : "";
    const pathPrefix = typeof stored?.pathPrefix === "string" ? stored.pathPrefix : "";
    const expiresAt = typeof stored?.expiresAt === "number" ? stored.expiresAt : 0;

    if (!message || !pathPrefix || expiresAt <= now) {
      clearPendingNotice();
      return null;
    }
    if (!pathMatches(currentPath, pathPrefix)) return null;

    clearPendingNotice();
    return message;
  } catch {
    clearPendingNotice();
    return null;
  }
}

export function clearPendingNotice(): void {
  if (!canUseStorage()) return;
  try {
    window.sessionStorage.removeItem(PENDING_NOTICE_KEY);
  } catch {
    /* ignore */
  }
}
