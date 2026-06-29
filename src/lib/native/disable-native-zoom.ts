/** Locks viewport scale in Capacitor — the web app keeps pinch-zoom for accessibility. */
export const NATIVE_LOCKED_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

function lockViewportMeta(): void {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "viewport");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", NATIVE_LOCKED_VIEWPORT);
}

/**
 * Prevents pinch/double-tap zoom in the native WebView. Vertical scroll still works.
 * Returns a cleanup function (used by NativeBridge on unmount).
 */
export function installNativeZoomLock(): () => void {
  lockViewportMeta();

  const passiveFalse: AddEventListenerOptions = { passive: false };

  const blockGesture = (event: Event) => {
    event.preventDefault();
  };

  document.addEventListener("gesturestart", blockGesture, passiveFalse);
  document.addEventListener("gesturechange", blockGesture, passiveFalse);
  document.addEventListener("gestureend", blockGesture, passiveFalse);

  const blockMultiTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };

  document.addEventListener("touchmove", blockMultiTouchMove, passiveFalse);

  let lastTouchEnd = 0;
  const blockDoubleTapZoom = (event: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  };

  document.addEventListener("touchend", blockDoubleTapZoom, passiveFalse);

  const viewportObserver = new MutationObserver(() => {
    lockViewportMeta();
  });
  viewportObserver.observe(document.head, { childList: true, subtree: true });

  return () => {
    document.removeEventListener("gesturestart", blockGesture);
    document.removeEventListener("gesturechange", blockGesture);
    document.removeEventListener("gestureend", blockGesture);
    document.removeEventListener("touchmove", blockMultiTouchMove);
    document.removeEventListener("touchend", blockDoubleTapZoom);
    viewportObserver.disconnect();
  };
}
