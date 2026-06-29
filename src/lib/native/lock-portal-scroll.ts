import { PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

type ScrollLockSnapshot = {
  bodyOverflow: string;
  mainOverflow: string;
  mainScrollTop: number;
};

let lockCount = 0;
let snapshot: ScrollLockSnapshot | null = null;

function getPortalMain(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.getElementById(PORTAL_MAIN_CONTENT_ID);
}

/** Locks portal page scroll (main column on native; body fallback on marketing pages). */
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

  const main = getPortalMain();
  snapshot = {
    bodyOverflow: document.body.style.overflow,
    mainOverflow: main?.style.overflow ?? "",
    mainScrollTop: main?.scrollTop ?? 0,
  };

  document.body.style.overflow = "hidden";
  if (main) {
    main.style.overflow = "hidden";
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
  document.body.style.overflow = prev.bodyOverflow;
  const main = getPortalMain();
  if (main) {
    main.style.overflow = prev.mainOverflow;
    main.scrollTop = prev.mainScrollTop;
  }
}
