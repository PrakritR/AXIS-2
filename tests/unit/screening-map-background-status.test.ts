import { describe, expect, it } from "vitest";
import { backgroundCheckStatusFromScreening } from "@/lib/screening/map-background-status";

describe("backgroundCheckStatusFromScreening", () => {
  it("maps strong_yes to passed", () => {
    expect(
      backgroundCheckStatusFromScreening({
        provider: "certn",
        externalOrderId: "x",
        status: "complete",
        orderedAt: "2026-01-01T00:00:00.000Z",
        recommendation: "strong_yes",
        pros: [],
        cons: [],
        summary: "",
      }),
    ).toBe("passed");
  });
});
