import { shouldSkipOutboundEmail } from "@/lib/portal-sandbox-accounts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { userHoldsAdminRole } from "@/lib/auth/admin-role";
import { filterRecipientsBySenderScope } from "@/lib/inbox-recipient-scope";
import {
  ensureSmsIncludesPortalLink,
  type ResidentSmsLinkKind,
} from "@/lib/claw-resident-links";
import { canSendResidentOutboundSms, sendResidentOutboundSms } from "@/lib/resident-outbound-sms.server";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  resolveChannels,
  type NotificationCategory,
  type ResolvedChannels,
} from "@/lib/notification-preferences";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";
export const VENDOR_INBOX_SCOPE = "axis_portal_inbox_vendor_v1";

export type InboxDeliveryRecipient = {
  email: string;
  userId: string | null;
  role: string | null;
  scope: string;
};

function scopeForRole(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "manager" || normalized === "pro" || normalized === "admin") return MANAGER_INBOX_SCOPE;
  if (normalized === "vendor") return VENDOR_INBOX_SCOPE;
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

/**
 * Append a reply to an existing inbox thread. Only the thread's owner or its
 * participant (matched by email) may append; anything else is a silent no-op
 * (`ok: false`), mirroring the send-inbox-message route's historic behavior.
 */
export async function appendInboxThreadReply(
  db: SupabaseClient,
  opts: {
    threadId: string;
    senderUserId: string;
    senderEmail: string;
    fromName: string;
    text: string;
  },
): Promise<{ ok: boolean; thread?: { threadType: string; ownerUserId: string | null } }> {
  const threadId = opts.threadId.trim();
  if (!threadId) return { ok: false };
  const senderEmail = opts.senderEmail.trim().toLowerCase();
  const { data: threadRow } = await db
    .from("portal_inbox_thread_records")
    .select("id, row_data, owner_user_id, participant_email, scope, thread_type")
    .eq("id", threadId)
    .maybeSingle();
  if (
    !threadRow ||
    (threadRow.owner_user_id !== opts.senderUserId &&
      String(threadRow.participant_email ?? "").toLowerCase() !== senderEmail)
  ) {
    return { ok: false };
  }
  const rowData = (threadRow.row_data ?? {}) as Record<string, unknown>;
  const messages = Array.isArray(rowData.messages) ? [...rowData.messages] : [];
  const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  messages.push({
    id: `reply-${Date.now().toString(36)}`,
    from: opts.fromName,
    body: opts.text,
    at: when,
  });
  await db.from("portal_inbox_thread_records").upsert(
    {
      id: threadId,
      scope: String(threadRow.scope ?? rowData.scope ?? MANAGER_INBOX_SCOPE),
      owner_user_id: threadRow.owner_user_id,
      participant_email: threadRow.participant_email,
      row_data: {
        ...rowData,
        messages,
        preview: opts.text.slice(0, 100).replace(/\n/g, " "),
        unread: false,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return {
    ok: true,
    thread: {
      threadType: String(threadRow.thread_type ?? ""),
      ownerUserId: (threadRow.owner_user_id as string | null) ?? null,
    },
  };
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
    /** When set, SMS uses this body instead of `text` (keeps inbox/email on the full message). */
    smsText?: string;
    senderRole?: string;
    /**
     * When provided, email/SMS are gated PER RECIPIENT by each recipient's saved
     * notification preferences for this category (via `resolveChannels`) instead
     * of the single global `deliverViaEmail` / `deliverViaSms` booleans. Inbox is
     * always written. When omitted, delivery keeps the exact legacy behavior:
     * the two global booleans apply uniformly to every recipient.
     */
    eventCategory?: NotificationCategory;
  },
): Promise<{ ok: true; recipientCount: number } | { ok: false; error: string }> {
  const senderEmail = opts.senderEmail.trim().toLowerCase();
  const subject = opts.subject.trim();
  const text = opts.text.trim();
  const fromName = opts.fromName.trim() || "PropLane Portal";
  // Inbox is always written for category-driven sends (non-suppressible record).
  const deliverToPortalInbox = opts.eventCategory ? true : opts.deliverToPortalInbox !== false;
  const deliverViaEmail = opts.deliverViaEmail !== false;
  const deliverViaSms = opts.deliverViaSms === true;

  if (!subject || !text) return { ok: false, error: "subject and text are required." };

  const { data: senderProfile } = await db.from("profiles").select("role, sms_from_number").eq("id", opts.senderUserId).maybeSingle();
  const senderRole = String(opts.senderRole ?? senderProfile?.role ?? "manager").trim().toLowerCase() || "manager";

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

  let recipients = [...recipientsByEmail.values()];
  if (recipients.length === 0) return { ok: false, error: "No recipients selected." };

  // Enforce role scope server-side (mirrors the interactive send route). Scheduled
  // sends are authored by managers or admins; an out-of-scope recipient is rejected
  // here too. Admins are unrestricted — fall back to the role-membership check
  // (mirrors send-inbox-message) since profiles.role may not literally be "admin".
  const senderIsAdmin = senderRole === "admin" || (await userHoldsAdminRole(db, opts.senderUserId));
  if (!senderIsAdmin) {
    const { allowed } = await filterRecipientsBySenderScope(
      db,
      { id: opts.senderUserId, email: senderEmail, role: senderRole, isAdmin: false },
      recipients,
    );
    if (allowed.length === 0) {
      return { ok: false, error: "You can only message people connected to your account." };
    }
    recipients = allowed;
  }

  // Per-recipient channel resolution. With an eventCategory, each recipient's
  // saved notification preferences decide email/SMS (default matrix when they
  // have no row); without one, the legacy global booleans apply to everyone.
  const eventCategory = opts.eventCategory;
  let channelByEmail: Map<string, ResolvedChannels> | null = null;
  if (eventCategory) {
    channelByEmail = new Map();
    // One batched fetch of recipient phone + verification for resolveChannels
    // (which gates SMS on a verified, non-opted-out phone).
    const recipientUserIds = recipients
      .map((r) => r.userId)
      .filter((id): id is string => Boolean(id));
    const profileById = new Map<string, { phone: string | null; phone_verified_at: string | null }>();
    if (recipientUserIds.length) {
      const { data: recProfiles } = await db
        .from("profiles")
        .select("id, phone, phone_verified_at")
        .in("id", recipientUserIds);
      for (const p of recProfiles ?? []) {
        profileById.set(String(p.id), {
          phone: (p.phone as string | null) ?? null,
          phone_verified_at: (p.phone_verified_at as string | null) ?? null,
        });
      }
    }
    for (const recipient of recipients) {
      if (recipient.userId) {
        channelByEmail.set(
          recipient.email,
          await resolveChannels(db, recipient.userId, eventCategory, profileById.get(recipient.userId) ?? null),
        );
      } else {
        // Email-only recipient (no account row): no stored prefs and no verified
        // phone, so fall back to the category's default email flag and never SMS.
        channelByEmail.set(recipient.email, {
          inbox: true,
          email: DEFAULT_NOTIFICATION_PREFERENCES[eventCategory].email,
          sms: false,
        });
      }
    }
  }

  const emailWanted = (recipient: InboxDeliveryRecipient): boolean =>
    channelByEmail ? channelByEmail.get(recipient.email)?.email === true : deliverViaEmail;

  // Recipients that will actually receive email (channel on + not a sandbox skip).
  // In legacy mode this collapses to "all non-skip recipients when deliverViaEmail",
  // preserving the previous meaning of `toEmails`.
  const willEmail = new Set<string>(
    recipients.filter((r) => emailWanted(r) && !shouldSkipOutboundEmail(r.email)).map((r) => r.email),
  );
  const toEmails = [...willEmail];

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

  if (toEmails.length > 0) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via PropLane portal by ${fromName}</p>`;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: toEmails, subject, text, html }),
        });
        if (!res.ok) {
          // Inbox already written — soft-fail email so the manager action still succeeds.
          for (const email of toEmails) willEmail.delete(email);
        }
      } catch {
        for (const email of toEmails) willEmail.delete(email);
      }
    } else {
      for (const email of toEmails) willEmail.delete(email);
    }
  }

  const sentAt = new Date().toISOString();
  for (const recipient of recipients) {
    const logId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("portal_outbound_mail_records").upsert(
      {
        id: logId,
        recipient_email: recipient.email,
        subject,
        channel: willEmail.has(recipient.email) ? "email" : "portal",
        row_data: {
          id: logId,
          to: recipient.email,
          subject,
          body: text,
          sentAt,
          emailSent: willEmail.has(recipient.email),
        },
      },
      { onConflict: "id" },
    );
  }

  // SMS: legacy mode applies the single global deliverViaSms to every recipient;
  // category mode gates per recipient via resolved channels (verified,
  // non-opted-out phone already enforced by resolveChannels).
  const smsRecipients = recipients.filter((r) =>
    channelByEmail ? channelByEmail.get(r.email)?.sms === true : deliverViaSms,
  );
  if (smsRecipients.length > 0) {
    const smsFromNumber = String(senderProfile?.sms_from_number ?? "").trim();
    if (canSendResidentOutboundSms(smsFromNumber)) {
      const recipientEmails = smsRecipients.map((r) => r.email);
      const { data: phones } = await db.from("profiles").select("email, phone").in("email", recipientEmails);
      const phoneByEmail = new Map((phones ?? []).map((p) => [String(p.email).toLowerCase(), String(p.phone ?? "").trim()]));
      for (const recipient of smsRecipients) {
        const recipientPhone = phoneByEmail.get(recipient.email) ?? "";
        if (!recipientPhone) continue;
        const smsBody = (opts.smsText ?? text).trim();
        let body = smsBody.length <= 320 ? smsBody : `${subject}\n\n${smsBody}`.slice(0, 320);
        const recipientIsManager =
          recipient.scope === MANAGER_INBOX_SCOPE ||
          ["manager", "pro", "admin"].includes(String(recipient.role ?? "").toLowerCase());
        const recipientIsResident =
          recipient.scope === RESIDENT_INBOX_SCOPE ||
          String(recipient.role ?? "").toLowerCase() === "resident";
        // Never append resident-portal deep links to manager texts; created-event
        // SMS bodies already carry the manager Services URL when needed.
        const linkKind: ResidentSmsLinkKind | null = recipient.scope?.includes("vendor") || recipientIsManager
          ? null
          : eventCategory === "leases"
            ? "lease"
            : eventCategory === "payments"
              ? "payments"
              : eventCategory === "maintenance"
                ? "services_work_orders"
                : eventCategory === "applications"
                  ? "applications"
                  : "inbox";
        if (linkKind) {
          body = ensureSmsIncludesPortalLink(body, linkKind);
        }
        // Claw resident threads are resident↔manager only. Opening one when the
        // SMS recipient is the manager (e.g. new work-order alert) inverts the
        // roles and breaks manager reply routing.
        const openThread =
          recipientIsResident
            ? {
                managerUserId: opts.senderUserId,
                residentUserId: recipient.userId,
                residentEmail: recipient.email,
                topic:
                  eventCategory === "leases"
                    ? ("lease" as const)
                    : eventCategory === "payments"
                      ? ("payment" as const)
                      : eventCategory === "applications"
                        ? ("applications" as const)
                        : eventCategory === "maintenance"
                          ? ("maintenance" as const)
                          : ("general" as const),
              }
            : null;
        const result = await sendResidentOutboundSms({
          to: recipientPhone,
          text: body,
          fromNumber: smsFromNumber,
          linkKind: null, // already appended above
          openThread,
        });
        if (result.sent) {
          const logId = `outbound_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db.from("portal_outbound_mail_records").upsert(
            {
              id: logId,
              recipient_email: recipient.email,
              subject,
              channel: "sms",
              row_data: {
                id: logId,
                to: recipientPhone,
                subject,
                body: text,
                sentAt,
                smsSent: true,
                smsChannel: result.channel ?? null,
              },
            },
            { onConflict: "id" },
          );
        }
      }
    }
  }

  return { ok: true, recipientCount: recipients.length };
}
