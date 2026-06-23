import { describe, expect, it } from "vitest";
import { createDefaultListingSubmission, emptyRoom } from "@/lib/manager-listing-submission";
import {
  buildListingStepFieldOrder,
  listingRoomNameKey,
  listingRoomRentKey,
  validateListingWizardStep,
} from "@/lib/listing-wizard-validation";

describe("validateListingWizardStep", () => {
  it("flags each room missing a name on step 1", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "" }];
    const errs = validateListingWizardStep(1, sub);
    expect(errs[listingRoomNameKey("r1")]).toMatch(/required/i);
    expect(errs.rooms).toBeTruthy();
  });

  it("flags per-room rent on pricing step", () => {
    const sub = createDefaultListingSubmission();
    sub.listingPlaceCategoryId = "shared_home";
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "Room A", monthlyRent: 0 }];
    const errs = validateListingWizardStep(4, sub, { entireHomeRent: 0 });
    expect(errs[listingRoomRentKey("r1")]).toMatch(/rent/i);
  });

  it("orders room name keys before summary on step 1", () => {
    const sub = createDefaultListingSubmission();
    sub.rooms = [{ ...emptyRoom(0), id: "r1", name: "" }];
    const order = buildListingStepFieldOrder(1, sub);
    expect(order[0]).toBe(listingRoomNameKey("r1"));
  });
});
