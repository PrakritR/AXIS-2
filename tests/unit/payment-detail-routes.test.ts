import { describe, expect, it } from "vitest";
import { legacyChargeIdAliases, publicChargeIdForUrl } from "@/lib/household-charges";
import { paymentDetailHref, paymentListHref } from "@/lib/portal-detail-routes";

describe("paymentDetailHref", () => {
  it("builds list and detail paths from portal base (no double /payments)", () => {
    expect(paymentListHref("/portal", "incoming", "pending")).toBe("/portal/payments/incoming/pending");
    expect(paymentDetailHref("/portal", "incoming", "pending", "hc_app_pl_demo_prorated_rent")).toBe(
      "/portal/payments/incoming/pending/hc_app_pl_demo_prorated_rent",
    );
  });

  it("does not duplicate payments when base is already /portal", () => {
    const href = paymentDetailHref("/portal", "incoming", "pending", "chg-1");
    expect(href).not.toContain("/payments/payments/");
  });
});

describe("publicChargeIdForUrl", () => {
  it("replaces legacy axis slug segments with pl_", () => {
    expect(publicChargeIdForUrl("hc_app_axis_demosofid_prorated_rent")).toBe(
      "hc_app_pl_demosofid_prorated_rent",
    );
  });

  it("legacyChargeIdAliases resolves both forms", () => {
    const legacy = "hc_app_axis_demosofid_prorated_rent";
    const branded = "hc_app_pl_demosofid_prorated_rent";
    expect(legacyChargeIdAliases(legacy)).toEqual(expect.arrayContaining([legacy, branded]));
    expect(legacyChargeIdAliases(branded)).toEqual(expect.arrayContaining([legacy, branded]));
  });
});
