/**
 * Scale-to-fit math for the flyer preview iframe.
 *
 * A flyer sheet has a fixed print/canvas width (816px for letter, 1080px for
 * IG formats — see `FLYER_SIZES`), so on a phone the document is 2–3× wider
 * than the preview container. Instead of relying on iframe-internal scrolling
 * (unreliable in iOS WKWebView), the preview renders the iframe at the sheet's
 * natural size and scales it down with a CSS transform so the whole page width
 * fits the container; the container then owns vertical scrolling.
 */
export type FlyerFit = {
  /** Applied as `transform: scale(...)` with a top-left origin. Never > 1. */
  scale: number;
  /** Natural (unscaled) sheet dimensions the iframe is laid out at. */
  sheetWidth: number;
  sheetHeight: number;
  /** On-screen size after scaling — the spacer box the scroll container sees. */
  scaledWidth: number;
  scaledHeight: number;
};

export function computeFlyerFit(
  containerWidth: number,
  sheetWidth: number,
  sheetHeight: number,
): FlyerFit | null {
  if (!(containerWidth > 0) || !(sheetWidth > 0) || !(sheetHeight > 0)) return null;
  const scale = Math.min(1, containerWidth / sheetWidth);
  return {
    scale,
    sheetWidth,
    sheetHeight,
    scaledWidth: sheetWidth * scale,
    scaledHeight: sheetHeight * scale,
  };
}
