/**
 * Gated manager WRITE tools for the Services section: opening a work order and
 * deciding on a resident's add-on service request.
 *
 * Both re-resolve their target from the landlord's OWN rows
 * (`manager_user_id = ctx.landlordId`) at preview AND execute time, so a
 * model-supplied id belonging to another landlord can never be acted on. All
 * resident-authored text (a request's notes, a maintenance description) is data
 * that gets rendered on the confirmation card — never an instruction.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineWriteTool } from "../registry";
import type { ActionPreview } from "../registry";
import type { AgentContext } from "../context";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import { loadManagerApplications } from "./residents";
import { findOwnedResident } from "./residents-logic";

const WORK_ORDER_PRIORITIES = ["Low", "Medium", "High", "Emergency"] as const;

const createWorkOrderSchema = z
  .object({
    title: z.string().min(1).max(120).describe("Short job title, e.g. 'Kitchen faucet leak'."),
    description: z
      .string()
      .min(1)
      .max(2000)
      .describe("What needs doing — the detail the vendor will read."),
    priority: z.enum(WORK_ORDER_PRIORITIES).optional().describe("Defaults to Medium."),
    category: z
      .string()
      .max(60)
      .optional()
      .describe("Trade/category used to auto-match vendors, e.g. 'plumbing' or 'electrical'."),
    residentEmail: z
      .string()
      .optional()
      .describe(
        "Optional: the resident this job is for, as returned by list_residents. Must be one of the landlord's own residents.",
      ),
    propertyName: z.string().max(160).optional().describe("Optional property label for the job."),
    unit: z.string().max(60).optional().describe("Optional unit/room label."),
  })
  .strict();

type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

/**
 * Gated write: open a maintenance work order, the manager-side equivalent of
 * the Services -> Work orders "Create work order" action. Persists straight to
 * `portal_work_order_records` (the server-side source of truth) and then runs
 * the same `prepareDispatch` vendor-matching pass the UI path triggers, so the
 * job lands with a dispatch proposal ready for review.
 */
export const createWorkOrderTool = defineWriteTool<CreateWorkOrderInput, { reply: string }>({
  name: "create_work_order",
  description:
    "Open a new maintenance work order for the landlord (the Services -> Work orders create action). Optionally tie it to one of their residents with residentEmail from list_residents. After it is created, PropLane runs vendor auto-matching so a dispatch proposal is ready. The landlord sees the exact job and must confirm before it is created.",
  inputSchema: createWorkOrderSchema,
  preview: async (ctx, input): Promise<ActionPreview> => {
    const resident = input.residentEmail
      ? findOwnedResident(await loadManagerApplications(ctx), input.residentEmail)
      : null;
    if (input.residentEmail && !resident) {
      throw new Error("No resident with that email in this landlord's portfolio.");
    }
    return {
      kind: "create_work_order",
      title: "Open this work order",
      confirmLabel: "Create work order",
      fields: [
        { label: "Title", value: input.title },
        { label: "Priority", value: input.priority ?? "Medium" },
        ...(input.category ? [{ label: "Category", value: input.category }] : []),
        {
          label: "Property",
          value: input.propertyName || resident?.property || "Not specified",
        },
        ...(resident ? [{ label: "Resident", value: `${resident.name} (${resident.email})` }] : []),
        { label: "Details", value: input.description },
      ],
    };
  },
  handler: async (ctx, input) => {
    const resident = input.residentEmail
      ? findOwnedResident(await loadManagerApplications(ctx), input.residentEmail)
      : null;
    if (input.residentEmail && !resident) {
      throw new Error("No resident with that email in this landlord's portfolio.");
    }
    const nowIso = new Date().toISOString();
    const id = `WO-AI-${randomUUID().slice(0, 8).toUpperCase()}`;
    const propertyName = input.propertyName || resident?.property || "—";
    const row: DemoManagerWorkOrderRow = {
      id,
      title: input.title,
      description: input.description,
      priority: input.priority ?? "Medium",
      status: "Submitted",
      bucket: "open",
      category: input.category,
      propertyName,
      unit: input.unit,
      scheduled: "—",
      cost: "—",
      managerUserId: ctx.landlordId,
      managerInitiated: true,
      residentName: resident?.name,
      residentEmail: resident?.email?.trim().toLowerCase(),
    } as DemoManagerWorkOrderRow;

    // Record intent first, idempotently: the same title for the same landlord on
    // the same day is treated as a replayed confirm, not a second job.
    const dedupeKey = `create_work_order:${ctx.landlordId}:${input.title.trim().toLowerCase()}:${nowIso.slice(0, 10)}`;
    const { error: auditError } = await ctx.db.from("audit_log").insert({
      actor_user_id: ctx.userId,
      landlord_id: ctx.landlordId,
      action: "create_work_order",
      tool_name: "create_work_order",
      input_summary: { title: input.title, priority: row.priority },
      result_summary: { workOrderId: id },
      dedupe_key: dedupeKey,
      created_at: nowIso,
    });
    if (auditError) {
      if (auditError.code === "23505") {
        return { reply: `A work order titled "${input.title}" was already created today; nothing new was opened.` };
      }
      throw new Error("Could not record the action; no work order was created.");
    }

    const { error } = await ctx.db.from("portal_work_order_records").upsert(
      {
        id,
        manager_user_id: ctx.landlordId,
        resident_email: row.residentEmail ?? null,
        vendor_user_id: null,
        row_data: row,
        updated_at: nowIso,
      },
      { onConflict: "id" },
    );
    if (error) {
      await ctx.db
        .from("audit_log")
        .update({ dedupe_key: null, result_summary: { workOrderId: id, saved: false } })
        .eq("dedupe_key", dedupeKey);
      throw new Error("Could not save the work order.");
    }
    // Imported lazily: `work-order-dispatch.server` reaches the vendor agent,
    // which imports this registry — a static import would close that cycle and
    // leave the registry half-initialised at module load.
    // Vendor matching is best-effort: a failed match must not undo a saved job.
    await import("@/lib/work-order-dispatch.server")
      .then((m) => m.prepareDispatch(ctx.db, id))
      .catch(() => undefined);
    return { reply: `Opened "${input.title}" (${id}) at ${propertyName}. Vendor matching is running now.` };
  },
});

const decideServiceRequestSchema = z
  .object({
    requestId: z.string().min(1).describe("The request id from list_service_requests."),
    decision: z.enum(["approve", "deny"]).describe("Approve or deny the resident's request."),
    note: z.string().max(1000).optional().describe("Optional note recorded with the decision."),
  })
  .strict();

type DecideServiceRequestInput = z.infer<typeof decideServiceRequestSchema>;

/** The landlord's own service request, by id. Returns null for anyone else's. */
async function loadOwnedServiceRequest(
  ctx: AgentContext,
  requestId: string,
): Promise<ServiceRequest | null> {
  const { data, error } = await ctx.db
    .from("portal_service_request_records")
    .select("id, row_data")
    .eq("manager_user_id", ctx.landlordId)
    .eq("id", requestId.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = (data as { row_data?: unknown } | null)?.row_data;
  return row ? (row as ServiceRequest) : null;
}

/**
 * Gated write: approve or deny a resident's add-on service request (parking,
 * storage, cleaning, equipment rental — the Services -> Requests tab). Pricing
 * and any resulting charges stay a portal action; this only records the
 * decision, which is what the resident is waiting on.
 */
export const decideServiceRequestTool = defineWriteTool<DecideServiceRequestInput, { reply: string }>({
  name: "decide_service_request",
  description:
    "Approve or deny one of the landlord's pending add-on service requests (parking, storage, cleaning, equipment rentals — the Services -> Requests tab). Use list_service_requests first to get the request id. This records the decision only; it does not set a price or create a charge. The landlord sees the request and must confirm before the decision is recorded.",
  inputSchema: decideServiceRequestSchema,
  preview: async (ctx, input): Promise<ActionPreview> => {
    const request = await loadOwnedServiceRequest(ctx, input.requestId);
    if (!request) throw new Error("That service request isn't in your portfolio.");
    return {
      kind: "decide_service_request",
      title: input.decision === "approve" ? "Approve this request" : "Deny this request",
      confirmLabel: input.decision === "approve" ? "Approve" : "Deny",
      fields: [
        { label: "Service", value: request.offerName || "(untitled request)" },
        { label: "Resident", value: `${request.residentName || "Resident"} (${request.residentEmail})` },
        // Resident-authored text: shown to the landlord as data so they can see
        // exactly what they are approving.
        ...(request.notes ? [{ label: "Resident's note", value: request.notes }] : []),
        { label: "Current status", value: request.status },
        ...(input.note ? [{ label: "Your note", value: input.note }] : []),
      ],
      warnings:
        input.decision === "approve" && !request.price
          ? ["No price is set on this request — set it in Services → Requests before billing the resident."]
          : undefined,
    };
  },
  handler: async (ctx, input) => {
    const request = await loadOwnedServiceRequest(ctx, input.requestId);
    if (!request) throw new Error("That service request isn't in your portfolio.");
    if (request.status !== "pending") {
      return { reply: `That request is already ${request.status}; nothing changed.` };
    }
    const nowIso = new Date().toISOString();
    const status = input.decision === "approve" ? "approved" : "denied";
    const next: ServiceRequest = {
      ...request,
      status,
      ...(input.decision === "approve" ? { approvedAt: nowIso } : { deniedAt: nowIso }),
      ...(input.note ? { managerNote: input.note } : {}),
    };
    const { error } = await ctx.db
      .from("portal_service_request_records")
      .update({ status, row_data: next, updated_at: nowIso })
      .eq("manager_user_id", ctx.landlordId)
      .eq("id", request.id);
    if (error) throw new Error("Could not record the decision.");

    await ctx.db.from("audit_log").insert({
      actor_user_id: ctx.userId,
      landlord_id: ctx.landlordId,
      action: "decide_service_request",
      tool_name: "decide_service_request",
      input_summary: { requestId: request.id, decision: input.decision },
      result_summary: { status },
      created_at: nowIso,
    });

    return {
      reply: `${status === "approved" ? "Approved" : "Denied"} "${request.offerName}" for ${request.residentName || "the resident"}.`,
    };
  },
});

export const managerServicesWriteTools = [createWorkOrderTool, decideServiceRequestTool];
