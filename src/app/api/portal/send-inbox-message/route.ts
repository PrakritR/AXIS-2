import { NextResponse, after } from "next/server";
import { track } from "@/lib/analytics/posthog";
import {
  findVendorAgentSessionByThread,
  runVendorAgentSessionTurn,
} from "@/lib/agent/vendor-agent.server";
import { resolvePropertyScopedManagerRecipientIds } from "@/lib/co-manager-notification-recipients.server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { filterRecipientsBySenderScope } from "@/lib/inbox-recipient-scope";
import { sendPushToUser } from "@/lib/push-notifications.server";
import { appendInboxThreadReply } from "@/lib/portal-inbox-delivery";
import { clientIpFrom, rateLimit } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { canSendResidentOutboundSms, sendResidentOutboundSms } from "@/lib/resident-outbound-sms.server";
import {
  ensureSmsIncludesPortalLink,
  type ResidentSmsLinkKind,
} from "@/lib/claw-resident-links";
import { isPortalSandboxEmail } from "@/lib/portal-sandbox-accounts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_CATEGORIES,
  resolveChannels,
  type NotificationCategory,
} from "@/lib/notification-preferences";

export const runtime = "nodejs";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";
const VENDOR_INBOX_SCOPE = "axis_portal_inbox_vendor_v1";

function normalizeEmails(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[;,]/).map((e) => e.trim()).filter(Boolean);
  return [];
}

function normalizeUserIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[;,]/).map((v) => v.trim()).filter(Boolean);
  return [];
}

function scopeForRole(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "manager" || normalized === "pro" || normalized === "admin") return MANAGER_INBOX_SCOPE;
  if (normalized === "vendor") return VENDOR_INBOX_SCOPE;
  return RESIDENT_INBOX_SCOPE;
}

/** Deep-link a push notification tap into the recipient's own inbox. */
function inboxDeepLinkForRole(role: string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (normalized === "manager" || normalized === "pro") return "/portal/inbox/unopened";
  if (normalized === "admin") return "/admin/inbox/unopened";
  if (normalized === "vendor") return "/vendor/inbox/unopened";
  return "/resident/inbox/unopened";
}

type BroadcastRecipient = { email: string; userId: string | null; role: "resident" | "manager" };

/** Resolve "All management" / "All residents" compose chips to real recipients for the sender's own portfolio. */
async function resolveBroadcastRecipients(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  senderId: string,
  senderEmail: string,
  senderRole: string | null,
  categories: ("management" | "resident")[],
): Promise<BroadcastRecipient[]> {
  const out: BroadcastRecipient[] = [];
  const normalizedRole = String(senderRole ?? "").trim().toLowerCase();

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

  if (normalizedRole === "manager" || normalizedRole === "pro" || normalizedRole === "admin") {
    if (categories.includes("resident")) await approvedResidentsForManagers([senderId]);
    if (categories.includes("management")) await linkedCoManagersForManagers([senderId]);
    return out;
  }

  // Vendor sender — "management" resolves to the manager(s) who invited/own them.
  if (normalizedRole === "vendor") {
    if (categories.includes("management")) {
      const filter = senderEmail
        ? `vendor_user_id.eq.${senderId},row_data->>email.eq.${senderEmail}`
        : `vendor_user_id.eq.${senderId}`;
      const { data } = await db.from("manager_vendor_records").select("manager_user_id").or(filter);
      const managerIds = [...new Set((data ?? []).map((r) => String(r.manager_user_id ?? "").trim()).filter(Boolean))];
      if (managerIds.length > 0) {
        const { data: mgrProfiles } = await db.from("profiles").select("id, email").in("id", managerIds);
        for (const p of mgrProfiles ?? []) {
          const email = String(p.email ?? "").trim().toLowerCase();
          if (email) out.push({ email, userId: (p.id as string) ?? null, role: "manager" });
        }
      }
    }
    return out;
  }

  // Resident sender — "management" resolves to their property manager plus linked co-managers.
  if (categories.includes("management")) {
    const { data } = await db
      .from("manager_application_records")
      .select("manager_user_id, row_data")
      .ilike("resident_email", senderEmail)
      .limit(1);
    const row = (data ?? [])[0] as { manager_user_id: string | null; row_data: unknown } | undefined;
    const rowData = (row?.row_data ?? {}) as Record<string, unknown>;
    const managerUserId = rowData.bucket === "approved" ? row?.manager_user_id ?? null : null;
    if (managerUserId) {
      const { data: mgrProfile } = await db.from("profiles").select("id, email").eq("id", managerUserId).maybeSingle();
      const mgrEmail = String(mgrProfile?.email ?? "").trim().toLowerCase();
      if (mgrEmail) out.push({ email: mgrEmail, userId: managerUserId, role: "manager" });
      await linkedCoManagersForManagers([managerUserId]);
    }
  }
  return out;
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    if (
      !rateLimit(`send-inbox:user:${user.id}`, 30, 60_000).ok ||
      !rateLimit(`send-inbox:ip:${clientIpFrom(req)}`, 60, 60_000).ok
    ) {
      return NextResponse.json({ ok: false, error: "Too many messages. Please slow down." }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      fromName?: string;
      fromEmail?: string;
      toEmails?: unknown;
      toUserIds?: unknown;
      toBroadcast?: unknown;
      subject?: string;
      text?: string;
      threadId?: string;
      deliverToPortalInbox?: boolean;
      deliverViaEmail?: boolean;
      deliverViaSms?: boolean;
      propertyId?: string;
      /** When set with a single manager recipient, also notify linked co-managers with inbox access. */
      fanOutPropertyInbox?: boolean;
      /** Gate email/SMS per recipient's saved preference for this category (inbox always on). */
      eventCategory?: string;
    };

    const threadId = String(body.threadId ?? "").trim();
    const senderEmail = String(user.email ?? body.fromEmail ?? "portal@example.com").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const text = String(body.text ?? "").trim();
    const fromName = String(body.fromName ?? "PropLane Portal").trim();
    const deliverToPortalInbox = body.deliverToPortalInbox !== false;
    const deliverViaEmail = body.deliverViaEmail !== false;
    const deliverViaSms = body.deliverViaSms === true;
    // When a category is provided, email/SMS are gated PER RECIPIENT by their
    // saved notification preferences (this route is a parallel implementation of
    // deliverPortalInboxMessage and must honor the same matrix). Without one, the
    // legacy uniform booleans above apply to everyone.
    const eventCategory: NotificationCategory | null =
      typeof body.eventCategory === "string" &&
      (NOTIFICATION_CATEGORIES as string[]).includes(body.eventCategory)
        ? (body.eventCategory as NotificationCategory)
        : null;

    if (!subject || !text) {
      return NextResponse.json({ ok: false, error: "subject and text are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();

    if (threadId) {
      const appended = await appendInboxThreadReply(db, {
        threadId,
        senderUserId: user.id,
        senderEmail,
        fromName,
        text,
      });

      // A vendor replying in their agent thread talks to the agent, not to a
      // human recipient — run the turn after the response and skip the normal
      // fan-out. Only the thread OWNER (the vendor) triggers it.
      if (appended.ok && appended.thread?.threadType === "vendor_agent" && appended.thread.ownerUserId === user.id) {
        const session = await findVendorAgentSessionByThread(db, threadId);
        if (session) {
          const turnTask = () =>
            runVendorAgentSessionTurn(db, session, text, "inbox").catch((e) =>
              console.error("vendor-agent inbox turn failed", e),
            );
          try {
            after(turnTask);
          } catch {
            void turnTask();
          }
        }
        return NextResponse.json({ ok: true, agentHandled: true });
      }
    }

    let toUserIds = normalizeUserIds(body.toUserIds);
    const { data: senderProfile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const senderRole = String(senderProfile?.role ?? "").trim().toLowerCase() || null;

    const propertyId = String(body.propertyId ?? "").trim();
    if (propertyId && body.fanOutPropertyInbox !== false && toUserIds.length === 1) {
      toUserIds = await resolvePropertyScopedManagerRecipientIds(db, {
        ownerManagerUserId: toUserIds[0]!,
        propertyId,
        channel: "inbox",
      });
    }

    const recipientsByEmail = new Map<
      string,
      { email: string; userId: string | null; role: string | null; scope: string }
    >();

    const toEmailsNormalized = normalizeEmails(body.toEmails)
      .filter((e) => e.includes("@"))
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e !== senderEmail && !recipientsByEmail.has(e));

    if (toEmailsNormalized.length > 0) {
      const { data: emailProfiles } = await db
        .from("profiles")
        .select("id, email, role")
        .in("email", toEmailsNormalized);
      const profileByEmail = new Map(
        (emailProfiles ?? []).map((p) => [String(p.email ?? "").trim().toLowerCase(), p]),
      );
      for (const email of toEmailsNormalized) {
        if (recipientsByEmail.has(email)) continue;
        // No matching profile (e.g. not yet signed up) — best-effort resident
        // scope so the row still shows up if/when they sign in by that email.
        const profile = profileByEmail.get(email);
        const role = profile ? String(profile.role ?? "").trim().toLowerCase() || null : null;
        recipientsByEmail.set(email, {
          email,
          userId: profile?.id ?? null,
          role,
          scope: scopeForRole(role),
        });
      }
    }

    if (toUserIds.length > 0) {
      const { data: recipientProfiles } = await db
        .from("profiles")
        .select("id, email, role")
        .in("id", toUserIds);
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

    const broadcastCategories = (Array.isArray(body.toBroadcast) ? body.toBroadcast : [])
      .filter((c): c is "management" | "resident" => c === "management" || c === "resident");
    if (broadcastCategories.length > 0) {
      const broadcastRecipients = await resolveBroadcastRecipients(db, user.id, senderEmail, senderRole, broadcastCategories);
      for (const r of broadcastRecipients) {
        if (r.email === senderEmail || recipientsByEmail.has(r.email)) continue;
        recipientsByEmail.set(r.email, { email: r.email, userId: r.userId, role: r.role, scope: scopeForRole(r.role) });
      }
    }

    // Enforce role scope on the SERVER (the compose UI only hides people; it is
    // not a boundary). Residents may message only their own manager(s)/owner(s);
    // managers may message only their own residents/co-managers; both may reach
    // Axis admin ops. Admins are unrestricted. Broadcast recipients above are
    // already resolved from the sender's own relationships, so they pass through;
    // this meaningfully restricts arbitrary toEmails/toUserIds. See
    // src/lib/inbox-recipient-scope.ts for the authoritative rules.
    const senderIsAdmin = senderRole === "admin" || (await isAdminUser(user.id));

    let recipients = [...recipientsByEmail.values()];
    if (!senderIsAdmin) {
      const { allowed } = await filterRecipientsBySenderScope(
        db,
        { id: user.id, email: senderEmail, role: senderRole, isAdmin: false },
        recipients,
      );
      if (allowed.length === 0) {
        return NextResponse.json(
          { ok: false, error: "You can only message people connected to your account." },
          { status: 403 },
        );
      }
      recipients = allowed;
    }

    // Per-recipient channel resolution (category mode) mirrors core delivery:
    // email/SMS follow each recipient's saved prefs; account-less (no userId)
    // recipients get the category-default email and never SMS.
    const channelByEmail = new Map<string, { email: boolean; sms: boolean }>();
    if (eventCategory) {
      const recipientUserIds = recipients
        .map((r) => r.userId)
        .filter((id): id is string => Boolean(id));
      const phoneById = new Map<string, { phone: string | null; phone_verified_at: string | null }>();
      if (recipientUserIds.length) {
        const { data: recProfiles } = await db
          .from("profiles")
          .select("id, phone, phone_verified_at")
          .in("id", recipientUserIds);
        for (const p of recProfiles ?? []) {
          phoneById.set(String(p.id), {
            phone: (p.phone as string | null) ?? null,
            phone_verified_at: (p.phone_verified_at as string | null) ?? null,
          });
        }
      }
      for (const r of recipients) {
        if (r.userId) {
          const ch = await resolveChannels(db, r.userId, eventCategory, phoneById.get(r.userId) ?? null);
          channelByEmail.set(r.email, { email: ch.email, sms: ch.sms });
        } else {
          channelByEmail.set(r.email, {
            email: DEFAULT_NOTIFICATION_PREFERENCES[eventCategory].email,
            sms: false,
          });
        }
      }
    }
    const emailWanted = (email: string): boolean =>
      eventCategory ? channelByEmail.get(email)?.email === true : deliverViaEmail;
    const anySmsWanted = eventCategory
      ? recipients.some((r) => channelByEmail.get(r.email)?.sms === true)
      : deliverViaSms;

    // All non-sandbox recipient emails — sandbox accounts skip Resend.
    // NOTE: endsWith("@axis.local") alone is wrong for "@test.axis.local".
    const toEmails = recipients
      .map((recipient) => recipient.email)
      .filter((email) => !isPortalSandboxEmail(email));
    // The actual email SEND list: category mode → recipients whose email channel
    // is on; legacy → all real recipients when deliverViaEmail.
    const emailToSend = recipients
      .filter((recipient) => emailWanted(recipient.email))
      .map((recipient) => recipient.email)
      .filter((email) => !isPortalSandboxEmail(email));

    // Deliver to portal inbox for all recipients (including @axis.local demo emails)
    if (deliverToPortalInbox && recipients.length > 0) {
      const senderScope = scopeForRole(senderRole);

      const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const preview = text.slice(0, 100).replace(/\n/g, " ");
      for (const recipient of recipients) {
        const ts = Date.now();
        const rand = Math.random().toString(36).slice(2, 6);
        const recipientLower = recipient.email;

        // Sender's Sent record (owner-only, scoped to the sender's portal)
        const senderThreadId = `msg_${user.id}_${ts}_${rand}`;
        await db.from("portal_inbox_thread_records").upsert(
          {
            id: senderThreadId,
            scope: senderScope,
            owner_user_id: user.id,
            participant_email: null,
            thread_type: "portal_message",
            row_data: { id: senderThreadId, folder: "sent", from: fromName, email: recipientLower, subject, preview, body: text, time: when, unread: false, scope: senderScope },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );

        if (recipientLower === senderEmail) continue;

        // Recipient's inbox record in their own scope.
        const recipientThreadId = `msg_inbox_${ts}_${rand}`;
        await db.from("portal_inbox_thread_records").upsert(
          {
            id: recipientThreadId,
            scope: recipient.scope,
            owner_user_id: recipient.userId,
            participant_email: recipientLower,
            thread_type: "portal_message",
            row_data: { id: recipientThreadId, folder: "inbox", from: fromName, email: senderEmail, subject, preview, body: text, time: when, unread: true, scope: recipient.scope },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      }

      // Push notification, best-effort. Keep the payload generic (sender name
      // only) since messages here can carry sensitive lease/payment details.
      try {
        const pushCandidates = recipients.filter((r) => r.email !== senderEmail);
        const missingIdEmails = pushCandidates.filter((r) => !r.userId).map((r) => r.email);
        const resolvedIds = new Map<string, string>();
        if (missingIdEmails.length > 0) {
          const { data: resolvedProfiles } = await db
            .from("profiles")
            .select("id, email")
            .in("email", missingIdEmails);
          for (const p of resolvedProfiles ?? []) {
            const email = String(p.email ?? "").trim().toLowerCase();
            if (email) resolvedIds.set(email, p.id as string);
          }
        }
        await Promise.all(
          pushCandidates.map((r) => {
            const uid = r.userId ?? resolvedIds.get(r.email);
            if (!uid) return Promise.resolve();
            return sendPushToUser(uid, {
              title: `New message from ${fromName}`,
              body: "You have a new message in your PropLane inbox.",
              url: inboxDeepLinkForRole(r.role),
            }).catch(() => {});
          }),
        );
      } catch {
        /* non-critical — no-ops when FCM is not configured */
      }
    }

    // If no eligible real email recipients and SMS not requested, short-circuit
    if (toEmails.length === 0 && !anySmsWanted) {
      const sentAt = new Date().toISOString();
      for (const recipient of recipients) {
        const logId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.from("portal_outbound_mail_records").upsert(
          {
            id: logId,
            recipient_email: recipient.email,
            subject,
            channel: "email",
            row_data: { id: logId, to: recipient.email, subject, body: text, sentAt, emailSent: false },
          },
          { onConflict: "id" },
        );
      }
      return NextResponse.json({ ok: true, skipped: true, reason: "No eligible real recipients — portal inbox updated." });
    }

    let emailResendId: string | null = null;

    if (emailToSend.length > 0) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: "Email delivery not configured (RESEND_API_KEY missing)." }, { status: 503 });
      }
      const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via PropLane portal by ${fromName}</p>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: emailToSend, subject, text, html }),
      });
      const emailPayload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: emailPayload.message ?? "Email send failed." }, { status: 502 });
      }
      emailResendId = emailPayload.id ?? null;
    }

    const sentAt = new Date().toISOString();

    // Log email sends
    if (emailToSend.length > 0) {
      for (const recipient of recipients) {
        const logId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.from("portal_outbound_mail_records").upsert(
          {
            id: logId,
            recipient_email: recipient.email,
            subject,
            channel: "email",
            row_data: {
              id: logId,
              to: recipient.email,
              subject,
              body: text,
              sentAt,
              emailSent: emailToSend.includes(recipient.email),
            },
          },
          { onConflict: "id" },
        );
      }
    }

    // SMS delivery. In category mode each recipient is gated by their resolved
    // SMS channel (verified, non-opted-out phone + pref on); legacy mode texts
    // every recipient with a phone (STOP opt-out still enforced inside sendSms).
    if (anySmsWanted) {
      const { data: senderProfile } = await db.from("profiles").select("sms_from_number").eq("id", user.id).maybeSingle();
      const smsFromNumber = String(senderProfile?.sms_from_number ?? "").trim();

      if (canSendResidentOutboundSms(smsFromNumber)) {
        // Fetch phone numbers for all recipients
        const recipientEmails = recipients.map((r) => r.email);
        const { data: phones } = await db
          .from("profiles")
          .select("email, phone")
          .in("email", recipientEmails);
        const phoneByEmail = new Map((phones ?? []).map((p) => [String(p.email).toLowerCase(), String(p.phone ?? "").trim()]));

        for (const recipient of recipients) {
          if (eventCategory && channelByEmail.get(recipient.email)?.sms !== true) continue;
          const recipientPhone = phoneByEmail.get(recipient.email) ?? "";
          if (!recipientPhone) continue;
          let smsText = `${subject}\n\n${text}`;
          const linkKind: ResidentSmsLinkKind | null =
            eventCategory === "leases"
              ? "lease"
              : eventCategory === "payments"
                ? "payments"
                : eventCategory === "maintenance"
                  ? "services"
                  : eventCategory
                    ? "inbox"
                    : null;
          if (linkKind) smsText = ensureSmsIncludesPortalLink(smsText, linkKind);
          const result = await sendResidentOutboundSms({
            to: recipientPhone,
            text: smsText,
            fromNumber: smsFromNumber,
            linkKind: null,
            openThread:
              eventCategory === "payments" || eventCategory === "leases"
                ? {
                    managerUserId: user.id,
                    residentEmail: recipient.email,
                    topic: eventCategory === "leases" ? "lease" : "payment",
                  }
                : null,
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

    track("message_sent", user.id, { delivered: Boolean(emailResendId) });
    return NextResponse.json({ ok: true, id: emailResendId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
