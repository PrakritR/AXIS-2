import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { APPLICATION_FEE_CHECKOUT_PURPOSE, axisAchCheckoutPaid } from "@/lib/stripe-axis-ach-checkout";
import type { HouseholdCharge } from "@/lib/household-charges";
import { syncLedgerPaymentEntry } from "@/lib/reports/ledger-sync";

export function isApplicationFeeCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.purpose === APPLICATION_FEE_CHECKOUT_PURPOSE;
}

/**
 * Marks the pending application-fee household charge paid after Stripe ACH clears.
 */
export async function markApplicationFeePaidFromStripeSession(
  db: SupabaseClient,
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; chargeId?: string; alreadyPaid?: boolean }> {
  if (!isApplicationFeeCheckoutSession(session) || !axisAchCheckoutPaid(session)) {
    return { ok: false };
  }

  const propertyId = session.metadata?.property_id?.trim();
  const residentEmail =
    session.metadata?.resident_email?.trim().toLowerCase() ??
    session.customer_email?.trim().toLowerCase() ??
    "";
  if (!propertyId || !residentEmail.includes("@")) return { ok: false };

  const { data: rows, error } = await db
    .from("portal_household_charge_records")
    .select("id, row_data, status")
    .eq("resident_email", residentEmail)
    .eq("status", "pending");

  if (error || !rows?.length) return { ok: false };

  const match = rows.find((row) => {
    const charge = row.row_data as HouseholdCharge | null;
    if (!charge || charge.kind !== "application_fee") return false;
    return charge.propertyId === propertyId;
  });

  if (!match) return { ok: false };

  const charge = match.row_data as HouseholdCharge;
  if (match.status === "paid" || charge.status === "paid") {
    return { ok: true, chargeId: match.id as string, alreadyPaid: true };
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
      id: match.id,
      manager_user_id: charge.managerUserId,
      resident_user_id: charge.residentUserId,
      resident_email: residentEmail,
      property_id: propertyId,
      kind: "application_fee",
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
  await syncLedgerPaymentEntry(db, nextCharge, now, session.id);
  return { ok: true, chargeId: match.id as string };
}
