import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import { loadAllManagerRows } from "./load-manager-rows";
import { suggestVendorsForWorkOrder } from "@/lib/work-order-auto-match";

/** Server-side read of the landlord's work orders, scoped by manager_user_id. */
async function loadManagerWorkOrders(ctx: AgentContext): Promise<DemoManagerWorkOrderRow[]> {
  return loadAllManagerRows(
    ctx,
    "portal_work_order_records",
    (rowData) => rowData as DemoManagerWorkOrderRow,
  );
}

/**
 * Server-side read of vendors eligible to be suggested for one of the
 * landlord's work orders: the landlord's own vendors, plus other managers'
 * vendors that have opted in via `sharedWithManagers`. Mirrors the shared-row
 * query in `/api/portal-vendors` (route.ts) so agent suggestions match what
 * the manager Vendors UI already considers "available to me".
 */
async function loadVendorsForMatching(ctx: AgentContext): Promise<ManagerVendorRow[]> {
  const ownRows = await loadAllManagerRows(
    ctx,
    "manager_vendor_records",
    (rowData) => rowData as ManagerVendorRow,
  );

  const { data: sharedData, error: sharedError } = await ctx.db
    .from("manager_vendor_records")
    .select("row_data, manager_user_id")
    .neq("manager_user_id", ctx.landlordId)
    .eq("row_data->>sharedWithManagers", "true")
    .limit(200);
  if (sharedError) throw new Error(sharedError.message);

  const sharedRows: ManagerVendorRow[] = ((sharedData ?? []) as { row_data: unknown; manager_user_id: string }[])
    .map((record) => ({ ...(record.row_data as ManagerVendorRow), managerUserId: record.manager_user_id }))
    .filter((row) => Boolean(row?.id));

  const byId = new Map<string, ManagerVendorRow>();
  for (const row of [...ownRows, ...sharedRows]) byId.set(row.id, row);
  return [...byId.values()];
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

export const suggestVendorsForWorkOrderTool = defineTool({
  name: "suggest_vendors_for_work_order",
  description:
    "Suggest a ranked shortlist of candidate vendors for one of the landlord's work orders, based on trade/category match, property coverage, and fairness (least-recently-assigned first). This is a SUGGESTION only — it does not assign a vendor, send any notification, or change the work order. The manager must still review and confirm before a vendor is contacted. Returns an empty list when no vendor matches.",
  kind: "read",
  inputSchema: z
    .object({
      workOrderId: z.string().describe("The id of the work order to suggest vendors for."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const workOrders = await loadManagerWorkOrders(ctx);
    const workOrder = workOrders.find((r) => r.id === input.workOrderId);
    if (!workOrder) {
      return { found: false, message: "Work order not found." };
    }

    const vendors = await loadVendorsForMatching(ctx);
    const candidates = suggestVendorsForWorkOrder(workOrder, vendors, { allWorkOrders: workOrders });
    return { found: true, workOrderId: workOrder.id, category: workOrder.category ?? null, candidates };
  },
});
