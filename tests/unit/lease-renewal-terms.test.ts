import { describe, expect, it } from "vitest";
import {
  renewalLeaseTermOptionsForProperty,
  renewalRentalTypeForTerm,
} from "@/lib/lease-renewal-terms";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";

describe("renewalRentalTypeForTerm", () => {
  it("maps short-term stay to short_term rental type", () => {
    expect(renewalRentalTypeForTerm(SHORT_TERM_LEASE_TERM)).toBe("short_term");
  });

  it("maps standard lease terms to standard rental type", () => {
    expect(renewalRentalTypeForTerm("12-Month")).toBe("standard");
    expect(renewalRentalTypeForTerm("Month-to-Month")).toBe("standard");
  });
});

describe("renewalLeaseTermOptionsForProperty", () => {
  it("includes 6-Month in the default fallback set", () => {
    const options = renewalLeaseTermOptionsForProperty("");
    expect(options).toContain("6-Month");
    expect(options).toContain("Month-to-Month");
    expect(options).toContain(SHORT_TERM_LEASE_TERM);
    expect(options.indexOf("Custom")).toBeGreaterThan(options.indexOf(SHORT_TERM_LEASE_TERM));
  });
});
