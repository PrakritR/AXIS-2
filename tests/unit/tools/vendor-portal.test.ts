import { describe, it, expect } from "vitest";
import {
  listMyBidsTool,
  listMyJobsTool,
  listMyScheduleTool,
  requireVendorPortalScope,
} from "@/lib/tools/domains/vendor-portal";
import type { AgentContext } from "@/lib/tools/context";
import { makeManagerRowsCtx, type FakeRecord } from "./fake-agent-ctx";

function vendorCtx(tables: Record<string, FakeRecord[]>, vendorUserId = "vendor_a"): AgentContext {
  return makeManagerRowsCtx(tables, {
    // A vendor has no landlord scope: an empty landlordId is what makes a tool
    // that forgot its vendor filter return nothing rather than a portfolio.
    landlordId: "",
    userId: vendorUserId,
    roles: ["vendor"],
    vendorPortalScope: { vendorUserId, email: `${vendorUserId}@example.com` },
  });
}

/** A work order row keyed by the assigned vendor. */
function jobRow(vendorUserId: string, rowData: Record<string, unknown>): FakeRecord {
  return { id: String(rowData.id ?? ""), vendor_user_id: vendorUserId, row_data: rowData } as FakeRecord;
}

describe("vendor portal tools", () => {
  it("refuse to run without a vendor scope", () => {
    const ctx = makeManagerRowsCtx({});
    expect(() => requireVendorPortalScope(ctx)).toThrow(/signed-in vendor/i);
  });

  it("list_my_jobs returns only the signed-in vendor's jobs", async () => {
    const ctx = vendorCtx({
      portal_work_order_records: [
        jobRow("vendor_a", { id: "w1", title: "Fix sink", bucket: "open" }),
        jobRow("vendor_a", { id: "w2", title: "Repaint", bucket: "completed" }),
        jobRow("vendor_b", { id: "w3", title: "Not mine", bucket: "open" }),
      ],
    });
    const all = (await listMyJobsTool.handler(ctx, {})) as { count: number; jobs: { id: string }[] };
    expect(all.jobs.map((j) => j.id).sort()).toEqual(["w1", "w2"]);

    const open = (await listMyJobsTool.handler(ctx, { bucket: "open" })) as { jobs: { id: string }[] };
    expect(open.jobs.map((j) => j.id)).toEqual(["w1"]);
  });

  it("list_my_bids returns only the signed-in vendor's bids", async () => {
    const ctx = vendorCtx({
      work_order_bids: [
        { vendor_user_id: "vendor_a", row_data: {}, id: "b1" } as FakeRecord,
        { vendor_user_id: "vendor_b", row_data: {}, id: "b2" } as FakeRecord,
      ],
    });
    const res = (await listMyBidsTool.handler(ctx, {})) as { count: number };
    expect(res.count).toBe(1);
  });

  it("list_my_schedule returns only the vendor's own calendar rows", async () => {
    const ctx = vendorCtx({
      portal_schedule_records: [
        { id: "e1", owner_user_id: "vendor_a", row_data: { id: "e1", title: "Visit", date: "2026-07-21" } },
        { id: "e2", owner_user_id: "vendor_b", row_data: { id: "e2", title: "Theirs", date: "2026-07-21" } },
      ],
    });
    const res = (await listMyScheduleTool.handler(ctx, {})) as { count: number; events: { id: string | null }[] };
    expect(res.count).toBe(1);
    expect(res.events[0]!.id).toBe("e1");
  });

  it("list_my_schedule honours the date window", async () => {
    const ctx = vendorCtx({
      portal_schedule_records: [
        { id: "e1", owner_user_id: "vendor_a", row_data: { id: "e1", date: "2026-07-01" } },
        { id: "e2", owner_user_id: "vendor_a", row_data: { id: "e2", date: "2026-08-01" } },
      ],
    });
    const res = (await listMyScheduleTool.handler(ctx, { from: "2026-07-15" })) as {
      events: { id: string | null }[];
    };
    expect(res.events.map((e) => e.id)).toEqual(["e2"]);
  });
});
