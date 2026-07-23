import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_WEEK_DAY_COUNT,
  buildMondayWeekDates,
  mondayBasedDayIndex,
  resolveBlockBaseDates,
} from "@/lib/portal/availability-block";

// Local noon-anchored date builder mirroring the component's addDays semantics.
function d(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}
function iso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

describe("mondayBasedDayIndex", () => {
  it("maps weekdays to a Monday-based index (0=Mon..6=Sun)", () => {
    expect(mondayBasedDayIndex(d("2026-07-13"))).toBe(0); // Monday
    expect(mondayBasedDayIndex(d("2026-07-15"))).toBe(2); // Wednesday
    expect(mondayBasedDayIndex(d("2026-07-17"))).toBe(4); // Friday
    expect(mondayBasedDayIndex(d("2026-07-19"))).toBe(6); // Sunday
  });
});

describe("resolveBlockBaseDates", () => {
  const weekMonday = d("2026-07-13"); // Monday of the Jul 13–19 week

  it("full Mon–Sun week: identical to addDays(weekMonday, weekday)", () => {
    const fullWeek = [0, 1, 2, 3, 4, 5, 6].map((i) => {
      const x = new Date(weekMonday);
      x.setDate(x.getDate() + i);
      return x;
    });
    // Wednesday selected → Jul 15
    expect(resolveBlockBaseDates(fullWeek, weekMonday, [2]).map(iso)).toEqual(["2026-07-15"]);
    // Mon+Fri → Jul 13, Jul 17
    expect(resolveBlockBaseDates(fullWeek, weekMonday, [0, 4]).map(iso)).toEqual([
      "2026-07-13",
      "2026-07-17",
    ]);
  });

  it("compact window starting Wed: a selected weekday resolves to its real visible date, not weekMonday+weekday-as-position", () => {
    // Compact 5-day window starting Wed Jul 15 → Wed..Sun (Jul 15–19).
    const compact = [0, 1, 2, 3, 4].map((i) => d(iso(new Date(2026, 6, 15 + i))));

    // The REPORTED BUG: clicking the 3rd column (Fri Jul 17) used to pass the
    // column index (2) as the weekday, which the modal read as Wednesday.
    // With date-derived weekdays, the Friday column is weekday 4 → resolves to Jul 17.
    const fridayWeekday = mondayBasedDayIndex(d("2026-07-17"));
    expect(fridayWeekday).toBe(4);
    expect(resolveBlockBaseDates(compact, weekMonday, [fridayWeekday]).map(iso)).toEqual([
      "2026-07-17",
    ]);

    // And the leftmost column (Wed Jul 15) resolves to Jul 15, not Monday.
    const wedWeekday = mondayBasedDayIndex(d("2026-07-15"));
    expect(wedWeekday).toBe(2);
    expect(resolveBlockBaseDates(compact, weekMonday, [wedWeekday]).map(iso)).toEqual([
      "2026-07-15",
    ]);
  });

  it("compact window straddling a Monday boundary resolves each column to its real date", () => {
    // Window starts Sat Jul 18 → Sat, Sun, Mon, Tue, Wed (Jul 18–22), crossing into
    // the next Mon–Sun week (Mon Jul 20). The anchor week's Monday is still Jul 13.
    const compact = [0, 1, 2, 3, 4].map((i) => d(iso(new Date(2026, 6, 18 + i))));
    const anchorWeekMonday = d("2026-07-13");

    // Monday column here is Jul 20 (next week), NOT the anchor week's Jul 13.
    const mondayWeekday = mondayBasedDayIndex(d("2026-07-20"));
    expect(mondayWeekday).toBe(0);
    expect(resolveBlockBaseDates(compact, anchorWeekMonday, [mondayWeekday]).map(iso)).toEqual([
      "2026-07-20",
    ]);
  });

  it("weekday outside the compact window falls back to the anchor week's Monday", () => {
    // Window Wed–Sun (Jul 15–19) does not contain Monday; selecting Mon falls back
    // to weekMonday (Jul 13).
    const compact = [0, 1, 2, 3, 4].map((i) => d(iso(new Date(2026, 6, 15 + i))));
    expect(resolveBlockBaseDates(compact, weekMonday, [0]).map(iso)).toEqual(["2026-07-13"]);
  });
});

describe("buildMondayWeekDates", () => {
  it("returns seven contiguous Mon–Sun dates", () => {
    const weekMonday = d("2026-08-24");
    expect(buildMondayWeekDates(weekMonday).map(iso)).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
      "2026-08-30",
    ]);
  });

  it("advancing one week has no gap between Sunday and the next Monday", () => {
    const weekMonday = d("2026-08-24");
    const dates = buildMondayWeekDates(weekMonday);
    const nextMonday = d("2026-08-31");
    const nextDates = buildMondayWeekDates(nextMonday);
    const lastDay = dates[dates.length - 1]!;
    const firstNext = nextDates[0]!;
    const gapMs = firstNext.getTime() - lastDay.getTime();
    expect(gapMs).toBe(24 * 60 * 60 * 1000);
    expect(dates).toHaveLength(AVAILABILITY_WEEK_DAY_COUNT);
    expect(nextDates).toHaveLength(AVAILABILITY_WEEK_DAY_COUNT);
  });
});
