import { describe, expect, it } from "vitest";
import { computeFlyerFit } from "@/lib/promotion-flyer-fit";

describe("computeFlyerFit", () => {
  it("scales a letter sheet down to a phone-width container", () => {
    // 8.5in = 816px; iPhone-ish preview column ≈ 358px.
    const fit = computeFlyerFit(358, 816, 1056);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBeCloseTo(358 / 816, 5);
    expect(fit!.scaledWidth).toBeCloseTo(358, 5);
    expect(fit!.scaledHeight).toBeCloseTo(1056 * (358 / 816), 5);
    expect(fit!.sheetWidth).toBe(816);
    expect(fit!.sheetHeight).toBe(1056);
  });

  it("never scales up past the sheet's natural size", () => {
    const fit = computeFlyerFit(2000, 816, 1056);
    expect(fit!.scale).toBe(1);
    expect(fit!.scaledWidth).toBe(816);
    expect(fit!.scaledHeight).toBe(1056);
  });

  it("returns null until real measurements exist", () => {
    expect(computeFlyerFit(0, 816, 1056)).toBeNull();
    expect(computeFlyerFit(358, 0, 1056)).toBeNull();
    expect(computeFlyerFit(358, 816, 0)).toBeNull();
    expect(computeFlyerFit(Number.NaN, 816, 1056)).toBeNull();
  });

  it("scales tall IG-story canvases by width, letting the container scroll the rest", () => {
    const fit = computeFlyerFit(358, 1080, 1920);
    expect(fit!.scale).toBeCloseTo(358 / 1080, 5);
    expect(fit!.scaledHeight).toBeGreaterThan(fit!.scaledWidth);
  });
});
