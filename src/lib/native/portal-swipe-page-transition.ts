/**
 * Imperative slide transition for the native main-content pager. Mirrors
 * `sync-portal-bottom-nav-inset.ts`'s pattern of directly styling
 * `#portal-main-content` from outside React — a gesture-driven animation runs
 * far smoother as direct DOM writes than as per-frame React state.
 */

const EXIT_MS = 150;
const ENTER_MS = 200;
const EXIT_OFFSET = "28%";
const ENTER_OFFSET = "22%";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function resetInline(el: HTMLElement): void {
  el.style.transition = "";
  el.style.transform = "";
  el.style.opacity = "";
}

/** Slides the current tab's content out toward `direction`, then resolves. Instant if reduced-motion. */
export function playSwipeExit(el: HTMLElement, direction: "left" | "right"): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  const sign = direction === "left" ? "-1" : "1";
  return new Promise((resolve) => {
    el.style.transition = `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`;
    requestAnimationFrame(() => {
      el.style.transform = `translateX(calc(${sign} * ${EXIT_OFFSET}))`;
      el.style.opacity = "0.35";
    });
    window.setTimeout(resolve, EXIT_MS);
  });
}

/**
 * Snaps the (now-mounted) new tab's content to the opposite edge with no
 * transition, then animates it in to rest. Call right after navigation lands.
 */
export function playSwipeEnter(el: HTMLElement, direction: "left" | "right"): void {
  if (prefersReducedMotion()) {
    resetInline(el);
    return;
  }
  const sign = direction === "left" ? "1" : "-1";
  el.style.transition = "none";
  el.style.transform = `translateX(calc(${sign} * ${ENTER_OFFSET}))`;
  el.style.opacity = "0.35";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transition = `transform ${ENTER_MS}ms ease-out, opacity ${ENTER_MS}ms ease-out`;
      el.style.transform = "translateX(0)";
      el.style.opacity = "1";
      window.setTimeout(() => resetInline(el), ENTER_MS);
    });
  });
}

/** Cancels any in-flight swipe transform (e.g. unmount, or a new gesture interrupts one still settling). */
export function resetSwipeTransform(el: HTMLElement): void {
  resetInline(el);
}
