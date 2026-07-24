import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Enrich a payment ledger row with the fee/net the MANAGER actually experienced.
 *
 * `ledger_entries` is the manager's book, and these charges are Connect
 * destination charges created on PropLane's platform account. Stripe's
 * processing fee is therefore debited from PropLane's balance, never the
 * manager's — so `stripe_fee_cents` on the manager's row is 0, and their net is
 * the destination transfer (charge amount minus whatever PropLane retained as
 * the application fee, which is also 0 today). The platform's real cost lives in
 * PropLane's own Stripe balance transactions; attributing it here would tell the
 * manager they paid a fee that never left their payout.
 */
export async function enrichLedgerPaymentFromStripeCharge(
  db: SupabaseClient,
  stripe: Stripe,
  opts: {
    stripeChargeId: string;
    stripeCheckoutSessionId?: string | null;
    applicationFeeCents?: number | null;
  },
): Promise<boolean> {
  const charge = await stripe.charges.retrieve(opts.stripeChargeId);
  const applicationFeeCents = typeof opts.applicationFeeCents === "number" ? opts.applicationFeeCents : 0;
  const netCents =
    typeof charge.amount === "number" ? Math.max(0, charge.amount - applicationFeeCents) : null;

  const patch: Record<string, unknown> = {
    stripe_charge_id: opts.stripeChargeId,
    stripe_fee_cents: 0,
    updated_at: new Date().toISOString(),
  };
  if (netCents !== null) patch.net_cents = netCents;
  if (typeof opts.applicationFeeCents === "number") patch.axis_fee_cents = opts.applicationFeeCents;

  let query = db.from("ledger_entries").update(patch).eq("entry_type", "payment");
  if (opts.stripeCheckoutSessionId) {
    query = query.eq("stripe_checkout_session_id", opts.stripeCheckoutSessionId);
  } else {
    query = query.eq("stripe_charge_id", opts.stripeChargeId);
  }

  const { data, error } = await query.select("id").limit(5);
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export async function stripeChargeIdFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const details = await paymentIntentDetailsFromCheckoutSession(stripe, session);
  return details.chargeId;
}

async function paymentIntentDetailsFromCheckoutSession(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<{ chargeId: string | null; applicationFeeCents: number | null }> {
  const piRef = session.payment_intent;
  const piId = typeof piRef === "string" ? piRef : piRef?.id;
  if (!piId) return { chargeId: null, applicationFeeCents: null };

  const pi = await stripe.paymentIntents.retrieve(piId);
  const ch = pi.latest_charge;
  const chargeId = typeof ch === "string" ? ch : ch?.id ?? null;
  return { chargeId, applicationFeeCents: pi.application_fee_amount ?? null };
}

export async function enrichLedgerFromCheckoutSession(
  db: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { chargeId, applicationFeeCents } = await paymentIntentDetailsFromCheckoutSession(stripe, session);
  if (!chargeId) return;
  await enrichLedgerPaymentFromStripeCharge(db, stripe, {
    stripeChargeId: chargeId,
    stripeCheckoutSessionId: session.id,
    applicationFeeCents,
  });
}
