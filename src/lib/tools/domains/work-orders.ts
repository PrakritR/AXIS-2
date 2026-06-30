import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { loadAllManagerRows } from "./load-manager-rows";

/** Server-side read of the landlord's work orders, scoped by manager_user_id. */
async function loadManagerWorkOrders(ctx: AgentContext): Promise<DemoManagerWorkOrderRow[]> {
  return loadAllManagerRows(
    ctx,
    "portal_work_order_records",
    (rowData) => rowData as DemoManagerWorkOrderRow,
  );
}

/**
 * Project only the fields the agent needs to describe a work order. Raw photo
 * data URLs and internal id references are intentionally omitted to keep results
 * compact and free of large blobs.
 */
function summarizeWorkOrder(r: DemoManagerWorkOrderRow) {
  return {
    id: r.id,
    title: r.title || null,
    status: r.status || null,
    bucket: r.bucket || null,
    priority: r.priority || null,
    property: r.propertyName || null,
    unit: r.unit || null,
    residentName: r.residentName || null,
    residentEmail: r.residentEmail || null,
    scheduled: r.scheduled || r.scheduledAtIso || null,
    cost: r.cost || null,
    vendorName: r.vendorName || null,
    category: r.category || null,
    description: r.description || null,
    completedAt: r.completedAt || null,
    managerInitiated: r.managerInitiated === true,
  };
}

export const listWorkOrdersTool = defineTool({
  name: "list_work_orders",
  description:
    "List the current landlord's maintenance work orders with status, priority, property/unit, resident, scheduled date, cost, and assigned vendor. Use to answer questions like 'what work orders are open', 'which maintenance is scheduled', or 'how many work orders are completed'.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on work order status, e.g. 'open' or 'completed'."),
      bucket: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on the work order bucket/stage, e.g. 'scheduled'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadManagerWorkOrders(ctx);
    const wantStatus = input.status?.trim().toLowerCase();
    const wantBucket = input.bucket?.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (wantStatus && String(r.status ?? "").toLowerCase() !== wantStatus) return false;
      if (wantBucket && String(r.bucket ?? "").toLowerCase() !== wantBucket) return false;
      return true;
    });
    return { count: filtered.length, workOrders: filtered.map(summarizeWorkOrder) };
  },
});
