import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";
import { sendFromManagerWorkNumber } from "@/lib/proplane-sms-transport.server";
import { resolveActiveManagerSendNumber } from "@/lib/sms/manager-number-provisioning.server";

/**
 * Weekly recurring rent-reminder SMS, sent from each manager's own PropLane
 * number. Idempotent PER WEEK: a retry, redeploy, or duplicate cron tick can
 * never text a resident twice in the same ISO week because the dedup row is
 * CLAIMED atomically before the send.
 *
 * Gating (all inherited, one code path):
 * - Only managers whose own registration is approved AND number is active send
 *   (resolveActiveManagerSendNumber → null otherwise).
 * - The send goes through sendFromManagerWorkNumber with sendClass "automated",
 *   so it is consent-gated (opted-out numbers skipped) and quiet-hours-gated.
 */

const RENT_KINDS: ReadonlySet<HouseholdCharge["kind"]> = new Set([
  "rent",
  "first_month_rent",
  "prorated_rent",
  "prorated_last_month_rent",
]);

/** ISO-8601 week key like `2026-W30`. Stable across a Mon–Sun week. */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday of the current week decides the ISO year.
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function residentKeyFor(charge: HouseholdCharge): string {
  const uid = String(charge.residentUserId ?? "").trim();
  if (uid) return `u_${uid}`;
  return `e_${charge.residentEmail.trim().toLowerCase()}`;
}

export function weeklyRentReminderDedupId(weekKey: string, managerUserId: string, residentKey: string): string {
  // Keyed per MANAGER per resident per week: a resident with pending charges
  // under two managers must get one reminder from EACH, not one total.
  return `weekly_rent_sms_${weekKey}_${managerUserId}_${residentKey}`;
}

function reminderBody(charge: HouseholdCharge): string {
  const where = charge.propertyLabel?.trim() ? ` for ${charge.propertyLabel.trim()}` : "";
  const due = charge.dueDateLabel?.trim() ? ` (due ${charge.dueDateLabel.trim()})` : "";
  return `Rent reminder${where}: ${charge.amountLabel}${due}. Reply here with any questions.`;
}

export type WeeklyRentReminderResult = {
  considered: number;
  sent: number;
  skippedAlreadySent: number;
  skippedNoSendNumber: number;
  skippedNoPhone: number;
  failed: number;
  errors: Array<{ residentKey: string; error: string }>;
};

/**
 * Atomically claim the per-week dedup row. Returns true only for the caller that
 * actually inserted it — a duplicate tick / retry gets false and does not send.
 */
async function claimWeeklyReminder(
  db: SupabaseClient,
  id: string,
  recipientEmail: string,
  phone: string,
): Promise<boolean> {
  const { data } = await db
    .from("portal_outbound_mail_records")
    .upsert(
      {
        id,
        recipient_email: recipientEmail || phone,
        subject: "Weekly rent reminder (SMS)",
        row_data: { id, to: phone, kind: "weekly_rent_sms", claimedAt: new Date().toISOString() },
      },
      { onConflict: "id", ignoreDuplicates: true },
    )
    .select("id");
  return (data ?? []).length > 0;
}

export async function sendWeeklyRentReminders(
  db: SupabaseClient,
  opts?: { now?: Date; managerUserId?: string },
): Promise<WeeklyRentReminderResult> {
  const now = opts?.now ?? new Date();
  const weekKey = isoWeekKey(now);
  const result: WeeklyRentReminderResult = {
    considered: 0,
    sent: 0,
    skippedAlreadySent: 0,
    skippedNoSendNumber: 0,
    skippedNoPhone: 0,
    failed: 0,
    errors: [],
  };

  let query = db
    .from("portal_household_charge_records")
    .select("row_data, manager_user_id")
    .eq("status", "pending")
    .limit(5000);
  if (opts?.managerUserId) query = query.eq("manager_user_id", opts.managerUserId);
  const { data: rows } = await query;

  // One rent charge per resident (dedupe by residentKey), grouped by manager.
  const byManager = new Map<string, Map<string, HouseholdCharge>>();
  for (const row of rows ?? []) {
    const charge = (row as { row_data: HouseholdCharge | null }).row_data;
    if (!charge?.id || !RENT_KINDS.has(charge.kind)) continue;
    const managerId = String((row as { manager_user_id: string | null }).manager_user_id ?? charge.managerUserId ?? "").trim();
    if (!managerId) continue;
    const residents = byManager.get(managerId) ?? new Map<string, HouseholdCharge>();
    const key = residentKeyFor(charge);
    if (!residents.has(key)) residents.set(key, charge);
    byManager.set(managerId, residents);
  }

  for (const [managerId, residents] of byManager) {
    const sendNumber = await resolveActiveManagerSendNumber(db, managerId);
    if (!sendNumber) {
      result.skippedNoSendNumber += residents.size;
      continue;
    }

    for (const [residentKey, charge] of residents) {
      result.considered++;

      // Resolve a verified resident phone (never text an unverified number).
      let phone = "";
      let recipientEmail = charge.residentEmail.trim().toLowerCase();
      if (charge.residentUserId) {
        const { data: prof } = await db
          .from("profiles")
          .select("phone, phone_verified_at, email")
          .eq("id", charge.residentUserId)
          .maybeSingle();
        if (prof?.phone_verified_at) phone = String(prof?.phone ?? "").trim();
        recipientEmail = String(prof?.email ?? recipientEmail).trim().toLowerCase();
      }
      if (!phone) {
        result.skippedNoPhone++;
        continue;
      }

      const dedupId = weeklyRentReminderDedupId(weekKey, managerId, residentKey);
      const claimed = await claimWeeklyReminder(db, dedupId, recipientEmail, phone);
      if (!claimed) {
        result.skippedAlreadySent++;
        continue;
      }

      const res = await sendFromManagerWorkNumber({
        managerUserId: managerId,
        to: phone,
        text: reminderBody(charge),
        fromNumber: sendNumber,
        residentUserId: charge.residentUserId,
        source: "automated",
        sendClass: "automated",
        counterpartyRole: "resident",
      });
      if (res.ok) {
        result.sent++;
      } else {
        result.failed++;
        result.errors.push({ residentKey, error: res.error ?? "send_failed" });
      }
    }
  }

  return result;
}
