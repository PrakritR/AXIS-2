import { describe, expect, it } from "vitest";
import { normalizeProRelationshipRecord } from "@/lib/pro-relationships";

describe("pro-relationships", () => {
  it("normalizes co-manager link rows with permissions", () => {
    const row = normalizeProRelationshipRecord({
      id: "rel-1",
      linkedAxisId: "co@example.com",
      linkedDisplayName: "Co Manager",
      payoutPercentForManager: 20,
      assignedPropertyIds: ["prop-a", "prop-b"],
      coManagerPermissions: { applications: true, payments: true },
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row?.linkedAxisId).toBe("co@example.com");
    expect(row?.payoutPercentForManager).toBe(20);
    expect(row?.assignedPropertyIds).toEqual(["prop-a", "prop-b"]);
    expect(row?.coManagerPermissions).toEqual({ applications: true, payments: true });
  });

  it("migrates legacy canEditListing to editListings permission", () => {
    const row = normalizeProRelationshipRecord({
      id: "rel-2",
      linkedAxisId: "legacy@example.com",
      canEditListing: true,
    });
    expect(row?.coManagerPermissions?.editListings).toBe(true);
  });

  it("defaults payout percent when missing", () => {
    const row = normalizeProRelationshipRecord({
      id: "rel-3",
      linkedAxisId: "default@example.com",
    });
    expect(row?.payoutPercentForManager).toBe(15);
  });

  it("rejects invalid records", () => {
    expect(normalizeProRelationshipRecord(null)).toBeNull();
    expect(normalizeProRelationshipRecord({ id: "only-id" })).toBeNull();
  });
});
