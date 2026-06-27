import { describe, expect, it } from "vitest";
import { evaluateVendorTaxProfile } from "@/lib/reports/queries";
import { managerSectionAllowedForTier } from "@/lib/manager-access";

describe("reports access", () => {
  it("gates documents to pro+ tiers", () => {
    expect(managerSectionAllowedForTier("documents", "free")).toBe(false);
    expect(managerSectionAllowedForTier("documents", "paid")).toBe(true);
    expect(managerSectionAllowedForTier("financials", "free")).toBe(false);
    expect(managerSectionAllowedForTier("payments", "free")).toBe(true);
  });

  it("flags incomplete vendor tax profiles", () => {
    const incomplete = evaluateVendorTaxProfile(null);
    expect(incomplete.complete).toBe(false);
    expect(incomplete.missingFields.length).toBeGreaterThan(0);

    const complete = evaluateVendorTaxProfile({
      legal_name: "Acme LLC",
      address_line1: "1 Main",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      tin_type: "ein",
      tin_ciphertext: "abc",
      w9_attestation: true,
    });
    expect(complete.complete).toBe(true);
  });
});
