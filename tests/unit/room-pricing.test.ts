import { describe, expect, it } from "vitest";
import {
  DAILY_RENT_MONTH_ESTIMATE_DAYS,
  roomDailyRentPrice,
  roomHeadlineAmount,
  roomHeadlinePriceLabel,
  roomIsDailyPriced,
  roomMonthlyEquivalent,
  roomPricePeriod,
  roomPricePeriodSuffix,
} from "@/lib/room-pricing";

describe("room-pricing helpers", () => {
  it("treats a room with no rentBasis as monthly (backward compatible)", () => {
    const room = { monthlyRent: 825 };
    expect(roomIsDailyPriced(room)).toBe(false);
    expect(roomPricePeriod(room)).toBe("month");
    expect(roomPricePeriodSuffix(room)).toBe("/mo");
    expect(roomDailyRentPrice(room)).toBeUndefined();
    expect(roomHeadlineAmount(room)).toBe(825);
    expect(roomHeadlinePriceLabel(room)).toBe("$825/mo");
    expect(roomMonthlyEquivalent(room)).toBe(825);
  });

  it("does NOT treat a stored dailyRentPrice as active unless rentBasis is daily", () => {
    // A monthly room may carry a daily price hint; it must stay monthly.
    const room = { monthlyRent: 900, rentBasis: "monthly" as const, dailyRentPrice: 40 };
    expect(roomIsDailyPriced(room)).toBe(false);
    expect(roomHeadlinePriceLabel(room)).toBe("$900/mo");
    expect(roomMonthlyEquivalent(room)).toBe(900);
  });

  it("prices by the day only when rentBasis is daily and dailyRentPrice > 0", () => {
    const room = { monthlyRent: 0, rentBasis: "daily" as const, dailyRentPrice: 40 };
    expect(roomIsDailyPriced(room)).toBe(true);
    expect(roomPricePeriod(room)).toBe("day");
    expect(roomPricePeriodSuffix(room)).toBe("/day");
    expect(roomDailyRentPrice(room)).toBe(40);
    expect(roomHeadlineAmount(room)).toBe(40);
    expect(roomHeadlinePriceLabel(room)).toBe("$40/day");
    expect(roomMonthlyEquivalent(room)).toBe(40 * DAILY_RENT_MONTH_ESTIMATE_DAYS);
  });

  it("falls back to monthly when rentBasis is daily but the daily price is missing/zero", () => {
    const room = { monthlyRent: 700, rentBasis: "daily" as const, dailyRentPrice: 0 };
    expect(roomIsDailyPriced(room)).toBe(false);
    expect(roomHeadlinePriceLabel(room)).toBe("$700/mo");
  });

  it("formats non-integer daily rates with cents", () => {
    const room = { rentBasis: "daily" as const, dailyRentPrice: 42.5 };
    expect(roomHeadlinePriceLabel(room)).toBe("$42.50/day");
  });
});
