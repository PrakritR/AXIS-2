/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  readHouseholdCharges,
  recordApprovedApplicationCharges,
  removeResidentHouseholdPaymentData,
} from "@/lib/household-charges";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow } from "@/lib/manager-applications-storage";

const MANAGER_ID = "mgr-short-term-charges";

function room(over: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  const base = createDefaultListingSubmission().rooms[0]!;
  return {
    ...base,
    id: "room-1",
    name: "Guest room",
    monthlyRent: 1200,
    ...over,
  } as ManagerRoomSubmission;
}

function seedShortTermListing(
  propertyId: string,
  opts?: { deposit?: string; moveIn?: string },
): MockProperty {
  const sub = createDefaultListingSubmission();
  sub.shortTermRentalsAllowed = true;
  sub.shortTermDailyCost = "85";
  sub.shortTermDeposit = opts?.deposit ?? "";
  sub.shortTermMoveInFee = opts?.moveIn ?? "";
  sub.applicationFee = "";
  sub.rooms = [room({ monthlyRent: 1200 })];
  sub.allowedLeaseTerms = ["12-Month"];
  const property: MockProperty = {
    id: propertyId,
    title: "Oak Street Guest Room",
    tagline: "Nightly stays welcome",
    address: "100 Oak St, Seattle, WA",
    zip: "98101",
    neighborhood: "Capitol Hill",
    beds: 1,
    baths: 1,
    rentLabel: "$85/night",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Oak Street Guest Room",
    unitLabel: "Guest room",
    adminPublishLive: true,
    managerUserId: MANAGER_ID,
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
  return property;
}

function shortTermApplicant(propertyId: string, email: string): DemoApplicantRow {
  return {
    id: `app-${email}`,
    name: "Guest Tenant",
    email,
    property: "Oak Street Guest Room",
    propertyId,
    assignedPropertyId: propertyId,
    assignedRoomChoice: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
    managerUserId: MANAGER_ID,
    application: {
      propertyId,
      roomChoice1: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
      rentalType: "short_term",
      leaseStart: "2026-03-10",
      leaseEnd: "2026-03-16",
      fullLegalName: "Guest Tenant",
    },
  } as unknown as DemoApplicantRow;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("short-term approved-application charges", () => {
  it("creates one stay total charge (nights × nightly rate), not monthly rent lines", () => {
    const email = "short-guest@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-short-term-stay";
    seedShortTermListing(propertyId);

    recordApprovedApplicationCharges(shortTermApplicant(propertyId, email), MANAGER_ID, true);

    const charges = readHouseholdCharges().filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase());
    const stay = charges.find((c) => c.kind === "stay_total");
    expect(stay?.amountLabel).toBe("$595.00");
    expect(stay?.title).toBe("Stay total (7 nights × $85)");
    expect(stay?.dueDateLabel).toBe("Before check-in");
    expect(charges.some((c) => c.kind === "first_month_rent" || c.kind === "prorated_rent")).toBe(false);
    expect(charges.some((c) => c.kind === "rent" && c.recurringRentProfileId)).toBe(false);
  });

  it("defaults deposit and move-in fee to off ($0 charges)", () => {
    const email = "short-no-fees@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-short-term-defaults";
    seedShortTermListing(propertyId);

    recordApprovedApplicationCharges(shortTermApplicant(propertyId, email), MANAGER_ID, true);

    const charges = readHouseholdCharges().filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase());
    expect(charges.find((c) => c.kind === "security_deposit")).toBeUndefined();
    expect(charges.find((c) => c.kind === "move_in_fee")).toBeUndefined();
  });

  it("adds optional short-term deposit and cleaning/move-in fee when configured", () => {
    const email = "short-with-fees@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-short-term-fees";
    seedShortTermListing(propertyId, { deposit: "100", moveIn: "40" });

    recordApprovedApplicationCharges(shortTermApplicant(propertyId, email), MANAGER_ID, true);

    const charges = readHouseholdCharges().filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase());
    expect(charges.find((c) => c.kind === "security_deposit")?.amountLabel).toBe("$100.00");
    expect(charges.find((c) => c.kind === "move_in_fee")?.amountLabel).toBe("$40.00");
  });

  it("uses manager rent override as nightly rate when regenerating stay total", () => {
    const email = "short-override@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-short-term-override";
    seedShortTermListing(propertyId);

    const base = shortTermApplicant(propertyId, email);
    recordApprovedApplicationCharges(base, MANAGER_ID, true);
    expect(
      readHouseholdCharges()
        .filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase())
        .find((c) => c.kind === "stay_total")?.amountLabel,
    ).toBe("$595.00");

    const edited = {
      ...base,
      signedMonthlyRent: 225,
      application: {
        ...base.application!,
        managerRentOverride: "225",
      },
    } as DemoApplicantRow;
    recordApprovedApplicationCharges(edited, MANAGER_ID, true);

    const stay = readHouseholdCharges()
      .filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase())
      .find((c) => c.kind === "stay_total");
    expect(stay?.amountLabel).toBe("$1,575.00");
    expect(stay?.title).toBe("Stay total (7 nights × $225)");
  });
});

describe("long-term path unchanged", () => {
  it("still creates first-month rent for standard leases", () => {
    const email = "long-term-tenant@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-long-term-unchanged";
    seedShortTermListing(propertyId);

    const row = shortTermApplicant(propertyId, email);
    row.application = { ...row.application!, rentalType: "standard", leaseEnd: "2026-06-12" };

    recordApprovedApplicationCharges(row, MANAGER_ID, true);

    const charges = readHouseholdCharges().filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase());
    expect(charges.some((c) => c.kind === "stay_total")).toBe(false);
    expect(charges.some((c) => c.kind === "first_month_rent" || c.kind === "prorated_rent")).toBe(true);
  });
});
