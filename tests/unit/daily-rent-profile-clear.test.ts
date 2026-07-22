/**
 * @vitest-environment jsdom
 *
 * A recurring rent profile must not keep billing per day after its room is
 * switched back to monthly pricing. `upsertRecurringRentProfile` inherits an
 * omitted `dailyRentPrice`, so the approval path passes an explicit `0` for a
 * monthly room — that 0 has to CLEAR the stored daily rate, not be ignored.
 */
import { describe, expect, it } from "vitest";
import { upsertRecurringRentProfile } from "@/lib/household-charges";

function baseProfileInput(suffix: string) {
  return {
    residentEmail: `daily-clear-${suffix}@example.com`,
    residentName: "Daily Tenant",
    propertyId: `prop-daily-clear-${suffix}`,
    propertyLabel: "Test Property",
    roomLabel: "Room 1",
    managerUserId: "mgr-1",
  };
}

describe("recurring rent profile — daily rate lifecycle", () => {
  it("stores a positive daily rate for a daily-priced room", () => {
    const profile = upsertRecurringRentProfile({
      ...baseProfileInput("store"),
      monthlyRent: 0,
      dailyRentPrice: 40,
    });
    expect(profile?.dailyRentPrice).toBe(40);
  });

  it("clears the daily rate when the room switches back to monthly (explicit 0)", () => {
    const input = baseProfileInput("switch");
    const daily = upsertRecurringRentProfile({ ...input, monthlyRent: 0, dailyRentPrice: 40 });
    expect(daily?.dailyRentPrice).toBe(40);

    const monthly = upsertRecurringRentProfile({ ...input, monthlyRent: 825, dailyRentPrice: 0 });
    expect(monthly?.dailyRentPrice).toBeUndefined();
    expect(monthly?.monthlyRent).toBe(825);
  });

  it("keeps the existing daily rate when the field is omitted entirely", () => {
    const input = baseProfileInput("omit");
    upsertRecurringRentProfile({ ...input, monthlyRent: 0, dailyRentPrice: 40 });

    const again = upsertRecurringRentProfile({ ...input, monthlyRent: 0 });
    expect(again?.dailyRentPrice).toBe(40);
  });

  it("never sets a daily rate on a plain monthly profile", () => {
    const profile = upsertRecurringRentProfile({
      ...baseProfileInput("monthly"),
      monthlyRent: 825,
      dailyRentPrice: 0,
    });
    expect(profile?.dailyRentPrice).toBeUndefined();
  });
});
