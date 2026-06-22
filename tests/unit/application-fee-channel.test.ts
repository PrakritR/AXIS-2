import { describe, expect, it } from "vitest";
import {
  createDefaultListingServiceOptions,
  createDefaultListingSubmission,
  isListingFeeAmountFilled,
  normalizeManagerListingSubmissionV1,
  resolveAllowedLeaseTerms,
} from "@/lib/manager-listing-submission";
import {
  listingApplicationFeeChannels,
  resolveApplicationFeePayChannel,
} from "@/lib/rental-application/application-fee-channel";

describe("manager-listing-submission new fields", () => {
  it("normalizes house move-in and application fee other fields", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      houseMoveInAvailableDate: "2026-07-01",
      houseMoveInInstructions: "Pick up keys at front desk.",
      applicationFeeOtherEnabled: true,
      applicationFeeOtherInstructions: "Pay by check at office.",
    });
    expect(sub.houseMoveInAvailableDate).toBe("2026-07-01");
    expect(sub.houseMoveInInstructions).toBe("Pick up keys at front desk.");
    expect(sub.applicationFeeOtherEnabled).toBe(true);
    expect(sub.applicationFeeOtherInstructions).toBe("Pay by check at office.");
  });

  it("createDefaultListingServiceOptions returns starter services", () => {
    const options = createDefaultListingServiceOptions();
    expect(options.length).toBeGreaterThanOrEqual(4);
    expect(options.every((o) => o.available)).toBe(true);
    expect(options.map((o) => o.name)).toContain("Weekly cleaning");
  });
});

describe("application-fee-channel", () => {
  it("resolves other channel when enabled with instructions", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      applicationFeeStripeEnabled: false,
      axisPaymentsEnabled: false,
      applicationFeeOtherEnabled: true,
      applicationFeeOtherInstructions: "Mail check to 123 Main St.",
    });
    const channels = listingApplicationFeeChannels(sub);
    expect(channels.other).toBe(true);
    expect(resolveApplicationFeePayChannel(sub, "other")).toBe("other");
  });

  it("includes zelle and venmo when contacts are set", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      zellePaymentsEnabled: true,
      zelleContact: "pay@example.com",
      applicationFeeZelleEnabled: true,
      venmoPaymentsEnabled: true,
      venmoContact: "@landlord",
      applicationFeeVenmoEnabled: true,
    });
    const channels = listingApplicationFeeChannels(sub);
    expect(channels.zelle).toBe(true);
    expect(channels.venmo).toBe(true);
  });

  it("enables ACH from application fee stripe toggle alone", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      applicationFeeStripeEnabled: true,
      axisPaymentsEnabled: false,
    });
    expect(listingApplicationFeeChannels(sub).ach).toBe(true);
  });
});

describe("listing fee and lease term helpers", () => {
  it("requires numeric fee amounts including zero", () => {
    expect(isListingFeeAmountFilled("0")).toBe(true);
    expect(isListingFeeAmountFilled("")).toBe(false);
    expect(isListingFeeAmountFilled("Waived")).toBe(false);
  });

  it("normalizes allowed lease terms from checkboxes", () => {
    const sub = normalizeManagerListingSubmissionV1({
      ...createDefaultListingSubmission(),
      allowedLeaseTerms: ["12-Month", "Month-to-Month"],
    });
    expect(resolveAllowedLeaseTerms(sub)).toEqual(["12-Month", "Month-to-Month"]);
    expect(sub.leaseTermsBody).toContain("12-Month");
  });
});
