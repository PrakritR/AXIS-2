import type Stripe from "stripe";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

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

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";
  if (!paid) return;

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

  const patch = {
    stripe_checkout_session_id: session.id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    tier: session.metadata?.tier ?? null,
    billing: session.metadata?.billing ?? null,
    promo_code: session.metadata?.promo ?? null,
    paid_at: new Date().toISOString(),
    full_name: session.metadata?.full_name?.trim() || null,
    ...(email ? { email } : {}),
    ...(managerId ? { manager_id: managerId } : {}),
    ...(metadataUserId ? { user_id: metadataUserId } : {}),
  };

  /** Logged-in portal upgrade: merge into the existing `manager_purchases` row for this account. */
  if (metadataUserId || managerId) {
    let updated = false;
    if (metadataUserId) {
      const { data: byUser, error: e1 } = await supabase
        .from("manager_purchases")
        .update(patch)
        .eq("user_id", metadataUserId)
        .select("id");
      if (e1) throw new Error(e1.message);
      if (byUser && byUser.length > 0) updated = true;
    }
    if (!updated && managerId) {
      const { data: byMgr, error: e2 } = await supabase
        .from("manager_purchases")
        .update(patch)
        .eq("manager_id", managerId)
        .select("id");
      if (e2) throw new Error(e2.message);
      if (byMgr && byMgr.length > 0) updated = true;
    }
    if (updated) return;
  }

  /** New signup checkout (no linked profile row yet). */
  if (!managerId || !email) return;

  const { error } = await supabase.from("manager_purchases").upsert(
    {
      stripe_checkout_session_id: session.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      email,
      manager_id: managerId,
      tier: session.metadata?.tier ?? null,
      billing: session.metadata?.billing ?? null,
      promo_code: session.metadata?.promo ?? null,
      paid_at: new Date().toISOString(),
      full_name: session.metadata?.full_name?.trim() || null,
      user_id: metadataUserId ?? null,
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  if (error) throw new Error(error.message);
}
