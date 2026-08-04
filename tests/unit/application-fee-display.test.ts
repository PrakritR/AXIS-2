import { describe, expect, it } from "vitest";
import {
  applicationFeeChargeLabel,
  applicationFeeReviewNote,
  applicationFeeWaiverExplanation,
  publishedApplicationFeeLabel,
} from "@/lib/rental-application/application-fee-display";

/**
 * F-FIN-1 / resident F8: the Review step printed the listing's published
 * `$50.00` while the very next screen said no fee was required. An applicant
 * must never read two different numbers for the same charge.
 */

const WAIVED_BY_POLICY = { needsFee: false, paid: true, displayLabel: "$50.00", waived: true };
const FEE_DUE = { needsFee: true, paid: false, displayLabel: "$50.00", waived: false };

describe("application fee copy is derived once (F8)", () => {
  it("Review shows $0.00 when the fee is waived, not the listing's published amount", () => {
    expect(applicationFeeChargeLabel(WAIVED_BY_POLICY)).toBe("$0.00");
    expect(applicationFeeChargeLabel(FEE_DUE)).toBe("$50.00");
  });

  it("Review states the waiver in the SAME words the fee step uses", () => {
    const note = applicationFeeReviewNote(WAIVED_BY_POLICY, false);
    const stepCopy = applicationFeeWaiverExplanation(WAIVED_BY_POLICY, false);
    expect(stepCopy).toBe(
      "No application fee is required. Your first application fee already covers additional applications.",
    );
    expect(note).toContain(stepCopy);
    // …and still names the listing's published fee, so the $50 on screen is explained.
    expect(note).toContain("$50.00");
  });

  it("a redeemed waiver code beats the policy waiver in both places", () => {
    expect(applicationFeeWaiverExplanation(WAIVED_BY_POLICY, true)).toBe(
      "No application fee is due — your waiver code covers it in full.",
    );
    expect(applicationFeeReviewNote(WAIVED_BY_POLICY, true)).toContain("waiver code");
  });

  it("claims nothing while the server fee preview is still in flight", () => {
    const pending = { needsFee: true, paid: false, displayLabel: "…", waived: false, pending: true };
    expect(applicationFeeChargeLabel(pending)).toBe("…");
    expect(applicationFeeReviewNote(pending, false)).toBeNull();
    expect(publishedApplicationFeeLabel(pending)).toBeNull();
  });

  it("a listing that publishes no fee says so without inventing an amount", () => {
    const noFee = { needsFee: false, paid: true, displayLabel: "—", waived: false };
    expect(applicationFeeChargeLabel(noFee)).toBe("$0.00");
    expect(applicationFeeReviewNote(noFee, false)).toBe("No application fee is required for this listing.");
  });

  it("an already-paid fee is labelled paid rather than left as a bare amount", () => {
    expect(applicationFeeReviewNote({ ...FEE_DUE, paid: true }, false)).toBe("Already paid.");
    expect(applicationFeeReviewNote(FEE_DUE, false)).toBeNull();
  });
});
