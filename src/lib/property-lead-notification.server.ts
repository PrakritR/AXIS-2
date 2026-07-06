/**
 * Notify property manager when a prospect sends a leasing message.
 */

import {
  resolveManagerRecipientProfiles,
  resolvePropertyScopedManagerRecipientIds,
} from "@/lib/co-manager-notification-recipients.server";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";

type Db = ReturnType<typeof import("@/lib/supabase/service").createSupabaseServiceRoleClient>;

async function deliverEmail(to: string[], subject: string, text: string): Promise<void> {
  const recipients = to.map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
  if (recipients.length === 0) return;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return;
  const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: recipients, subject, text }),
  }).catch(() => undefined);
}

async function upsertManagerInbox(
  db: Db,
  managerUserId: string,
  input: { subject: string; body: string; fromName: string; fromEmail: string },
): Promise<void> {
  const threadId = `lead-msg-${Date.now().toString(36)}`;
  const now = new Date().toLocaleString();
  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: MANAGER_INBOX_SCOPE,
      owner_user_id: managerUserId,
      participant_email: input.fromEmail,
      row_data: {
        id: threadId,
        folder: "inbox",
        from: input.fromName,
        email: input.fromEmail,
        subject: input.subject,
        preview: input.body.slice(0, 100),
        body: input.body,
        time: now,
        unread: true,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
}

export async function notifyManagerPropertyLeadMessage(input: {
  managerUserId: string;
  propertyId: string;
  propertyTitle?: string;
  name: string;
  email: string;
  phone?: string;
  topic: string;
  body: string;
}): Promise<void> {
  const db = (await import("@/lib/supabase/service")).createSupabaseServiceRoleClient();
  const recipientIds = await resolvePropertyScopedManagerRecipientIds(db, {
    ownerManagerUserId: input.managerUserId,
    propertyId: input.propertyId,
    channel: "inbox",
  });
  const recipients = await resolveManagerRecipientProfiles(db, recipientIds);
  if (recipients.length === 0) return;

  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000";
  const property = input.propertyTitle?.trim() || input.propertyId;
  const subject = `Leasing message — ${input.topic}`;
  const lines = [
    `New leasing message for ${property}.`,
    "",
    `From: ${input.name} (${input.email})`,
    input.phone?.trim() ? `Phone: ${input.phone.trim()}` : null,
    `Topic: ${input.topic}`,
    "",
    input.body,
    "",
    `Open your inbox: ${origin}/portal/inbox`,
    "",
    "— Axis",
  ].filter(Boolean);

  const text = lines.join("\n");
  await deliverEmail(
    recipients.map((recipient) => recipient.email),
    subject,
    text,
  );
  for (const recipient of recipients) {
    await upsertManagerInbox(db, recipient.userId, {
      subject,
      body: text,
      fromName: input.name,
      fromEmail: input.email,
    });
  }
}
