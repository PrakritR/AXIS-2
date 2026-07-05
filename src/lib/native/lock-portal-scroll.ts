import { isDemoModeActive } from "@/lib/demo/demo-session";
import { DEMO_PORTAL_SCROLL_ID, PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

type ScrollLockSnapshot = {
  bodyOverflow: string;
  scrollEl: HTMLElement | null;
  scrollOverflow: string;
  scrollTop: number;
  lockBody: boolean;
};

let lockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

function getScrollLockElement(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const id = isDemoModeActive() ? DEMO_PORTAL_SCROLL_ID : PORTAL_MAIN_CONTENT_ID;
  return document.getElementById(id);
}

/** Locks portal page scroll (main column on native; demo frame scroll on `/demo`). */
export function lockPortalScroll(): () => void {
  if (typeof document === "undefined") return () => undefined;

  lockCount += 1;
  if (lockCount > 1) {
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && snapshot) {
        restorePortalScroll(snapshot);
        snapshot = null;
      }
    };
  }

  const scrollEl = getScrollLockElement();
  const lockBody = !isDemoModeActive();
  snapshot = {
    bodyOverflow: document.body.style.overflow,
    scrollEl,
    scrollOverflow: scrollEl?.style.overflow ?? "",
    scrollTop: scrollEl?.scrollTop ?? 0,
    lockBody,
  };

  if (lockBody) {
    document.body.style.overflow = "hidden";
  }
  if (scrollEl) {
    scrollEl.style.overflow = "hidden";
  }

  return () => {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0 && snapshot) {
      restorePortalScroll(snapshot);
      snapshot = null;
    }
  };
}

function restorePortalScroll(prev: ScrollLockSnapshot) {
  if (prev.lockBody) {
    document.body.style.overflow = prev.bodyOverflow;
  }
  if (prev.scrollEl) {
    prev.scrollEl.style.overflow = prev.scrollOverflow;
    prev.scrollEl.scrollTop = prev.scrollTop;
  }
}
