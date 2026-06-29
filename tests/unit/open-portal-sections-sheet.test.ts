import { describe, expect, it } from "vitest";
import { shouldOpenNativeSectionsSheet } from "@/lib/native/open-portal-sections-sheet";

describe("shouldOpenNativeSectionsSheet", () => {
  it("opens on a mostly vertical upward swipe", () => {
    expect(
      shouldOpenNativeSectionsSheet({
        startX: 120,
        startY: 800,
        endX: 125,
        endY: 740,
      }),
    ).toBe(true);
  });

  it("ignores horizontal swipes", () => {
    expect(
      shouldOpenNativeSectionsSheet({
        startX: 40,
        startY: 800,
        endX: 180,
        endY: 790,
      }),
    ).toBe(false);
  });
});
