import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { collectLinkedPropertyIdsForUser } from "@/lib/auth/manager-lease-scope";
import { track } from "@/lib/analytics/posthog";
import { chargeDueLabel, isUnpaidHouseholdCharge, type HouseholdCharge } from "@/lib/household-charges";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

function canSendPaymentReminder(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager" || role === "owner" || role === "pro";
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function loadChargeForReminder(
  db: ReturnType<typeof createSupabaseServiceRoleClient>,
  userId: string,
  chargeId: string,
  admin: boolean,
): Promise<{ charge: HouseholdCharge; managerUserId: string } | null> {
  const { data, error } = await db
    .from("portal_household_charge_records")
    .select("row_data, manager_user_id")
    .eq("id", chargeId)
    .maybeSingle();
  if (error || !data?.row_data) return null;

  const charge = data.row_data as HouseholdCharge;
  const managerUserId = data.manager_user_id?.trim() || charge.managerUserId?.trim() || "";
  if (admin || (managerUserId && managerUserId === userId)) {
    return { charge, managerUserId };
  }

  const propertyId = charge.propertyId?.trim() ?? "";
  if (propertyId) {
    const linked = await collectLinkedPropertyIdsForUser(db, userId);
    if (linked.has(propertyId)) return { charge, managerUserId };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as { chargeId?: string };

    const db = createSupabaseServiceRoleClient();
    const [{ data: requestor }, admin] = await Promise.all([
      db.from("profiles").select("role, full_name, email, sms_from_number").eq("id", user.id).maybeSingle(),
      isAdminUser(user.id),
    ]);
    if (!admin && !canSendPaymentReminder(requestor?.role)) {
      return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 403 });
    }

    const chargeId = String(body.chargeId ?? "").trim();
    if (!chargeId) {
      return NextResponse.json({ ok: false, error: "chargeId is required." }, { status: 400 });
    }

    const loaded = await loadChargeForReminder(db, user.id, chargeId, admin);
    if (!loaded) {
      return NextResponse.json({ ok: false, error: "Charge not found." }, { status: 404 });
    }
    const ownedCharge = loaded.charge;
    if (!isUnpaidHouseholdCharge(ownedCharge)) {
      return NextResponse.json(
        { ok: false, error: "This charge is already paid. Reminders are not sent for paid charges.", code: "charge_paid" },
        { status: 409 },
      );
    }

    const residentEmail = String(ownedCharge.residentEmail ?? "").trim().toLowerCase();
    const residentName = String(ownedCharge.residentName ?? "Resident").trim();
    const chargeTitle = String(ownedCharge.title ?? "outstanding charge").trim();
    const balanceDue = String(ownedCharge.balanceLabel ?? "").trim();
    const dueDate = String(chargeDueLabel(ownedCharge)).trim();
    const propertyLabel = String(ownedCharge.propertyLabel ?? "").trim();
    const managerProfile = requestor;
    const managerName =
      managerProfile?.full_name?.trim() || managerProfile?.email?.trim() || "Your property manager";

    if (!residentEmail || !residentEmail.includes("@")) {
      return NextResponse.json({ ok: false, error: "Valid resident email required." }, { status: 400 });
    }

    const senderLower = (user.email ?? "").trim().toLowerCase();
    const skipExternalEmail = residentEmail.endsWith("@axis.local") || (!!senderLower && residentEmail === senderLower);

    if (skipExternalEmail) {
      // Demo email — still deliver to portal inbox, just skip real email
      await deliverToPortalInbox({ db, userId: user.id, managerEmail: user.email ?? "", residentEmail, residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });
      return NextResponse.json({ ok: true, skipped: true, reason: "Skipped external delivery; portal inbox updated." });
    }

    const subject = `Payment reminder: ${chargeTitle}`;
    const messageBody = buildReminderBody({ residentName, chargeTitle, balanceDue, dueDate, propertyLabel, managerName });

    // 1. Send real email via Resend
    let emailSent = false;
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (apiKey) {
      const from = process.env.RESEND_FROM?.trim() || "Axis <onboarding@resend.dev>";
      const html = `<p style="white-space:pre-wrap;font-family:sans-serif;font-size:15px;line-height:1.6;color:#1e293b">${escapeHtmlText(messageBody)}</p><hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"><p style="font-family:sans-serif;font-size:12px;color:#94a3b8">Sent via Axis portal by ${escapeHtmlText(managerName)}</p>`;
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

    // 4. SMS delivery (if manager has sms_from_number configured)
    const smsFromNumber = String(managerProfile?.sms_from_number ?? "").trim();
    if (smsFromNumber) {
      const { data: residentProfile } = await db.from("profiles").select("phone").eq("email", residentEmail.toLowerCase()).maybeSingle();
      const residentPhone = String(residentProfile?.phone ?? "").trim();
      if (residentPhone) {
        const smsBody = `Hi ${residentName}, this is a payment reminder: ${chargeTitle}${balanceDue ? ` — ${balanceDue}` : ""}${propertyLabel ? ` (${propertyLabel})` : ""}. Log in to your Axis portal to pay. — ${managerName}`;
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
    "Please log in to your Axis resident portal to make your payment at your earliest convenience.",
    "",
    "If you have any questions, please don't hesitate to reach out.",
    "",
    managerName,
    "Axis Portal",
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
