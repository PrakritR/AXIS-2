"use client";

import { useEffect } from "react";

/** Locks portal main to a flex viewport so page chrome stays fixed and list bodies scroll below. */
export function usePortalStickyPageChrome(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.documentElement.dataset.portalStickyChrome = "true";
    return () => {
      delete document.documentElement.dataset.portalStickyChrome;
    };
  }, [active]);
}
