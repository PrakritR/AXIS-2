import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdCharge } from "@/lib/household-charges";
import { enrichHouseholdChargesFromPropertyRecords } from "@/lib/household-charge-payment-eligibility";
import {
  loadListingByPropertyId,
  loadSentReminderDedupIds,
  parseScheduledMessageListId,
} from "@/lib/payment-automation-server";
import {
  loadManagerAutomationSettings,
  loadScheduledMessageOverrides,
  scheduledOverrideId,
  upsertScheduledMessageOverride,
} from "@/lib/payment-automation-settings";
import { projectScheduledPaymentMessages } from "@/lib/scheduled-payment-messages";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function loadChargeForManager(
  db: SupabaseClient,
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
  const [enriched] = await enrichHouseholdChargesFromPropertyRecords(db, [data.row_data as HouseholdCharge]);
  return enriched ?? null;
}

async function projectFutureRemindersForCharge(
  db: SupabaseClient,
  managerUserId: string,
  charge: HouseholdCharge,
  opts?: { treatAsPending?: boolean },
): Promise<ReturnType<typeof projectScheduledPaymentMessages>> {
  const now = new Date();
  const today = startOfLocalDay(now).getTime();
  const projectionCharge =
    opts?.treatAsPending && charge.status === "paid"
      ? { ...charge, status: "pending" as const, balanceLabel: charge.amountLabel }
      : charge;

  const [settings, overrides, listingByPropertyId, sentDedupIds] = await Promise.all([
    loadManagerAutomationSettings(db, managerUserId),
    loadScheduledMessageOverrides(db, managerUserId),
    loadListingByPropertyId(db),
    loadSentReminderDedupIds(db, [charge.id]),
  ]);

  const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", managerUserId).maybeSingle();
  const managerName = profile?.full_name?.trim() || profile?.email?.trim() || "Your property manager";

  return projectScheduledPaymentMessages({
    managerUserId,
    charges: [projectionCharge],
    settings,
    overrides,
    sentDedupIds,
    listingByPropertyId,
    managerName,
    now,
    includeHidden: true,
  }).filter(
    (message) =>
      message.chargeId === charge.id &&
      startOfLocalDay(new Date(message.sendAt)).getTime() >= today,
  );
}

/** Cancel future scheduled payment reminders when a charge is marked paid. */
export async function cancelFuturePaymentRemindersForCharge(
  db: SupabaseClient,
  managerUserId: string,
  chargeId: string,
): Promise<number> {
  const charge = await loadChargeForManager(db, managerUserId, chargeId);
  if (!charge) return 0;

  const messages = await projectFutureRemindersForCharge(db, managerUserId, charge, { treatAsPending: true });
  let cancelled = 0;
  for (const message of messages) {
    if (message.status !== "scheduled") continue;
    const parsed = parseScheduledMessageListId(message.id);
    if (!parsed) continue;
    await upsertScheduledMessageOverride(db, {
      managerUserId,
      chargeId: parsed.chargeId,
      kind: parsed.kind,
      daysBeforeDue: parsed.daysBeforeDue,
      patch: { cancelled: true, cancelledBecausePaid: true },
    });
    cancelled += 1;
  }
  return cancelled;
}

/** Restore auto reminders that were cancelled when the charge was marked paid. */
export async function restoreFuturePaymentRemindersForCharge(
  db: SupabaseClient,
  managerUserId: string,
  chargeId: string,
): Promise<number> {
  const charge = await loadChargeForManager(db, managerUserId, chargeId);
  if (!charge || charge.status === "paid") return 0;

  const overrides = await loadScheduledMessageOverrides(db, managerUserId);
  const messages = await projectFutureRemindersForCharge(db, managerUserId, charge);
  let restored = 0;
  for (const message of messages) {
    if (message.status !== "cancelled") continue;
    const parsed = parseScheduledMessageListId(message.id);
    if (!parsed) continue;
    const overrideKey = scheduledOverrideId({
      managerUserId,
      chargeId: parsed.chargeId,
      kind: parsed.kind,
      daysBeforeDue: parsed.daysBeforeDue,
    });
    if (overrides.get(overrideKey)?.cancelledBecausePaid !== true) continue;
    await upsertScheduledMessageOverride(db, {
      managerUserId,
      chargeId: parsed.chargeId,
      kind: parsed.kind,
      daysBeforeDue: parsed.daysBeforeDue,
      patch: { cancelled: false, cancelledBecausePaid: false },
    });
    restored += 1;
  }
  return restored;
}
