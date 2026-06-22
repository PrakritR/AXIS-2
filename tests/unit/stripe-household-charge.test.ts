import { describe, expect, it } from "vitest";
import {
  axisAchPlatformFeeCents,
  householdChargeAmountCents,
  isHouseholdChargeCheckoutSession,
} from "@/lib/stripe-household-charge";
import type { HouseholdCharge } from "@/lib/household-charges";

describe("stripe-household-charge", () => {
  it("calculates ACH platform fee", () => {
    expect(axisAchPlatformFeeCents(10000)).toBe(80);
    expect(axisAchPlatformFeeCents(0)).toBe(0);
  });

  it("parses charge amount cents", () => {
    const charge = { balanceLabel: "$150.00", amountLabel: "$150.00" } as HouseholdCharge;
    expect(householdChargeAmountCents(charge)).toBe(15000);
  });

  it("identifies household charge checkout sessions", () => {
    expect(isHouseholdChargeCheckoutSession({ metadata: { purpose: "household_charge" } } as never)).toBe(true);
    expect(isHouseholdChargeCheckoutSession({ metadata: {} } as never)).toBe(false);
  });
});
