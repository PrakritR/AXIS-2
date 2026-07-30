/** Marks an element as horizontally scrollable for wheel forwarding. */
export const HORIZONTAL_SCROLL_ATTR = "data-horizontal-scroll";

/** Marks a wider band that forwards wheel events to a nested horizontal scroller. */
export const HORIZONTAL_SCROLL_CAPTURE_ATTR = "data-horizontal-scroll-capture";

export const HORIZONTAL_SCROLL_SELECTOR = `[${HORIZONTAL_SCROLL_ATTR}]`;

/** Shared overflow row classes for portal tab bars and action strips. */
export const PORTAL_HORIZONTAL_SCROLL_ROW_CLASS =
  "min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

/**
 * Convert vertical wheel/trackpad motion into horizontal scroll when content overflows.
 * Returns true when the event was consumed.
 */
export function applyHorizontalWheelScroll(scrollEl: HTMLElement, event: WheelEvent): boolean {
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return false;
  if (Math.abs(event.deltaY) < 0.5) return false;

  const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
  if (maxScroll <= 1) return false;

  const atStart = scrollEl.scrollLeft <= 0;
  const atEnd = scrollEl.scrollLeft >= maxScroll - 1;
  if ((event.deltaY > 0 && atEnd) || (event.deltaY < 0 && atStart)) return false;

  event.preventDefault();
  scrollEl.scrollLeft += event.deltaY;
  return true;
}

export function findHorizontalScrollTarget(zone: HTMLElement): HTMLElement | null {
  const marked = zone.querySelector<HTMLElement>(HORIZONTAL_SCROLL_SELECTOR);
  if (marked) return marked;
  for (const child of zone.querySelectorAll<HTMLElement>("*")) {
    const { overflowX } = getComputedStyle(child);
    if ((overflowX === "auto" || overflowX === "scroll") && child.scrollWidth > child.clientWidth + 1) {
      return child;
    }
  }
  return null;
}
