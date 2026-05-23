import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { householdChargeDueDate, chargeDueLabel, type HouseholdCharge } from "@/lib/household-charges";
import {
  PAYMENT_REMINDER_SUBJECTS,
  buildPaymentReminderText,
  buildPaymentReminderHtml,
} from "@/lib/payment-reminder-email";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

const WINDOWS: Array<{ slot: "3d" | "12h"; minH: number; maxH: number }> = [
  { slot: "3d", minH: 71, maxH: 73 },
  { slot: "12h", minH: 11, maxH: 13 },
];

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return true;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  const now = Date.now();
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";

  const { data: records, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, manager_user_id")
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const record of records ?? []) {
    const charge = record.row_data as HouseholdCharge | null;
    if (!charge?.id || !charge.residentEmail) continue;
    if (charge.residentEmail.trim().toLowerCase().endsWith("@axis.local")) continue;

    const dueDate = householdChargeDueDate(charge);
    if (!dueDate) continue;

    const hoursUntilDue = (dueDate.getTime() - now) / (1000 * 60 * 60);

    for (const { slot, minH, maxH } of WINDOWS) {
      if (hoursUntilDue < minH || hoursUntilDue > maxH) continue;

      if ((charge.cancelledReminders ?? []).includes(slot)) {
        skipped++;
        continue;
      }

      const dedupId = `payment_reminder_${slot}_${charge.id}`;
      const { data: existing } = await db
        .from("portal_outbound_mail_records")
        .select("id")
        .eq("id", dedupId)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Resolve manager name and SMS from number
      let managerName = "Your property manager";
      let managerSmsFromNumber = "";
      const managerId = record.manager_user_id as string | null;
      if (managerId) {
        const { data: profile } = await db
          .from("profiles")
          .select("full_name, email, sms_from_number")
          .eq("id", managerId)
          .maybeSingle();
        if (profile?.full_name?.trim()) managerName = profile.full_name.trim();
        else if (profile?.email?.trim()) managerName = profile.email.trim();
        managerSmsFromNumber = String(profile?.sms_from_number ?? "").trim();
      }

      const subject = PAYMENT_REMINDER_SUBJECTS[slot](charge.title);
      const dueDateLabel = chargeDueLabel(charge);
      const params = {
        slot,
        residentName: charge.residentName || "Resident",
        chargeTitle: charge.title,
        balanceDue: charge.balanceLabel,
        propertyLabel: charge.propertyLabel,
        managerName,
        dueDateLabel,
      };
      const text = buildPaymentReminderText(params);
      const html = buildPaymentReminderHtml(params);

      const residentLower = charge.residentEmail.trim().toLowerCase();

      // Send real email
      let emailSent = false;
      if (apiKey) {
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: [residentLower], subject, text, html }),
          });
          emailSent = res.ok;
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { message?: string };
            errors.push(`${residentLower}/${slot}: ${payload.message ?? res.statusText}`);
          }
        } catch (e) {
          errors.push(`${residentLower}/${slot}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 6);
      const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
      const preview = text.slice(0, 100).replace(/\n/g, " ");

      // Resident inbox thread
      try {
        const residentThreadId = `payment_auto_reminder_inbox_${ts}_${rand}`;
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
              email: from.match(/<([^>]+)>/)?.[1] ?? from,
              subject,
              preview,
              body: text,
              time: when,
              unread: true,
              scope: "axis_portal_inbox_resident_v1",
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" },
        );
      } catch { /* non-critical */ }

      // Manager sent thread
      try {
        if (managerId) {
          const managerThreadId = `payment_auto_reminder_sent_${ts}_${rand}`;
          await db.from("portal_inbox_thread_records").upsert(
            {
              id: managerThreadId,
              scope: "axis_portal_inbox_manager_v1",
              owner_user_id: managerId,
              participant_email: null,
              thread_type: "payment_reminder",
              row_data: {
                id: managerThreadId,
                folder: "sent",
                from: managerName,
                email: residentLower,
                subject,
                preview,
                body: text,
                time: when,
                unread: false,
                scope: "axis_portal_inbox_manager_v1",
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );
        }
      } catch { /* non-critical */ }

      // Dedup key — also serves as the permanent log entry
      await db.from("portal_outbound_mail_records").upsert(
        {
          id: dedupId,
          recipient_email: residentLower,
          subject,
          channel: "email",
          row_data: {
            id: dedupId,
            to: residentLower,
            subject,
            body: text,
            sentAt: new Date().toISOString(),
            emailSent,
            chargeId: charge.id,
            slot,
          },
        },
        { onConflict: "id" },
      );

      // SMS delivery if manager has a Twilio number configured
      if (managerSmsFromNumber) {
        try {
          const { data: residentProfile } = await db.from("profiles").select("phone").eq("email", residentLower).maybeSingle();
          const residentPhone = String(residentProfile?.phone ?? "").trim();
          if (residentPhone) {
            const dueDateText = params.dueDateLabel ? ` due ${params.dueDateLabel}` : "";
            const smsBody = `Hi ${params.residentName}, reminder: ${charge.title}${dueDateText}${charge.balanceLabel ? ` — ${charge.balanceLabel}` : ""}. Log in to your Axis portal to pay. — ${managerName}`;
            const smsResult = await sendSms(residentPhone, smsBody, managerSmsFromNumber);
            if (smsResult.sent) {
              const smsLogId = `outbound_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              await db.from("portal_outbound_mail_records").upsert(
                {
                  id: smsLogId,
                  recipient_email: residentLower,
                  subject,
                  channel: "sms",
                  row_data: { id: smsLogId, to: residentPhone, subject, body: smsBody, sentAt: new Date().toISOString(), smsSent: true, chargeId: charge.id, slot },
                },
                { onConflict: "id" },
              );
            }
          }
        } catch { /* non-critical */ }
      }

      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, errors: errors.length ? errors : undefined });
}
