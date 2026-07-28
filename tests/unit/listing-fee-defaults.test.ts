import { describe, expect, it } from "vitest";
import {
  LISTING_FEE_CONTEXT_DEFAULTS,
  applyListingFeeContextDefaults,
  feeContextForBundleKind,
  resolveListingFeeContextDefaults,
} from "@/lib/listing-fee-defaults";

describe("listing fee defaults — per-context tuning surface", () => {
  it("gives group bundles and per-room DIFFERENT defaults", () => {
    // The whole point: renting as a group must not inherit the per-room defaults.
    expect(LISTING_FEE_CONTEXT_DEFAULTS.per_room.utilitiesEstimate).not.toBe(
      LISTING_FEE_CONTEXT_DEFAULTS.group_bundle.utilitiesEstimate,
    );
    expect(LISTING_FEE_CONTEXT_DEFAULTS.whole_house.utilitiesPaymentModel).toBe("tenant_direct");
    expect(LISTING_FEE_CONTEXT_DEFAULTS.per_room.utilitiesPaymentModel).toBe("manager_billed");
  });

  it("maps bundle-generation kinds to their fee context", () => {
    expect(feeContextForBundleKind("whole_house")).toBe("whole_house");
    expect(feeContextForBundleKind("multi_room")).toBe("group_bundle");
    expect(feeContextForBundleKind("custom")).toBe("group_bundle");
  });

  it("computes the deposit as months-of-rent for the context", () => {
    const d = resolveListingFeeContextDefaults("group_bundle", 4500);
    // group_bundle default is 1 month → deposit = one month of the bundle's rent.
    expect(d.securityDeposit).toBe("4500");
    expect(d.utilitiesPaymentModel).toBe("manager_billed");
    // No rent → no deposit default (nothing to scale off).
    expect(resolveListingFeeContextDefaults("group_bundle", 0).securityDeposit).toBe("");
  });

  it("fills empty fields but NEVER overwrites values the manager already typed", () => {
    const filled = applyListingFeeContextDefaults(
      { securityDeposit: "9999", utilitiesPaymentModel: "tenant_direct", utilitiesEstimate: "" },
      "group_bundle",
      4500,
    );
    // Manager-entered deposit + a resident-pays utilities choice are preserved.
    expect(filled.securityDeposit).toBe("9999");
    expect(filled.utilitiesPaymentModel).toBe("tenant_direct");
    // tenant_direct carries no estimate, so the default estimate is not injected.
    expect(filled.utilitiesEstimate ?? "").toBe("");

    const empty = applyListingFeeContextDefaults({}, "group_bundle", 4500);
    expect(empty.securityDeposit).toBe("4500");
    expect(empty.utilitiesPaymentModel).toBe("manager_billed");
    expect(empty.utilitiesEstimate).toBe(LISTING_FEE_CONTEXT_DEFAULTS.group_bundle.utilitiesEstimate);
  });

  it("whole-house defaults to resident-paid utilities (no estimate injected)", () => {
    const wh = applyListingFeeContextDefaults({}, "whole_house", 6000);
    expect(wh.utilitiesPaymentModel).toBe("tenant_direct");
    expect(wh.utilitiesEstimate ?? "").toBe("");
    expect(wh.securityDeposit).toBe("6000");
  });
});
