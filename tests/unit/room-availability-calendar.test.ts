import { describe, expect, it } from "vitest";
import {
  buildMonthDayCells,
  dayIsUnavailable,
  monthAvailabilityTone,
  monthToneLabel,
  resolveAvailabilityMonthRange,
} from "@/lib/room-availability-calendar";

describe("room-availability-calendar", () => {
  const today = new Date(2026, 7, 8); // Aug 8, 2026

  it("marks days inside an unavailability window as blocked", () => {
    const windows = [{ start: new Date(2026, 7, 10), end: new Date(2026, 7, 15) }];
    expect(dayIsUnavailable(new Date(2026, 7, 9), windows)).toBe(false);
    expect(dayIsUnavailable(new Date(2026, 7, 12), windows)).toBe(true);
    expect(dayIsUnavailable(new Date(2026, 7, 16), windows)).toBe(false);
  });

  it("builds a month grid with leading blanks", () => {
    const cells = buildMonthDayCells(new Date(2026, 7, 1));
    expect(cells[0]).toBeNull();
    expect(cells.filter(Boolean)).toHaveLength(31);
  });

  it("classifies a fully open month as available", () => {
    expect(monthAvailabilityTone(new Date(2026, 9, 1), [], today)).toBe("available");
  });

  it("classifies a fully blocked future month as unavailable", () => {
    const windows = [{ start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) }];
    expect(monthAvailabilityTone(new Date(2026, 9, 1), windows, today)).toBe("unavailable");
  });

  it("classifies partial-month blocks as mixed", () => {
    const windows = [{ start: new Date(2026, 7, 20), end: new Date(2026, 7, 25) }];
    expect(monthAvailabilityTone(new Date(2026, 7, 1), windows, today)).toBe("mixed");
  });

  it("extends the range when windows reach beyond the default horizon", () => {
    const windows = [{ start: new Date(2027, 8, 1), end: new Date(2027, 8, 30) }];
    const { monthCount } = resolveAvailabilityMonthRange(windows, { today, horizonMonths: 12 });
    expect(monthCount).toBeGreaterThan(12);
  });

  it("labels month tones for the calendar legend", () => {
    expect(monthToneLabel("available")).toBe("Open");
    expect(monthToneLabel("unavailable")).toBe("Unavailable");
    expect(monthToneLabel("mixed")).toBe("Mixed");
  });
});
