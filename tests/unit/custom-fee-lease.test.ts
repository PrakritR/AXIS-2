import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { buildAiGeneratedLeaseHtml, leaseContextFromApplication } from "@/lib/generated-lease";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";

/**
 * Custom-fee billing must reach the LEASE ([key=custom-fee-billing], captain: "make sure it
 * updates lease aswell"). A one-time custom fee that bills must appear in the generated lease
 * charges by name and amount — a lease that omits a billed charge is a legal problem.
 */
describe("custom fees in the generated lease", () => {
  function leaseHtmlWithCustomFees(customFees: { id: string; label: string; amount: string; frequency: "one-time" | "monthly" }[]) {
    const ctx = leaseContextFromApplication(snapshotJordanLee());
    const sub = ctx.submission ?? createDefaultListingSubmission();
    return buildAiGeneratedLeaseHtml({
      ...ctx,
      leasedRoom: undefined,
      submission: { ...sub, customFees },
    });
  }

  it("lists a one-time custom fee's name and amount in the lease charges", () => {
    const html = leaseHtmlWithCustomFees([
      { id: "cf1", label: "Cleaning fee", amount: "125", frequency: "one-time" },
    ]);
    expect(html).toContain("Cleaning fee");
    expect(html).toContain("$125");
    // It appears in Exhibit A as a One-time item.
    expect(html).toMatch(/Cleaning fee<\/td><td>\$125\.00<\/td><td>One-time<\/td>/);
  });

  it("does NOT list a monthly custom fee (it does not bill yet — no unbilled fee on the lease)", () => {
    const html = leaseHtmlWithCustomFees([
      { id: "cf1", label: "Parking spot", amount: "100", frequency: "monthly" },
    ]);
    expect(html).not.toContain("Parking spot");
  });

  it("lists a short-term custom fee in the short-term stay's Payment table", () => {
    const ctx = leaseContextFromApplication(snapshotJordanLee());
    const sub = ctx.submission ?? createDefaultListingSubmission();
    const html = buildAiGeneratedLeaseHtml({
      ...ctx,
      leasedRoom: undefined,
      application: { ...ctx.application, rentalType: "short_term", leaseStart: "2026-03-10", leaseEnd: "2026-03-16" },
      submission: {
        ...sub,
        shortTermRentalsAllowed: true,
        shortTermDailyCost: "85",
        shortTermDeposit: "100",
        customFees: [{ id: "cf1", label: "Resort fee", amount: "", frequency: "one-time", shortTermAmount: "40" }],
      },
    });
    expect(html).toContain("Resort fee");
    expect(html).toContain("$40");
  });
});
