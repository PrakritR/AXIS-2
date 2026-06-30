import "server-only";
import { cache } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { generateManagerId } from "@/lib/manager-id";
import {
  pickBestManagerPurchaseRow,
  resolveManagerSubscriptionTierFromPurchase,
  type ManagerSkuTier,
  type ManagerSubscriptionTier,
  type ManagerPurchaseRowRecord,
} from "@/lib/manager-access";

/**
 * Server-only manager_purchases reads/writes (service role). Split out of
 * `manager-access.ts` so client components can import the pure tier helpers
 * there without pulling the service-role client (and `server-only`) into the
 * client bundle.
 */

async function loadManagerPurchaseRowsForUser(userId: string): Promise<ManagerPurchaseRowRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = profile?.email?.trim().toLowerCase() ?? "";

  const select =
    "id, tier, billing, stripe_customer_id, stripe_subscription_id, stripe_checkout_session_id, promo_code, paid_at, user_id";
  const [{ data: byUserId }, { data: byEmail }] = await Promise.all([
    supabase.from("manager_purchases").select(select).eq("user_id", userId),
    email
      ? supabase.from("manager_purchases").select(select).ilike("email", email)
      : Promise.resolve({ data: [] as ManagerPurchaseRowRecord[] }),
  ]);

  const merged = new Map<string, ManagerPurchaseRowRecord>();
  for (const row of [...(byUserId ?? []), ...(byEmail ?? [])]) {
    merged.set(String(row.id), row as ManagerPurchaseRowRecord);
  }
  return [...merged.values()];
}

const getManagerPurchaseRowByUserId = cache(async (userId: string): Promise<{
  tier: string | null;
  billing: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  promoCode: string | null;
  paidAt: string | null;
}> => {
  const best = pickBestManagerPurchaseRow(await loadManagerPurchaseRowsForUser(userId), userId);
  if (!best) {
    return {
      tier: null,
      billing: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeCheckoutSessionId: null,
      promoCode: null,
      paidAt: null,
    };
  }
  return {
    tier: best.tier != null ? String(best.tier) : null,
    billing: best.billing != null ? String(best.billing) : null,
    stripeCustomerId:
      best.stripe_customer_id != null && String(best.stripe_customer_id).trim() !== ""
        ? String(best.stripe_customer_id).trim()
        : null,
    stripeSubscriptionId:
      best.stripe_subscription_id != null && String(best.stripe_subscription_id).trim() !== ""
        ? String(best.stripe_subscription_id).trim()
        : null,
    stripeCheckoutSessionId:
      best.stripe_checkout_session_id != null && String(best.stripe_checkout_session_id).trim() !== ""
        ? String(best.stripe_checkout_session_id).trim()
        : null,
    promoCode:
      best.promo_code != null && String(best.promo_code).trim() !== ""
        ? String(best.promo_code).trim()
        : null,
    paidAt: best.paid_at != null ? String(best.paid_at) : null,
  };
});

/**
 * Returns "free" if the manager's purchase row is tier free; "paid" if any paid tier;
 * null if no purchase row (legacy / unknown — treat as full access).
 */
const getManagerSubscriptionTierCached = cache(async (userId: string): Promise<ManagerSubscriptionTier> => {
  try {
    const { syncManagerPurchaseTierState } = await import("@/lib/manager-tier-sync");
    await syncManagerPurchaseTierState(userId);
    const purchase = await getManagerPurchaseRowByUserId(userId);
    const rows = await loadManagerPurchaseRowsForUser(userId);
    return resolveManagerSubscriptionTierFromPurchase({
      tier: purchase.tier,
      billing: purchase.billing,
      stripeSubscriptionId: purchase.stripeSubscriptionId,
      stripeCheckoutSessionId: purchase.stripeCheckoutSessionId,
      promoCode: purchase.promoCode,
      paidAt: purchase.paidAt,
      hasPurchaseRow: rows.length > 0,
    });
  } catch {
    return null;
  }
});

export async function getManagerSubscriptionTier(userId: string): Promise<ManagerSubscriptionTier> {
  return getManagerSubscriptionTierCached(userId);
}

const getManagerSubscriptionTierByManagerIdCached = cache(
  async (managerId: string): Promise<ManagerSubscriptionTier> => {
    const normalized = managerId.trim();
    if (!normalized) return null;
    try {
      const supabase = createSupabaseServiceRoleClient();
      const { data } = await supabase
        .from("manager_purchases")
        .select("user_id, tier, billing, stripe_subscription_id, stripe_checkout_session_id, promo_code, paid_at")
        .eq("manager_id", normalized)
        .maybeSingle();
      if (!data) return null;
      const userId = data.user_id != null ? String(data.user_id) : "";
      if (userId) {
        return getManagerSubscriptionTier(userId);
      }
      return resolveManagerSubscriptionTierFromPurchase({
        tier: data.tier != null ? String(data.tier) : null,
        billing: data.billing != null ? String(data.billing) : null,
        stripeSubscriptionId: data.stripe_subscription_id ?? null,
        stripeCheckoutSessionId: data.stripe_checkout_session_id ?? null,
        promoCode: data.promo_code ?? null,
        paidAt: data.paid_at ?? null,
        hasPurchaseRow: true,
      });
    } catch {
      return null;
    }
  },
);

export async function getManagerSubscriptionTierByManagerId(managerId: string): Promise<ManagerSubscriptionTier> {
  return getManagerSubscriptionTierByManagerIdCached(managerId);
}

/** Raw tier + billing from manager_purchases (service role). */
export async function getManagerPurchaseSku(userId: string): Promise<{
  tier: string | null;
  billing: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}> {
  return getManagerPurchaseRowByUserId(userId);
}

/**
 * Sets `manager_purchases.tier` for the account (service role). Creates a row if needed (same rules as checkout completion).
 * Admin overrides use `billing: "admin"` and clear any stale Stripe subscription id.
 */
export async function setManagerPurchaseTier(
  userId: string,
  tier: ManagerSkuTier,
  opts?: { adminOverride?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!opts?.adminOverride && tier !== "free") {
    return { ok: false, error: "Paid plans require Stripe checkout or an admin assignment." };
  }

  const supabase = createSupabaseServiceRoleClient();
  const billing =
    tier === "free" ? "free" : opts?.adminOverride ? "admin" : "portal";
  const clearStripeSubscription = tier === "free" || opts?.adminOverride || billing === "portal";

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, manager_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email?.trim()) {
    return { ok: false, error: "Account email not found." };
  }

  const email = profile.email.trim().toLowerCase();
  const existingRows = await loadManagerPurchaseRowsForUser(userId);
  const updatePatch: Record<string, unknown> = {
    tier,
    billing,
    user_id: userId,
  };
  if (clearStripeSubscription) {
    updatePatch.stripe_subscription_id = null;
  }

  if (existingRows.length > 0) {
    for (const row of existingRows) {
      const { error } = await supabase.from("manager_purchases").update(updatePatch).eq("id", row.id);
      if (error) return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  let managerId = profile.manager_id?.trim() ?? "";
  if (!managerId) {
    managerId = generateManagerId();
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ manager_id: managerId, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (profileErr) return { ok: false, error: profileErr.message };
  }

  const sessionId = `admin_portal_${tier}_${userId}`;
  const { error: insErr } = await supabase.from("manager_purchases").insert({
    stripe_checkout_session_id: sessionId,
    email,
    manager_id: managerId,
    tier,
    billing,
    user_id: userId,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      const { error: upErr } = await supabase
        .from("manager_purchases")
        .update({ ...updatePatch, manager_id: managerId })
        .ilike("email", email);
      if (upErr) return { ok: false, error: upErr.message };
      return { ok: true };
    }
    return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

/**
 * Sets this account to Business in `manager_purchases` (service role).
 * Used for self-serve upgrade from the property portal; billing is marked `portal` until live checkout is wired.
 */
export async function upgradeManagerAccountToBusiness(): Promise<
  { ok: true; alreadyBusiness?: boolean } | { ok: false; error: string }
> {
  return { ok: false, error: "Business upgrades require Stripe checkout or an admin assignment." };
}
