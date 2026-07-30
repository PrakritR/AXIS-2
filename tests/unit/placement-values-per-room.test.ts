/**
 * @vitest-environment jsdom
 *
 * The placement PREVIEW (resolvePlacementValuesForRow) must show exactly what will bill.
 * It previously showed the LISTING deposit/move-in even when the booked room had its own —
 * disagreeing with recordApprovedApplicationCharges (room-first). This pins the alignment.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolvePlacementValuesForRow } from "@/lib/rental-application/placement-values";
import { cachePublicExtraListings } from "@/lib/demo-property-pipeline";
import {
  createDefaultListingSubmission,
  normalizeManagerListingSubmissionV1,
  type ManagerRoomSubmission,
} from "@/lib/manager-listing-submission";
import { LISTING_ROOM_CHOICE_SEP } from "@/lib/rental-application/data";
import type { MockProperty } from "@/data/types";

const MANAGER_ID = "mgr-placement-preview";

function room(over: Partial<ManagerRoomSubmission>): ManagerRoomSubmission {
  const base = createDefaultListingSubmission().rooms[0]!;
  return { ...base, id: "room-1", name: "Room 1", monthlyRent: 1200, utilitiesEstimate: "", ...over } as ManagerRoomSubmission;
}

function seed(propertyId: string, r: ManagerRoomSubmission, listingDeposit: string, listingMoveIn = ""): MockProperty {
  const sub = createDefaultListingSubmission();
  sub.rooms = [r];
  sub.securityDeposit = listingDeposit;
  sub.moveInFee = listingMoveIn;
  const property: MockProperty = {
    id: propertyId,
    title: "Preview House",
    tagline: "",
    address: "1500 Pike St, Seattle, WA",
    zip: "98101",
    neighborhood: "Belltown",
    beds: 1,
    baths: 1,
    rentLabel: "$1,200/mo",
    available: "Now",
    petFriendly: false,
    buildingId: "b1",
    buildingName: "Preview House",
    unitLabel: "Room 1",
    adminPublishLive: true,
    managerUserId: MANAGER_ID,
    listingSubmission: normalizeManagerListingSubmissionV1(sub),
  };
  cachePublicExtraListings([property], { silent: true });
  return property;
}

function rowFor(propertyId: string) {
  return {
    assignedPropertyId: propertyId,
    assignedRoomChoice: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
    propertyId,
    property: "Preview House",
    signedMonthlyRent: 1200,
    application: {
      propertyId,
      roomChoice1: `${propertyId}${LISTING_ROOM_CHOICE_SEP}room-1`,
      leaseTerm: "12-Month",
      leaseStart: "2026-03-01",
      leaseEnd: "2027-02-28",
    },
  } as Parameters<typeof resolvePlacementValuesForRow>[0];
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("placement preview — room-first deposit/move-in", () => {
  it("previews the room's own deposit and move-in, not the listing amount", () => {
    const propertyId = "prop-preview-room";
    seed(propertyId, room({ securityDeposit: "1500", moveInFee: "300" }), "1000", "150");

    const v = resolvePlacementValuesForRow(rowFor(propertyId));
    expect(v.securityDeposit).toBe(1500);
    expect(v.moveInFee).toBe(300);
  });

  it("falls back to the listing amount when the room has none", () => {
    const propertyId = "prop-preview-listing";
    seed(propertyId, room({ securityDeposit: undefined, moveInFee: undefined }), "1000", "150");

    const v = resolvePlacementValuesForRow(rowFor(propertyId));
    expect(v.securityDeposit).toBe(1000);
    expect(v.moveInFee).toBe(150);
  });
});
