import { describe, expect, it } from "vitest";
import { buildManagerOutgoingPaymentRows } from "@/lib/manager-outgoing-payments";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

describe("buildManagerOutgoingPaymentRows", () => {
  it("includes pending vendor work orders and paid expenses", () => {
    const workOrders: DemoManagerWorkOrderRow[] = [
      {
        id: "wo-1",
        propertyName: "Magnolia House",
        unit: "Room 1",
        title: "Sink repair",
        priority: "Medium",
        status: "Completed",
        bucket: "completed",
        description: "",
        scheduled: "—",
        cost: "$200.00",
        vendorName: "Rainier Plumbing",
        vendorCostCents: 20000,
        automationStatus: "vendor_marked_done",
        vendorMarkedDoneAt: new Date().toISOString(),
      },
    ];

    const rows = buildManagerOutgoingPaymentRows({
      managerUserId: "mgr-1",
      expenses: [
        {
          id: "exp-1",
          categoryCode: "property_tax",
          categoryLabel: "Property Tax",
          amountCents: 120000,
          expenseDate: "2026-06-01",
          memo: "Q2 property tax",
          propertyName: "Magnolia House",
        },
      ],
      workOrders,
      paidCharges: [],
    });

    expect(rows.some((row) => row.id === "work-order-wo-1" && row.bucket === "pending")).toBe(true);
    expect(rows.some((row) => row.id === "expense-exp-1" && row.bucket === "paid")).toBe(true);
  });
});
