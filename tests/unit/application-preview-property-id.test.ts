import { describe, expect, it } from "vitest";
import { resolveApplicationPreviewPropertyId } from "@/components/portal/manager-property-application-questions-panel";

describe("resolveApplicationPreviewPropertyId", () => {
  it("prefers an explicit listing id", () => {
    expect(
      resolveApplicationPreviewPropertyId({
        listingId: "mgr-live-1",
        saveTarget: { mode: "pending", saveId: "mgr-pending-1" },
      }),
    ).toBe("mgr-live-1");
  });

  it("falls back to the save target id when listing id is absent", () => {
    expect(
      resolveApplicationPreviewPropertyId({
        saveTarget: { mode: "listing", saveId: "mgr-live-2" },
      }),
    ).toBe("mgr-live-2");

    expect(
      resolveApplicationPreviewPropertyId({
        saveTarget: { mode: "pending", saveId: "mgr-pending-2" },
      }),
    ).toBe("mgr-pending-2");
  });

  it("returns empty when nothing resolves", () => {
    expect(resolveApplicationPreviewPropertyId({})).toBe("");
    expect(
      resolveApplicationPreviewPropertyId({
        managerUserId: "user-1",
        bulkPropertyIds: [],
      }),
    ).toBe("");
  });
});
