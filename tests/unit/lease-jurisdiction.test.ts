import { describe, expect, it } from "vitest";
import { snapshotJordanLee } from "@/data/manager-application-snapshots";
import { leaseContextFromApplication } from "@/lib/generated-lease";
import {
  isLeaseGenerationSupported,
  resolveLeaseJurisdiction,
  unsupportedJurisdictionMessage,
} from "@/lib/lease-jurisdiction";

describe("lease-jurisdiction", () => {
  it("detects Seattle from address", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication({
      ...app,
      propertyId: app.propertyId,
    });
    const withSeattle = {
      ...ctx,
      leasedRoom: undefined,
      listingProperty: ctx.listingProperty
        ? { ...ctx.listingProperty, address: "5259 Brooklyn Ave NE, Seattle, WA", neighborhood: "Seattle" }
        : undefined,
    };
    expect(resolveLeaseJurisdiction(withSeattle)).toBe("seattle");
    expect(isLeaseGenerationSupported(resolveLeaseJurisdiction(withSeattle))).toBe(true);
  });

  it("detects San Francisco from address", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const sfCtx = {
      ...ctx,
      leasedRoom: undefined,
      submission: { ...(ctx.submission ?? { v: 1 as const, buildingName: "SF House", address: "123 Market St, San Francisco, CA", neighborhood: "SOMA", zip: "94103", rooms: [], sharedSpaces: [] }), address: "123 Market St, San Francisco, CA" },
      listingProperty: {
        ...(ctx.listingProperty ?? { id: "sf-test", title: "SF House", tagline: "", zip: "94103", beds: 1, baths: 1, rentLabel: "$1000", available: "Now", petFriendly: false, buildingId: "b1", buildingName: "SF House", unitLabel: "Room 1", adminPublishLive: true }),
        address: "123 Market St, San Francisco, CA 94103",
        neighborhood: "SOMA",
      },
    };
    expect(resolveLeaseJurisdiction(sfCtx)).toBe("san_francisco");
  });

  it("returns unsupported for other cities", () => {
    const app = snapshotJordanLee();
    const ctx = leaseContextFromApplication(app);
    const portlandCtx = {
      ...ctx,
      leasedRoom: undefined,
      submission: ctx.submission ? { ...ctx.submission, address: "1000 SW Broadway, Portland, OR" } : { v: 1 as const, buildingName: "PDX", address: "1000 SW Broadway, Portland, OR", neighborhood: "Portland", zip: "97201", rooms: [], sharedSpaces: [] },
      listingProperty: {
        ...(ctx.listingProperty ?? { id: "pdx-test", title: "PDX House", tagline: "", zip: "97201", beds: 1, baths: 1, rentLabel: "$1000", available: "Now", petFriendly: false, buildingId: "b1", buildingName: "PDX", unitLabel: "Room 1", adminPublishLive: true }),
        address: "1000 SW Broadway, Portland, OR",
        neighborhood: "Portland",
      },
      application: { ...ctx.application, currentCity: "Portland", currentState: "OR" },
    };
    expect(resolveLeaseJurisdiction(portlandCtx)).toBe("unsupported");
    expect(unsupportedJurisdictionMessage("unsupported")).toContain("Seattle");
  });
});
