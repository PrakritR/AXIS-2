import { PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

export function getPortalScrollRoot(el: HTMLElement | null): HTMLElement | null {
  return (
    el?.closest<HTMLElement>(`#${PORTAL_MAIN_CONTENT_ID}`) ??
    (typeof document !== "undefined" ? document.getElementById(PORTAL_MAIN_CONTENT_ID) : null)
  );
}

/** Measure the mobile portal top bar and publish `--portal-mobile-top-chrome` on the scroll root. */
export function syncPortalMobileTopChrome(anchorEl: HTMLElement | null): number {
  const main = getPortalScrollRoot(anchorEl);
  const nav = main?.querySelector<HTMLElement>(".portal-mobile-nav-bar");
  if (!main || !nav) {
    main?.style.removeProperty("--portal-mobile-top-chrome");
    return 0;
  }
  const style = window.getComputedStyle(nav);
  if (style.display === "none" || style.visibility === "hidden") {
    main.style.removeProperty("--portal-mobile-top-chrome");
    return 0;
  }
  const height = nav.getBoundingClientRect().height;
  if (height > 0) {
    main.style.setProperty("--portal-mobile-top-chrome", `${height}px`);
  }
  return height;
}

/** Pinned property-detail chrome (top tabs + Preview/House details + listing subnav). */
export function syncPortalDetailDestinationOffset(anchorEl: HTMLElement | null): number {
  const main = getPortalScrollRoot(anchorEl);
  if (!main) return 0;

  const propertyChrome = main.querySelector<HTMLElement>("[data-portal-property-detail-chrome]");
  if (propertyChrome) {
    const height = propertyChrome.getBoundingClientRect().height;
    if (height > 0) {
      main.style.setProperty("--portal-detail-destination-offset", `${height}px`);
      return height;
    }
    main.style.removeProperty("--portal-detail-destination-offset");
    return 0;
  }

  const destNav = main.querySelector<HTMLElement>("[data-portal-detail-destination-nav]");
  if (!destNav) {
    main.style.removeProperty("--portal-detail-destination-offset");
    return 0;
  }
  const style = window.getComputedStyle(destNav);
  if (style.position !== "sticky") {
    main.style.removeProperty("--portal-detail-destination-offset");
    return 0;
  }
  const height = destNav.getBoundingClientRect().height;
  if (height > 0) {
    main.style.setProperty("--portal-detail-destination-offset", `${height}px`);
  } else {
    main.style.removeProperty("--portal-detail-destination-offset");
  }
  return height;
}
