const PENDING_TOAST_KEY = "axis:pending-toast";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

/**
 * Hand a message to the NEXT page load.
 *
 * `showToast` cannot survive a `window.location.replace` — the signup flows
 * navigate that way, so a toast fired just before one is destroyed before it is
 * ever read. Queue it here instead and `AppUiProvider` shows it on arrival.
 */
export function queuePendingToast(message: string): void {
  const text = message.trim();
  if (!text || !canUseStorage()) return;
  try {
    window.sessionStorage.setItem(PENDING_TOAST_KEY, text);
  } catch {
    /* storage disabled — the message is best-effort, never a blocker */
  }
}

/** Read-and-clear, so a queued message is shown exactly once. */
export function takePendingToast(): string | null {
  if (!canUseStorage()) return null;
  try {
    const text = window.sessionStorage.getItem(PENDING_TOAST_KEY);
    window.sessionStorage.removeItem(PENDING_TOAST_KEY);
    return text?.trim() || null;
  } catch {
    return null;
  }
}
