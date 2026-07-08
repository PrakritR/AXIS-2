import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Enrich a payment ledger row with Stripe fee/net from the balance transaction. */
export async function enrichLedgerPaymentFromStripeCharge(
  db: SupabaseClient,
  stripe: Stripe,
  opts: {
    stripeChargeId: string;
    stripeCheckoutSessionId?: string | null;
    applicationFeeCents?: number | null;
  },
): Promise<boolean> {
  const charge = await stripe.charges.retrieve(opts.stripeChargeId, { expand: ["balance_transaction"] });
  const bt = charge.balance_transaction;
  let stripeFeeCents: number | null = null;
  let netCents: number | null = null;
  if (bt && typeof bt === "object") {
    stripeFeeCents = bt.fee;
    netCents = bt.net;
  } else if (typeof bt === "string") {
    const txn = await stripe.balanceTransactions.retrieve(bt);
    stripeFeeCents = txn.fee;
    netCents = txn.net;
  }

  const patch: Record<string, unknown> = {
    stripe_charge_id: opts.stripeChargeId,
    updated_at: new Date().toISOString(),
  };
  if (stripeFeeCents !== null) patch.stripe_fee_cents = stripeFeeCents;
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
