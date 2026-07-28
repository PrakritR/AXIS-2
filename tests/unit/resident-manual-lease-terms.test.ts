import { describe, expect, it } from "vitest";
import {
  listingLeaseTermToResidentValue,
  residentLeaseTermSelectValue,
  RESIDENT_LEASE_TERM_CUSTOM,
  normalizeApplicationLeaseTerm,
  residentLeaseTermToApplicationFields,
  shouldUseResidentLeaseCustomMode,
} from "@/lib/resident-manual-lease-terms";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";

describe("resident manual lease terms", () => {
  const presets = ["Month-to-month", "12 months", "3 months", SHORT_TERM_LEASE_TERM] as const;

  it("maps listing canonical labels to resident dropdown values", () => {
    expect(listingLeaseTermToResidentValue("Month-to-Month")).toBe("Month-to-month");
    expect(listingLeaseTermToResidentValue("12-Month")).toBe("12 months");
    expect(listingLeaseTermToResidentValue(SHORT_TERM_LEASE_TERM)).toBe(SHORT_TERM_LEASE_TERM);
  });

  it("keeps custom mode selected even when the text field is empty", () => {
    expect(residentLeaseTermSelectValue("", true, presets)).toBe(RESIDENT_LEASE_TERM_CUSTOM);
  });

  it("detects custom mode from non-preset stored values", () => {
    expect(shouldUseResidentLeaseCustomMode("18 months", presets)).toBe(true);
    expect(shouldUseResidentLeaseCustomMode("12 months", presets)).toBe(false);
  });
});

  it("maps resident lease choices to application fields for template generation", () => {
    expect(residentLeaseTermToApplicationFields("12 months", false)).toEqual({
      leaseTerm: "12-Month",
      rentalType: "standard",
    });
    expect(residentLeaseTermToApplicationFields(SHORT_TERM_LEASE_TERM, false)).toEqual({
      leaseTerm: SHORT_TERM_LEASE_TERM,
      rentalType: "short_term",
    });
    expect(normalizeApplicationLeaseTerm("Month-to-month")).toBe("Month-to-Month");
  });
