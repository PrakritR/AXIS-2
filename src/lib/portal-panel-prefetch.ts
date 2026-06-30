/** Panel modules code-split in render-portal-section — warm gradually after portal mount. */

import {
  loadManagerResidents,
  loadManagerApplications,
  loadManagerProperties,
  loadPortalCalendar,
  loadManagerAllServicesPanel,
  loadManagerInbox,
  loadManagerFinancesPanel,
  loadManagerDocumentsPanel,
  loadProAccountLinksPanel,
  loadResidentServicesPanel,
} from "@/lib/portal-panel-imports";
import { portalBackgroundPrefetchEnabled } from "@/lib/portal-nav-prefetch";

/**
 * Each loader uses a static literal import so Turbopack can resolve the chunk.
 * A dynamic `import(variable)` cannot be statically analyzed and fails at
 * runtime with "Cannot find module", so we warm chunks through the same
 * loaders the section renderer uses.
 */
const PANEL_LOADERS = [
  loadManagerResidents,
  loadManagerApplications,
  loadManagerProperties,
  loadPortalCalendar,
  loadManagerAllServicesPanel,
  loadManagerInbox,
  loadManagerFinancesPanel,
  loadManagerDocumentsPanel,
  loadProAccountLinksPanel,
  loadResidentServicesPanel,
] as const;

let prefetchStarted = false;

/** Import one panel chunk at a time so dev compile stays responsive. */
export function prefetchPortalPanelChunks() {
  if (!portalBackgroundPrefetchEnabled()) return;
  if (prefetchStarted || typeof window === "undefined") return;
  prefetchStarted = true;

  let index = 0;
  const step = () => {
    const loader = PANEL_LOADERS[index];
    if (!loader) return;
    void loader().catch(() => {
      /* prefetch is best-effort */
    });
    index += 1;
    if (index < PANEL_LOADERS.length) {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(step, { timeout: 1200 });
      } else {
        window.setTimeout(step, 120);
      }
    }
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(step, { timeout: 2000 });
  } else {
    window.setTimeout(step, 300);
  }
}
