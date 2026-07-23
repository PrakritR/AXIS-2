import { describe, it, expect } from "vitest";
import { listMyScheduleTool } from "@/lib/tools/domains/vendor/schedule";
import type { VendorAgentContext } from "@/lib/tools/vendor-context";
import { makeManagerRowsCtx, type FakeRecord } from "./fake-agent-ctx";

/**
 * `list_my_schedule` was ported onto the one framework's VendorAgentContext
 * (its whole scope key is `owner_user_id = ctx.userId`). The rest of the vendor
 * catalog is covered in tests/unit/tools/vendor-scope-isolation.test.ts.
 */
function vendorCtx(tables: Record<string, FakeRecord[]>, vendorUserId = "vendor_a"): VendorAgentContext {
  return makeManagerRowsCtx(tables, {
    // A vendor has no landlord scope: an empty landlordId is what makes a tool
    // that forgot its vendor filter return nothing rather than a portfolio.
    landlordId: "",
    userId: vendorUserId,
  }) as unknown as VendorAgentContext;
}

describe("list_my_schedule", () => {
  it("returns only the vendor's own calendar rows", async () => {
    const ctx = vendorCtx({
      portal_schedule_records: [
        { id: "e1", owner_user_id: "vendor_a", row_data: { id: "e1", title: "Visit", date: "2026-07-21" } },
        { id: "e2", owner_user_id: "vendor_b", row_data: { id: "e2", title: "Theirs", date: "2026-07-21" } },
      ] as unknown as FakeRecord[],
    });
    const res = (await listMyScheduleTool.handler(ctx, {})) as { count: number; events: { id: string | null }[] };
    expect(res.count).toBe(1);
    expect(res.events[0]!.id).toBe("e1");
  });

  it("honours the date window", async () => {
    const ctx = vendorCtx({
      portal_schedule_records: [
        { id: "e1", owner_user_id: "vendor_a", row_data: { id: "e1", date: "2026-07-01" } },
        { id: "e2", owner_user_id: "vendor_a", row_data: { id: "e2", date: "2026-08-01" } },
      ] as unknown as FakeRecord[],
    });
    const res = (await listMyScheduleTool.handler(ctx, { from: "2026-07-15" })) as {
      events: { id: string | null }[];
    };
    expect(res.events.map((e) => e.id)).toEqual(["e2"]);
  });
});
