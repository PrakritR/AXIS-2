import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMoneyAmount } from "@/lib/parse-money";
import { residentConnectApplicationFeeCents, type ResidentAxisPaymentMethod } from "@/lib/payment-policy";
import type { HouseholdCharge } from "@/lib/household-charges";
import { cancelFuturePaymentRemindersForCharge } from "@/lib/payment-reminder-lifecycle.server";
import { sendPushToUser } from "@/lib/push-notifications.server";
import { syncLedgerPaymentEntry } from "@/lib/reports/ledger-sync";

export const HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE = "household_charge";

/** @deprecated Use residentConnectApplicationFeeCents with explicit payment method. */
export function axisAchPlatformFeeCents(grossAmountCents: number): number {
  return residentConnectApplicationFeeCents(grossAmountCents, "ach");
}

export function axisConnectPlatformFeeCents(
  grossAmountCents: number,
  method: ResidentAxisPaymentMethod,
  managerTier?: string | null,
): number {
  return residentConnectApplicationFeeCents(grossAmountCents, method, managerTier);
}

export function householdChargeAmountCents(charge: Pick<HouseholdCharge, "balanceLabel" | "amountLabel">): number {
  const raw = charge.balanceLabel?.trim() || charge.amountLabel?.trim() || "";
  const dollars = parseMoneyAmount(raw);
  if (!(dollars > 0)) return 0;
  return Math.round(dollars * 100);
}

export function isHouseholdChargeCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.purpose === HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE;
}

export function householdChargeCheckoutPaid(session: Stripe.Checkout.Session): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

export function householdChargeCheckoutProcessing(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && session.payment_status === "unpaid";
}

/**
 * Marks a pending household charge paid after Stripe confirms funds (sync or async ACH).
 */
export async function markHouseholdChargePaidFromStripeSession(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; chargeId?: string; alreadyPaid?: boolean }> {
  if (!isHouseholdChargeCheckoutSession(session)) {
    return { ok: false };
  }

  const chargeIds =
    session.metadata?.charge_ids
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  const fallbackId = session.metadata?.charge_id?.trim();
  const idsToMark = chargeIds.length > 0 ? chargeIds : fallbackId ? [fallbackId] : [];
  if (idsToMark.length === 0) return { ok: false };

  if (!householdChargeCheckoutPaid(session)) {
    return { ok: false };
  }

  // The id list comes from session metadata we set only after validating that
  // the paying user owns every charge, so it is trusted. Keep a defensive
  // consistency check that each charge belongs to the manager this session paid
  // out to. Do NOT gate on resident email: a bulk session carries a single
  // customer_email, so a charge whose stored email drifted from it would be
  // silently left unmarked even though the resident already paid for it.
  const expectedManagerUserId = session.metadata?.manager_user_id?.trim() ?? "";

  let marked = 0;
  let alreadyPaid = false;
  const now = new Date().toISOString();

  for (const chargeId of idsToMark) {
    const { data: row, error } = await db
      .from("portal_household_charge_records")
      .select("id, row_data, status")
      .eq("id", chargeId)
      .maybeSingle();

    if (error || !row) continue;

    const charge = row.row_data as HouseholdCharge | null;
    if (!charge?.id) continue;

    if (row.status === "paid" || charge.status === "paid") {
      alreadyPaid = true;
      marked += 1;
      await syncLedgerPaymentEntry(db, charge, charge.paidAt, session.id);
      continue;
    }

    const chargeManagerUserId = charge.managerUserId?.trim() ?? "";
    if (expectedManagerUserId && chargeManagerUserId && chargeManagerUserId !== expectedManagerUserId) {
      continue;
    }

    const nextCharge: HouseholdCharge = {
      ...charge,
      status: "paid",
      paidAt: now,
      balanceLabel: "$0.00",
    };

    const { error: upsertErr } = await db.from("portal_household_charge_records").upsert(
      {
        id: chargeId,
        manager_user_id: charge.managerUserId,
        resident_user_id: charge.residentUserId,
        resident_email: charge.residentEmail.trim().toLowerCase(),
        property_id: charge.propertyId,
        kind: charge.kind,
        status: "paid",
        row_data: {
          ...nextCharge,
          stripeCheckoutSessionId: session.id,
          stripePaymentStatus: session.payment_status,
        },
        updated_at: now,
      },
      { onConflict: "id" },
    );

    if (!upsertErr) {
      marked += 1;
      await syncLedgerPaymentEntry(db, nextCharge, now, session.id);
      const managerUserId = charge.managerUserId?.trim() || expectedManagerUserId;
      if (managerUserId) {
        await cancelFuturePaymentRemindersForCharge(db, managerUserId, chargeId).catch(() => undefined);
      }
      if (charge.residentUserId) {
        try {
          await sendPushToUser(charge.residentUserId, {
            title: "Payment received",
            body: `Your payment for ${charge.title || "your charge"} has been confirmed.`,
            url: "/resident/payments",
            data: { chargeId },
          });
        } catch {
          /* non-critical — no-ops when FCM is not configured */
        }
      }
    }
  }

  if (marked === 0) return { ok: false };
  return { ok: true, chargeId: idsToMark[0], alreadyPaid };
}
