import { normalizeManagerSkuTier } from "@/lib/manager-access";
import { isManagerPurchasePeriodExpired, resolveEffectiveManagerTier } from "@/lib/manager-tier-expiry";
import { reconcileManagerPurchaseWithStripe } from "@/lib/manager-stripe-subscription-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/** Downgrades admin-assigned paid tiers when `paid_at` + billing period has elapsed. */
export async function applyExpiredManagerPurchaseDowngrade(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("manager_purchases")
    .select("id, tier, billing, paid_at, stripe_subscription_id")
    .eq("user_id", uid)
    .maybeSingle();

  if (!data) return false;
  if (data.stripe_subscription_id?.trim()) return false;

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

  await applyExpiredManagerPurchaseDowngrade(uid);
}

export { resolveEffectiveManagerTier };
