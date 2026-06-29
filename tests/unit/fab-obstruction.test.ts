import { describe, expect, it } from "vitest";

import { probeRectFromFab, rectSignificantlyOverlaps } from "@/lib/axis-assistant/fab-obstruction";

describe("fab obstruction helpers", () => {
  it("builds a padded probe around the fab", () => {
    const probe = probeRectFromFab({ left: 100, top: 200, right: 156, bottom: 256, width: 56, height: 56, x: 100, y: 200, toJSON: () => ({}) });
    expect(probe).toEqual({ left: 90, top: 190, right: 166, bottom: 266 });
  });

  it("detects meaningful overlap", () => {
    const a = { left: 0, top: 0, right: 60, bottom: 60 };
    const b = { left: 40, top: 40, right: 100, bottom: 100 };
    expect(rectSignificantlyOverlaps(a, b)).toBe(true);
    expect(rectSignificantlyOverlaps(a, { left: 200, top: 200, right: 220, bottom: 220 })).toBe(false);
  });
});
