import { describe, expect, it } from "vitest";
import {
  emptyPropertyPipelineSnapshot,
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
      sideGlobal: { requestChange: [], unlisted: [], rejected: [] },
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
});
