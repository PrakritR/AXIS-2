import { describe, expect, it } from "vitest";

import type { HouseholdCharge } from "@/lib/household-charges";
import {
  matchChargeByContext,
  memoMatchesProperty,
  payerNameMatchesResident,
} from "@/lib/payment-receipt-email/receipt-fallback-match";

function charge(overrides: Partial<HouseholdCharge>): HouseholdCharge {
  return {
    id: "hc_1",
    createdAt: "2026-07-01T00:00:00.000Z",
    residentEmail: "junaid@example.com",
    residentName: "Junaid Mohammed",
    residentUserId: "resident-1",
    propertyId: "mgr-5257-brooklyn",
    propertyLabel: "5257 Brooklyn Avenue",
    managerUserId: "mgr-1",
    kind: "application_fee",
    title: "Application fee",
    amountLabel: "$50.00",
    balanceLabel: "$50.00",
    status: "pending",
    blocksLeaseUntilPaid: false,
    ...overrides,
  };
}

describe("payerNameMatchesResident", () => {
  it("matches on first + last name overlap", () => {
    expect(payerNameMatchesResident("Junaid Mohammed", "Junaid Mohammed")).toBe(true);
    expect(payerNameMatchesResident("Junaid Mohammed", "Junaid A Mohammed")).toBe(true);
  });

  it("does not match on a single shared token", () => {
    expect(payerNameMatchesResident("Junaid Smith", "Junaid Mohammed")).toBe(false);
    expect(payerNameMatchesResident("Junaid", "Junaid Mohammed")).toBe(false);
  });

  it("does not let a duplicated payer token count as first + last", () => {
    expect(payerNameMatchesResident("Junaid Junaid", "Junaid Mohammed")).toBe(false);
  });

  it("returns false for a null payer name", () => {
    expect(payerNameMatchesResident(null, "Junaid Mohammed")).toBe(false);
  });
});

describe("memoMatchesProperty", () => {
  it("matches when the memo carries the street number and a distinctive word", () => {
    expect(
      memoMatchesProperty("Application fee for room 5 at 5257 Brooklyn avenue", "5257 Brooklyn Avenue"),
    ).toBe(true);
  });

  it("does not match on a generic street word alone (no street number)", () => {
    expect(memoMatchesProperty("rent for the avenue place", "5257 Brooklyn Avenue")).toBe(false);
  });

  it("matches abbreviated street words in the memo", () => {
    expect(memoMatchesProperty("Application fee at 5257 Brooklyn ave", "5257 Brooklyn Avenue")).toBe(true);
  });

  it("does not match on the number alone", () => {
    expect(memoMatchesProperty("here is 5257 dollars", "5257 Brooklyn Avenue")).toBe(false);
  });
});

describe("matchChargeByContext", () => {
  it("matches the captain's real Venmo receipt on name + property", () => {
    const result = matchChargeByContext([charge({})], {
      amountCents: 5000,
      payerName: "Junaid Mohammed",
      memoText: "Junaid Mohammed paid you $50.00 Application fee for room 5 at 5257 Brooklyn avenue",
    });
    expect(result).toEqual({ kind: "matched", charge: expect.objectContaining({ id: "hc_1" }) });
  });

  it("returns none when no charge shares the amount", () => {
    const result = matchChargeByContext([charge({})], {
      amountCents: 12345,
      payerName: "Junaid Mohammed",
      memoText: "5257 Brooklyn avenue",
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("is ambiguous when two same-amount charges both match identity", () => {
    const a = charge({ id: "hc_a" });
    const b = charge({ id: "hc_b", title: "Holding deposit", kind: "holding_deposit" });
    const result = matchChargeByContext([a, b], {
      amountCents: 5000,
      payerName: "Junaid Mohammed",
      memoText: "Junaid Mohammed 5257 Brooklyn avenue",
    });
    expect(result).toEqual({ kind: "ambiguous", matchCount: 2 });
  });

  it("is ambiguous (never auto-credited) when the amount matches but identity does not", () => {
    const result = matchChargeByContext([charge({})], {
      amountCents: 5000,
      payerName: "Someone Else",
      memoText: "thanks",
    });
    expect(result).toEqual({ kind: "ambiguous", matchCount: 1 });
  });
});
