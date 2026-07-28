import { describe, expect, it } from "vitest";
import {
  applyListingFeesToSubmission,
  defaultCoreListingFeeRows,
  legacyListingAmountsFromFees,
  listingFeesFromLegacyScalars,
  resolveListingFees,
  validateListingFeeRows,
} from "@/lib/listing-fees";
import { createDefaultListingSubmission, normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

describe("listing fees migration", () => {
  it("builds preset rows from legacy scalar fields", () => {
    const sub = createDefaultListingSubmission();
    sub.securityDeposit = "900";
    sub.moveInFee = "0";
    sub.parkingMonthly = "25";
    const fees = listingFeesFromLegacyScalars(sub);
    expect(fees.find((f) => f.presetId === "security_deposit")?.amount).toBe("900");
    expect(fees.find((f) => f.presetId === "parking_monthly")?.amount).toBe("25");
  });

  it("dual-writes legacy fields from unified fee rows", () => {
    const fees = defaultCoreListingFeeRows();
    const sec = fees.find((f) => f.presetId === "security_deposit");
    if (sec) sec.amount = "500";
    const legacy = legacyListingAmountsFromFees(fees);
    expect(legacy.securityDeposit).toBe("500");
  });

  it("derive payment at signing from dueAtSigning flags", () => {
    const sub = createDefaultListingSubmission();
    const fees = resolveListingFees(sub).map((f) =>
      f.presetId === "move_in_fee" ? { ...f, dueAtSigning: false } : f,
    );
    const next = applyListingFeesToSubmission(sub, fees);
    expect(next.paymentAtSigningIncludes).toContain("security_deposit");
    expect(next.paymentAtSigningIncludes).not.toContain("move_in_fee");
  });

  it("normalizes older submissions into unified fees", () => {
    const sub = createDefaultListingSubmission();
    sub.customFees = [];
    sub.securityDeposit = "100";
    sub.moveInFee = "0";
    sub.parkingMonthly = "0";
    sub.hoaMonthly = "0";
    sub.otherMonthlyFees = "0";
    sub.monthToMonthSurcharge = "0";
    const n = normalizeManagerListingSubmissionV1(sub);
    expect(n.customFees?.some((f) => f.presetId === "security_deposit")).toBe(true);
    expect(n.securityDeposit).toBe("100");
  });

  it("validates required preset amounts", () => {
    const fees = defaultCoreListingFeeRows();
    const sec = fees.find((f) => f.presetId === "security_deposit");
    if (sec) sec.amount = "";
    const errs = validateListingFeeRows(fees);
    expect(Object.keys(errs).length).toBeGreaterThan(0);
  });
});
