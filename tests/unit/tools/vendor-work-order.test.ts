import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent-notify.server", () => ({ notifyManagerFromAgent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics/posthog", () => ({ track: vi.fn() }));
vi.mock("@/lib/vendor-dispatch-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vendor-dispatch-settings")>();
  return {
    ...actual,
    loadVendorDispatchSettings: vi.fn().mockResolvedValue(actual.DEFAULT_VENDOR_DISPATCH_SETTINGS),
  };
});

import { notifyManagerFromAgent } from "@/lib/agent-notify.server";
import { buildVendorAgentContext } from "@/lib/tools/context";
import {
  escalateToManagerTool,
  getJobAccessInfoTool,
  getJobDetailsTool,
} from "@/lib/tools/domains/vendor-work-order";

type WoRec = { id: string; manager_user_id: string; vendor_user_id: string | null; row_data: Record<string, unknown> };

function mockDb(opts: {
  workOrders?: WoRec[];
  accessInfo?: Record<string, unknown>;
  auditDuplicate?: boolean;
}) {
  const auditInserts: Array<Record<string, unknown>> = [];
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const woQueries: Array<Record<string, string>> = [];

  const db = {
    from(table: string) {
      if (table === "portal_work_order_records") {
        const filters: Record<string, string> = {};
        const chain = {
          select: () => chain,
          eq: (col: string, val: string) => {
            filters[col] = val;
            return chain;
          },
          order: () => chain,
          limit: async () => ({
            data: (opts.workOrders ?? [])
              .filter((r) => r.manager_user_id === filters.manager_user_id)
              .map((r) => ({ id: r.id, vendor_user_id: r.vendor_user_id, row_data: r.row_data })),
            error: null,
          }),
          maybeSingle: async () => {
            woQueries.push({ ...filters });
            const rec = (opts.workOrders ?? []).find(
              (r) => r.id === filters.id && r.manager_user_id === filters.manager_user_id,
            );
            return { data: rec ?? null, error: null };
          },
        };
        return chain;
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Mia Manager" }, error: null }) }),
          }),
        };
      }
      if (table === "manager_property_access") {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: opts.accessInfo ? { access_info: opts.accessInfo } : null, error: null }),
        };
        return chain;
      }
      if (table === "audit_log") {
        return {
          insert: async (row: Record<string, unknown>) => {
            if (opts.auditDuplicate) return { error: { code: "23505", message: "dup" } };
            auditInserts.push(row);
            return { error: null };
          },
        };
      }
      if (table === "agent_sessions") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: async () => {
              sessionUpdates.push(patch);
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { db: db as never, auditInserts, sessionUpdates, woQueries };
}

const SCOPE = { sessionId: "sess-1", vendorDirectoryId: "v-plumb", vendorUserId: "vendor-user-1", workOrderId: "REQ-1" };

const scheduledRow = (over: Record<string, unknown> = {}) => ({
  id: "REQ-1",
  title: "Leaking sink",
  description: "Water under the kitchen sink",
  category: "plumbing",
  priority: "High",
  status: "Scheduled",
  bucket: "scheduled",
  propertyId: "prop-1",
  propertyName: "128 Oak St",
  unit: "4B",
  propertyAddress: "128 Oak St, Seattle, WA 98101",
  scheduledAtIso: "2026-07-16T17:00:00.000Z",
  scheduled: "Jul 16, 10:00 AM",
  preferredArrival: "after 5pm",
  residentName: "Rosa Alvarez",
  residentEmail: "rosa@example.com",
  photoDataUrls: ["data:image/png;base64,xxx"],
  vendorCostCents: 42000,
  vendorId: "v-plumb",
  managerUserId: "mgr-a",
  entryPermission: "allowed",
  entryNotes: "gate sticks, push hard",
  ...over,
});

describe("vendor work-order tools scoping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("get_job_details pins the query to the session's landlord + work order and strips PII", async () => {
    const { db, woQueries } = mockDb({
      workOrders: [{ id: "REQ-1", manager_user_id: "mgr-a", vendor_user_id: "vendor-user-1", row_data: scheduledRow() }],
    });
    const ctx = buildVendorAgentContext(db, { landlordId: "mgr-a", scope: SCOPE });
    const result = (await getJobDetailsTool.handler(ctx, {})) as { found: boolean; job: Record<string, unknown> };

    expect(woQueries[0]).toMatchObject({ id: "REQ-1", manager_user_id: "mgr-a" });
    expect(result.found).toBe(true);
    expect(result.job.residentFirstName).toBe("Rosa");
    expect(result.job.managerName).toBe("Mia Manager");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("rosa@example.com");
    expect(serialized).not.toContain("photoDataUrls");
    expect(serialized).not.toContain("42000");
    expect(serialized).not.toContain("Alvarez");
  });

  it("get_job_details cannot see another landlord's work order", async () => {
    const { db } = mockDb({
      workOrders: [{ id: "REQ-1", manager_user_id: "mgr-b", vendor_user_id: null, row_data: scheduledRow() }],
    });
    const ctx = buildVendorAgentContext(db, { landlordId: "mgr-a", scope: SCOPE });
    const result = (await getJobDetailsTool.handler(ctx, {})) as { found: boolean };
    expect(result.found).toBe(false);
  });

  it("get_job_access_info denies when unassigned or unscheduled, releases when assigned + scheduled", async () => {
    const denyCases = [
      scheduledRow({ vendorId: "someone-else" }),
      scheduledRow({ bucket: "open" }),
      scheduledRow({ selfAssigned: true }),
    ];
    for (const row of denyCases) {
      const { db } = mockDb({
        workOrders: [{ id: "REQ-1", manager_user_id: "mgr-a", vendor_user_id: "vendor-user-1", row_data: row }],
        accessInfo: { gateCode: "4821" },
      });
      const ctx = buildVendorAgentContext(db, { landlordId: "mgr-a", scope: SCOPE });
      const result = (await getJobAccessInfoTool.handler(ctx, {})) as { available: boolean };
      expect(result.available).toBe(false);
    }

    const { db } = mockDb({
      workOrders: [{ id: "REQ-1", manager_user_id: "mgr-a", vendor_user_id: "vendor-user-1", row_data: scheduledRow() }],
      accessInfo: { gateCode: "4821", lockboxLocation: "side door" },
    });
    const ctx = buildVendorAgentContext(db, { landlordId: "mgr-a", scope: SCOPE });
    const result = (await getJobAccessInfoTool.handler(ctx, {})) as {
      available: boolean;
      access: { gateCode: string; permissionToEnter: string; residentEntryNotes: string };
    };
    expect(result.available).toBe(true);
    expect(result.access.gateCode).toBe("4821");
    expect(result.access.permissionToEnter).toBe("allowed");
    expect(result.access.residentEntryNotes).toBe("gate sticks, push hard");
  });

  it("escalate notifies the owning manager once per session-hour", async () => {
    const seed = () =>
      mockDb({
        workOrders: [{ id: "REQ-1", manager_user_id: "mgr-a", vendor_user_id: "vendor-user-1", row_data: scheduledRow() }],
      });

    const first = seed();
    const ctx = buildVendorAgentContext(first.db, { landlordId: "mgr-a", scope: SCOPE });
    const result = (await escalateToManagerTool.handler(ctx, { summary: "Vendor wants to move the visit to Friday.", urgency: "normal" })) as {
      ok: boolean;
    };
    expect(result.ok).toBe(true);
    expect(first.auditInserts).toHaveLength(1);
    expect(first.sessionUpdates[0]).toMatchObject({ status: "escalated" });
    expect(vi.mocked(notifyManagerFromAgent)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyManagerFromAgent).mock.calls[0]![1]).toMatchObject({ landlordId: "mgr-a" });

    vi.clearAllMocks();
    const dup = mockDb({
      workOrders: [{ id: "REQ-1", manager_user_id: "mgr-a", vendor_user_id: "vendor-user-1", row_data: scheduledRow() }],
      auditDuplicate: true,
    });
    const ctx2 = buildVendorAgentContext(dup.db, { landlordId: "mgr-a", scope: SCOPE });
    const second = (await escalateToManagerTool.handler(ctx2, { summary: "again", urgency: "normal" })) as {
      ok: boolean;
      alreadyEscalated?: boolean;
    };
    expect(second.ok).toBe(true);
    expect(second.alreadyEscalated).toBe(true);
    expect(vi.mocked(notifyManagerFromAgent)).not.toHaveBeenCalled();
  });
});
