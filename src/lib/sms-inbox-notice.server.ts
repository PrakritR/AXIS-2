/**
 * Shared delivery helpers for SMS-originated manager notices, used by both
 * inbound-SMS paths (work-number → Axis inbox, and the proxy-pair relay
 * mirror) so the two never drift.
 *
 * Direct thread-row write (the notifyManagerFromAgent pattern) because
 * deliverPortalInboxMessage drops recipients whose email equals the sender's —
 * a self-addressed notice would silently deliver to no one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";

export async function upsertManagerInboxNotice(
  db: SupabaseClient,
  args: {
    managerUserId: string;
    idPrefix: string;
    threadType: string;
    folder?: "inbox" | "sent";
    from: string;
    subject: string;
    preview: string;
    body: string;
    unread?: boolean;
  },
): Promise<void> {
  const threadId = `${args.idPrefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db
    .from("portal_inbox_thread_records")
    .upsert(
      {
        id: threadId,
        scope: MANAGER_INBOX_SCOPE,
        owner_user_id: args.managerUserId,
        participant_email: null,
        thread_type: args.threadType,
        row_data: {
          id: threadId,
          folder: args.folder ?? "inbox",
          from: args.from,
          email: "",
          subject: args.subject,
          preview: args.preview.slice(0, 100).replace(/\n/g, " "),
          body: args.body,
          time: new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
          unread: args.unread ?? true,
          scope: MANAGER_INBOX_SCOPE,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .then(
      () => undefined,
      () => undefined,
    );
}

export async function sendManagerNoticeEmail(args: {
  toEmail: string | null | undefined;
  subject: string;
  text: string;
}): Promise<void> {
  const managerEmail = String(args.toEmail ?? "").trim().toLowerCase();
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey || !managerEmail.includes("@") || managerEmail.endsWith("@axis.local")) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>",
      to: [managerEmail],
      subject: args.subject,
      text: args.text,
    }),
  }).catch(() => undefined);
}
