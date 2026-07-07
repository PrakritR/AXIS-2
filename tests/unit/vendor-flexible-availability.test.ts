import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLEXIBLE_TIMING_RANK,
  FLEXIBLE_TIMING_RANGES,
  mergeSlotKeysToDateWindows,
  normalizeFlexibleTimingRank,
  resolveNextAvailableSlot,
} from "@/lib/vendor-availability";

describe("vendor flexible availability", () => {
  it("normalizes timing rank with missing values", () => {
    expect(normalizeFlexibleTimingRank(["evening", "morning"])).toEqual(["evening", "morning", "afternoon"]);
  });

  it("merges adjacent slot keys into windows", () => {
    const windows = mergeSlotKeysToDateWindows(["2026-07-06:16", "2026-07-06:17", "2026-07-06:19"]);
    expect(windows.get("2026-07-06")).toEqual([
      { start: 8 * 60, end: 9 * 60 },
      { start: 9 * 60 + 30, end: 10 * 60 },
    ]);
  });

  it("prefers tenant requested time when flexible day allows it", () => {
    const iso = resolveNextAvailableSlot({
      rules: [],
      busy: [],
      durationMinutes: 60,
      from: new Date("2026-07-06T15:00:00.000Z"),
      slotKeys: [],
      flexibleWeekdays: new Set([1]),
      timingRank: DEFAULT_FLEXIBLE_TIMING_RANK,
      tenantPreferredIso: "2026-07-06T18:00:00.000Z",
    });
    expect(iso).toBe("2026-07-06T18:00:00.000Z");
  });

  it("auto-schedules by timing rank on flexible days without explicit blocks", () => {
    const iso = resolveNextAvailableSlot({
      rules: [],
      busy: [],
      durationMinutes: 60,
      from: new Date("2026-07-06T15:00:00.000Z"),
      slotKeys: [],
      flexibleWeekdays: new Set([1]),
      timingRank: ["afternoon", "morning", "evening"],
    });
    expect(iso).toBeTruthy();
    const hour = new Date(iso!).getUTCHours();
    const afternoonStart = Math.floor(FLEXIBLE_TIMING_RANGES.afternoon.start / 60);
    expect(hour).toBeGreaterThanOrEqual(afternoonStart - 8);
  });
});
