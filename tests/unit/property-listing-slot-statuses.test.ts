/**
 * The plan's property cap counts LISTING SLOTS, and "listing slot" has to mean
 * the same thing on the server as it does in the portal.
 *
 * The portal's count is `countManagerManagedPropertiesForUser` — pending rows
 * plus the live catalog — and both of those come out of `propertyRowsToSnapshot`
 * (`pendingByUser` + `extrasByUser`). `LISTING_SLOT_PROPERTY_STATUSES` is the
 * server's copy of that answer, used by `POST /api/property-records`.
 *
 * This drives the real mapping so the two cannot drift: add a status that lands
 * in either of those two buckets without adding it to the slot list and this
 * fails, rather than the cap silently stopping counting it.
 */
import { describe, expect, it } from "vitest";
import {
  LISTING_SLOT_PROPERTY_STATUSES,
  propertyRowsToSnapshot,
  propertyStatusOccupiesListingSlot,
  type ManagerPropertyRecord,
  type ManagerPropertyRecordStatus,
} from "@/lib/persisted-property-records";

const ALL_STATUSES: ManagerPropertyRecordStatus[] = [
  "pending",
  "live",
  "review",
  "request_change",
  "unlisted",
  "rejected",
  "draft",
];

const OWNER = "mgr-owner-1";

function record(status: ManagerPropertyRecordStatus): ManagerPropertyRecord {
  const stub = { id: `row-${status}`, adminRefId: `row-${status}`, listingId: `row-${status}` };
  return {
    id: `row-${status}`,
    manager_user_id: OWNER,
    status,
    row_data: stub,
    property_data: stub,
    edit_request_note: null,
  };
}

/** True when this status shows up in the two buckets the portal's count reads. */
function countedByThePortal(status: ManagerPropertyRecordStatus): boolean {
  const snapshot = propertyRowsToSnapshot([record(status)]);
  const pending = snapshot.pendingByUser[OWNER]?.length ?? 0;
  const live = snapshot.extrasByUser[OWNER]?.length ?? 0;
  return pending + live > 0;
}

describe("LISTING_SLOT_PROPERTY_STATUSES", () => {
  it("matches exactly the statuses the portal counts as properties", () => {
    const fromSnapshot = ALL_STATUSES.filter(countedByThePortal);
    expect([...LISTING_SLOT_PROPERTY_STATUSES].sort()).toEqual([...fromSnapshot].sort());
  });

  it("charges published and in-flight listings", () => {
    expect(propertyStatusOccupiesListingSlot("live")).toBe(true);
    expect(propertyStatusOccupiesListingSlot("pending")).toBe(true);
    // `review` is treated as live by the snapshot ("listings are auto-published").
    expect(propertyStatusOccupiesListingSlot("review")).toBe(true);
  });

  it("charges nothing for a row the manager has not published", () => {
    // A draft is private and unpublished; an unlisted row is a listing already
    // taken down. Neither is a listing a prospect can see, and draft count is
    // deliberately uncapped.
    expect(propertyStatusOccupiesListingSlot("draft")).toBe(false);
    expect(propertyStatusOccupiesListingSlot("unlisted")).toBe(false);
    expect(propertyStatusOccupiesListingSlot("rejected")).toBe(false);
    expect(propertyStatusOccupiesListingSlot("request_change")).toBe(false);
  });

  it("treats an absent or unknown status as not occupying a slot", () => {
    // The route passes `null` for a row that does not exist yet — that must read
    // as "no slot held", which is what makes a create charge the cap.
    expect(propertyStatusOccupiesListingSlot(null)).toBe(false);
    expect(propertyStatusOccupiesListingSlot(undefined)).toBe(false);
    expect(propertyStatusOccupiesListingSlot("something-new")).toBe(false);
  });
});
