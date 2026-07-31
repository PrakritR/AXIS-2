import { describe, expect, it } from "vitest";
import { buildLeaseHtml } from "@/lib/lease-templates/build-lease-html";
import { SEATTLE_LEASE_CONFIG } from "@/lib/lease-templates/types";
import { createDefaultListingSubmission } from "@/lib/manager-listing-submission";
import type { LeaseGenerationContext } from "@/lib/generated-lease";
import { shortTermCheckoutDate } from "@/lib/short-term-stay-pricing";

describe("shortTermCheckoutDate", () => {
  it("returns checkout-exclusive end date from check-in and nights", () => {
    expect(shortTermCheckoutDate("2026-07-31", 4)).toBe("2026-08-04");
  });
});

describe("short-term lease payment section", () => {
  it("uses manager rent override and move-in fee in the payment table", () => {
    const submission = {
      ...createDefaultListingSubmission(),
      shortTermRentalsAllowed: true,
      shortTermDailyCost: "50",
      shortTermDeposit: "0",
      shortTermMoveInFee: "25",
      rooms: [
        {
          id: "room-7",
          name: "Room 7",
          monthlyRent: 800,
          shortTermRent: "50",
          shortTermDeposit: "0",
          shortTermMoveInFee: "25",
        },
      ],
    };
    const ctx: LeaseGenerationContext = {
      application: {
        fullLegalName: "Siva Narendra",
        rentalType: "short_term",
        leaseTerm: "Short-Term Stay",
        leaseStart: "2026-07-31",
        leaseEnd: "2026-08-04",
        roomChoice1: "prop-1::room-7",
        managerRentOverride: "225",
        managerSecurityDepositOverride: "0",
        managerMoveInFeeOverride: "0",
        __signedRentLabel: "$225.00",
      },
      leasedRoom: undefined,
      listingProperty: { id: "prop-1", title: "4709A 8th Ave N" } as LeaseGenerationContext["listingProperty"],
      submission,
      generatedAtIso: "2026-07-30T00:00:00.000Z",
    };

    const html = buildLeaseHtml(ctx, SEATTLE_LEASE_CONFIG);
    expect(html).toContain("Daily rent");
    expect(html).toContain("$225.00 per day");
    expect(html).toContain("Total rent for stay");
    expect(html).toContain("$900.00");
    expect(html).toContain("Move-in fee");
    expect(html).toContain("Deposit");
    expect(html).toContain("4 night");
  });
});
