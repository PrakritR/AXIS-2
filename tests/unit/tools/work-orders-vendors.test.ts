import { describe, it, expect } from "vitest";
import { listWorkOrdersTool } from "@/lib/tools/domains/work-orders";
import { listVendorsTool } from "@/lib/tools/domains/vendors";
import { makeManagerRowsCtx, managerRow } from "./fake-agent-ctx";

describe("list_work_orders", () => {
  const ctx = makeManagerRowsCtx({
    portal_work_order_records: [
      managerRow("manager_a", { id: "wo1", title: "Leak", status: "open", bucket: "scheduled", residentName: "Pat" }),
      managerRow("manager_a", { id: "wo2", title: "Lockout", status: "completed", bucket: "done" }),
      // Another landlord's work order must never surface.
      managerRow("manager_b", { id: "wo3", title: "Other", status: "open", bucket: "scheduled" }),
    ],
  });

  it("returns only the current landlord's work orders", async () => {
    const res = (await listWorkOrdersTool.handler(ctx, {})) as { count: number; workOrders: { id: string }[] };
    expect(res.count).toBe(2);
    expect(res.workOrders.map((w) => w.id).sort()).toEqual(["wo1", "wo2"]);
  });

  it("filters by status (case-insensitive)", async () => {
    const res = (await listWorkOrdersTool.handler(ctx, { status: "OPEN" })) as {
      count: number;
      workOrders: { id: string }[];
    };
    expect(res.count).toBe(1);
    expect(res.workOrders[0]!.id).toBe("wo1");
  });

  it("omits raw photo blobs from the projection", async () => {
    const withPhotos = makeManagerRowsCtx({
      portal_work_order_records: [
        managerRow("manager_a", { id: "wo4", title: "X", status: "open", photoDataUrls: ["data:image/png;base64,AAA"] }),
      ],
    });
    const res = (await listWorkOrdersTool.handler(withPhotos, {})) as { workOrders: Record<string, unknown>[] };
    expect(res.workOrders[0]).not.toHaveProperty("photoDataUrls");
  });
});

describe("list_vendors", () => {
  const ctx = makeManagerRowsCtx({
    manager_vendor_records: [
      managerRow("manager_a", { id: "v1", name: "Ace Plumbing", trade: "plumbing", phone: "555", email: "a@x.com", notes: "", active: true }),
      managerRow("manager_a", { id: "v2", name: "Spark Electric", trade: "electrical", phone: "", email: "", notes: "", active: false }),
      managerRow("manager_b", { id: "v3", name: "Other Co", trade: "plumbing", phone: "", email: "", notes: "", active: true }),
    ],
  });

  it("returns only the current landlord's vendors", async () => {
    const res = (await listVendorsTool.handler(ctx, {})) as { count: number; vendors: { id: string }[] };
    expect(res.count).toBe(2);
    expect(res.vendors.map((v) => v.id).sort()).toEqual(["v1", "v2"]);
  });

  it("filters to active vendors and by trade", async () => {
    const active = (await listVendorsTool.handler(ctx, { activeOnly: true })) as { count: number };
    expect(active.count).toBe(1);
    const plumbing = (await listVendorsTool.handler(ctx, { trade: "Plumbing" })) as {
      vendors: { id: string }[];
    };
    expect(plumbing.vendors.map((v) => v.id)).toEqual(["v1"]);
  });

  it("never projects tax/TIN fields even if present on the row", async () => {
    const leaky = makeManagerRowsCtx({
      manager_vendor_records: [
        managerRow("manager_a", {
          id: "v9",
          name: "Tax Co",
          trade: "general",
          phone: "",
          email: "",
          notes: "",
          active: true,
          // Hostile/extra fields that must not pass through the allowlist.
          tin: "12-3456789",
          tin_ciphertext: "ENCRYPTED",
        }),
      ],
    });
    const res = (await listVendorsTool.handler(leaky, {})) as { vendors: Record<string, unknown>[] };
    expect(res.vendors[0]).not.toHaveProperty("tin");
    expect(res.vendors[0]).not.toHaveProperty("tin_ciphertext");
  });
});
