import { describe, expect, it } from "vitest";
import {
  formatUtilitiesListingLine,
  leaseUtilitiesBillingConflictAmount,
  normalizeUtilitiesPaymentModel,
  resolveListingUtilitiesPaymentModel,
  utilitiesBillableMonthlyAmount,
  utilitiesListingSummaryLabel,
} from "@/lib/listing-utilities-payment";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

function baseSub(overrides: Partial<ManagerListingSubmissionV1> = {}): ManagerListingSubmissionV1 {
  return {
    v: 1,
    buildingName: "Test",
    address: "1 Main",
    zip: "98101",
    neighborhood: "Capitol Hill",
    homeStructureNote: "",
    tagline: "",
    petFriendly: false,
    houseOverview: "",
    houseRulesText: "",
    rooms: [
      {
        id: "r1",
        name: "Room A",
        floor: "",
        monthlyRent: 900,
        availability: "Available",
        moveInAvailableDate: "",
        moveInInstructions: "",
        manualUnavailableRanges: [],
        detail: "",
        furnishing: "",
        roomAmenitiesText: "",
        photoDataUrls: [],
        videoDataUrl: null,
        utilitiesEstimate: "175",
        utilitiesPaymentModel: "manager_billed",
      },
    ],
    bathrooms: [],
    sharedSpaces: [],
    amenitiesText: "",
    applicationFee: "",
    securityDeposit: "",
    moveInFee: "",
    leaseTermsBody: "",
    bundles: [],
    quickFacts: [],
    customFees: [],
    customApplicationFields: [],
    ...overrides,
  };
}

describe("listing-utilities-payment", () => {
  it("normalizes unknown models to manager_billed", () => {
    expect(normalizeUtilitiesPaymentModel(undefined)).toBe("manager_billed");
    expect(normalizeUtilitiesPaymentModel("tenant_direct")).toBe("tenant_direct");
  });

  it("formats tenant direct and included lines", () => {
    expect(formatUtilitiesListingLine("tenant_direct", "150")).toBe("Tenant pays directly (~$150/mo typical)");
    expect(formatUtilitiesListingLine("tenant_direct")).toBe("Tenant pays directly");
    expect(formatUtilitiesListingLine("included_in_rent", "150")).toBe("Included in rent");
  });

  it("returns zero billable amount for tenant direct", () => {
    const sub = baseSub({
      rooms: [
        {
          ...baseSub().rooms[0]!,
          utilitiesPaymentModel: "tenant_direct",
          utilitiesEstimate: "200",
        },
      ],
    });
    expect(utilitiesBillableMonthlyAmount(sub, sub.rooms[0])).toBe(0);
    expect(resolveListingUtilitiesPaymentModel(sub, sub.rooms[0])).toBe("tenant_direct");
  });

  describe("leaseUtilitiesBillingConflictAmount", () => {
    const allIncluded = [
      { id: "u1", kind: "electricity", paidBy: "included_in_rent", setUpBy: "manager" },
      { id: "u2", kind: "water", paidBy: "manager", setUpBy: "manager" },
    ];

    it("flags a breakdown with no resident-paid row while rooms are manager-billed with an estimate", () => {
      expect(leaseUtilitiesBillingConflictAmount(baseSub({ leaseUtilities: allIncluded }))).toBe(175);
    });

    it("stays silent when any row is resident-paid", () => {
      const sub = baseSub({
        leaseUtilities: [...allIncluded, { id: "u3", kind: "gas", paidBy: "resident", setUpBy: "resident" }],
      });
      expect(leaseUtilitiesBillingConflictAmount(sub)).toBe(0);
    });

    it("stays silent when no breakdown is configured", () => {
      expect(leaseUtilitiesBillingConflictAmount(baseSub())).toBe(0);
      expect(leaseUtilitiesBillingConflictAmount(baseSub({ leaseUtilities: [] }))).toBe(0);
      expect(leaseUtilitiesBillingConflictAmount(undefined)).toBe(0);
    });

    it("stays silent when nothing is billed through the manager", () => {
      const rooms = [{ ...baseSub().rooms[0]!, utilitiesPaymentModel: "tenant_direct" as const }];
      expect(leaseUtilitiesBillingConflictAmount(baseSub({ rooms, leaseUtilities: allIncluded }))).toBe(0);
    });

    it("stays silent when manager-billed rooms carry no estimate", () => {
      const rooms = [{ ...baseSub().rooms[0]!, utilitiesEstimate: "" }];
      expect(leaseUtilitiesBillingConflictAmount(baseSub({ rooms, leaseUtilities: allIncluded }))).toBe(0);
    });

    it("uses the entire-home estimate for whole-unit listings", () => {
      const sub = baseSub({
        listingPlaceCategoryId: "entire_home",
        entireHomeMonthlyRent: 3000,
        entireHomeUtilitiesEstimate: "250",
        entireHomeUtilitiesPaymentModel: "manager_billed",
        leaseUtilities: allIncluded,
      });
      expect(leaseUtilitiesBillingConflictAmount(sub)).toBe(250);
    });
  });

  it("summarizes entire-home tenant direct", () => {
    const sub = baseSub({
      listingPlaceCategoryId: "entire_home",
      entireHomeMonthlyRent: 3000,
      entireHomeUtilitiesEstimate: "250",
      entireHomeUtilitiesPaymentModel: "tenant_direct",
    });
    expect(utilitiesListingSummaryLabel(sub)).toMatch(/Tenant pays directly/);
  });
});
