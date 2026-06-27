import { describe, expect, it } from "vitest";
import { mergeWorkOrderCompletion } from "@/lib/work-order-expenses";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

describe("work order expense sync", () => {
  it("mergeWorkOrderCompletion stores costs and expense ids", () => {
    const row: DemoManagerWorkOrderRow = {
      id: "wo-1",
      propertyName: "House",
      unit: "A",
      title: "Fix leak",
      priority: "High",
      status: "Scheduled",
      bucket: "scheduled",
      description: "Plumbing: leak",
      scheduled: "Mar 1",
      cost: "—",
    };

    const updated = mergeWorkOrderCompletion(
      row,
      {
        workOrderId: "wo-1",
        category: "plumbing",
        vendorCostCents: 15000,
        materialsCostCents: 2500,
        workDoneSummary: "Replaced trap",
      },
      ["exp-1", "exp-2"],
    );

    expect(updated.bucket).toBe("completed");
    expect(updated.category).toBe("plumbing");
    expect(updated.vendorCostCents).toBe(15000);
    expect(updated.expenseEntryIds).toEqual(["exp-1", "exp-2"]);
  });
});
