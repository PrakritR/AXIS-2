/** Minimum horizontal swipe (px) on native portal content to page to the adjacent main tab. */
export const PORTAL_SWIPE_PAGE_THRESHOLD_PX = 48;

/**
 * True horizontal paging gesture: the finger moved mostly sideways (not a
 * vertical scroll) past the threshold. Mirrors the shape of
 * `shouldOpenNativeSectionsSheet` (same dx/dy dominance test, opposite axis).
 */
export function resolveSwipePageDirection(input: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thresholdPx?: number;
}): "left" | "right" | null {
  const threshold = input.thresholdPx ?? PORTAL_SWIPE_PAGE_THRESHOLD_PX;
  const dx = input.endX - input.startX;
  const dy = input.endY - input.startY;
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.35) return null;
  return dx < 0 ? "left" : "right";
}

/**
 * The main tab adjacent to `current` in `order`, in the swipe direction
 * (swiping left advances to the next tab, like turning a page forward).
 * Returns null at either end of the list or if `current` isn't in `order`.
 */
export function adjacentPrimarySection(
  order: readonly string[],
  current: string,
  direction: "left" | "right",
): string | null {
  const idx = order.indexOf(current);
  if (idx === -1) return null;
  const nextIdx = direction === "left" ? idx + 1 : idx - 1;
  if (nextIdx < 0 || nextIdx >= order.length) return null;
  return order[nextIdx] ?? null;
}
