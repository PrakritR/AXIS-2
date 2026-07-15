import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import {
  leaseAllowsManagerDocumentEdits,
  normalizeLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { loadAllManagerRows } from "./load-manager-rows";
import {
  applyLeaseDraftUpdate,
  buildLeaseDraft,
  buildLeaseDraftPreview,
  type CreateLeaseDraftInput,
  type UpdateLeaseDraftInput,
} from "./leases-logic";
import { loadManagerApplications } from "./residents";
import { findOwnedResident } from "./residents-logic";

/** Server-side read of the landlord's lease pipeline, scoped by manager_user_id. */
async function loadManagerLeases(ctx: AgentContext): Promise<LeasePipelineRow[]> {
  return loadAllManagerRows(
    ctx,
    "portal_lease_pipeline_records",
    (rowData) => normalizeLeasePipelineRow(rowData),
  );
}

export const listLeasesTool = defineTool({
  name: "list_leases",
  description:
    "List the current landlord's leases with their status (Draft, Manager Review, Resident Signature Pending, Manager Signature Pending, Fully Signed, Voided), resident, and property. Use to answer questions about lease status or how many leases are awaiting signature.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on lease status, e.g. 'Fully Signed'."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const rows = await loadManagerLeases(ctx);
    const wanted = input.status?.trim().toLowerCase();
    const filtered = wanted
      ? rows.filter((r) => String(r.status ?? r.stageLabel ?? "").toLowerCase() === wanted)
      : rows;
    return {
      count: filtered.length,
      leases: filtered.map((r) => ({
        id: r.id,
        status: r.status ?? r.stageLabel ?? null,
        residentName: r.residentName || null,
        residentEmail: r.residentEmail || null,
        unit: r.unit || null,
      })),
    };
  },
});

/** Upsert a lease row through the same column mapping as the pipeline route. */
async function upsertLeaseRow(ctx: AgentContext, row: LeasePipelineRow): Promise<void> {
  const { error } = await ctx.db.from("portal_lease_pipeline_records").upsert(
    {
      id: row.id,
      manager_user_id: ctx.landlordId,
      resident_user_id: row.residentUserId ?? null,
      resident_email: row.residentEmail || null,
      property_id: row.propertyId ?? null,
      status: row.bucket,
      row_data: row,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error("Could not save the lease draft.");
}

async function writeLeaseAudit(
  ctx: AgentContext,
  action: string,
  leaseId: string,
  dedupeKey: string | null,
): Promise<"ok" | "duplicate"> {
  const { error } = await ctx.db.from("audit_log").insert({
    actor_user_id: ctx.userId,
    landlord_id: ctx.landlordId,
    action,
    tool_name: action,
    input_summary: { leaseId },
    result_summary: {},
    dedupe_key: dedupeKey,
    created_at: new Date().toISOString(),
  });
  if (error?.code === "23505") return "duplicate";
  if (error) throw new Error("Could not record the action; nothing was saved.");
  return "ok";
}

/**
 * Gated write: start a lease draft (including a renewal — a fresh draft for an
 * existing resident). The resident is re-resolved from the landlord's own
 * residents at preview and execute time.
 */
export const createLeaseDraftTool = defineWriteTool<CreateLeaseDraftInput, { reply: string }>({
  name: "create_lease_draft",
  description:
    "Start a new lease draft for one of the landlord's own residents (also used for renewals). Use list_residents first to get the resident's email. The landlord sees the draft details and must confirm before it is created.",
  inputSchema: z
    .object({
      residentEmail: z
        .string()
        .describe("The resident's email, as returned by list_residents. Must be one of the landlord's own residents."),
      unit: z.string().max(120).optional().describe("Optional unit/room label; defaults to the resident's assigned room."),
      notes: z.string().max(2000).optional().describe("Optional notes to record on the draft."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const resident = findOwnedResident(await loadManagerApplications(ctx), input.residentEmail);
    if (!resident) throw new Error("No resident with that email in this landlord's portfolio.");
    return buildLeaseDraftPreview(
      buildLeaseDraft(resident, input, ctx.landlordId, "preview", new Date().toISOString()),
      "create",
    );
  },
  handler: async (ctx, input) => {
    const resident = findOwnedResident(await loadManagerApplications(ctx), input.residentEmail);
    if (!resident) throw new Error("No resident with that email in this landlord's portfolio.");
    const nowIso = new Date().toISOString();
    const row = buildLeaseDraft(resident, input, ctx.landlordId, `lease_${randomUUID()}`, nowIso);
    // One agent-created draft per resident per day guards double-confirms.
    const dedupeKey = `create_lease_draft:${ctx.landlordId}:${row.residentEmail}:${nowIso.slice(0, 10)}`;
    if ((await writeLeaseAudit(ctx, "create_lease_draft", row.id, dedupeKey)) === "duplicate") {
      return { reply: `A lease draft for ${row.residentName} was already created today; nothing new was created.` };
    }
    await upsertLeaseRow(ctx, row);
    return { reply: `Created a lease draft for ${row.residentName}${row.unit !== "—" ? ` (unit ${row.unit})` : ""}. It's in the Leases tab under Draft.` };
  },
});

/** Load one lease row owned by this landlord, or null. */
async function loadOwnedLease(ctx: AgentContext, leaseId: string): Promise<LeasePipelineRow | null> {
  const id = leaseId.trim();
  if (!id) return null;
  const { data } = await ctx.db
    .from("portal_lease_pipeline_records")
    .select("row_data")
    .eq("id", id)
    .eq("manager_user_id", ctx.landlordId)
    .maybeSingle();
  if (!data?.row_data) return null;
  return normalizeLeasePipelineRow(data.row_data);
}

/**
 * Gated write: update the whitelisted editable fields (unit, notes) of an
 * existing draft. Deliberately stricter than the UI: drafts only, refused once
 * any signature exists.
 */
export const updateLeaseDraftTool = defineWriteTool<UpdateLeaseDraftInput, { reply: string }>({
  name: "update_lease_draft",
  description:
    "Update the unit or notes on one of the landlord's existing lease drafts (use list_leases to find the lease id). Only drafts that have no signatures can be edited. The landlord must confirm before anything changes.",
  inputSchema: z
    .object({
      leaseId: z.string().describe("The lease id from list_leases."),
      unit: z.string().max(120).optional().describe("New unit/room label."),
      notes: z.string().max(2000).optional().describe("New notes (replaces the existing notes)."),
    })
    .strict(),
  preview: async (ctx, input) => {
    if (input.unit === undefined && input.notes === undefined) {
      throw new Error("Nothing to update: provide unit and/or notes.");
    }
    const row = await loadOwnedLease(ctx, input.leaseId);
    if (!row) throw new Error("No lease with that id in this landlord's portfolio.");
    if (!leaseAllowsManagerDocumentEdits(row)) {
      throw new Error("This lease can no longer be edited (it has signatures or has left manager review).");
    }
    return buildLeaseDraftPreview(applyLeaseDraftUpdate(row, input, new Date().toISOString()), "update");
  },
  handler: async (ctx, input) => {
    const row = await loadOwnedLease(ctx, input.leaseId);
    if (!row) throw new Error("No lease with that id in this landlord's portfolio.");
    if (!leaseAllowsManagerDocumentEdits(row)) {
      throw new Error("This lease can no longer be edited (it has signatures or has left manager review).");
    }
    const updated = applyLeaseDraftUpdate(row, input, new Date().toISOString());
    await writeLeaseAudit(ctx, "update_lease_draft", updated.id, null);
    await upsertLeaseRow(ctx, updated);
    return { reply: `Updated the lease draft for ${updated.residentName}.` };
  },
});
