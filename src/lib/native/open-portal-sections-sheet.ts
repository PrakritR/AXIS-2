/** Minimum upward swipe (px) on the native bottom bar to open the full section list. */
export const NATIVE_BOTTOM_NAV_SWIPE_UP_THRESHOLD_PX = 48;

export function shouldOpenNativeSectionsSheet(input: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thresholdPx?: number;
}): boolean {
  const threshold = input.thresholdPx ?? NATIVE_BOTTOM_NAV_SWIPE_UP_THRESHOLD_PX;
  const dx = input.endX - input.startX;
  const dy = input.startY - input.endY;
  return dy >= threshold && dy > Math.abs(dx) * 1.35;
}
