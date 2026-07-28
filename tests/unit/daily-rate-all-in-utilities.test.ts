/**
 * @vitest-environment jsdom
 *
 * The daily rate is ALL-IN. Two guarantees, both money-path:
 *  1. Normalization FOLDS a stored separate `dailyUtilitiesRate` into `dailyRentRate`
 *     (rent += utilities) and clears the source — idempotently (folding twice must not
 *     add it again).
 *  2. Charge generation for a daily-rate-prorated month bills the all-in daily rent and
 *     does NOT add a prorated utilities line on top (no double-bill), even when the room
 *     carries a monthly utilities estimate. Auto proration still bills utilities.
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

const MANAGER_ID = "mgr-all-in-daily";

function room(over: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  const base = createDefaultListingSubmission().rooms[0]!;
  return {
    ...base,
    id: "room-1",
    name: "Room 1",
    availability: "Available now",
    moveInAvailableDate: "2026-01-01",
    monthlyRent: 1200,
    utilitiesEstimate: "",
    ...over,
  } as ManagerRoomSubmission;
}

function seed(propertyId: string, r: ManagerRoomSubmission): void {
  const sub = createDefaultListingSubmission();
  sub.rooms = [r];
  const property: MockProperty = {
    id: propertyId,
    title: "All-in Loft",
    tagline: "",
    address: "1 Pike St, Seattle, WA",
    zip: "98101",
    neighborhood: "Belltown",
    beds: 1,
    baths: 1,
    rentLabel: "$1,200/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "All-in Loft",
    unitLabel: "Room 1",
    adminPublishLive: true,
    managerUserId: MANAGER_ID,
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
}

function applicantRow(propertyId: string, email: string, leaseStart: string, leaseEnd: string): DemoApplicantRow {
  return {
    id: `app-${email}`,
    name: "Dana Tenant",
    email,
    property: "All-in Loft",
    propertyId,
    assignedPropertyId: propertyId,
    assignedRoomChoice: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
    managerUserId: MANAGER_ID,
    application: {
      propertyId,
      roomChoice1: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
      leaseStart,
      leaseEnd,
      fullLegalName: "Dana Tenant",
    },
  } as unknown as DemoApplicantRow;
}

function chargesFor(email: string) {
  return readHouseholdCharges().filter((c) => c.residentEmail.toLowerCase() === email.toLowerCase());
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("normalization — daily utilities folded into the daily rate, idempotently", () => {
  it("folds dailyUtilitiesRate into dailyRentRate and clears the source", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [room({ prorateMethod: "daily_rate", dailyRentRate: 40, dailyUtilitiesRate: 6 })];
    const once = normalizeManagerListingSubmissionV1(sub);
    expect(once.rooms[0]!.dailyRentRate).toBe(46); // 40 rent + 6 utilities, all-in
    expect(once.rooms[0]!.dailyUtilitiesRate).toBeUndefined();

    // Idempotent: re-normalizing the already-folded submission must NOT add utilities again.
    const twice = normalizeManagerListingSubmissionV1(once);
    expect(twice.rooms[0]!.dailyRentRate).toBe(46);
    expect(twice.rooms[0]!.dailyUtilitiesRate).toBeUndefined();
  });
});

describe("charge generation — daily rate is all-in, no double-billed utilities", () => {
  it("bills only the all-in daily rent for a prorated month, never a separate utilities line", () => {
    const email = "allin@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-all-in";
    // Room has BOTH a daily rate AND a monthly utilities estimate — the trap for a double-bill.
    seed(propertyId, room({ prorateMethod: "daily_rate", dailyRentRate: 40, dailyUtilitiesRate: 6, utilitiesEstimate: "150" }));

    // Lease Mar 10 → Mar 25 2026: a single partial month, daily-rate prorated.
    recordApprovedApplicationCharges(applicantRow(propertyId, email, "2026-03-10", "2026-03-25"), MANAGER_ID, true);
    const charges = chargesFor(email);

    // No utilities / prorated_utilities charge at all — utilities are inside the daily rate.
    expect(charges.some((c) => c.kind === "utilities" || c.kind === "prorated_utilities")).toBe(false);
    // The rent line bills the all-in folded rate (46/day), not 40.
    const rent = charges.find((c) => c.kind === "rent" || c.kind === "prorated_rent");
    expect(rent?.title).toContain("$46/day");
  });

  it("auto proration still bills utilities separately (long-term utilities unchanged)", () => {
    const email = "auto-utils@example.com";
    removeResidentHouseholdPaymentData(email);
    const propertyId = "prop-auto-utils";
    seed(propertyId, room({ prorateMethod: "auto", utilitiesEstimate: "150" }));

    recordApprovedApplicationCharges(applicantRow(propertyId, email, "2026-03-10", "2027-03-09"), MANAGER_ID, true);
    const charges = chargesFor(email);
    // Auto listings keep a real utilities line.
    expect(charges.some((c) => c.kind === "utilities" || c.kind === "prorated_utilities")).toBe(true);
  });
});
