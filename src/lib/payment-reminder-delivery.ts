import { chargeDueLabel, isUnpaidHouseholdCharge, type HouseholdCharge } from "@/lib/household-charges";
import { sendPushToUser } from "@/lib/push-notifications.server";
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { sendSms } from "@/lib/twilio";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  resolveChannels,
  type NotificationCategory,
} from "@/lib/notification-preferences";

type ServiceDb = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function deliverPaymentReminder(input: {
  db: ServiceDb;
  charge: HouseholdCharge;
  managerId: string | null;
  dedupId: string;
  managerName: string;
  managerSmsFromNumber: string;
  apiKey: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  slotLabel: string;
  /** Defaults to 'payments'. Email/SMS follow the resident's per-category preference. */
  eventCategory?: NotificationCategory;
}): Promise<{ sent: boolean; error?: string }> {
  const { db, charge, managerId, dedupId, managerName, managerSmsFromNumber, apiKey, from, subject, text, html, slotLabel } =
    input;
  if (!isUnpaidHouseholdCharge(charge)) {
    return { sent: false, error: "charge_paid" };
  }
  const residentLower = charge.residentEmail.trim().toLowerCase();

  // Resolve the resident's account + saved preferences once. Account-less
  // residents (no profile row) fall back to the category default (email ON,
  // never SMS). Inbox is always written regardless.
  const category: NotificationCategory = input.eventCategory ?? "payments";
  const { data: residentProfile } = await db
    .from("profiles")
    .select("id, phone, phone_verified_at")
    .eq("email", residentLower)
    .maybeSingle();
  const residentUserId = String(residentProfile?.id ?? "").trim() || null;
  const channels = residentUserId
    ? await resolveChannels(db, residentUserId, category, {
        phone: (residentProfile?.phone as string | null) ?? null,
        phone_verified_at: (residentProfile?.phone_verified_at as string | null) ?? null,
      })
    : { inbox: true, email: DEFAULT_NOTIFICATION_PREFERENCES[category].email, sms: false };

  let emailSent = false;
  if (apiKey && channels.email) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [residentLower], subject, text, html }),
      });
      emailSent = res.ok;
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        return { sent: false, error: `${residentLower}/${slotLabel}: ${payload.message ?? res.statusText}` };
      }
    } catch (e) {
      return { sent: false, error: `${residentLower}/${slotLabel}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  const ts = Date.now();
  const rand = crypto.randomUUID().slice(0, 8);
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
  } catch {
    /* non-critical */
  }

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
  } catch {
    /* non-critical */
  }

  try {
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
          slot: slotLabel,
        },
      },
      { onConflict: "id" },
    );
  } catch {
    if (!emailSent && !apiKey) {
      return { sent: false, error: "Could not record the reminder send." };
    }
  }

  if (managerSmsFromNumber && channels.sms) {
    try {
      const residentPhone = String(residentProfile?.phone ?? "").trim();
      if (residentPhone) {
        const smsBody = `${subject}\n\n${text.slice(0, 300)}`;
        const smsResult = await sendSms(residentPhone, smsBody, managerSmsFromNumber);
        if (smsResult.sent) {
          const smsLogId = `${dedupId}_sms`;
          await db.from("portal_outbound_mail_records").upsert(
            {
              id: smsLogId,
              recipient_email: residentLower,
              subject,
              channel: "sms",
              row_data: {
                id: smsLogId,
                to: residentPhone,
                subject,
                body: smsBody,
                sentAt: new Date().toISOString(),
                smsSent: true,
                chargeId: charge.id,
                slot: slotLabel,
              },
            },
            { onConflict: "id" },
          );
        }
      }
    } catch {
      /* non-critical */
    }
  }

  try {
    if (residentUserId) {
      const pushBody = text.replace(/\s+/g, " ").trim().slice(0, 180);
      await sendPushToUser(residentUserId, {
        title: subject,
        body: pushBody || `Payment reminder for ${charge.title}`,
        url: "/resident/payments",
        data: { chargeId: charge.id, slot: slotLabel },
      });
    }
  } catch {
    /* non-critical — no-ops when FCM is not configured */
  }

  return { sent: true };
}

export function reminderHtmlFromText(text: string): string {
  const htmlBody = text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${line.replace(/</g, "&lt;")}</p>` : ""))
    .join("\n");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1e293b">\n${htmlBody}\n</body></html>`;
}

export function chargeDueLabelSafe(charge: HouseholdCharge): string {
  return chargeDueLabel(charge);
}
