export type Rect = { left: number; top: number; right: number; bottom: number };

const INTERACTIVE_SELECTOR =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [role="button"]:not([aria-disabled="true"])';

const IGNORE_SELECTOR =
  ".axis-assistant-nav-btn, .portal-native-bottom-nav-assistant, [data-radix-portal], .portal-native-bottom-nav, [aria-hidden='true']";

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

export function probeRectFromFab(fabRect: DOMRect, padding = 10): Rect {
  return {
    left: fabRect.left - padding,
    top: fabRect.top - padding,
    right: fabRect.right + padding,
    bottom: fabRect.bottom + padding,
  };
}

export function rectSignificantlyOverlaps(a: Rect, b: Rect, minArea = 360): boolean {
  if (!rectsOverlap(a, b)) return false;
  return overlapArea(a, b) >= minArea;
}

function isVisibleInteractive(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width >= 8 && rect.height >= 8;
}

/** True when the FAB probe overlaps a tappable control in the lower viewport. */
export function fabObstructsInteractiveContent(
  fabRect: DOMRect,
  viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800,
): boolean {
  const probe = probeRectFromFab(fabRect);
  const lowerBandTop = viewportHeight * 0.52;

  for (const node of document.querySelectorAll(INTERACTIVE_SELECTOR)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest(IGNORE_SELECTOR)) continue;
    if (!isVisibleInteractive(node)) continue;

    const rect = node.getBoundingClientRect();
    if (rect.bottom < lowerBandTop) continue;

    if (rectSignificantlyOverlaps(probe, rect)) return true;
  }

  return false;
}
