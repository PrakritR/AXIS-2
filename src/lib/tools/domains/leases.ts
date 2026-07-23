import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import { normalizeLeasePipelineRow, type LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { amendLeaseMoveOutDate, checkMoveOutAvailabilityForLease } from "@/lib/lease-amendment.server";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { loadAllManagerRows } from "./load-manager-rows";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
    "List the current landlord's leases with their status (Draft, Manager Review, Resident Signature Pending, Manager Signature Pending, Fully Signed, Voided), resident, property, and lease dates. Use to answer questions about lease status or how many leases are awaiting signature, and to collect lease ids for amend_lease, void_lease, or send_lease_for_signature.",
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
        propertyId: r.propertyId || null,
        leaseStart: r.application?.leaseStart || null,
        leaseEnd: r.application?.leaseEnd || null,
        fullySignedAt: r.fullySignedAt || null,
      })),
    };
  },
});

/** The lease record columns every lease write tool resolves and re-verifies. */
type OwnedLeaseRecord = {
  id: string;
  manager_user_id: string | null;
  property_id: string | null;
  resident_email: string | null;
  row_data: unknown;
};

/**
 * Resolve a single lease record by id, scoped to the landlord. The explicit
 * manager_user_id filter is the ownership gate (the service role bypasses
 * RLS) — a foreign or unknown lease id simply resolves to null.
 */
async function findOwnedLeaseRecord(ctx: AgentContext, leaseId: string): Promise<OwnedLeaseRecord | null> {
  const { data, error } = await ctx.db
    .from("portal_lease_pipeline_records")
    .select("id, row_data, manager_user_id, property_id, resident_email")
    .eq("id", leaseId.trim())
    .eq("manager_user_id", ctx.landlordId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OwnedLeaseRecord | null) ?? null;
}

const SIGNATURE_RESET_WARNING =
  "Both signatures reset; the lease returns to review and must be re-signed.";

export const amendLeaseTool = defineWriteTool({
  name: "amend_lease",
  description:
    "Change a fully signed lease's move-out (end) date — extend, renew, or shorten it. Pass the lease id from list_leases and the new end date; extensions are checked against the room's availability first and rejected with the conflict reason if the room is booked.",
  kind: "write",
  inputSchema: z
    .object({
      leaseId: z.string().min(1).describe("Id of the lease to amend, from list_leases."),
      newLeaseEnd: z
        .string()
        .regex(DATE_RE, "Use YYYY-MM-DD.")
        .describe("New lease end / move-out date in YYYY-MM-DD format."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) {
      return {
        ok: false,
        error: `No lease with id ${input.leaseId} belongs to this landlord. Use list_leases to get valid lease ids.`,
      };
    }
    const row = normalizeLeasePipelineRow(record.row_data);
    if (row.status !== "Fully Signed") {
      return { ok: false, error: "Only fully signed leases can be renewed or extended." };
    }
    const currentEnd = row.application?.leaseEnd ?? "";
    if (input.newLeaseEnd === currentEnd) {
      return { ok: false, error: "The new move-out date is the same as the current lease end date." };
    }
    const availability = await checkMoveOutAvailabilityForLease(ctx.db, row, record, input.newLeaseEnd);
    if (!availability.ok) {
      const nextAvailable = availability.nextAvailableDate
        ? ` Next available date: ${availability.nextAvailableDate}.`
        : "";
      return { ok: false, error: `${availability.reason}${nextAvailable}` };
    }
    const verb = availability.direction === "decrease" ? "Shorten" : "Extend";
    return {
      ok: true,
      input: { leaseId: record.id, newLeaseEnd: input.newLeaseEnd },
      preview: {
        title: "Amend lease move-out date",
        summary: `${verb} ${row.residentName}'s lease${row.unit && row.unit !== "—" ? ` at ${row.unit}` : ""} to end ${input.newLeaseEnd}.`,
        lines: [
          { label: "Resident", value: row.residentName },
          { label: "Unit", value: row.unit },
          { label: "Current end", value: currentEnd || "—" },
          { label: "New end", value: input.newLeaseEnd },
        ],
        confirmLabel: "Amend lease",
        warning: SIGNATURE_RESET_WARNING,
      },
    };
  },
  execute: async (ctx, input) => {
    // Re-resolve at execute time — the preview's record is never trusted as
    // ownership proof, and lease state may have changed since.
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) return { ok: false, error: "No matching lease for this landlord." };
    const row = normalizeLeasePipelineRow(record.row_data);

    // Record intent first, idempotently — one amend per lease per target date.
    const dedupeKey = `amend_lease:${ctx.landlordId}:${record.id}:${input.newLeaseEnd}`;
    const audit = await writeAuditLog(ctx, {
      action: "amend_lease",
      toolName: "amend_lease",
      inputSummary: { leaseId: record.id, newLeaseEnd: input.newLeaseEnd },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: `This lease was already amended to end ${input.newLeaseEnd}.` };
      }
      return { ok: false, error: "Could not record the action; the lease was not amended." };
    }

    // amendLeaseMoveOutDate re-checks signatures, dates, and room availability
    // against live data, regenerates the document, and resets both signatures
    // back to manager review — the same path as the manager amend route.
    const result = await amendLeaseMoveOutDate(ctx.db, record, input.newLeaseEnd);
    if (!result.ok) {
      await updateAuditResult(ctx, dedupeKey, { amended: false }, { clearDedupeKey: true });
      return { ok: false, error: result.error };
    }
    await updateAuditResult(ctx, dedupeKey, { amended: true, direction: result.direction, newLeaseEnd: result.newLeaseEnd });
    const verb = result.direction === "extend" ? "extended" : "shortened";
    return {
      ok: true,
      reply: `${row.residentName}'s lease was ${verb} to end ${result.newLeaseEnd}. Both signatures were reset — the lease is back in manager review and must be re-signed.`,
      resultSummary: { leaseId: record.id, direction: result.direction, newLeaseEnd: result.newLeaseEnd },
    };
  },
});

export const voidLeaseTool = defineWriteTool({
  name: "void_lease",
  description:
    "Permanently void a lease so it can no longer be signed or enforced. Pass the lease id from list_leases; an optional reason is recorded on the lease's activity thread.",
  kind: "write",
  destructive: true,
  inputSchema: z
    .object({
      leaseId: z.string().min(1).describe("Id of the lease to void, from list_leases."),
      reason: z
        .string()
        .max(500)
        .optional()
        .describe("Optional short reason recorded on the lease's activity thread."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) {
      return {
        ok: false,
        error: `No lease with id ${input.leaseId} belongs to this landlord. Use list_leases to get valid lease ids.`,
      };
    }
    const row = normalizeLeasePipelineRow(record.row_data);
    if (row.status === "Voided") {
      return { ok: false, error: "This lease is already voided." };
    }
    const reason = input.reason?.trim();
    return {
      ok: true,
      input: { leaseId: record.id, ...(reason ? { reason } : {}) },
      preview: {
        title: "Void lease",
        summary: `Void ${row.residentName}'s lease${row.unit && row.unit !== "—" ? ` at ${row.unit}` : ""}.`,
        lines: [
          { label: "Resident", value: row.residentName },
          { label: "Unit", value: row.unit },
          { label: "Current status", value: row.status ?? row.stageLabel },
          ...(reason ? [{ label: "Reason", value: reason }] : []),
        ],
        confirmLabel: "Void lease",
        warning: "Voiding is permanent; the resident keeps portal access.",
      },
    };
  },
  execute: async (ctx, input) => {
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) return { ok: false, error: "No matching lease for this landlord." };
    const row = normalizeLeasePipelineRow(record.row_data);
    if (row.status === "Voided") {
      return { ok: true, reply: `The lease for ${row.residentName} is already voided.` };
    }

    // One-shot transition: record intent first; retries return already-done.
    const dedupeKey = `void_lease:${ctx.landlordId}:${record.id}`;
    const audit = await writeAuditLog(ctx, {
      action: "void_lease",
      toolName: "void_lease",
      inputSummary: { leaseId: record.id },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: "This lease was already voided." };
      return { ok: false, error: "Could not record the action; the lease was not voided." };
    }

    // Read-merge-write the CURRENT row_data (never constructed from scratch) so
    // unrelated fields — documents, signatures, thread — are preserved verbatim.
    const nowIso = new Date().toISOString();
    const current = (record.row_data && typeof record.row_data === "object" ? record.row_data : {}) as Record<
      string,
      unknown
    >;
    const thread = Array.isArray(current.thread) ? current.thread : [];
    const reason = input.reason?.trim();
    const nextRowData = {
      ...current,
      voidedAt: nowIso,
      // workflowStatusForRow conventions: voidedAt => "Voided", actor "system".
      status: "Voided",
      stageLabel: "Voided",
      currentActorRole: "system",
      thread: [
        ...thread,
        {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          at: nowIso,
          role: "manager",
          body: reason ? `Lease voided — ${reason}` : "Lease voided by manager.",
        },
      ],
      updatedAtIso: nowIso,
      updated: "just now",
    };
    const { error } = await ctx.db
      .from("portal_lease_pipeline_records")
      .update({
        // The top-level status column mirrors buildUpsert in the pipeline
        // route: bucket first, workflow status as the fallback.
        status: (current.bucket as string | undefined) ?? "Voided",
        row_data: nextRowData,
        updated_at: nowIso,
      })
      .eq("id", record.id)
      .eq("manager_user_id", ctx.landlordId);
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { voided: false }, { clearDedupeKey: true });
      return { ok: false, error: error.message };
    }
    await updateAuditResult(ctx, dedupeKey, { voided: true });
    return {
      ok: true,
      reply: `Voided the lease for ${row.residentName}${row.unit && row.unit !== "—" ? ` at ${row.unit}` : ""}. This is permanent; the resident keeps portal access.`,
      resultSummary: { leaseId: record.id, voided: true },
    };
  },
});

/**
 * Guards shared by send_lease_for_signature's preview and execute — the same
 * checks sendLeaseToResident applies in the Leases UI.
 */
function sendForSignatureBlocker(row: LeasePipelineRow): string | null {
  if (!row.generatedHtml && !row.managerUploadedPdf?.dataUrl) {
    return "This lease has no lease document yet — generate or upload one in Leases first.";
  }
  if (row.status === "Fully Signed" || row.status === "Voided") {
    return "This lease is already finalized.";
  }
  if (row.managerSignature || row.residentSignature || (row.signatureName && row.signedAtIso)) {
    return "This lease already has signatures and cannot be re-sent.";
  }
  if (!row.residentEmail.trim().toLowerCase().includes("@")) {
    return "This lease has no resident email on file, so the resident cannot be notified to sign.";
  }
  return null;
}

export const sendLeaseForSignatureTool = defineWriteTool({
  name: "send_lease_for_signature",
  description:
    "Send a prepared lease to its resident for electronic signature: moves the lease to the resident's signing queue and notifies them in their portal inbox and by email. The lease must already have a generated or uploaded document; pass the lease id from list_leases.",
  kind: "write",
  inputSchema: z
    .object({
      leaseId: z.string().min(1).describe("Id of the lease to send, from list_leases."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) {
      return {
        ok: false,
        error: `No lease with id ${input.leaseId} belongs to this landlord. Use list_leases to get valid lease ids.`,
      };
    }
    const row = normalizeLeasePipelineRow(record.row_data);
    const blocker = sendForSignatureBlocker(row);
    if (blocker) return { ok: false, error: blocker };
    const residentEmail = row.residentEmail.trim().toLowerCase();
    return {
      ok: true,
      input: { leaseId: record.id },
      preview: {
        title: "Send lease for signature",
        summary: `Send ${row.residentName}'s lease to ${residentEmail} for electronic signature.`,
        lines: [
          { label: "Resident", value: row.residentName },
          { label: "Email", value: residentEmail },
          { label: "Unit", value: row.unit },
          { label: "Document", value: row.managerUploadedPdf?.dataUrl ? "Uploaded PDF" : "Generated lease" },
        ],
        confirmLabel: "Send for signature",
      },
    };
  },
  execute: async (ctx, input) => {
    const record = await findOwnedLeaseRecord(ctx, input.leaseId);
    if (!record) return { ok: false, error: "No matching lease for this landlord." };
    const row = normalizeLeasePipelineRow(record.row_data);
    const blocker = sendForSignatureBlocker(row);
    if (blocker) return { ok: false, error: blocker };
    const residentEmail = row.residentEmail.trim().toLowerCase();

    // Repeatable send: idempotent per lease per day.
    const dedupeKey = `send_lease_for_signature:${ctx.landlordId}:${record.id}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "send_lease_for_signature",
      toolName: "send_lease_for_signature",
      inputSummary: { leaseId: record.id },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: "This lease was already sent to the resident today." };
      }
      return { ok: false, error: "Could not record the action; the lease was not sent." };
    }

    // Same field transition the Leases UI writes (sendLeaseToResident in
    // lease-pipeline-storage): resident-signature stage, signatures cleared.
    const nowIso = new Date().toISOString();
    const current = (record.row_data && typeof record.row_data === "object" ? record.row_data : {}) as Record<
      string,
      unknown
    >;
    const nextRowData = {
      ...current,
      bucket: "resident",
      status: "Resident Signature Pending",
      stageLabel: "Resident Signature Pending",
      currentActorRole: "resident",
      sentToResidentAt: nowIso,
      managerSignature: null,
      residentSignature: null,
      signatureName: null,
      signedAtIso: null,
      updatedAtIso: nowIso,
      updated: "just now",
    };
    const { error } = await ctx.db
      .from("portal_lease_pipeline_records")
      .update({ status: "resident", row_data: nextRowData, updated_at: nowIso })
      .eq("id", record.id)
      .eq("manager_user_id", ctx.landlordId);
    if (error) {
      await updateAuditResult(ctx, dedupeKey, { sent: false }, { clearDedupeKey: true });
      return { ok: false, error: error.message };
    }

    // Best-effort resident notification (portal inbox + email). A delivery
    // failure never rolls back the workflow transition.
    let notified = false;
    try {
      const { data: profile } = await ctx.db
        .from("profiles")
        .select("full_name")
        .eq("id", ctx.landlordId)
        .maybeSingle();
      const fromName = String(profile?.full_name ?? "").trim() || "Your property manager";
      const delivery = await deliverPortalInboxMessage(ctx.db, {
        senderUserId: ctx.userId,
        senderEmail: ctx.email,
        fromName,
        subject: "Your lease is ready to sign",
        text: `Your lease${row.unit && row.unit !== "—" ? ` for ${row.unit}` : ""} is ready for your electronic signature. Log in to your Axis resident portal to review and sign it.`,
        toEmails: [residentEmail],
        deliverToPortalInbox: true,
        deliverViaEmail: true,
        deliverViaSms: false,
      });
      notified = delivery.ok;
    } catch {
      notified = false;
    }

    await updateAuditResult(ctx, dedupeKey, { residentEmail, sent: true, notified });
    return {
      ok: true,
      reply: notified
        ? `Sent the lease to ${row.residentName} (${residentEmail}) for signature — they've been notified in their portal inbox.`
        : `Sent the lease to ${row.residentName} for signature. The notification could not be delivered, but the lease is waiting in their portal.`,
      resultSummary: { leaseId: record.id, notified },
    };
  },
});
