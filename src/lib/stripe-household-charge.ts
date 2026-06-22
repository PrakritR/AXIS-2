import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseMoneyAmount } from "@/lib/parse-money";
import { AXIS_ACH_FEE_PERCENT } from "@/lib/payment-policy";
import type { HouseholdCharge } from "@/lib/household-charges";

export const HOUSEHOLD_CHARGE_CHECKOUT_PURPOSE = "household_charge";

/** Integer cents retained by Axis on ACH Connect destination charges. */
export function axisAchPlatformFeeCents(grossAmountCents: number): number {
  if (!Number.isFinite(grossAmountCents) || grossAmountCents <= 0) return 0;
  const bps = Math.round(AXIS_ACH_FEE_PERCENT * 100);
  return Math.floor((grossAmountCents * bps) / 10_000);
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

  const chargeId = session.metadata?.charge_id?.trim();
  if (!chargeId) return { ok: false };

  if (!householdChargeCheckoutPaid(session)) {
    return { ok: false };
  }

  const { data: row, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status")
    .eq("id", chargeId)
    .maybeSingle();

  if (error || !row) return { ok: false };

  const charge = row.row_data as HouseholdCharge | null;
  if (!charge?.id) return { ok: false };

  if (row.status === "paid" || charge.status === "paid") {
    return { ok: true, chargeId, alreadyPaid: true };
  }

  const expectedEmail = charge.residentEmail.trim().toLowerCase();
  const sessionEmail = session.customer_email?.trim().toLowerCase() ?? session.metadata?.resident_email?.trim().toLowerCase() ?? "";
  if (sessionEmail && expectedEmail && sessionEmail !== expectedEmail) {
    return { ok: false };
  }

  const now = new Date().toISOString();
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

  if (upsertErr) return { ok: false };
  return { ok: true, chargeId };
}
