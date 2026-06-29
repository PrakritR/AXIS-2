export const PORTAL_NATIVE_BOTTOM_NAV_INSET_VAR = "--portal-native-bottom-nav-inset";

/** CSS fallback until the fixed nav bar is measured in the WebView. */
export const PORTAL_NATIVE_BOTTOM_NAV_INSET_FALLBACK =
  "max(5rem, calc(var(--native-safe-bottom) + 3.5rem))";

export function formatNativeBottomNavInset(px: number): string {
  return `${Math.max(0, Math.ceil(px))}px`;
}

export function applyNativeBottomNavInset(heightPx: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    PORTAL_NATIVE_BOTTOM_NAV_INSET_VAR,
    formatNativeBottomNavInset(heightPx),
  );
}

export function clearNativeBottomNavInset(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.removeProperty(PORTAL_NATIVE_BOTTOM_NAV_INSET_VAR);
}

/** Keeps `#portal-main-content` padding aligned with the measured native footer height. */
export function observeNativeBottomNavInset(
  element: HTMLElement | null,
  active: boolean,
): () => void {
  if (!active || !element || typeof window === "undefined") {
    return () => clearNativeBottomNavInset();
  }

  const sync = () => applyNativeBottomNavInset(element.getBoundingClientRect().height);

  sync();
  const observer = new ResizeObserver(sync);
  observer.observe(element);
  window.addEventListener("orientationchange", sync);

  return () => {
    observer.disconnect();
    window.removeEventListener("orientationchange", sync);
    clearNativeBottomNavInset();
  };
}
