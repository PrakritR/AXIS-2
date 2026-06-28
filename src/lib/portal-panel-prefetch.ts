/** Panel modules code-split in render-portal-section — warm gradually after portal mount. */

const PANEL_MODULES = [
  "@/components/portal/manager-residents",
  "@/components/portal/manager-applications",
  "@/components/portal/manager-properties",
  "@/components/portal/portal-calendar",
  "@/components/portal/manager-all-services-panel",
  "@/components/portal/manager-inbox",
  "@/components/portal/manager-finances-panel",
  "@/components/portal/manager-documents-panel",
  "@/components/portal/pro-account-links-panel",
  "@/components/portal/resident-services-panel",
] as const;

let prefetchStarted = false;

/** Import one panel chunk at a time so dev compile stays responsive. */
export function prefetchPortalPanelChunks() {
  if (prefetchStarted || typeof window === "undefined") return;
  prefetchStarted = true;

  let index = 0;
  const step = () => {
    const modulePath = PANEL_MODULES[index];
    if (!modulePath) return;
    void import(modulePath);
    index += 1;
    if (index < PANEL_MODULES.length) {
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
