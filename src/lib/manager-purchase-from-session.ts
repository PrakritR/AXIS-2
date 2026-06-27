import type Stripe from "stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/**
 * Stripe Checkout can complete a subscription while `payment_status` is still `unpaid`
 * (e.g. trial, async payment methods). Treat completed subscription sessions with a
 * subscription id as successful so we persist tier + Stripe ids.
 */
export function checkoutSessionIndicatesPaidPurchase(session: Stripe.Checkout.Session): boolean {
  if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
    return true;
  }
  if (session.status !== "complete") return false;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription && typeof session.subscription !== "string"
        ? session.subscription.id
        : null;
  if (session.mode === "subscription" && subscriptionId) return true;
  return false;
}

/** Idempotent: records a completed Checkout session as a paid manager purchase. */
export async function recordPaidManagerCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const managerId = session.metadata?.manager_id?.trim();
  const metadataUserId = session.metadata?.userId?.trim();
  const email = (
    session.customer_details?.email ??
    session.customer_email ??
    session.metadata?.email
  )
    ?.trim()
    .toLowerCase();

  if (!checkoutSessionIndicatesPaidPurchase(session)) return;

  const supabase = createSupabaseServiceRoleClient();
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer && typeof session.customer !== "string"
        ? session.customer.id
        : null;

  const subscriptionRaw = session.subscription;
  const subscriptionId =
    typeof subscriptionRaw === "string"
      ? subscriptionRaw
      : subscriptionRaw && typeof subscriptionRaw !== "string"
        ? subscriptionRaw.id
        : null;

  const tierMeta = session.metadata?.tier?.trim().toLowerCase() || null;
  const billingMeta = session.metadata?.billing?.trim().toLowerCase() || null;

  const patch = {
    stripe_checkout_session_id: session.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    tier: tierMeta,
    billing: billingMeta,
    promo_code: session.metadata?.promo ?? null,
    paid_at: new Date().toISOString(),
    full_name: session.metadata?.full_name?.trim() || null,
    ...(email ? { email } : {}),
    ...(managerId ? { manager_id: managerId } : {}),
    ...(metadataUserId ? { user_id: metadataUserId } : {}),
  };

  const { data: bySession, error: sessionUpdateError } = await supabase
    .from("manager_purchases")
    .update(patch)
    .eq("stripe_checkout_session_id", session.id)
    .select("id");
  if (sessionUpdateError) throw new Error(sessionUpdateError.message);
  if (bySession && bySession.length > 0) return;

  /** Fallback for older pending rows that were not reserved by Checkout session id. */
  if (metadataUserId || managerId) {
    let updated = false;
    if (metadataUserId) {
      const { data: byUser, error: e1 } = await supabase
        .from("manager_purchases")
        .update(patch)
        .eq("user_id", metadataUserId)
        .is("paid_at", null)
        .select("id");
      if (e1) throw new Error(e1.message);
      if (byUser && byUser.length > 0) updated = true;
    }
    if (!updated && managerId) {
      const { data: byMgr, error: e2 } = await supabase
        .from("manager_purchases")
        .update(patch)
        .eq("manager_id", managerId)
        .is("paid_at", null)
        .select("id");
      if (e2) throw new Error(e2.message);
      if (byMgr && byMgr.length > 0) updated = true;
    }
    if (updated) return;
  }

  /**
   * Upsert by `manager_id` (unique): covers first-time inserts and rows where
   * prior updates missed (e.g. `user_id` was null on an older row).
   */
  if (managerId && email) {
    const { data: existingManagerPurchase, error: existingErr } = await supabase
      .from("manager_purchases")
      .select("id, paid_at, stripe_checkout_session_id")
      .eq("manager_id", managerId)
      .maybeSingle();
    if (existingErr) throw new Error(existingErr.message);
    if (
      existingManagerPurchase?.paid_at &&
      existingManagerPurchase.stripe_checkout_session_id !== session.id
    ) {
      return;
    }

    const { error: upErr } = await supabase.from("manager_purchases").upsert(
      {
        stripe_checkout_session_id: session.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        email,
        manager_id: managerId,
        tier: tierMeta,
        billing: billingMeta,
        promo_code: session.metadata?.promo ?? null,
        paid_at: new Date().toISOString(),
        full_name: session.metadata?.full_name?.trim() || null,
        user_id: metadataUserId ?? null,
      },
      { onConflict: "manager_id" },
    );
    if (upErr) throw new Error(upErr.message);
    return;
  }

  /** Legacy signup checkout without manager_id in metadata (handled by other flows). */
  return;
}
