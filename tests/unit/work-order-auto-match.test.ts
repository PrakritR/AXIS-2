import { describe, expect, it } from "vitest";
import { suggestVendorsForWorkOrder } from "@/lib/work-order-auto-match";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";

const NOW = new Date("2026-07-04T00:00:00.000Z").getTime();

function workOrder(overrides: Partial<DemoManagerWorkOrderRow> = {}): DemoManagerWorkOrderRow {
  return {
    id: "wo-1",
    propertyName: "Maple St",
    unit: "1A",
    title: "Leaky faucet",
    priority: "normal",
    status: "open",
    bucket: "new",
    description: "",
    scheduled: "",
    cost: "",
    managerUserId: "mgr-1",
    propertyId: "prop-1",
    category: "plumbing",
    ...overrides,
  };
}

function vendor(overrides: Partial<ManagerVendorRow> = {}): ManagerVendorRow {
  return {
    id: "v-1",
    managerUserId: "mgr-1",
    name: "Ace Plumbing",
    trade: "Plumbing",
    phone: "",
    email: "",
    notes: "",
    active: true,
    ...overrides,
  };
}

describe("suggestVendorsForWorkOrder", () => {
  it("matches a vendor whose trade maps to the work order's category", () => {
    const result = suggestVendorsForWorkOrder(workOrder(), [vendor()], { now: NOW });
    expect(result).toHaveLength(1);
    expect(result[0].vendorId).toBe("v-1");
    expect(result[0].reason).toBe("no prior assignments");
  });

  it("excludes vendors whose trade does not match the category", () => {
    const result = suggestVendorsForWorkOrder(workOrder({ category: "electrical" }), [vendor()], { now: NOW });
    expect(result).toEqual([]);
  });

  it("excludes inactive vendors", () => {
    const result = suggestVendorsForWorkOrder(workOrder(), [vendor({ active: false })], { now: NOW });
    expect(result).toEqual([]);
  });

  it("excludes vendors owned by a different manager unless shared", () => {
    const otherManagerVendor = vendor({ id: "v-2", managerUserId: "mgr-2" });
    expect(suggestVendorsForWorkOrder(workOrder(), [otherManagerVendor], { now: NOW })).toEqual([]);

    const sharedVendor = vendor({ id: "v-3", managerUserId: "mgr-2", sharedWithManagers: true });
    const result = suggestVendorsForWorkOrder(workOrder(), [sharedVendor], { now: NOW });
    expect(result.map((c) => c.vendorId)).toEqual(["v-3"]);
  });

  it("excludes vendors scoped to properties that don't include the work order's property", () => {
    const scoped = vendor({ id: "v-2", propertyIds: ["prop-9"] });
    expect(suggestVendorsForWorkOrder(workOrder(), [scoped], { now: NOW })).toEqual([]);

    const matchingScope = vendor({ id: "v-3", propertyIds: ["prop-1", "prop-9"] });
    const result = suggestVendorsForWorkOrder(workOrder(), [matchingScope], { now: NOW });
    expect(result.map((c) => c.vendorId)).toEqual(["v-3"]);
  });

  it("does not restrict by property when the vendor has no propertyIds set", () => {
    const unscoped = vendor({ id: "v-2", propertyIds: undefined });
    const result = suggestVendorsForWorkOrder(workOrder({ propertyId: "prop-anything" }), [unscoped], { now: NOW });
    expect(result.map((c) => c.vendorId)).toEqual(["v-2"]);
  });

  it("ranks candidates by least-recently-assigned first", () => {
    const recent = vendor({ id: "v-recent", name: "Recent Co" });
    const stale = vendor({ id: "v-stale", name: "Stale Co" });
    const never = vendor({ id: "v-never", name: "Never Co" });
    const priorWorkOrders: DemoManagerWorkOrderRow[] = [
      workOrder({ id: "wo-old", vendorId: "v-recent", vendorAssignedAt: "2026-07-01T00:00:00.000Z" }),
      workOrder({ id: "wo-older", vendorId: "v-stale", vendorAssignedAt: "2026-06-01T00:00:00.000Z" }),
    ];

    const result = suggestVendorsForWorkOrder(workOrder(), [recent, stale, never], {
      allWorkOrders: priorWorkOrders,
      now: NOW,
    });

    expect(result.map((c) => c.vendorId)).toEqual(["v-never", "v-stale", "v-recent"]);
    expect(result[1].reason).toBe("matches Plumbing · last assigned 33d ago");
    expect(result[2].reason).toBe("matches Plumbing · last assigned 3d ago");
  });

  it("uses each vendor's single most-recent assignment across multiple prior work orders", () => {
    const v = vendor();
    const priorWorkOrders: DemoManagerWorkOrderRow[] = [
      workOrder({ id: "wo-a", vendorId: "v-1", vendorAssignedAt: "2026-06-01T00:00:00.000Z" }),
      workOrder({ id: "wo-b", vendorId: "v-1", vendorAssignedAt: "2026-07-03T00:00:00.000Z" }),
    ];
    const result = suggestVendorsForWorkOrder(workOrder(), [v], { allWorkOrders: priorWorkOrders, now: NOW });
    expect(result[0].lastAssignedAt).toBe("2026-07-03T00:00:00.000Z");
    expect(result[0].reason).toBe("matches Plumbing · last assigned 1d ago");
  });

  it("returns an empty list when the work order has no category", () => {
    const result = suggestVendorsForWorkOrder(workOrder({ category: undefined }), [vendor()], { now: NOW });
    expect(result).toEqual([]);
  });

  it("returns an empty list when no vendors match at all", () => {
    const result = suggestVendorsForWorkOrder(workOrder({ category: "mold" }), [vendor()], { now: NOW });
    expect(result).toEqual([]);
  });
});
