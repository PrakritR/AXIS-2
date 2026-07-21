/**
 * Vendor-portal assistant tools (the "Ask PropLane" surface inside /vendor).
 *
 * Every query filters by `vendor_user_id = ctx.vendorPortalScope.vendorUserId` —
 * the authenticated session user id, never model or client input — so a vendor
 * can only ever reach their own jobs, bids, and schedule. This is the same
 * scoping rule the vendor-financials tools already follow.
 *
 * W-9 / TIN data is deliberately absent here, as everywhere else in the tool
 * map: tax identifiers must never reach the model.
 */
import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext, VendorPortalScope } from "../context";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";

/** The vendor scope, or a hard failure — a vendor tool must never run unscoped. */
export function requireVendorPortalScope(ctx: AgentContext): VendorPortalScope {
  const scope = ctx.vendorPortalScope;
  if (!scope?.vendorUserId) {
    throw new Error("This tool is only available to a signed-in vendor.");
  }
  return scope;
}

/** Safe projection of a job as the vendor sees it (no manager-internal fields). */
function summarizeJob(r: DemoManagerWorkOrderRow) {
  return {
    id: r.id,
    title: r.title || null,
    status: r.status || null,
    bucket: r.bucket || null,
    priority: r.priority || null,
    category: r.category || null,
    description: r.description || null,
    property: r.propertyName || null,
    unit: r.unit || null,
    scheduled: r.scheduled || r.scheduledAtIso || null,
    cost: r.cost || null,
    completedAt: r.completedAt || null,
  };
}

export const listMyJobsTool = defineTool({
  name: "list_my_jobs",
  description:
    "List the jobs assigned to the signed-in vendor (the 'Services' section of the vendor portal): title, status, priority, category, property, scheduled visit, and agreed cost. Use for 'what work do I have this week', 'which jobs are still open'.",
  kind: "read",
  inputSchema: z
    .object({
      bucket: z
        .string()
        .optional()
        .describe("Optional case-insensitive stage filter, e.g. 'open', 'scheduled', or 'completed'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const scope = requireVendorPortalScope(ctx);
    const { data, error } = await ctx.db
      .from("portal_work_order_records")
      .select("id, row_data")
      .eq("vendor_user_id", scope.vendorUserId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const want = input.bucket?.trim().toLowerCase();
    const jobs = ((data ?? []) as { row_data: unknown }[])
      .map((r) => r.row_data as DemoManagerWorkOrderRow)
      .filter(Boolean)
      .filter((r) => !want || String(r.bucket ?? "").toLowerCase() === want)
      .map(summarizeJob);
    return { count: jobs.length, jobs };
  },
});

export const listMyBidsTool = defineTool({
  name: "list_my_bids",
  description:
    "List the quotes/bids the signed-in vendor has submitted on work orders, with quote mode (upfront price, or site visit first and price after), labor and materials amounts in cents, proposed time, and status (submitted/accepted/declined). Use for 'which of my quotes were accepted'.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .enum(["submitted", "accepted", "declined"])
        .optional()
        .describe("Optional filter to a single bid status."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const scope = requireVendorPortalScope(ctx);
    let query = ctx.db
      .from("work_order_bids")
      .select(
        "id, work_order_id, quote_mode, consultation_visit_at, amount_cents, materials_cents, proposed_time, status, created_at",
      )
      .eq("vendor_user_id", scope.vendorUserId)
      .order("created_at", { ascending: false });
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const bids = ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: String(b.id ?? ""),
      workOrderId: String(b.work_order_id ?? ""),
      quoteMode: String(b.quote_mode ?? "") || null,
      consultationVisitAt: (b.consultation_visit_at as string | null) ?? null,
      amountCents: (b.amount_cents as number | null) ?? null,
      materialsCents: (b.materials_cents as number | null) ?? 0,
      proposedTime: (b.proposed_time as string | null) ?? null,
      status: String(b.status ?? "") || null,
      createdAt: String(b.created_at ?? "") || null,
    }));
    return { count: bids.length, bids };
  },
});

export const listMyScheduleTool = defineTool({
  name: "list_my_schedule",
  description:
    "List the signed-in vendor's own calendar entries (site visits, job appointments, and work events they created) with title, date/time, and property. Use for 'what's on my calendar', 'when is my next visit'.",
  kind: "read",
  inputSchema: z
    .object({
      from: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) lower bound."),
      to: z.string().optional().describe("Optional ISO date (YYYY-MM-DD) upper bound."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const scope = requireVendorPortalScope(ctx);
    const { data, error } = await ctx.db
      .from("portal_schedule_records")
      .select("id, row_data")
      .eq("owner_user_id", scope.vendorUserId)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw new Error(error.message);
    const events = ((data ?? []) as { row_data: unknown }[])
      .map((r) => (r.row_data ?? {}) as Record<string, unknown>)
      .map((e) => ({
        id: String(e.id ?? "") || null,
        title: String(e.title ?? e.label ?? "") || null,
        date: String(e.date ?? e.startDate ?? "") || null,
        start: String(e.start ?? e.startTime ?? "") || null,
        end: String(e.end ?? e.endTime ?? "") || null,
        property: String(e.propertyName ?? e.property ?? "") || null,
        kind: String(e.kind ?? e.type ?? "") || null,
      }))
      .filter((e) => {
        if (input.from && e.date && e.date < input.from) return false;
        if (input.to && e.date && e.date > input.to) return false;
        return true;
      });
    return { count: events.length, events };
  },
});

/** Vendor-portal reads that complement the vendor-financials tools. */
export const vendorPortalTools = [listMyJobsTool, listMyBidsTool, listMyScheduleTool];
