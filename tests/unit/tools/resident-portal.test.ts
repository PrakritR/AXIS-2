import { describe, it, expect } from "vitest";
import { residentAgentRegistry, agentRegistry, vendorAgentRegistry } from "@/lib/tools";
import { toAnthropicTools } from "@/lib/tools/registry";
import {
  listMyChargesTool,
  listMyServiceRequestsTool,
  listMyWorkOrdersTool,
  requireResidentScope,
} from "@/lib/tools/domains/resident-portal";
import type { AgentContext, ResidentAgentScope } from "@/lib/tools/context";
import { makeManagerRowsCtx, type FakeRecord } from "./fake-agent-ctx";

const SCOPE: ResidentAgentScope = {
  residentUserId: "resident_a",
  residentEmail: "a@example.com",
  residentName: "Ada",
  managerUserId: "manager_a",
  propertyId: "prop1",
};

/** A resident-owned row as the portal tables store it. */
function residentRow(
  residentUserId: string | null,
  residentEmail: string | null,
  rowData: Record<string, unknown>,
): FakeRecord {
  return {
    id: String(rowData.id ?? ""),
    resident_user_id: residentUserId,
    resident_email: residentEmail,
    row_data: rowData,
  };
}

function residentCtx(tables: Record<string, FakeRecord[]>, scope: ResidentAgentScope = SCOPE): AgentContext {
  return makeManagerRowsCtx(tables, {
    landlordId: scope.managerUserId ?? "",
    userId: scope.residentUserId,
    email: scope.residentEmail,
    roles: ["resident"],
    residentScope: scope,
  });
}

describe("resident agent registry", () => {
  const tools = [...residentAgentRegistry.values()];

  it("registers the resident portal's capabilities", () => {
    const names = new Set(tools.map((t) => t.name));
    for (const expected of [
      "list_my_charges",
      "list_my_work_orders",
      "list_my_service_requests",
      "list_my_lease",
      "list_my_messages",
      "list_my_shared_documents",
      "report_maintenance_issue",
      "request_add_on_service",
      "message_my_manager",
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it("shares no tool with the manager or vendor registries", () => {
    const residentNames = new Set(tools.map((t) => t.name));
    for (const other of [agentRegistry, vendorAgentRegistry]) {
      for (const tool of other.values()) expect(residentNames.has(tool.name)).toBe(false);
    }
  });

  it("gives every resident write tool a preview so nothing executes unseen", () => {
    for (const tool of tools) {
      if (tool.kind === "write") expect(typeof tool.preview).toBe("function");
    }
  });

  it("has unique, Anthropic-valid tool names", () => {
    const schemas = toAnthropicTools(residentAgentRegistry);
    expect(schemas).toHaveLength(tools.length);
    for (const s of schemas) expect(s.name).toMatch(/^[a-z0-9_]{1,64}$/);
  });
});

describe("resident scope enforcement", () => {
  it("refuses to run without a resident scope", () => {
    const ctx = makeManagerRowsCtx({});
    expect(() => requireResidentScope(ctx)).toThrow(/signed-in resident/i);
  });

  it("list_my_charges returns only this resident's charges", async () => {
    // The foreign rows share the same manager, which is exactly the case a
    // landlordId-only filter would leak.
    const ctx = residentCtx({
      portal_household_charge_records: [
        residentRow("resident_a", "a@example.com", { id: "c1", title: "July rent", status: "pending" }),
        residentRow(null, "a@example.com", { id: "c2", title: "Utilities", status: "processing" }),
        residentRow("resident_b", "b@example.com", { id: "c3", title: "Their rent", status: "pending" }),
      ],
    });
    const res = (await listMyChargesTool.handler(ctx, {})) as {
      count: number;
      charges: { id: string; status: string | null }[];
    };
    expect(res.charges.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(res.count).toBe(2);
  });

  it("list_my_charges filters by status and preserves the ACH 'processing' state", async () => {
    const ctx = residentCtx({
      portal_household_charge_records: [
        residentRow("resident_a", "a@example.com", { id: "c1", title: "July rent", status: "pending" }),
        residentRow("resident_a", "a@example.com", { id: "c2", title: "Utilities", status: "processing" }),
      ],
    });
    const res = (await listMyChargesTool.handler(ctx, { status: "processing" })) as {
      charges: { id: string; status: string | null }[];
    };
    expect(res.charges).toHaveLength(1);
    expect(res.charges[0]).toMatchObject({ id: "c2", status: "processing" });
  });

  it("de-duplicates a row matched by both user id and email", async () => {
    const ctx = residentCtx({
      portal_work_order_records: [
        residentRow("resident_a", "a@example.com", { id: "w1", title: "Leak", bucket: "open" }),
      ],
    });
    const res = (await listMyWorkOrdersTool.handler(ctx, {})) as { count: number };
    expect(res.count).toBe(1);
  });

  it("list_my_service_requests scopes to the resident and filters by status", async () => {
    const ctx = residentCtx({
      portal_service_request_records: [
        residentRow("resident_a", "a@example.com", { id: "s1", offerName: "Parking", status: "pending" }),
        residentRow("resident_a", "a@example.com", { id: "s2", offerName: "Storage", status: "approved" }),
        residentRow("resident_b", "b@example.com", { id: "s3", offerName: "Theirs", status: "pending" }),
      ],
    });
    const all = (await listMyServiceRequestsTool.handler(ctx, {})) as { count: number };
    expect(all.count).toBe(2);
    const pending = (await listMyServiceRequestsTool.handler(ctx, { status: "pending" })) as {
      serviceRequests: { id: string }[];
    };
    expect(pending.serviceRequests.map((s) => s.id)).toEqual(["s1"]);
  });
});

describe("resident write previews", () => {
  const byName = new Map([...residentAgentRegistry.values()].map((t) => [t.name, t]));

  it("shows the resident exactly what will be filed", async () => {
    const ctx = residentCtx({});
    const tool = byName.get("report_maintenance_issue")!;
    const preview = await tool.preview!(ctx, { description: "Kitchen sink is leaking" });
    expect(preview.fields.some((f) => f.value.includes("Kitchen sink is leaking"))).toBe(true);
    expect(preview.fields.some((f) => f.value.includes("a@example.com"))).toBe(true);
  });

  it("refuses to file anything for a resident with no linked manager", async () => {
    const ctx = residentCtx({}, { ...SCOPE, managerUserId: null });
    const tool = byName.get("request_add_on_service")!;
    await expect(tool.preview!(ctx, { request: "a parking spot" })).rejects.toThrow(/linked to a property manager/i);
  });
});
