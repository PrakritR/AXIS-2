import { describe, expect, it } from "vitest";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import { demoWorkOrders, demoWorkOrderBids, DEMO_VENDOR_NAME } from "@/lib/demo/demo-data";
import { isPricingPendingBid, vendorWorkOrderTab } from "@/lib/vendor-work-order-tabs";

function row(partial: Partial<DemoManagerWorkOrderRow> = {}): DemoManagerWorkOrderRow {
  return {
    id: "wo-1",
    propertyName: "Test",
    unit: "1A",
    title: "Fix sink",
    priority: "Medium",
    status: "Open",
    bucket: "open",
    description: "",
    scheduled: "",
    cost: "",
    ...partial,
  };
}

function bid(partial: Partial<WorkOrderBid>): WorkOrderBid {
  return {
    id: "bid-1",
    workOrderId: "wo-1",
    vendorUserId: "v-1",
    vendorDirectoryId: "dir-1",
    quoteMode: "upfront",
    consultationVisitAt: null,
    amountCents: 10_000,
    materialsCents: 0,
    proposedTime: "2026-08-01T12:00:00.000Z",
    note: null,
    status: "submitted",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...partial,
  };
}

describe("demo idle vendor services tabs", () => {
  it("has at least one work order per vendor tab", () => {
    const vendorRows = demoWorkOrders().filter((r) => r.vendorName === DEMO_VENDOR_NAME);
    const bids = Object.fromEntries(demoWorkOrderBids().map((b) => [b.workOrderId, b]));
    const tabs = new Set(vendorRows.map((row) => vendorWorkOrderTab(row, bids[row.id])));
    expect(tabs.has("quote")).toBe(true);
    expect(tabs.has("tour")).toBe(true);
    expect(tabs.has("scheduled")).toBe(true);
    expect(tabs.has("completed")).toBe(true);
  });
});

describe("vendorWorkOrderTab", () => {
  it("routes open bidding to Quote", () => {
    expect(vendorWorkOrderTab(row({ biddingOpen: true }), undefined)).toBe("quote");
  });

  it("routes post-consultation pricing to Site visit", () => {
    expect(
      vendorWorkOrderTab(
        row({ biddingOpen: true }),
        bid({
          quoteMode: "after_consultation",
          consultationVisitAt: "2026-07-10T15:00:00.000Z",
          amountCents: null,
          proposedTime: null,
        }),
      ),
    ).toBe("tour");
  });

  it("routes accepted fixed-price jobs to Scheduled", () => {
    expect(
      vendorWorkOrderTab(row({ bucket: "scheduled", vendorCostCents: 15_000, scheduledAtIso: "2026-07-12T10:00:00.000Z" })),
    ).toBe("scheduled");
  });

  it("routes completed jobs to Completed", () => {
    expect(vendorWorkOrderTab(row({ bucket: "completed" }))).toBe("completed");
  });
});

describe("isPricingPendingBid", () => {
  it("is true only after consultation without labor price", () => {
    expect(
      isPricingPendingBid(
        bid({
          quoteMode: "after_consultation",
          consultationVisitAt: "2026-07-10T15:00:00.000Z",
          amountCents: null,
          proposedTime: null,
        }),
      ),
    ).toBe(true);
    expect(isPricingPendingBid(bid({ quoteMode: "upfront", amountCents: 5000 }))).toBe(false);
  });
});
