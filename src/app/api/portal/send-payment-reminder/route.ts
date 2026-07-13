import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { chargeDueLabel, isUnpaidHouseholdCharge, type HouseholdCharge } from "@/lib/household-charges";
import { shouldSkipOutboundEmail } from "@/lib/portal-sandbox-accounts";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendSms } from "@/lib/twilio";
import { DEFAULT_NOTIFICATION_PREFERENCES, resolveChannels } from "@/lib/notification-preferences";

export const runtime = "nodejs";

async function loadOwnedChargeForReminder(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  managerUserId: string,
  chargeId: string,
): Promise<HouseholdCharge | null> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("row_data, manager_user_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (error || !data?.row_data) return null;
  if (data.manager_user_id !== managerUserId) return null;
  return data.row_data as HouseholdCharge;
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      chargeId?: string;
      residentEmail?: string;
      residentName?: string;
      chargeTitle?: string;
      balanceDue?: string;
      dueDate?: string;
      propertyLabel?: string;
      managerName?: string;
    };

    const db = createSupabaseServiceRoleClient();
    const chargeId = String(body.chargeId ?? "").trim();
    const ownedCharge = chargeId ? await loadOwnedChargeForReminder(db, user.id, chargeId) : null;
    if (chargeId && !ownedCharge) {
      return NextResponse.json({ ok: false, error: "Charge not found." }, { status: 404 });
    }
    if (ownedCharge && !isUnpaidHouseholdCharge(ownedCharge)) {
      return NextResponse.json(
        { ok: false, error: "This charge is already paid. Reminders are not sent for paid charges.", code: "charge_paid" },
        { status: 409 },
      );
    }

    const residentEmail = String(ownedCharge?.residentEmail ?? body.residentEmail ?? "").trim().toLowerCase();
    const residentName = String(ownedCharge?.residentName ?? body.residentName ?? "Resident").trim();
    const chargeTitle = String(ownedCharge?.title ?? body.chargeTitle ?? "outstanding charge").trim();
    const balanceDue = String(ownedCharge?.balanceLabel ?? body.balanceDue ?? "").trim();
    const dueDate = String(ownedCharge ? chargeDueLabel(ownedCharge) : body.dueDate ?? "").trim();
    const propertyLabel = String(ownedCharge?.propertyLabel ?? body.propertyLabel ?? "").trim();

    const { data: managerProfile } = await db
      .from("profiles")
      .select("full_name, email, sms_from_number")
      .eq("id", user.id)
      .maybeSingle();
    const managerName =
      managerProfile?.full_name?.trim() || managerProfile?.email?.trim() || String(body.managerName ?? "Your property manager").trim();

    if (!residentEmail || !residentEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid resident email required." }, { status: 400 });
    }
    if (!ownedCharge && balanceDue === "$0.00") {
      return NextResponse.json(
        { ok: false, error: "This charge is already paid. Reminders are not sent for paid charges.", code: "charge_paid" },
        { status: 409 },
      );
    }

    const senderLower = (user.email ?? "").trim().toLowerCase();
    const skipExternalEmail = shouldSkipOutboundEmail(residentEmail) || (!!senderLower && residentEmail === senderLower);

    if (skipExternalEmail) {
      // Demo email — still deliver to portal inbox, just skip real email
      await deliverToPortalInbox({ db, userId: user.id, managerEmail: user.email ?? "", residentEmail, residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });
      return NextResponse.json({ ok: true, skipped: true, reason: "Skipped external delivery; portal inbox updated." });
    }

    const subject = `Payment reminder: ${chargeTitle}`;
    const messageBody = buildReminderBody({ residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });

    // Gate email/SMS by the resident's saved "payments" preference (inbox is
    // always delivered below). Account-less residents fall back to email-default-ON,
    // never SMS.
    const { data: residentProfile } = await db
      .from("profiles")
      .select("id, phone, phone_verified_at")
      .eq("email", residentEmail.toLowerCase())
      .maybeSingle();
    const residentUserId = String(residentProfile?.id ?? "").trim() || null;
    const channels = residentUserId
      ? await resolveChannels(db, residentUserId, "payments", {
          phone: (residentProfile?.phone as string | null) ?? null,
          phone_verified_at: (residentProfile?.phone_verified_at as string | null) ?? null,
        })
      : { inbox: true, email: DEFAULT_NOTIFICATION_PREFERENCES.payments.email, sms: false };

    // 1. Send real email via Resend
    let emailSent = false;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey && channels.email) {
      const from = process.env.RESEND_FROM?.trim() || "PropLane <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${messageBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via PropLane portal by ${managerName}</p>`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [residentEmail], subject, text: messageBody, html }),
      });
      emailSent = res.ok;
    }

    // 2. Deliver to resident's Axis portal inbox
    await deliverToPortalInbox({ db, userId: user.id, managerEmail: user.email ?? "", residentEmail, residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });

    // 3. Log to outbound mail records
    const outboundId = `outbound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.from("portal_outbound_mail_records").upsert({
      id: outboundId,
      recipient_email: residentEmail.toLowerCase(),
      subject,
      channel: "email",
      row_data: { id: outboundId, to: residentEmail, subject, body: messageBody, sentAt: new Date().toISOString(), emailSent, chargeId: chargeId || undefined },
    }, { onConflict: "id" });

    // 4. SMS delivery (manager has a work number AND resident opted into payments SMS)
    const smsFromNumber = String(managerProfile?.sms_from_number ?? "").trim();
    if (smsFromNumber && channels.sms) {
      const residentPhone = String(residentProfile?.phone ?? "").trim();
      if (residentPhone) {
        const smsBody = `Hi ${residentName}, this is a payment reminder: ${chargeTitle}${balanceDue ? ` — ${balanceDue}` : ""}${propertyLabel ? ` (${propertyLabel})` : ""}. Log in to your PropLane portal to pay. — ${managerName}`;
        const smsResult = await sendSms(residentPhone, smsBody, smsFromNumber);
        if (smsResult.sent) {
          const smsLogId = `outbound_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await db.from("portal_outbound_mail_records").upsert({
            id: smsLogId,
            recipient_email: residentEmail.toLowerCase(),
            subject,
            channel: "sms",
            row_data: { id: smsLogId, to: residentPhone, subject, body: smsBody, sentAt: new Date().toISOString(), smsSent: true },
          }, { onConflict: "id" });
        }
      }
    }

    track("payment_reminder_sent", user.id, { email_sent: emailSent });
    return NextResponse.json({ ok: true, emailSent });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

function buildReminderBody({
  residentName,
  chargeTitle,
  balanceDue,
  dueDate,
  propertyLabel,
  managerName,
}: {
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  dueDate: string;
  propertyLabel: string;
  managerName: string;
}): string {
  const lines = [
    `Hi ${residentName},`,
    "",
    `This is a friendly reminder that your ${chargeTitle} payment is outstanding.`,
  ];
  if (balanceDue) lines.push(`Amount due: ${balanceDue}`);
  if (dueDate) lines.push(`Due date: ${dueDate}`);
  if (propertyLabel) lines.push(`Property: ${propertyLabel}`);
  lines.push(
    "",
    "Please log in to your PropLane resident portal to make your payment at your earliest convenience.",
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    managerName,
    "PropLane Portal",
  );
  return lines.join("\n");
}

async function deliverToPortalInbox({
  db,
  userId,
  managerEmail,
  residentEmail,
  residentName,
  chargeTitle,
  balanceDue,
  dueDate,
  propertyLabel,
  managerName,
}: {
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
  userId: string;
  managerEmail: string;
  residentEmail: string;
  residentName: string;
  chargeTitle: string;
  balanceDue: string;
  dueDate: string;
  propertyLabel: string;
  managerName: string;
}) {
  const subject = `Payment reminder: ${chargeTitle}`;
  const messageBody = buildReminderBody({ residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const residentLower = residentEmail.toLowerCase();
  const senderLower = (managerEmail || "manager@example.com").toLowerCase();
  const when = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const preview = messageBody.slice(0, 100).replace(/\n/g, " ");

  const managerThreadId = `payment_sent_${userId}_${ts}_${rand}`;
  await db.from("portal_inbox_thread_records").upsert(
    {
      id: managerThreadId,
      scope: "axis_portal_inbox_manager_v1",
      owner_user_id: userId,
      participant_email: null,
      thread_type: "payment_reminder",
      row_data: {
        id: managerThreadId,
        folder: "sent",
        from: managerName,
        email: residentLower,
        subject,
        preview,
        body: messageBody,
        time: when,
        unread: false,
        scope: "axis_portal_inbox_manager_v1",
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  // Skip resident inbox record when recipient = sender (self-send) to avoid polluting manager's Unopened tab
  if (residentLower !== senderLower) {
    const residentThreadId = `payment_inbox_${ts}_${rand}`;
    await db.from("portal_inbox_thread_records").upsert(
      {
        id: residentThreadId,
        scope: "axis_portal_inbox_resident_v1",
        owner_user_id: null,
        participant_email: residentLower,
        thread_type: "payment_reminder",
        row_data: {
          id: residentThreadId,
          folder: "inbox",
          from: managerName,
          email: senderLower,
          subject,
          preview,
          body: messageBody,
          time: when,
          unread: true,
          scope: "axis_portal_inbox_resident_v1",
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  }
}
