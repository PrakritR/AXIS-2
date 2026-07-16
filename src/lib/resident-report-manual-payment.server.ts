/**
 * Report offline (Zelle/Venmo) payment from SMS or portal — shared core.
 */

import type { HouseholdCharge } from "@/lib/household-charges";
import {
  canPayHouseholdChargeWithManualChannel,
  type ResidentManualPaymentChannel,
} from "@/lib/platform/resident-payments";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { track } from "@/lib/analytics/posthog";

export type SkippedManualPaymentCharge = {
  id: string;
  reason: "not_found" | "already_paid" | "forbidden" | "channel_not_allowed";
};

export type ReportManualPaymentResult =
  | {
      ok: true;
      charges: HouseholdCharge[];
      channel: ResidentManualPaymentChannel;
      skipped: SkippedManualPaymentCharge[];
    }
  | { ok: false; error: string; skipped?: SkippedManualPaymentCharge[] };

function chargeOwnedByResident(charge: HouseholdCharge, userId: string | null, email: string): boolean {
  const e = email.trim().toLowerCase();
  if (userId && charge.residentUserId && charge.residentUserId === userId) return true;
  return Boolean(e && charge.residentEmail.trim().toLowerCase() === e);
}

function inferChannelFromText(text: string): ResidentManualPaymentChannel {
  if (/\bvenmo\b/i.test(text)) return "venmo";
  return "zelle";
}

/**
 * Mark pending charges as resident-reported manual payment (does not mark paid).
 * When chargeIds omitted, reports against all pending/failed charges for the resident.
 */
export async function reportManualPaymentForResident(args: {
  residentUserId?: string | null;
  residentEmail: string;
  channel?: ResidentManualPaymentChannel | null;
  textHint?: string;
  chargeIds?: string[] | null;
  managerUserId?: string | null;
}): Promise<ReportManualPaymentResult> {
  const email = args.residentEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "missing_email" };

  const channel: ResidentManualPaymentChannel =
    args.channel ?? (args.textHint ? inferChannelFromText(args.textHint) : "zelle");

  const db = createSupabaseServiceRoleClient();
  let ids = (args.chargeIds ?? []).map((id) => id.trim()).filter(Boolean);

  if (ids.length === 0) {
    let q = db
      .from("portal_household_charge_records")
      .select("id, row_data, status")
      .eq("resident_email", email)
      .in("status", ["pending", "failed", "partially_paid"]);
    if (args.managerUserId?.trim()) {
      q = q.eq("manager_user_id", args.managerUserId.trim());
    }
    const { data: rows } = await q.limit(20);
    ids = (rows ?? [])
      .map((r) => {
        const charge = (r as { row_data?: HouseholdCharge }).row_data;
        if (!charge || charge.status === "paid" || charge.status === "processing") return null;
        if (!canPayHouseholdChargeWithManualChannel(charge, channel)) return null;
        return String((r as { id?: string }).id ?? charge.id ?? "");
      })
      .filter(Boolean) as string[];
  }

  if (ids.length === 0) {
    return { ok: false, error: "no_payable_charges" };
  }

  const now = new Date().toISOString();
  const updated: HouseholdCharge[] = [];
  const skipped: SkippedManualPaymentCharge[] = [];
  const managerIds = new Set<string>();
  const userId = args.residentUserId?.trim() || null;

  for (const id of [...new Set(ids)]) {
    const { data: row, error: rowErr } = await db
      .from("portal_household_charge_records")
      .select("id, row_data, status, manager_user_id")
      .eq("id", id)
      .maybeSingle();
    if (rowErr || !row) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }

    const charge = (row as { row_data?: HouseholdCharge }).row_data;
    if (!charge?.id) {
      skipped.push({ id, reason: "not_found" });
      continue;
    }
    if ((row as { status?: string }).status === "paid" || charge.status === "paid") {
      skipped.push({ id, reason: "already_paid" });
      continue;
    }
    if (!chargeOwnedByResident(charge, userId, email)) {
      skipped.push({ id, reason: "forbidden" });
      continue;
    }
    if (!canPayHouseholdChargeWithManualChannel(charge, channel)) {
      skipped.push({ id, reason: "channel_not_allowed" });
      continue;
    }

    const managerUserId =
      String((row as { manager_user_id?: unknown }).manager_user_id ?? "").trim() ||
      charge.managerUserId?.trim() ||
      "";
    if (managerUserId) managerIds.add(managerUserId);

    const patched: HouseholdCharge = {
      ...charge,
      manualPaymentChannel: channel,
      manualPaymentReportedAt: now,
    };
    updated.push(patched);

    await db.from("portal_household_charge_records").upsert(
      {
        id,
        manager_user_id: managerUserId || null,
        resident_user_id: charge.residentUserId,
        resident_email: charge.residentEmail.trim().toLowerCase(),
        property_id: charge.propertyId,
        kind: charge.kind,
        status: charge.status,
        row_data: patched,
        updated_at: now,
      },
      { onConflict: "id" },
    );
  }

  if (updated.length === 0) {
    return { ok: false, error: "no_charges_updated", skipped };
  }

  const channelLabel = channel === "venmo" ? "Venmo" : "Zelle";
  const senderUserId = userId || "";
  if (senderUserId) {
    for (const managerUserId of managerIds) {
      await deliverPortalInboxMessage(db, {
        senderUserId,
        senderEmail: email,
        fromName: "Resident payment",
        subject: `${channelLabel} payment reported`,
        text: `A resident reported sending ${updated.length === 1 ? "a payment" : `${updated.length} payments`} via ${channelLabel}. Please verify and mark the charge${updated.length === 1 ? "" : "s"} paid when received.`,
        toUserIds: [managerUserId],
        eventCategory: "payments",
      }).catch(() => undefined);
    }
    track("manual_payment_reported", senderUserId, { channel, charge_count: updated.length });
  }

  return { ok: true, charges: updated, channel, skipped };
}
