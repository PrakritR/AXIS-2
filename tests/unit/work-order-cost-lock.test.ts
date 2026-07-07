import { describe, expect, it } from "vitest";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { isWorkOrderCostLockedByVendor } from "@/lib/work-order-cost-lock";

function baseRow(overrides: Partial<DemoManagerWorkOrderRow> = {}): DemoManagerWorkOrderRow {
  return {
    id: "wo-1",
    propertyName: "Test",
    unit: "Room 1",
    title: "Fix faucet",
    priority: "medium",
    status: "Scheduled",
    bucket: "scheduled",
    description: "Leak",
    scheduled: "—",
    cost: "$100.00",
    ...overrides,
  };
}

describe("isWorkOrderCostLockedByVendor", () => {
  it("is unlocked when only a manager-set cost and vendor are assigned", () => {
    expect(
      isWorkOrderCostLockedByVendor(
        baseRow({
          vendorId: "v-1",
          vendorName: "Puget Electric",
          cost: "$234.00",
        }),
      ),
    ).toBe(false);
  });

  it("locks when vendor set price via set-vendor-price", () => {
    expect(
      isWorkOrderCostLockedByVendor(
        baseRow({
          vendorPriceSetAt: "2026-07-07T00:00:00.000Z",
          vendorCostCents: 23400,
          cost: "$234.00",
        }),
      ),
    ).toBe(true);
  });

  it("locks when a vendor bid was accepted", () => {
    expect(
      isWorkOrderCostLockedByVendor(
        baseRow({
          biddingResolvedAt: "2026-07-07T00:00:00.000Z",
          vendorCostCents: 12500,
          cost: "$125.00",
        }),
      ),
    ).toBe(true);
  });

  it("stays unlocked when bidding resolved without vendor cost", () => {
    expect(
      isWorkOrderCostLockedByVendor(
        baseRow({
          biddingResolvedAt: "2026-07-07T00:00:00.000Z",
        }),
      ),
    ).toBe(false);
  });
});
