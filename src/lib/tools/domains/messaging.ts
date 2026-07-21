import { createHash } from "node:crypto";
import { z } from "zod";
import { defineWriteTool } from "../registry";
import type { AgentContext } from "../context";
import { appendInboxThreadReply, deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { loadManagerApplications } from "./residents";
import { findOwnedResident } from "./residents-logic";
import { buildResidentMessagePreview, type ResidentMessageInput } from "./messaging-logic";

const inputSchema = z
  .object({
    residentEmail: z
      .string()
      .describe("The resident's email, as returned by list_residents. Must be one of the landlord's own residents."),
    subject: z.string().min(1).max(200).describe("Email/portal subject line."),
    body: z.string().min(1).max(5000).describe("The full message body, exactly as it should be sent."),
    threadId: z
      .string()
      .optional()
      .describe("Optional inbox thread id (from list_inbox_threads) to record this as a reply in that thread."),
  })
  .strict();

async function resolveOwnedResident(ctx: AgentContext, email: string) {
  return findOwnedResident(await loadManagerApplications(ctx), email);
}

/**
 * A reply thread must be the landlord's own AND belong to the resolved
 * resident. Without the counterparty check, an injection-nudged threadId could
 * misdirect the message into a different resident's thread — a leak the
 * preview's opaque id would never surface.
 */
async function loadOwnedThreadForResident(
  ctx: AgentContext,
  threadId: string,
  residentEmail: string,
): Promise<{ subject: string }> {
  const { data } = await ctx.db
    .from("portal_inbox_thread_records")
    .select("owner_user_id, participant_email, row_data")
    .eq("id", threadId.trim())
    .maybeSingle();
  const rowData = (data?.row_data ?? {}) as Record<string, unknown>;
  // Manager-owned thread records keep the counterparty in row_data.email;
  // participant-scoped records use the participant_email column.
  const counterparty = String(data?.participant_email ?? rowData.email ?? "").trim().toLowerCase();
  if (!data || data.owner_user_id !== ctx.userId || counterparty !== residentEmail) {
    throw new Error("That thread is not a conversation with this resident.");
  }
  return { subject: String(rowData.subject ?? "") };
}

/**
 * Gated write: propose (preview) from the model loop, execute only from the
 * confirm endpoint. The recipient is re-resolved from the landlord's own
 * residents at both preview and execute time — a model-supplied address that
 * is not an owned resident can never receive a message.
 */
export const sendResidentMessageTool = defineWriteTool<ResidentMessageInput, { reply: string }>({
  name: "send_resident_message",
  description:
    "Send a message to one of the landlord's own residents (portal inbox + email). Use list_residents first to get the resident's email, and list_inbox_threads if replying to an existing thread. The landlord sees the exact message and must confirm before anything is sent.",
  inputSchema,
  preview: async (ctx, input) => {
    const resident = await resolveOwnedResident(ctx, input.residentEmail);
    if (!resident) throw new Error("No resident with that email in this landlord's portfolio.");
    const email = String(resident.email ?? "").trim().toLowerCase();
    const thread = input.threadId ? await loadOwnedThreadForResident(ctx, input.threadId, email) : null;
    return buildResidentMessagePreview(resident, input, thread?.subject);
  },
  handler: async (ctx, input) => {
    const resident = await resolveOwnedResident(ctx, input.residentEmail);
    if (!resident) throw new Error("No resident with that email in this landlord's portfolio.");
    const email = String(resident.email ?? "").trim().toLowerCase();
    // Re-validate the thread at execute time too — state may have drifted.
    if (input.threadId) await loadOwnedThreadForResident(ctx, input.threadId, email);
    const name = resident.name || "Resident";
    const nowIso = new Date().toISOString();

    // Record intent first, idempotently: an identical message to the same
    // resident on the same day (double-click, replayed confirm) is a no-op,
    // while a genuinely different message still goes out.
    const contentHash = createHash("sha256").update(`${input.subject}\n${input.body}`).digest("hex").slice(0, 16);
    const dedupeKey = `send_resident_message:${ctx.landlordId}:${email}:${contentHash}:${nowIso.slice(0, 10)}`;
    const { error: auditError } = await ctx.db.from("audit_log").insert({
      actor_user_id: ctx.userId,
      landlord_id: ctx.landlordId,
      action: "send_resident_message",
      tool_name: "send_resident_message",
      input_summary: { residentEmail: email, threadId: input.threadId ?? null },
      result_summary: {},
      dedupe_key: dedupeKey,
      created_at: nowIso,
    });
    if (auditError) {
      if (auditError.code === "23505") {
        return { reply: `This exact message was already sent to ${name} today; nothing new was sent.` };
      }
      throw new Error("Could not record the action; no message was sent.");
    }

    if (input.threadId) {
      await appendInboxThreadReply(ctx.db, {
        threadId: input.threadId,
        senderUserId: ctx.userId,
        senderEmail: ctx.email,
        fromName: "PropLane Assistant",
        text: input.body,
      });
    }

    const delivered = await deliverPortalInboxMessage(ctx.db, {
      senderUserId: ctx.userId,
      senderEmail: ctx.email,
      fromName: "PropLane Assistant",
      subject: input.subject,
      text: input.body,
      toEmails: [email],
    });

    await ctx.db
      .from("audit_log")
      .update({
        result_summary: { residentEmail: email, delivered: delivered.ok },
        // A failed delivery clears the dedupe key so a retry can go through.
        ...(delivered.ok ? {} : { dedupe_key: null }),
      })
      .eq("dedupe_key", dedupeKey);

    if (!delivered.ok) {
      return { reply: `The message to ${name} could not be delivered: ${delivered.error}` };
    }
    return { reply: `Message sent to ${name} (${email}).` };
  },
});
