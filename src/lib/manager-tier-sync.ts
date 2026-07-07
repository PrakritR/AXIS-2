import { isWaiverGrantedManagerPurchase, normalizeManagerSkuTier } from "@/lib/manager-access";
import { isAdminManagedManagerPurchase } from "@/lib/manager-admin-purchase";
import { isManagerPurchasePeriodExpired, isSignupTrialManagerPurchase, resolveEffectiveManagerTier } from "@/lib/manager-tier-expiry";
import { reconcileManagerPurchaseWithStripe } from "@/lib/manager-stripe-subscription-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/** Clears self-assigned paid tiers that were never backed by Stripe or admin billing. */
export async function revokeUnauthorizedManagerPaidTier(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("manager_purchases")
    .select("id, tier, billing, stripe_subscription_id, stripe_checkout_session_id, promo_code")
    .eq("user_id", uid)
    .maybeSingle();

  if (!data) return false;
  if (data.stripe_subscription_id?.trim()) return false;

  const tier = normalizeManagerSkuTier(data.tier);
  if (!tier || tier === "free") return false;

  const billing = data.billing?.toLowerCase().trim() ?? "";
  const isAdminGrant = billing === "admin" || isAdminManagedManagerPurchase(data.stripe_checkout_session_id);
  if (isAdminGrant) return false;
  if (isSignupTrialManagerPurchase(billing)) return false;
  // Payment-waiver / coupon grants (FREE100, onboard 100%-off) are authorized
  // paid access without a Stripe subscription — never revoke them.
  if (isWaiverGrantedManagerPurchase(data.promo_code)) return false;

  const { error } = await supabase
    .from("manager_purchases")
    .update({ tier: "free", billing: "free", stripe_subscription_id: null })
    .eq("id", data.id);

  return !error;
}

/** Downgrades admin-assigned paid tiers when `paid_at` + billing period has elapsed. */
export async function applyExpiredManagerPurchaseDowngrade(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("manager_purchases")
    .select("id, tier, billing, paid_at, stripe_subscription_id, promo_code")
    .eq("user_id", uid)
    .maybeSingle();

  if (!data) return false;
  if (data.stripe_subscription_id?.trim()) return false;
  // Coupon / payment-waiver grants are comp access, not a billing period that
  // lapses — leave them in place.
  if (isWaiverGrantedManagerPurchase(data.promo_code)) return false;

  const tier = normalizeManagerSkuTier(data.tier);
  if (!tier || tier === "free") return false;
  if (!isManagerPurchasePeriodExpired(data)) return false;

  const { error } = await supabase
    .from("manager_purchases")
    .update({ tier: "free", billing: "free" })
    .eq("id", data.id);

  return !error;
}

/** Aligns `manager_purchases` with Stripe and date-based expiry for one account. */
export async function syncManagerPurchaseTierState(userId: string): Promise<void> {
  const uid = userId.trim();
  if (!uid) return;

  try {
    await reconcileManagerPurchaseWithStripe(uid);
  } catch {
    /* Stripe not configured or transient error */
  }

  await revokeUnauthorizedManagerPaidTier(uid);
  await applyExpiredManagerPurchaseDowngrade(uid);
}

export { resolveEffectiveManagerTier };
