import { describe, expect, it } from "vitest";
import { sendAtWithinScheduleHorizon } from "@/lib/inbox-schedule-horizon";

describe("inbox-schedule-horizon", () => {
  const now = new Date("2026-06-30T12:00:00.000Z");

  it("includes sends within the day window", () => {
    expect(sendAtWithinScheduleHorizon("2026-07-02T09:00:00.000Z", 3, now)).toBe(true);
    expect(sendAtWithinScheduleHorizon("2026-08-01T09:00:00.000Z", 3, now)).toBe(false);
  });

  it("shows all upcoming when horizon is null", () => {
    expect(sendAtWithinScheduleHorizon("2026-12-01T09:00:00.000Z", null, now)).toBe(true);
  });

  it("excludes past sends", () => {
    expect(sendAtWithinScheduleHorizon("2026-06-29T09:00:00.000Z", 30, now)).toBe(false);
  });
});
