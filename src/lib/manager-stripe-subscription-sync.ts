import type Stripe from "stripe";
import { getManagerPurchaseSku } from "@/lib/manager-access";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { inferBillingFromStripePriceId, inferPaidTierFromStripePriceId } from "@/lib/stripe-price-ids";

/** Reconcile the row that owns this Stripe subscription id (webhook-safe). */
export async function reconcileManagerPurchaseByStripeSubscriptionId(subscriptionId: string): Promise<void> {
  const sid = subscriptionId.trim();
  if (!sid) return;

  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("manager_purchases")
    .select("user_id")
    .eq("stripe_subscription_id", sid)
    .maybeSingle();

  const uid = data?.user_id != null ? String(data.user_id) : "";
  if (!uid) return;

  await reconcileManagerPurchaseWithStripe(uid);
}

/**
 * Aligns `manager_purchases` with the live Stripe Subscription when we have a stored
 * `stripe_subscription_id`. Fixes drift when webhooks lag or metadata was incomplete.
 */
export async function reconcileManagerPurchaseWithStripe(userId: string): Promise<void> {
  const { stripeSubscriptionId } = await getManagerPurchaseSku(userId);
  const sid = stripeSubscriptionId?.trim();
  if (!sid) return;

  const stripe = getStripe();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(sid, { expand: ["items.data.price"] });
  } catch {
    const supabase = createSupabaseServiceRoleClient();
    await supabase
      .from("manager_purchases")
      .update({ tier: "free", billing: "free", stripe_subscription_id: null })
      .eq("user_id", userId);
    return;
  }

  if (sub.status === "canceled" || sub.status === "incomplete_expired") {
    const supabase = createSupabaseServiceRoleClient();
    await supabase
      .from("manager_purchases")
      .update({ tier: "free", billing: "free", stripe_subscription_id: null })
      .eq("user_id", userId);
    return;
  }

  const item = sub.items.data[0];
  const priceId = typeof item?.price === "string" ? item.price : item?.price?.id ?? null;
  const paidTier = inferPaidTierFromStripePriceId(priceId);
  const billing = inferBillingFromStripePriceId(priceId);

  if (!paidTier || !billing) return;

  const supabase = createSupabaseServiceRoleClient();
  await supabase
    .from("manager_purchases")
    .update({
      tier: paidTier,
      billing,
      stripe_subscription_id: sub.id,
    })
    .eq("user_id", userId);
}
