import { z } from "zod";
import { defineTool } from "../registry";
import type { AgentContext } from "../context";
import type { HouseholdCharge } from "@/lib/household-charges";
import { loadAllManagerRows } from "./load-manager-rows";
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
    "List the current landlord's overdue charges (past due and unpaid): tenants who are late on rent or other charges. Returns each charge's id, resident name, amount due, property, and due date. Use this to answer 'who is late on rent' and similar questions.",
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

/**
 * Gated write executor. Called ONLY from the confirm endpoint, never from the
 * model loop. The action is re-resolved from the landlord's own overdue charges
 * by id; every value that reaches an outbound channel comes from that record,
 * never from client- or model-supplied input. Every send writes an audit row.
 */
export type SendRentReminderResult =
  | { ok: true; preview: RentReminderPreview; delivery: "emailed" | "portal_only" | "email_failed" | "already_sent" }
  | { ok: false; error: string };

export async function executeSendRentReminder(
  ctx: AgentContext,
  chargeId: string,
): Promise<SendRentReminderResult> {
  const charge = findOwnedOverdueCharge(await loadManagerCharges(ctx), chargeId);
  if (!charge) {
    return { ok: false, error: "No matching overdue charge for this landlord." };
  }
  const preview = buildRentReminderPreview(charge);
  const subject = `Payment reminder: ${preview.chargeTitle}`;
  const body = buildReminderBody(preview);
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // 1. Record intent first, idempotently. A unique violation on the dedupe key
  //    means this charge was already reminded today — do not send again. Any
  //    other audit error fails loudly: we never send without an audit record.
  const dedupeKey = `send_rent_reminder:${ctx.landlordId}:${preview.chargeId}:${today}`;
  const { error: auditError } = await ctx.db.from("audit_log").insert({
    actor_user_id: ctx.userId,
    landlord_id: ctx.landlordId,
    action: "send_rent_reminder",
    tool_name: "send_rent_reminder",
    input_summary: { chargeId: preview.chargeId },
    result_summary: { residentEmail: preview.residentEmail },
    dedupe_key: dedupeKey,
    created_at: nowIso,
  });
  if (auditError) {
    if (auditError.code === "23505") {
      return { ok: true, preview, delivery: "already_sent" };
    }
    return { ok: false, error: "Could not record the action; no reminder was sent." };
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

  // Update the audit record with the realized delivery outcome. On a hard email
  // failure, clear the dedupe key so a same-day retry can record a fresh attempt
  // instead of short-circuiting to "already_sent". Successful and portal-only
  // sends keep their key, staying idempotent for the day.
  await ctx.db
    .from("audit_log")
    .update({
      result_summary: { residentEmail: preview.residentEmail, delivery, inboxRecorded },
      ...(delivery === "email_failed" ? { dedupe_key: null } : {}),
    })
    .eq("dedupe_key", dedupeKey);

  return { ok: true, preview, delivery };
}
