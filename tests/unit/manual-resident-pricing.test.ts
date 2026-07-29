/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { resolveManualResidentPlacementValues } from "@/lib/rental-application/placement-values";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import type { MockProperty } from "@/data/types";

const MANAGER_ID = "mgr-manual-resident";

function room(over: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  const base = createDefaultListingSubmission().rooms[0]!;
  return {
    ...base,
    id: "room-1",
    name: "Room A",
    monthlyRent: 900,
    utilitiesEstimate: "150",
    securityDeposit: "900",
    moveInFee: "200",
    shortTermRent: "225",
    shortTermDeposit: "100",
    shortTermMoveInFee: "50",
    ...over,
  } as ManagerRoomSubmission;
}

function seed(propertyId: string, r: ManagerRoomSubmission, listingExtras?: Record<string, string>): MockProperty {
  const sub = createDefaultListingSubmission();
  sub.rooms = [r];
  sub.securityDeposit = "800";
  sub.moveInFee = "150";
  sub.shortTermDailyCost = "200";
  sub.shortTermDeposit = "75";
  sub.shortTermMoveInFee = "25";
  if (listingExtras) {
    for (const [k, v] of Object.entries(listingExtras)) {
      (sub as Record<string, unknown>)[k] = v;
    }
  }
  const property: MockProperty = {
    id: propertyId,
    title: "Test House",
    tagline: "",
    address: "4709A 8th Ave NE, Seattle, WA",
    zip: "98105",
    neighborhood: "U District",
    beds: 1,
    baths: 1,
    rentLabel: "$900/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Test House",
    unitLabel: "Room A",
    adminPublishLive: true,
    managerUserId: MANAGER_ID,
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
  return property;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("resolveManualResidentPlacementValues", () => {
  it("fills long-term rent, utilities, and room-first fees", () => {
    const propertyId = "prop-lt";
    seed(propertyId, room({}));

    const v = resolveManualResidentPlacementValues({
      propertyId,
      roomId: "room-1",
      leaseTerm: "12 months",
      leaseTermCustomMode: false,
    });
    expect(v?.rentalType).toBe("standard");
    expect(v?.rent).toBe("900");
    expect(Number(v?.utilities)).toBeGreaterThan(0);
    expect(v?.securityDeposit).toBe("900");
    expect(v?.moveInFee).toBe("200");
  });

  it("fills short-term daily rate with zero utilities and room short-term fees", () => {
    const propertyId = "prop-st";
    seed(propertyId, room({}));

    const v = resolveManualResidentPlacementValues({
      propertyId,
      roomId: "room-1",
      leaseTerm: SHORT_TERM_LEASE_TERM,
      leaseTermCustomMode: false,
    });
    expect(v?.rentalType).toBe("short_term");
    expect(v?.rent).toBe("225");
    expect(v?.utilities).toBe("0");
    expect(v?.securityDeposit).toBe("100");
    expect(v?.moveInFee).toBe("50");
  });

  it("uses listing short-term defaults when the room has no short-term overrides", () => {
    const propertyId = "prop-st-listing";
    seed(
      propertyId,
      room({ shortTermRent: "", shortTermDeposit: "", shortTermMoveInFee: "" }),
    );

    const v = resolveManualResidentPlacementValues({
      propertyId,
      roomId: "room-1",
      leaseTerm: SHORT_TERM_LEASE_TERM,
      leaseTermCustomMode: false,
    });
    expect(v?.rent).toBe("200");
    expect(v?.securityDeposit).toBe("75");
    expect(v?.moveInFee).toBe("25");
  });
});
