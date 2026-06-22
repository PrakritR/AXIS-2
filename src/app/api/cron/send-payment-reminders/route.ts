import { NextResponse } from "next/server";
import { isProductionRuntime } from "@/lib/server-env";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import {
  householdChargeDueDate,
  chargeDueLabel,
  type HouseholdCharge,
} from "@/lib/household-charges";
import { normalizeManagerListingSubmissionV1, type ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { lateFeePolicyFromSubmission } from "@/lib/payment-policy";
import type { PaymentReminderSlot } from "@/lib/payment-policy";
import {
  PAYMENT_REMINDER_SUBJECTS,
  buildPaymentReminderText,
  buildPaymentReminderHtml,
  buildLateFeeNoticeText,
} from "@/lib/payment-reminder-email";
import { sendSms } from "@/lib/twilio";

export const runtime = "nodejs";

const PRE_DUE_WINDOWS: Array<{ slot: Exclude<PaymentReminderSlot, "overdue_daily">; minH: number; maxH: number }> = [
  { slot: "7d", minH: 167, maxH: 169 },
  { slot: "5d", minH: 119, maxH: 121 },
  { slot: "3d", minH: 71, maxH: 73 },
  { slot: "12h", minH: 11, maxH: 13 },
];

const LATE_FEE_ELIGIBLE_KINDS = new Set<HouseholdCharge["kind"]>([
  "rent",
  "utilities",
  "first_month_rent",
  "prorated_rent",
  "prorated_utilities",
  "move_in_fee",
]);

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return !isProductionRuntime();
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / (1000 * 60 * 60 * 24));
}

function listingFromPropertyRow(propertyData: unknown): ManagerListingSubmissionV1 | null {
  if (!propertyData || typeof propertyData !== "object") return null;
  const submission = (propertyData as { listingSubmission?: unknown }).listingSubmission;
  if (!submission || typeof submission !== "object") return null;
  const v = (submission as { v?: unknown }).v;
  if (v !== 1) return null;
  return normalizeManagerListingSubmissionV1(submission as ManagerListingSubmissionV1);
}

async function deliverReminder(input: {
  db: ReturnType<typeof createSupabaseServiceRoleClient>;
  charge: HouseholdCharge;
  managerId: string | null;
  slot: PaymentReminderSlot;
  dedupId: string;
  managerName: string;
  managerSmsFromNumber: string;
  apiKey: string;
  from: string;
}): Promise<{ sent: boolean; error?: string }> {
  const { db, charge, managerId, slot, dedupId, managerName, managerSmsFromNumber, apiKey, from } = input;
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
        return { sent: false, error: `${residentLower}/${slot}: ${payload.message ?? res.statusText}` };
      }
    } catch (e) {
      return { sent: false, error: `${residentLower}/${slot}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  const when = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const preview = text.slice(0, 100).replace(/\n/g, " ");

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

  if (managerSmsFromNumber) {
    try {
      const { data: residentProfile } = await db.from("profiles").select("phone").eq("email", residentLower).maybeSingle();
      const residentPhone = String(residentProfile?.phone ?? "").trim();
      if (residentPhone) {
        const dueDateText = params.dueDateLabel ? ` due ${params.dueDateLabel}` : "";
        const smsBody =
          slot === "overdue_daily"
            ? `Hi ${params.residentName}, your ${charge.title} is overdue${dueDateText}${charge.balanceLabel ? ` — ${charge.balanceLabel}` : ""}. Please pay in your Axis portal. — ${managerName}`
            : `Hi ${params.residentName}, reminder: ${charge.title}${dueDateText}${charge.balanceLabel ? ` — ${charge.balanceLabel}` : ""}. Log in to your Axis portal to pay. — ${managerName}`;
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

  return { sent: true };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createSupabaseServiceRoleClient();
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim() || "Axis Housing <onboarding@resend.dev>";

  const { data: records, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, manager_user_id")
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: propertyRows } = await db.from("manager_property_records").select("id, property_data");
  const listingByPropertyId = new Map<string, ManagerListingSubmissionV1>();
  for (const row of propertyRows ?? []) {
    const sub = listingFromPropertyRow(row.property_data);
    if (sub && typeof row.id === "string") listingByPropertyId.set(row.id, sub);
  }

  const allCharges = (records ?? [])
    .map((record) => ({
      recordId: record.id as string,
      managerUserId: record.manager_user_id as string | null,
      charge: record.row_data as HouseholdCharge | null,
    }))
    .filter((row): row is { recordId: string; managerUserId: string | null; charge: HouseholdCharge } =>
      Boolean(row.charge?.id && row.charge.residentEmail),
    );

  const existingLateFeeSources = new Set(
    allCharges
      .filter((row) => row.charge.kind === "late_fee" && row.charge.sourceChargeId)
      .map((row) => row.charge.sourceChargeId!),
  );

  let sent = 0;
  let skipped = 0;
  let lateFeesCreated = 0;
  const errors: string[] = [];

  for (const { charge, managerUserId: managerId } of allCharges) {
    if (charge.residentEmail.trim().toLowerCase().endsWith("@axis.local")) continue;

    const dueDate = householdChargeDueDate(charge);
    if (!dueDate) continue;

    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    let managerName = "Your property manager";
    let managerSmsFromNumber = "";
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

    for (const { slot, minH, maxH } of PRE_DUE_WINDOWS) {
      if (hoursUntilDue < minH || hoursUntilDue > maxH) continue;
      if ((charge.cancelledReminders ?? []).includes(slot)) {
        skipped++;
        continue;
      }

      const dedupId = `payment_reminder_${slot}_${charge.id}`;
      const { data: existing } = await db.from("portal_outbound_mail_records").select("id").eq("id", dedupId).maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }

      const result = await deliverReminder({
        db,
        charge,
        managerId,
        slot,
        dedupId,
        managerName,
        managerSmsFromNumber,
        apiKey: apiKey ?? "",
        from,
      });
      if (result.error) errors.push(result.error);
      if (result.sent) sent++;
    }

    if (hoursUntilDue < 0) {
      const slot: PaymentReminderSlot = "overdue_daily";
      if (!(charge.cancelledReminders ?? []).includes(slot)) {
        const dedupId = `payment_reminder_overdue_${todayKey}_${charge.id}`;
        const { data: existing } = await db.from("portal_outbound_mail_records").select("id").eq("id", dedupId).maybeSingle();
        if (!existing) {
          const result = await deliverReminder({
            db,
            charge,
            managerId,
            slot,
            dedupId,
            managerName,
            managerSmsFromNumber,
            apiKey: apiKey ?? "",
            from,
          });
          if (result.error) errors.push(result.error);
          if (result.sent) sent++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }

      if (LATE_FEE_ELIGIBLE_KINDS.has(charge.kind) && !existingLateFeeSources.has(charge.id)) {
        const listing = listingByPropertyId.get(charge.propertyId);
        const policy = lateFeePolicyFromSubmission(listing);
        const daysPastDue = daysBetween(dueDate, now);
        if (policy.enabled && daysPastDue >= policy.graceDays) {
          const lateFeeId = `hc_late_fee_${charge.id}`;
          const lateFeeCharge: HouseholdCharge = {
            id: lateFeeId,
            createdAt: new Date().toISOString(),
            residentEmail: charge.residentEmail,
            residentName: charge.residentName,
            residentUserId: charge.residentUserId,
            propertyId: charge.propertyId,
            propertyLabel: charge.propertyLabel,
            managerUserId: charge.managerUserId ?? managerId,
            kind: "late_fee",
            title: `Late fee — ${charge.title}`,
            amountLabel: policy.amountLabel,
            balanceLabel: policy.amountLabel,
            status: "pending",
            blocksLeaseUntilPaid: false,
            dueDateLabel: "Due immediately",
            sourceChargeId: charge.id,
            zelleContactSnapshot: charge.zelleContactSnapshot,
            venmoContactSnapshot: charge.venmoContactSnapshot,
          };

          await db.from("portal_household_charge_records").upsert(
            {
              id: lateFeeId,
              manager_user_id: lateFeeCharge.managerUserId,
              resident_email: charge.residentEmail.trim().toLowerCase(),
              status: "pending",
              row_data: lateFeeCharge,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" },
          );

          existingLateFeeSources.add(charge.id);
          lateFeesCreated++;

          const noticeSubject = `Late fee added: ${charge.title}`;
          const noticeText = buildLateFeeNoticeText({
            residentName: charge.residentName || "Resident",
            sourceTitle: charge.title,
            lateFeeLabel: policy.amountLabel,
            graceDays: policy.graceDays,
            propertyLabel: charge.propertyLabel,
            managerName,
          });
          const residentLower = charge.residentEmail.trim().toLowerCase();
          const noticeDedupId = `late_fee_notice_${lateFeeId}`;

          if (apiKey) {
            try {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ from, to: [residentLower], subject: noticeSubject, text: noticeText }),
              });
            } catch { /* non-critical */ }
          }

          await db.from("portal_outbound_mail_records").upsert(
            {
              id: noticeDedupId,
              recipient_email: residentLower,
              subject: noticeSubject,
              channel: "email",
              row_data: {
                id: noticeDedupId,
                to: residentLower,
                subject: noticeSubject,
                body: noticeText,
                sentAt: new Date().toISOString(),
                chargeId: lateFeeId,
                slot: "late_fee_created",
              },
            },
            { onConflict: "id" },
          );
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    lateFeesCreated,
    errors: errors.length ? errors : undefined,
  });
}
