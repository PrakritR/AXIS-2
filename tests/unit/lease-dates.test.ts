import { describe, expect, it } from "vitest";
import {
  computeLeaseEndDate,
  normalizeIsoDateInput,
  resolvePlacementLeaseDates,
} from "@/lib/rental-application/lease-dates";

describe("lease-dates", () => {
  it("normalizes slash dates for date inputs", () => {
    expect(normalizeIsoDateInput("6/1/2026")).toBe("2026-06-01");
    expect(normalizeIsoDateInput("2026-06-01")).toBe("2026-06-01");
  });

  it("computes lease end from fixed terms", () => {
    expect(computeLeaseEndDate("2026-06-01", "3-Month")).toBe("2026-08-31");
    expect(computeLeaseEndDate("2026-06-01", "12-Month")).toBe("2027-05-31");
  });

  it("fills missing lease end when placement dates are resolved", () => {
    expect(
      resolvePlacementLeaseDates({
        leaseTerm: "3-Month",
        leaseStart: "6/1/2026",
        leaseEnd: "",
        rentalType: "standard",
      }),
    ).toEqual({
      leaseTerm: "3-Month",
      leaseStart: "2026-06-01",
      leaseEnd: "2026-08-31",
    });
  });
});
