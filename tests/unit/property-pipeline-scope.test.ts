import { describe, expect, it } from "vitest";
import {
  emptyPropertyPipelineSnapshot,
  propertyRowsToSnapshot,
  scopePropertyPipelineSnapshotForViewer,
} from "@/lib/persisted-property-records";

describe("scopePropertyPipelineSnapshotForViewer", () => {
  it("keeps only the viewer bucket plus explicitly linked owner rows", () => {
    const snapshot = {
      pendingByUser: {
        viewer: [{ id: "pend-viewer", submittedAt: "2026-01-01T00:00:00.000Z", buildingName: "Mine", address: "1 A", zip: "1", neighborhood: "N", unitLabel: "A", beds: 1, baths: 1, monthlyRent: 1000, petFriendly: false, tagline: "t" }],
        owner: [
          { id: "pend-linked", submittedAt: "2026-01-01T00:00:00.000Z", buildingName: "Linked", address: "2 B", zip: "1", neighborhood: "N", unitLabel: "B", beds: 1, baths: 1, monthlyRent: 1000, petFriendly: false, tagline: "t" },
          { id: "pend-other", submittedAt: "2026-01-01T00:00:00.000Z", buildingName: "Other", address: "3 C", zip: "1", neighborhood: "N", unitLabel: "C", beds: 1, baths: 1, monthlyRent: 1000, petFriendly: false, tagline: "t" },
        ],
        demo: [{ id: "pend-demo", submittedAt: "2026-01-01T00:00:00.000Z", buildingName: "Demo", address: "4 D", zip: "1", neighborhood: "N", unitLabel: "D", beds: 1, baths: 1, monthlyRent: 1000, petFriendly: false, tagline: "t" }],
      },
      extrasByUser: {},
      sideGlobal: { requestChange: [], unlisted: [], rejected: [], drafts: [] },
      sideByUser: {},
    };

    const scoped = scopePropertyPipelineSnapshotForViewer(snapshot, "viewer", ["pend-linked"]);
    expect(scoped.pendingByUser.viewer).toHaveLength(1);
    expect(scoped.pendingByUser.owner).toHaveLength(1);
    expect(scoped.pendingByUser.owner?.[0]?.id).toBe("pend-linked");
    expect(scoped.pendingByUser.demo).toBeUndefined();
  });

  it("returns empty snapshot when viewer id is missing", () => {
    expect(scopePropertyPipelineSnapshotForViewer(emptyPropertyPipelineSnapshot(), "", [])).toEqual(
      emptyPropertyPipelineSnapshot(),
    );
  });

  it("drops co-managed owner buckets when linked ids are empty (client must pass server ids)", () => {
    const snapshot = {
      pendingByUser: {},
      extrasByUser: {
        viewer: [{ id: "mgr-owned", title: "Owned", buildingName: "8th", address: "4709B", managerUserId: "stale-other" } as never],
        ambika: [{ id: "mgr-brooklyn", title: "Brooklyn", buildingName: "Brooklyn", address: "5259", managerUserId: "ambika" } as never],
      },
      sideGlobal: { requestChange: [], unlisted: [], rejected: [], drafts: [] },
      sideByUser: {},
    };
    const wiped = scopePropertyPipelineSnapshotForViewer(snapshot, "viewer", []);
    expect(wiped.extrasByUser.viewer).toHaveLength(1);
    expect(wiped.extrasByUser.ambika).toBeUndefined();

    const kept = scopePropertyPipelineSnapshotForViewer(snapshot, "viewer", ["mgr-brooklyn"]);
    expect(kept.extrasByUser.ambika).toHaveLength(1);
  });
});

describe("propertyRowsToSnapshot", () => {
  it("stamps managerUserId from the DB owner column onto live listings", () => {
    const snapshot = propertyRowsToSnapshot([
      {
        id: "mgr-brooklyn",
        manager_user_id: "owner-ambika",
        status: "live",
        row_data: null,
        property_data: {
          id: "mgr-brooklyn",
          title: "5259 Brooklyn",
          buildingName: "5259 Brooklyn Ave NE",
          address: "5259 Brooklyn Ave NE",
          // Stale / missing owner on the blob must not win over the DB column.
          managerUserId: "wrong-user",
          adminPublishLive: true,
        },
        edit_request_note: null,
      },
    ]);
    expect(snapshot.extrasByUser["owner-ambika"]?.[0]?.managerUserId).toBe("owner-ambika");
  });
});
