import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

const MANAGER_INBOX_SCOPE = "axis_portal_inbox_manager_v1";
const OWNER_INBOX_SCOPE = "axis_portal_inbox_owner_v1";
const RESIDENT_INBOX_SCOPE = "axis_portal_inbox_resident_v1";

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
  if (normalized === "owner") return OWNER_INBOX_SCOPE;
  if (normalized === "manager" || normalized === "pro" || normalized === "admin") return MANAGER_INBOX_SCOPE;
  return RESIDENT_INBOX_SCOPE;
}

type BroadcastRecipient = { email: string; userId: string | null; role: "resident" | "manager" | "owner" };

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

  async function linkedOwnersForManagers(managerIds: string[]) {
    if (managerIds.length === 0) return;
    const { data } = await db
      .from("portal_pro_relationship_records")
      .select("related_user_id, related_email")
      .in("manager_user_id", managerIds);
    for (const row of data ?? []) {
      const email = String(row.related_email ?? "").trim().toLowerCase();
      if (email) out.push({ email, userId: (row.related_user_id as string | null) ?? null, role: "owner" });
    }
  }

  if (normalizedRole === "manager" || normalizedRole === "pro" || normalizedRole === "admin") {
    if (categories.includes("resident")) await approvedResidentsForManagers([senderId]);
    if (categories.includes("management")) await linkedOwnersForManagers([senderId]);
    return out;
  }

  if (normalizedRole === "owner") {
    const { data: rels } = await db
      .from("portal_pro_relationship_records")
      .select("manager_user_id")
      .or(`related_user_id.eq.${senderId},related_email.eq.${senderEmail}`);
    const managerIds = [...new Set((rels ?? []).map((r) => r.manager_user_id as string | null).filter((id): id is string => Boolean(id)))];
    if (categories.includes("management") && managerIds.length > 0) {
      const { data: mgrProfiles } = await db.from("profiles").select("id, email").in("id", managerIds);
      for (const p of mgrProfiles ?? []) {
        const email = String(p.email ?? "").trim().toLowerCase();
        if (email) out.push({ email, userId: p.id, role: "manager" });
      }
    }
    if (categories.includes("resident")) await approvedResidentsForManagers(managerIds);
    return out;
  }

  // Resident sender — "management" resolves to their own manager + any owners linked to that manager.
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
      await linkedOwnersForManagers([managerUserId]);
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

    const body = (await req.json().catch(() => ({}))) as {
      fromName?: string;
      fromEmail?: string;
      toEmails?: unknown;
      toUserIds?: unknown;
      toBroadcast?: unknown;
      subject?: string;
      text?: string;
      deliverToPortalInbox?: boolean;
      deliverViaEmail?: boolean;
      deliverViaSms?: boolean;
    };

    const senderEmail = String(user.email ?? body.fromEmail ?? "portal@example.com").trim().toLowerCase();
    const toUserIds = normalizeUserIds(body.toUserIds);
    const subject = String(body.subject ?? "").trim();
    const text = String(body.text ?? "").trim();
    const fromName = String(body.fromName ?? "Axis Housing Portal").trim();
    const deliverToPortalInbox = body.deliverToPortalInbox !== false;
    const deliverViaEmail = body.deliverViaEmail !== false;
    const deliverViaSms = body.deliverViaSms === true;

    if (!subject || !text) {
      return NextResponse.json({ ok: false, error: "subject and text are required." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const { data: senderProfile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const senderRole = String(senderProfile?.role ?? "").trim().toLowerCase() || null;

    const recipientsByEmail = new Map<
      string,
      { email: string; userId: string | null; role: string | null; scope: string }
    >();

    for (const email of normalizeEmails(body.toEmails)
      .filter((e) => e.includes("@"))
      .map((e) => e.trim().toLowerCase())) {
      if (email === senderEmail || recipientsByEmail.has(email)) continue;
      recipientsByEmail.set(email, {
        email,
        userId: null,
        role: null,
        scope: RESIDENT_INBOX_SCOPE,
      });
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

    const recipients = [...recipientsByEmail.values()];
    const recipientEmails = recipients.map((recipient) => recipient.email);
    const toEmails = recipients
      .map((recipient) => recipient.email)
      .filter((email) => !email.endsWith("@axis.local"));

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
    }

    // If no eligible real email recipients and SMS not requested, short-circuit
    if (toEmails.length === 0 && !deliverViaSms) {
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

    if (deliverViaEmail && toEmails.length > 0) {
      const apiKey = process.env.RESEND_API_KEY?.trim();
      if (!apiKey) {
        return NextResponse.json({ ok: false, error: "Email delivery not configured (RESEND_API_KEY missing)." }, { status: 503 });
      }
      const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis Housing portal by ${fromName}</p>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: toEmails, subject, text, html }),
      });
      const emailPayload = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: emailPayload.message ?? "Email send failed." }, { status: 502 });
      }
      emailResendId = emailPayload.id ?? null;
    }

    const sentAt = new Date().toISOString();

    // Log email sends
    if (deliverViaEmail && toEmails.length > 0) {
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
              emailSent: toEmails.includes(recipient.email),
            },
          },
          { onConflict: "id" },
        );
      }
    }

    // SMS delivery
    if (deliverViaSms) {
      const { data: senderProfile } = await db.from("profiles").select("sms_from_number").eq("id", user.id).maybeSingle();
      const smsFromNumber = String(senderProfile?.sms_from_number ?? "").trim();

      if (smsFromNumber) {
        // Fetch phone numbers for all recipients
        const recipientEmails = recipients.map((r) => r.email);
        const { data: phones } = await db
          .from("profiles")
          .select("email, phone")
          .in("email", recipientEmails);
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

    return NextResponse.json({ ok: true, id: emailResendId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
