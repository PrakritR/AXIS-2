/**
 * Messaging tools: send a portal inbox message (optionally also email), schedule
 * a future send, and cancel a scheduled send. Recipient authorization always
 * goes through filterRecipientsBySenderScope — the same server-side gate the
 * interactive compose route uses — so the agent can never message anyone the
 * landlord couldn't message from the UI.
 */
import { z } from "zod";
import { defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import { writeAuditLog, updateAuditResult, auditDayBucket } from "../audit";
import { filterRecipientsBySenderScope, type InboxScopeSender } from "@/lib/inbox-recipient-scope";
import { deliverPortalInboxMessage, resolveBroadcastRecipients } from "@/lib/portal-inbox-delivery";
import {
  createScheduledInboxMessage,
  generateScheduledInboxMessageId,
  isResidentOriginatedScheduledRow,
  updateScheduledInboxMessage,
} from "@/lib/scheduled-inbox-messages";

const PREVIEW_LINE_CAP = 8;

/**
 * Tiny FNV-1a content hash for dedupe keys — only needs to make "the same
 * message to the same people" collide, nothing cryptographic.
 */
function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The sender identity handed to the scope filter — mirrors the interactive
 * send-inbox-message route's construction. Always from the authenticated
 * context, never from model input.
 */
function managerSender(ctx: AgentContext): InboxScopeSender {
  return { id: ctx.userId, email: ctx.email, role: "manager", isAdmin: false };
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

type ResolvedRecipient = { email: string; userId: string | null; name: string };

/** email -> display name from the landlord's own approved application records. */
async function residentNamesByEmail(ctx: AgentContext): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const { data } = await ctx.db
    .from("manager_application_records")
    .select("resident_email, row_data")
    .eq("manager_user_id", ctx.landlordId);
  for (const row of (data ?? []) as { resident_email: string | null; row_data: unknown }[]) {
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    if (rowData.bucket !== "approved") continue;
    const email = normalizeEmail(String(row.resident_email ?? rowData.email ?? ""));
    const name = String(rowData.name ?? rowData.residentName ?? "").trim();
    if (email && name && !out.has(email)) out.set(email, name);
  }
  return out;
}

/**
 * Resolve + authorize recipients from authoritative server data. Explicit
 * emails and the all-residents broadcast are merged, enriched with the
 * landlord's own approved-application names and matching profile ids, then
 * split by filterRecipientsBySenderScope. Out-of-scope recipients come back in
 * `blocked` so previews surface them instead of silently dropping them.
 */
async function resolveMessageRecipients(
  ctx: AgentContext,
  input: { toEmails?: string[]; toAllResidents?: boolean },
): Promise<{ allowed: ResolvedRecipient[]; blocked: ResolvedRecipient[] }> {
  const senderEmail = normalizeEmail(ctx.email);
  const byEmail = new Map<string, { email: string; userId: string | null }>();
  for (const raw of input.toEmails ?? []) {
    const email = normalizeEmail(raw);
    if (!email.includes("@") || email === senderEmail || byEmail.has(email)) continue;
    byEmail.set(email, { email, userId: null });
  }
  if (input.toAllResidents === true) {
    // Same broadcast expansion the send route's "All residents" chip uses,
    // resolved from the landlord's OWN approved application records.
    const residents = await resolveBroadcastRecipients(ctx.db, ctx.landlordId, ["resident"]);
    for (const r of residents) {
      if (r.email === senderEmail || byEmail.has(r.email)) continue;
      byEmail.set(r.email, { email: r.email, userId: r.userId });
    }
  }
  const candidates = [...byEmail.values()];
  if (candidates.length === 0) return { allowed: [], blocked: [] };

  // One profiles lookup attaches user ids (drives inbox scope + push at
  // delivery time); display names come from the landlord's own records.
  const { data: profiles } = await ctx.db
    .from("profiles")
    .select("id, email")
    .in("email", candidates.map((c) => c.email));
  const idByEmail = new Map(
    ((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [
      normalizeEmail(String(p.email ?? "")),
      p.id,
    ]),
  );
  const nameByEmail = await residentNamesByEmail(ctx);
  const enriched: ResolvedRecipient[] = candidates.map((c) => ({
    email: c.email,
    userId: c.userId ?? idByEmail.get(c.email) ?? null,
    name: nameByEmail.get(c.email) ?? c.email,
  }));
  return filterRecipientsBySenderScope(ctx.db, managerSender(ctx), enriched);
}

function recipientLabel(r: { name: string; email: string }): string {
  return r.name === r.email ? r.email : `${r.name} (${r.email})`;
}

export const sendMessageTool = defineWriteTool({
  name: "send_message",
  description:
    "Send a message from the landlord to specific recipients by email and/or to all of their current residents at once, delivered to each recipient's portal inbox and optionally by email. Recipients must be connected to the landlord (their residents, co-managers, or vendors) — get emails from list_residents or list_vendors.",
  kind: "write",
  inputSchema: z
    .object({
      toEmails: z
        .array(z.string().min(3))
        .min(1)
        .max(20)
        .optional()
        .describe("Recipient email addresses (residents, co-managers, or vendors connected to this landlord)."),
      toAllResidents: z
        .boolean()
        .optional()
        .describe("When true, also send to every current (approved) resident in the landlord's portfolio."),
      subject: z.string().min(1).max(200).describe("Message subject line."),
      body: z.string().min(1).max(5000).describe("Message body (plain text)."),
      deliverViaEmail: z
        .boolean()
        .optional()
        .describe("Also send a real email to each recipient (default true). When false, delivers to portal inboxes only."),
    })
    .strict(),
  preview: async (ctx, input) => {
    if (!input.toEmails?.length && input.toAllResidents !== true) {
      return { ok: false, error: "Provide toEmails and/or set toAllResidents: true." };
    }
    const { allowed, blocked } = await resolveMessageRecipients(ctx, input);
    if (allowed.length === 0) {
      return {
        ok: false,
        error:
          blocked.length > 0
            ? `None of these recipients are connected to this landlord: ${blocked.map((b) => b.email).join(", ")}. Managers can only message their own residents, co-managers, and vendors.`
            : "No valid recipients resolved (the landlord has no approved residents to broadcast to).",
      };
    }
    const subject = input.subject.trim();
    const deliverViaEmail = input.deliverViaEmail !== false;

    const lines = allowed.slice(0, PREVIEW_LINE_CAP).map((r) => ({ label: r.name, value: r.email }));
    if (allowed.length > PREVIEW_LINE_CAP) {
      lines.push({ label: "…", value: `and ${allowed.length - PREVIEW_LINE_CAP} more` });
    }
    lines.push({ label: "Subject", value: subject });
    lines.push({ label: "Delivery", value: deliverViaEmail ? "Portal inbox + email" : "Portal inbox only" });
    if (blocked.length > 0) {
      // Surface — never silently drop — recipients the scope filter rejected.
      lines.push({ label: "Skipped (not connected)", value: blocked.map((b) => b.email).join(", ") });
    }

    // Normalized input: only in-scope explicit emails survive into the stored
    // action (execute re-resolves and re-filters everything regardless).
    const explicit = new Set((input.toEmails ?? []).map(normalizeEmail));
    const allowedExplicit = allowed.filter((r) => explicit.has(r.email)).map((r) => r.email);
    return {
      ok: true,
      input: {
        ...(allowedExplicit.length > 0 ? { toEmails: allowedExplicit } : {}),
        ...(input.toAllResidents === true ? { toAllResidents: true } : {}),
        subject,
        body: input.body.trim(),
        ...(input.deliverViaEmail === undefined ? {} : { deliverViaEmail: input.deliverViaEmail }),
      },
      preview: {
        title: allowed.length === 1 ? "Send message" : `Send message to ${allowed.length} recipients`,
        summary:
          (allowed.length === 1
            ? `Send "${subject}" to ${recipientLabel(allowed[0]!)}.`
            : `Send "${subject}" to ${allowed.length} recipients.`) +
          (blocked.length > 0
            ? ` ${blocked.length} requested recipient${blocked.length === 1 ? " is" : "s are"} not connected to you and will be skipped.`
            : ""),
        lines,
        confirmLabel: allowed.length === 1 ? "Send message" : `Send to ${allowed.length} recipients`,
        ...(allowed.length > 1 ? { batchCount: allowed.length } : {}),
      },
    };
  },
  execute: async (ctx, input) => {
    // Re-resolve + re-authorize every recipient at execute time — the stored
    // emails are never trusted as scope proof.
    const { allowed } = await resolveMessageRecipients(ctx, input);
    if (allowed.length === 0) {
      return { ok: false, error: "No authorized recipients remain for this message; nothing was sent." };
    }
    const subject = input.subject.trim();
    const body = input.body.trim();
    const deliverViaEmail = input.deliverViaEmail !== false;
    const sortedEmails = allowed.map((r) => r.email).sort();

    // Record intent first, idempotent per identical content + recipient set
    // per day. Any other audit error fails loudly: never send unrecorded.
    const dedupeKey = `send_message:${ctx.landlordId}:${contentHash(`${subject}\n${body}\n${sortedEmails.join(",")}`)}:${auditDayBucket()}`;
    const audit = await writeAuditLog(ctx, {
      action: "send_message",
      toolName: "send_message",
      inputSummary: { recipientCount: allowed.length, broadcast: input.toAllResidents === true, deliverViaEmail },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: "This exact message already went to the same recipients today — not sending it again." };
      }
      return { ok: false, error: "Could not record the action; nothing was sent." };
    }

    // Sender display name from the landlord's own profile (recipients see it).
    const { data: senderProfile } = await ctx.db
      .from("profiles")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();
    const fromName = String(senderProfile?.full_name ?? "").trim() || ctx.email || "Axis Portal";

    // Recipients with accounts go by user id (correct portal scope); emails
    // without a profile go by address. deliverPortalInboxMessage re-applies the
    // sender-scope filter internally — defense in depth.
    const toUserIds = allowed.filter((r) => r.userId).map((r) => r.userId!);
    const toEmails = allowed.filter((r) => !r.userId).map((r) => r.email);
    const delivery = await deliverPortalInboxMessage(ctx.db, {
      senderUserId: ctx.landlordId,
      senderEmail: ctx.email,
      fromName,
      subject,
      text: body,
      ...(toEmails.length > 0 ? { toEmails } : {}),
      ...(toUserIds.length > 0 ? { toUserIds } : {}),
      deliverViaEmail,
      senderRole: "manager",
    });
    if (!delivery.ok) {
      // Clear the dedupe key so a retry records a fresh attempt.
      await updateAuditResult(ctx, dedupeKey, { delivered: false }, { clearDedupeKey: true });
      return { ok: false, error: delivery.error };
    }
    await updateAuditResult(ctx, dedupeKey, { delivered: true, recipientCount: delivery.recipientCount });
    return {
      ok: true,
      reply: `Sent "${subject}" to ${delivery.recipientCount} recipient${delivery.recipientCount === 1 ? "" : "s"} ${deliverViaEmail ? "(portal inbox + email)" : "(portal inbox only)"}.`,
      resultSummary: { recipientCount: delivery.recipientCount, deliverViaEmail },
    };
  },
});

function parseFutureSendAt(sendAtIso: string): { ok: true; iso: string } | { ok: false; error: string } {
  const at = new Date(sendAtIso);
  if (Number.isNaN(at.getTime())) {
    return { ok: false, error: `"${sendAtIso}" is not a valid ISO 8601 datetime.` };
  }
  if (at.getTime() <= Date.now()) {
    return { ok: false, error: "sendAtIso must be in the future — for an immediate send use send_message instead." };
  }
  return { ok: true, iso: at.toISOString() };
}

export const scheduleMessageTool = defineWriteTool({
  name: "schedule_message",
  description:
    "Schedule a message from the landlord to one connected recipient (resident, co-manager, or vendor) to be delivered at a future date/time instead of immediately. For immediate delivery use send_message; scheduled messages appear in list_scheduled_messages.",
  kind: "write",
  inputSchema: z
    .object({
      toEmail: z.string().min(3).max(200).describe("Recipient email address — someone connected to this landlord."),
      subject: z.string().min(1).max(200).describe("Message subject line."),
      body: z.string().min(1).max(5000).describe("Message body (plain text)."),
      sendAtIso: z.string().min(1).describe("Future ISO 8601 datetime at which to send the message."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const when = parseFutureSendAt(input.sendAtIso);
    if (!when.ok) return { ok: false, error: when.error };
    const { allowed } = await resolveMessageRecipients(ctx, { toEmails: [input.toEmail] });
    const recipient = allowed[0];
    if (!recipient) {
      return {
        ok: false,
        error: `${normalizeEmail(input.toEmail)} is not connected to this landlord. Managers can only message their own residents, co-managers, and vendors.`,
      };
    }
    const subject = input.subject.trim();
    return {
      ok: true,
      input: { toEmail: recipient.email, subject, body: input.body.trim(), sendAtIso: when.iso },
      preview: {
        title: "Schedule message",
        summary: `Schedule "${subject}" to ${recipientLabel(recipient)} for ${when.iso}.`,
        lines: [
          { label: "To", value: recipientLabel(recipient) },
          { label: "Subject", value: subject },
          { label: "Send at", value: when.iso },
          { label: "Delivery", value: "Portal inbox + email" },
        ],
        confirmLabel: "Schedule message",
      },
    };
  },
  execute: async (ctx, input) => {
    const when = parseFutureSendAt(input.sendAtIso);
    if (!when.ok) return { ok: false, error: when.error };
    // Re-authorize the recipient at execute time.
    const { allowed } = await resolveMessageRecipients(ctx, { toEmails: [input.toEmail] });
    const recipient = allowed[0];
    if (!recipient) {
      return { ok: false, error: "This recipient is no longer connected to this landlord; nothing was scheduled." };
    }
    const subject = input.subject.trim();
    const body = input.body.trim();

    // One-shot per (recipient, send time, subject): retries return already-done.
    const dedupeKey = `schedule_message:${ctx.landlordId}:${recipient.email}:${when.iso}:${contentHash(subject)}`;
    const audit = await writeAuditLog(ctx, {
      action: "schedule_message",
      toolName: "schedule_message",
      inputSummary: { recipientEmail: recipient.email, sendAt: when.iso },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) {
        return { ok: true, reply: `A message with this subject is already scheduled to ${recipient.email} for ${when.iso}.` };
      }
      return { ok: false, error: "Could not record the action; nothing was scheduled." };
    }

    const id = generateScheduledInboxMessageId();
    try {
      await createScheduledInboxMessage(ctx.db, {
        id,
        managerUserId: ctx.landlordId,
        sendAt: when.iso,
        status: "scheduled",
        subject,
        body,
        recipientEmail: recipient.email,
        recipientName: recipient.name,
        recipientUserId: recipient.userId,
        deliverViaEmail: true,
        deliverViaSms: false,
        senderPortal: "manager",
      });
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { scheduled: false }, { clearDedupeKey: true });
      return { ok: false, error: e instanceof Error ? e.message : "The message could not be scheduled." };
    }
    await updateAuditResult(ctx, dedupeKey, { scheduledId: id });
    return {
      ok: true,
      reply: `Scheduled "${subject}" to ${recipientLabel(recipient)} for ${when.iso}.`,
      resultSummary: { scheduledId: id, sendAt: when.iso },
    };
  },
});

type ScheduledRow = { id: string; send_at: string; status: string; row_data: unknown };

/** Load ONE of the landlord's own scheduled messages, or null. */
async function loadOwnScheduledMessage(ctx: AgentContext, messageId: string): Promise<ScheduledRow | null> {
  const { data, error } = await ctx.db
    .from("portal_scheduled_inbox_message_records")
    .select("id, send_at, status, row_data")
    .eq("manager_user_id", ctx.landlordId)
    .eq("id", messageId)
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ScheduledRow[])[0] ?? null;
}

export const cancelScheduledMessageTool = defineWriteTool({
  name: "cancel_scheduled_message",
  description:
    "Cancel one of the landlord's own not-yet-sent scheduled messages so it never goes out. Pass the message id from list_scheduled_messages.",
  kind: "write",
  inputSchema: z
    .object({
      messageId: z.string().min(1).describe("Scheduled message id from list_scheduled_messages."),
    })
    .strict(),
  preview: async (ctx, input) => {
    const row = await loadOwnScheduledMessage(ctx, input.messageId);
    if (!row) {
      return {
        ok: false,
        error: `No scheduled message ${input.messageId} for this landlord. Use list_scheduled_messages to get valid ids.`,
      };
    }
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    if (isResidentOriginatedScheduledRow(rowData)) {
      return { ok: false, error: "This message was scheduled by a resident; managers cannot cancel it." };
    }
    if (row.status === "sent") {
      return { ok: false, error: "This scheduled message was already sent and can no longer be cancelled." };
    }
    if (row.status === "cancelled") {
      return { ok: false, error: "This scheduled message is already cancelled." };
    }
    const subject = String(rowData.subject ?? "").trim() || "(no subject)";
    const recipientEmail = normalizeEmail(String(rowData.recipientEmail ?? ""));
    const recipientName = String(rowData.recipientName ?? "").trim() || recipientEmail;
    return {
      ok: true,
      input,
      preview: {
        title: "Cancel scheduled message",
        summary: `Cancel the scheduled message "${subject}" to ${recipientName} (was set to send at ${row.send_at}).`,
        lines: [
          { label: "To", value: recipientLabel({ name: recipientName, email: recipientEmail }) },
          { label: "Subject", value: subject },
          { label: "Send at", value: row.send_at },
        ],
        confirmLabel: "Cancel message",
      },
    };
  },
  execute: async (ctx, input) => {
    // Re-resolve under the landlord scope — the stored id is never trusted.
    const row = await loadOwnScheduledMessage(ctx, input.messageId);
    if (!row) return { ok: false, error: "No scheduled message with that id for this landlord." };
    const rowData = (row.row_data ?? {}) as Record<string, unknown>;
    if (isResidentOriginatedScheduledRow(rowData)) {
      return { ok: false, error: "This message was scheduled by a resident; managers cannot cancel it." };
    }
    if (row.status === "sent") {
      return { ok: false, error: "This scheduled message was already sent and can no longer be cancelled." };
    }
    const subject = String(rowData.subject ?? "").trim() || "(no subject)";
    const recipientEmail = normalizeEmail(String(rowData.recipientEmail ?? ""));
    if (row.status === "cancelled") {
      return { ok: true, reply: `The scheduled message "${subject}" was already cancelled.` };
    }

    // One-shot state transition: repeats return already-done forever.
    const dedupeKey = `cancel_scheduled_message:${ctx.landlordId}:${row.id}`;
    const audit = await writeAuditLog(ctx, {
      action: "cancel_scheduled_message",
      toolName: "cancel_scheduled_message",
      inputSummary: { messageId: row.id },
      dedupeKey,
    });
    if (!audit.recorded) {
      if (audit.duplicate) return { ok: true, reply: `The scheduled message "${subject}" was already cancelled.` };
      return { ok: false, error: "Could not record the action; the message is still scheduled." };
    }
    try {
      // The lib re-checks (id, manager_user_id) ownership on its own read.
      await updateScheduledInboxMessage(ctx.db, ctx.landlordId, row.id, {
        status: "cancelled",
        cancelledAt: new Date().toISOString(),
      });
    } catch (e) {
      await updateAuditResult(ctx, dedupeKey, { cancelled: false }, { clearDedupeKey: true });
      return { ok: false, error: e instanceof Error ? e.message : "The scheduled message could not be cancelled." };
    }
    await updateAuditResult(ctx, dedupeKey, { cancelled: true });
    return {
      ok: true,
      reply: `Cancelled the scheduled message "${subject}" to ${recipientEmail || "the recipient"} (was set for ${row.send_at}).`,
      resultSummary: { messageId: row.id },
    };
  },
});
