import { describe, expect, it } from "vitest";

import { computeVisualViewportBottomInset } from "@/hooks/use-visual-viewport-bottom-inset";

describe("computeVisualViewportBottomInset", () => {
  it("returns 0 when the keyboard is hidden", () => {
    expect(computeVisualViewportBottomInset(844, 844, 0)).toBe(0);
  });

  it("measures covered viewport height", () => {
    expect(computeVisualViewportBottomInset(844, 500, 0)).toBe(344);
  });

  it("never returns a negative inset", () => {
    expect(computeVisualViewportBottomInset(500, 844, 0)).toBe(0);
  });
});
