import type { SupabaseClient } from "@supabase/supabase-js";
import { sendSms } from "@/lib/twilio";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";

export type InboxDeliveryRecipient = {
  email: string;
  userId: string | null;
  role: string | null;
  scope: string;
};

function scopeForRole(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "manager" || normalized === "pro" || normalized === "admin") return MANAGER_INBOX_SCOPE;
  return RESIDENT_INBOX_SCOPE;
}

type BroadcastRecipient = { email: string; userId: string | null; role: "resident" | "manager" };

export async function resolveBroadcastRecipients(
  db: SupabaseClient,
  senderId: string,
  categories: ("management" | "resident")[],
): Promise<BroadcastRecipient[]> {
  const out: BroadcastRecipient[] = [];

  async function approvedResidentsForManagers(managerIds: string[]) {
    if (managerIds.length === 0) return;
    const { data } = await db
      .from("manager_application_records")
      .select("resident_email, row_data")
      .in("manager_user_id", managerIds);
    for (const row of data ?? []) {
      const rowData = (row.row_data ?? {}) as Record<string, unknown>;
      if (rowData.bucket !== "approved") continue;
      const email = String(row.resident_email ?? rowData.email ?? "").trim().toLowerCase();
      if (email) out.push({ email, userId: null, role: "resident" });
    }
  }

  async function linkedCoManagersForManagers(managerIds: string[]) {
    if (managerIds.length === 0) return;
    const { data } = await db
      .from("portal_pro_relationship_records")
      .select("related_user_id, related_email")
      .in("manager_user_id", managerIds);
    for (const row of data ?? []) {
      const email = String(row.related_email ?? "").trim().toLowerCase();
      if (email) out.push({ email, userId: (row.related_user_id as string | null) ?? null, role: "manager" });
    }
  }

  if (categories.includes("resident")) await approvedResidentsForManagers([senderId]);
  if (categories.includes("management")) await linkedCoManagersForManagers([senderId]);
  return out;
}

export async function deliverPortalInboxMessage(
  db: SupabaseClient,
  opts: {
    senderUserId: string;
    senderEmail: string;
    fromName: string;
    subject: string;
    text: string;
    toEmails?: string[];
    toUserIds?: string[];
    broadcastCategories?: ("management" | "resident")[];
    deliverToPortalInbox?: boolean;
    deliverViaEmail?: boolean;
    deliverViaSms?: boolean;
  },
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const senderEmail = opts.senderEmail.trim().toLowerCase();
  const subject = opts.subject.trim();
  const text = opts.text.trim();
  const fromName = opts.fromName.trim() || "Axis Portal";
  const deliverToPortalInbox = opts.deliverToPortalInbox !== false;
  const deliverViaEmail = opts.deliverViaEmail !== false;
  const deliverViaSms = opts.deliverViaSms === true;

  if (!subject || !text) return { ok: false, error: "subject and text are required." };

  const { data: senderProfile } = await db.from("profiles").select("role, sms_from_number").eq("id", opts.senderUserId).maybeSingle();
  const senderRole = String(senderProfile?.role ?? "manager").trim().toLowerCase() || "manager";

  const recipientsByEmail = new Map<string, InboxDeliveryRecipient>();

  for (const email of (opts.toEmails ?? [])
    .filter((e) => e.includes("@"))
    .map((e) => e.trim().toLowerCase())) {
    if (email === senderEmail || recipientsByEmail.has(email)) continue;
    recipientsByEmail.set(email, { email, userId: null, role: null, scope: RESIDENT_INBOX_SCOPE });
  }

  if (opts.toUserIds?.length) {
    const { data: recipientProfiles } = await db.from("profiles").select("id, email, role").in("id", opts.toUserIds);
    for (const profile of recipientProfiles ?? []) {
      const email = String(profile.email ?? "").trim().toLowerCase();
      if (!email || email === senderEmail) continue;
      const role = String(profile.role ?? "").trim().toLowerCase() || null;
      recipientsByEmail.set(email, {
        email,
        userId: profile.id ?? null,
        role,
        scope: scopeForRole(role),
      });
    }
  }

  if (opts.broadcastCategories?.length) {
    const broadcastRecipients = await resolveBroadcastRecipients(db, opts.senderUserId, opts.broadcastCategories);
    for (const r of broadcastRecipients) {
      if (r.email === senderEmail || recipientsByEmail.has(r.email)) continue;
      recipientsByEmail.set(r.email, { email: r.email, userId: r.userId, role: r.role, scope: scopeForRole(r.role) });
    }
  }

  const recipients = [...recipientsByEmail.values()];
  if (recipients.length === 0) return { ok: false, error: "No recipients selected." };

  const toEmails = recipients.map((r) => r.email).filter((email) => !email.endsWith("@axis.local"));

  if (deliverToPortalInbox) {
    const senderScope = scopeForRole(senderRole);
    const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const preview = text.slice(0, 100).replace(/\n/g, " ");

    for (const recipient of recipients) {
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 6);
      const recipientLower = recipient.email;

      const senderThreadId = `msg_${opts.senderUserId}_${ts}_${rand}`;
      await db.from("portal_inbox_thread_records").upsert(
        {
          id: senderThreadId,
          scope: senderScope,
          owner_user_id: opts.senderUserId,
          participant_email: null,
          thread_type: "portal_message",
          row_data: {
            id: senderThreadId,
            folder: "sent",
            from: fromName,
            email: recipientLower,
            subject,
            preview,
            body: text,
            time: when,
            unread: false,
            scope: senderScope,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

      if (recipientLower === senderEmail) continue;

      const recipientThreadId = `msg_inbox_${ts}_${rand}`;
      await db.from("portal_inbox_thread_records").upsert(
        {
          id: recipientThreadId,
          scope: recipient.scope,
          owner_user_id: recipient.userId,
          participant_email: recipientLower,
          thread_type: "portal_message",
          row_data: {
            id: recipientThreadId,
            folder: "inbox",
            from: fromName,
            email: senderEmail,
            subject,
            preview,
            body: text,
            time: when,
            unread: true,
            scope: recipient.scope,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }
  }

  if (deliverViaEmail && toEmails.length > 0) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) return { ok: false, error: "Email delivery not configured (RESEND_API_KEY missing)." };
    const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
    const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis portal by ${fromName}</p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: toEmails, subject, text, html }),
    });
    const emailPayload = (await res.json().catch(() => ({}))) as { message?: string };
    if (!res.ok) return { ok: false, error: emailPayload.message ?? "Email send failed." };
  }

  const sentAt = new Date().toISOString();
  for (const recipient of recipients) {
    const logId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("portal_outbound_mail_records").upsert(
      {
        id: logId,
        recipient_email: recipient.email,
        subject,
        channel: deliverViaEmail && toEmails.includes(recipient.email) ? "email" : "portal",
        row_data: {
          id: logId,
          to: recipient.email,
          subject,
          body: text,
          sentAt,
          emailSent: deliverViaEmail && toEmails.includes(recipient.email),
        },
      },
      { onConflict: "id" },
    );
  }

  if (deliverViaSms) {
    const smsFromNumber = String(senderProfile?.sms_from_number ?? "").trim();
    if (smsFromNumber) {
      const recipientEmails = recipients.map((r) => r.email);
      const { data: phones } = await db.from("profiles").select("email, phone").in("email", recipientEmails);
      const phoneByEmail = new Map((phones ?? []).map((p) => [String(p.email).toLowerCase(), String(p.phone ?? "").trim()]));
      for (const recipient of recipients) {
        const recipientPhone = phoneByEmail.get(recipient.email) ?? "";
        if (!recipientPhone) continue;
        const result = await sendSms(recipientPhone, `${subject}\n\n${text}`, smsFromNumber);
        if (result.sent) {
          const logId = `outbound_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db.from("portal_outbound_mail_records").upsert(
            {
              id: logId,
              recipient_email: recipient.email,
              subject,
              channel: "sms",
              row_data: { id: logId, to: recipientPhone, subject, body: text, sentAt, smsSent: true },
            },
            { onConflict: "id" },
          );
        }
      }
    }
  }

  return { ok: true, recipientCount: recipients.length };
}
