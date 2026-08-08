import { describe, expect, it } from "vitest";
import { residentChargeManagerMessageDraft, residentTourManagerMessageDraft } from "@/lib/resident-manager-message-draft";
import type { HouseholdCharge } from "@/lib/household-charges";
import type { ResidentTourView } from "@/lib/tour-resident-link.server";

const sampleCharge: HouseholdCharge = {
  id: "hc_test",
  createdAt: "2026-01-01T00:00:00.000Z",
  residentEmail: "resident@test.proplane.local",
  residentName: "Test Resident",
  residentUserId: "user-1",
  propertyId: "prop-1",
  propertyLabel: "Oak House",
  managerUserId: "mgr-1",
  kind: "rent",
  title: "March rent",
  amountLabel: "$1,200.00",
  balanceLabel: "$1,200.00",
  status: "pending",
  blocksLeaseUntilPaid: false,
};

describe("resident manager message drafts", () => {
  it("builds a charge draft with property context", () => {
    const draft = residentChargeManagerMessageDraft(sampleCharge);
    expect(draft.subject).toBe("Question about March rent");
    expect(draft.body).toContain("March rent");
    expect(draft.propertyId).toBe("prop-1");
    expect(draft.managerUserId).toBe("mgr-1");
  });

  it("builds a tour draft with property context", () => {
    const tour: ResidentTourView = {
      inquiryId: "inq-1",
      tourGroupId: null,
      status: "pending",
      propertyId: "prop-oak",
      propertyTitle: "Oak House",
      roomLabel: "Room A",
      managerUserId: "mgr-1",
      managerLabel: "Demo Manager",
      guestName: "Alex",
      guestEmail: "alex@example.com",
      guestPhone: null,
      notes: null,
      instructions: null,
      proposedStart: "2026-08-10T17:00:00.000Z",
      proposedEnd: "2026-08-10T17:30:00.000Z",
      requestedWindows: [],
      createdAt: null,
      confirmed: false,
      confirmedStart: null,
      confirmedEnd: null,
    };
    const draft = residentTourManagerMessageDraft(tour);
    expect(draft.subject).toBe("Question about Oak House");
    expect(draft.body).toContain("Oak House");
    expect(draft.propertyId).toBe("prop-oak");
  });
});
