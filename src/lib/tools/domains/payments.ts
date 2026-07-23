import { z } from "zod";
import { defineTool, defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import type { HouseholdCharge } from "@/lib/household-charges";
import { loadAllManagerRows } from "./load-manager-rows";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";
import {
  filterOverdueCharges,
  findOwnedOverdueCharge,
  buildRentReminderPreview,
  type RentReminderPreview,
} from "./payments-logic";

/** Server-side read of the landlord's charges, scoped by manager_user_id. */
async function loadManagerCharges(ctx: AgentContext): Promise<HouseholdCharge[]> {
  return loadAllManagerRows(
    ctx,
    "portal_household_charge_records",
    (rowData) => rowData as HouseholdCharge,
  );
}

export const getOverdueChargesTool = defineTool({
  name: "get_overdue_charges",
  description:
    "List the current landlord's overdue charges (past due and unpaid): tenants who are late on rent or other charges. Returns each charge's id, resident name, amount due, property, and due date. Use this to answer 'who is late on rent' and similar questions, and to collect charge ids for send_rent_reminder.",
  kind: "read",
  inputSchema: z.object({}).strict(),
  handler: async (ctx) => {
    const overdue = filterOverdueCharges(await loadManagerCharges(ctx));
    return { count: overdue.length, charges: overdue.map(buildRentReminderPreview) };
  },
});

/** Safe projection of a charge for listing (no internal/user-id fields). */
function summarizeCharge(c: HouseholdCharge) {
  return {
    id: c.id,
    residentName: c.residentName || null,
    residentEmail: (c.residentEmail || "").trim().toLowerCase() || null,
    property: c.propertyLabel || null,
    kind: c.kind || null,
    title: c.title || null,
    amount: c.amountLabel || null,
    balance: c.balanceLabel || null,
    status: c.status || null,
    dueDate: c.dueDateLabel || null,
  };
}

export const listChargesTool = defineTool({
  name: "list_charges",
  description:
    "List the current landlord's household charges (rent, deposits, fees, and other charges), optionally filtered by status or resident. Returns each charge's id, resident, property, kind, amount, balance, status, and due date. Use for questions like 'what charges does this tenant have' or 'show all unpaid deposits'. For who is *late*, prefer get_overdue_charges.",
  kind: "read",
  inputSchema: z
    .object({
      status: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter on charge status, e.g. 'paid' or 'pending'."),
      residentEmail: z
        .string()
        .optional()
        .describe("Optional case-insensitive filter to a single resident's email."),
    })
    .strict(),
  handler: async (ctx, input) => {
    const wantStatus = input.status?.trim().toLowerCase();
    const wantEmail = input.residentEmail?.trim().toLowerCase();
    const filtered = (await loadManagerCharges(ctx)).filter((c) => {
      if (wantStatus && String(c.status ?? "").toLowerCase() !== wantStatus) return false;
      if (wantEmail && String(c.residentEmail ?? "").trim().toLowerCase() !== wantEmail) return false;
      return true;
    });
    return { count: filtered.length, charges: filtered.map(summarizeCharge) };
  },
});

/** Builds the reminder email/inbox body from authoritative server data. */
function buildReminderBody(p: RentReminderPreview): string {
  const lines = [`Hi ${p.residentName},`, "", `This is a reminder that your ${p.chargeTitle} payment is outstanding.`];
  if (p.balanceDue) lines.push(`Amount due: ${p.balanceDue}`);
  if (p.propertyLabel) lines.push(`Property: ${p.propertyLabel}`);
  lines.push("", "Please log in to your Axis resident portal to make your payment.", "", "Axis Portal");
  return lines.join("\n");
}

export type ReminderDelivery = "emailed" | "portal_only" | "email_failed" | "already_sent";

/**
 * Per-charge reminder core. The charge MUST already be re-resolved from the
 * landlord's own overdue set — every value that reaches an outbound channel
 * comes from that record, never from client- or model-supplied input. Records
 * intent in audit_log BEFORE sending, idempotent per charge per day.
 */
async function sendReminderForCharge(
  ctx: AgentContext,
  charge: HouseholdCharge,
): Promise<{ preview: RentReminderPreview; delivery: ReminderDelivery }> {
  const preview = buildRentReminderPreview(charge);
  const subject = `Payment reminder: ${preview.chargeTitle}`;
  const body = buildReminderBody(preview);
  const nowIso = new Date().toISOString();

  // 1. Record intent first, idempotently. A duplicate on the dedupe key means
  //    this charge was already reminded today — do not send again. Any other
  //    audit error fails loudly: we never send without an audit record.
  const dedupeKey = `send_rent_reminder:${ctx.landlordId}:${preview.chargeId}:${auditDayBucket()}`;
  const audit = await writeAuditLog(ctx, {
    action: "send_rent_reminder",
    toolName: "send_rent_reminder",
    inputSummary: { chargeId: preview.chargeId },
    resultSummary: { residentEmail: preview.residentEmail },
    dedupeKey,
  });
  if (!audit.recorded) {
    if (audit.duplicate) return { preview, delivery: "already_sent" };
    throw new Error("Could not record the action; no reminder was sent.");
  }

  // 2. Email via Resend. Skipped for demo addresses or when Resend is not
  //    configured (portal-only delivery); a real failure is reported honestly.
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const isDemoAddress = preview.residentEmail.endsWith("@axis.local") || preview.residentEmail === ctx.email;
  // An empty/invalid resident email (e.g. missing in untrusted row_data) has no
  // deliverable address: record in the portal rather than attempting a doomed send.
  const hasDeliverableEmail = preview.residentEmail.includes("@");
  let delivery: "emailed" | "portal_only" | "email_failed";
  if (!apiKey || isDemoAddress || !hasDeliverableEmail) {
    delivery = "portal_only";
  } else {
    try {
      const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [preview.residentEmail], subject, text: body }),
      });
      delivery = res.ok ? "emailed" : "email_failed";
    } catch {
      delivery = "email_failed";
    }
  }

  // 3. Best-effort manager "sent" inbox record (owned by the landlord). Only
  //    record a "sent" thread when delivery actually happened; a hard email
  //    failure must never show up in the manager's Sent folder, and skipping it
  //    keeps same-day retries from accumulating duplicate "sent" threads.
  let inboxRecorded = false;
  if (delivery === "emailed" || delivery === "portal_only") {
    const threadId = `payment_sent_${ctx.userId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const { error: inboxError } = await ctx.db.from("portal_inbox_thread_records").upsert(
      {
        id: threadId,
        scope: "axis_portal_inbox_manager_v1",
        owner_user_id: ctx.userId,
        participant_email: null,
        thread_type: "payment_reminder",
        row_data: {
          id: threadId,
          folder: "sent",
          from: "Axis Assistant",
          email: preview.residentEmail,
          subject,
          preview: body.slice(0, 100).replace(/\n/g, " "),
          body,
          unread: false,
          scope: "axis_portal_inbox_manager_v1",
        },
        updated_at: nowIso,
      },
      { onConflict: "id" },
    );
    inboxRecorded = !inboxError;
  }

  // Stamp the realized delivery outcome. On a hard email failure, clear the
  // dedupe key so a same-day retry can record a fresh attempt instead of
  // short-circuiting to "already_sent".
  await updateAuditResult(
    ctx,
    dedupeKey,
    { residentEmail: preview.residentEmail, delivery, inboxRecorded },
    { clearDedupeKey: delivery === "email_failed" },
  );

  return { preview, delivery };
}

/**
 * Single-charge executor kept for existing callers/tests; the registry tool
 * below is the batch-capable public surface.
 */
export type SendRentReminderResult =
  | { ok: true; preview: RentReminderPreview; delivery: ReminderDelivery }
  | { ok: false; error: string };

export async function executeSendRentReminder(
  ctx: AgentContext,
  chargeId: string,
): Promise<SendRentReminderResult> {
  const charge = findOwnedOverdueCharge(await loadManagerCharges(ctx), chargeId);
  if (!charge) {
    return { ok: false, error: "No matching overdue charge for this landlord." };
  }
  try {
    const { preview, delivery } = await sendReminderForCharge(ctx, charge);
    return { ok: true, preview, delivery };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The reminder could not be sent." };
  }
}

const PREVIEW_LINE_CAP = 8;

/**
 * The reference write tool: batch-capable payment reminders. preview()
 * validates every charge id against the landlord's own overdue set; execute()
 * loops the per-charge core (each item independently idempotent per day).
 */
export const sendRentReminderTool = defineWriteTool({
  name: "send_rent_reminder",
  description:
    "Send a payment reminder (email + portal inbox record) to residents with overdue charges. Pass the charge ids from get_overdue_charges — one id for a single resident, or many ids to remind everyone at once.",
  kind: "write",
  inputSchema: z
    .object({
      chargeIds: z
        .array(z.string().min(1))
        .min(1)
        .max(50)
        .describe("Ids of overdue charges (from get_overdue_charges) to send reminders for."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const charges = await loadManagerCharges(ctx);
    const uniqueIds = [...new Set(input.chargeIds.map((id) => id.trim()).filter(Boolean))];
    const resolved: RentReminderPreview[] = [];
    const invalid: string[] = [];
    for (const id of uniqueIds) {
      const charge = findOwnedOverdueCharge(charges, id);
      if (charge) resolved.push(buildRentReminderPreview(charge));
      else invalid.push(id);
    }
    if (invalid.length > 0) {
      return {
        ok: false,
        error: `These ids are not overdue charges owned by this landlord: ${invalid.join(", ")}. Use get_overdue_charges to get valid charge ids.`,
      };
    }
    const lines = resolved.slice(0, PREVIEW_LINE_CAP).map((p) => ({
      label: p.residentName,
      value: `${p.chargeTitle}${p.balanceDue ? ` (${p.balanceDue})` : ""}`,
    }));
    if (resolved.length > PREVIEW_LINE_CAP) {
      lines.push({ label: "…", value: `and ${resolved.length - PREVIEW_LINE_CAP} more` });
    }
    return {
      ok: true,
      input: { chargeIds: resolved.map((p) => p.chargeId) },
      preview: {
        title: resolved.length === 1 ? "Send rent reminder" : "Send rent reminders",
        summary:
          resolved.length === 1
            ? `Send a payment reminder to ${resolved[0]!.residentName} for ${resolved[0]!.chargeTitle}${resolved[0]!.balanceDue ? ` (${resolved[0]!.balanceDue})` : ""}.`
            : `Send payment reminders to ${resolved.length} residents with overdue charges.`,
        lines,
        confirmLabel: resolved.length === 1 ? "Send reminder" : `Send ${resolved.length} reminders`,
        ...(resolved.length > 1 ? { batchCount: resolved.length } : {}),
      },
    };
  },
  execute: async (ctx, input) => {
    const charges = await loadManagerCharges(ctx);
    let emailed = 0;
    let portalOnly = 0;
    let alreadySent = 0;
    let emailFailed = 0;
    let skipped = 0;
    for (const id of input.chargeIds) {
      // Re-resolve at execute time: overdue state may have changed since preview.
      const charge = findOwnedOverdueCharge(charges, id);
      if (!charge) {
        skipped += 1;
        continue;
      }
      try {
        const { delivery } = await sendReminderForCharge(ctx, charge);
        if (delivery === "emailed") emailed += 1;
        else if (delivery === "portal_only") portalOnly += 1;
        else if (delivery === "already_sent") alreadySent += 1;
        else emailFailed += 1;
      } catch {
        emailFailed += 1;
      }
    }
    const parts: string[] = [];
    if (emailed) parts.push(`emailed ${emailed} reminder${emailed === 1 ? "" : "s"}`);
    if (portalOnly) parts.push(`recorded ${portalOnly} in the portal (no email configured or demo address)`);
    if (alreadySent) parts.push(`${alreadySent} already sent today`);
    if (emailFailed) parts.push(`${emailFailed} failed to send`);
    if (skipped) parts.push(`${skipped} no longer overdue and skipped`);
    const reply = parts.length
      ? `Done — ${parts.join("; ")}.`
      : "Nothing to send — no matching overdue charges remained.";
    return {
      ok: true,
      reply,
      resultSummary: { emailed, portalOnly, alreadySent, emailFailed, skipped },
    };
  },
});
