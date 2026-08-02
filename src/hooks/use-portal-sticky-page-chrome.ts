"use client";

import { useEffect } from "react";

// Ref-counted: `ManagerPortalPageShell` opts in by default, so two shells can be
// mounted at once (nested shells, or a route transition where both trees are
// live). Without the count the first unmount would clear the attribute out from
// under the survivor and silently break its scroll container.
let activeCount = 0;

/** Locks portal main to a flex viewport so page chrome stays fixed and list bodies scroll below. */
export function usePortalStickyPageChrome(active: boolean) {
  useEffect(() => {
    if (!active) return;
    activeCount += 1;
    document.documentElement.dataset.portalStickyChrome = "true";
    return () => {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) delete document.documentElement.dataset.portalStickyChrome;
    };
  }, [active]);
}
