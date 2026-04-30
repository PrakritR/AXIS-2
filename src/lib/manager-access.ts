import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { cache } from "react";

/** Property caps by plan (houses / listings in the portal). Legacy unknown tier → no numeric cap (`null`). */
export const FREE_MAX_PROPERTIES = 1;
export const PRO_MAX_PROPERTIES = 2;
export const BUSINESS_MAX_PROPERTIES = 20;

export type ManagerSkuTier = "free" | "pro" | "business";

/** Public pricing (monthly); keep in sync with `partner/pricing` TIERS. */
export const MANAGER_TIER_MONTHLY_USD: Record<ManagerSkuTier, number> = {
  free: 0,
  pro: 20,
  business: 200,
};

/**
 * Sections available on Free / “owner starter” subscription for managers and owners:
 * listings, applications, payments, account linking, calendar, inbox, profile, plan.
 * Other sections (e.g. leases, work orders) still require Pro+.
 */
export const FREE_SUBSCRIPTION_SECTIONS = new Set([
  "dashboard",
  "properties",
  "applications",
  "payments",
  "relationships",
  "calendar",
  "inbox",
  "profile",
  "plan",
]);

/** Normalize DB tier string; unknown/null → treat as legacy full access (not Pro-limited). */
export function normalizeManagerSkuTier(tier: string | null | undefined): ManagerSkuTier | null {
  if (tier == null || String(tier).trim() === "") return null;
  const t = String(tier).toLowerCase().trim();
  if (t === "free") return "free";
  if (t === "business") return "business";
  if (t === "pro") return "pro";
  return null;
}

export function isProSkuTier(tier: string | null | undefined): boolean {
  return normalizeManagerSkuTier(tier) === "pro";
}

export function isBusinessSkuTier(tier: string | null | undefined): boolean {
  return normalizeManagerSkuTier(tier) === "business";
}

/** Max properties allowed for this tier; `null` = legacy / uncapped in UI. */
export function maxPropertiesForManagerTier(tier: string | null | undefined): number | null {
  const n = normalizeManagerSkuTier(tier);
  if (n === "free") return FREE_MAX_PROPERTIES;
  if (n === "pro") return PRO_MAX_PROPERTIES;
  if (n === "business") return BUSINESS_MAX_PROPERTIES;
  return null;
}

/** True when the user cannot add another property without upgrading. */
export function managerTierPropertyLimitReached(tier: string | null | undefined, propertyCount: number): boolean {
  const max = maxPropertiesForManagerTier(tier);
  if (max === null) return false;
  return propertyCount >= max;
}

/** Max linked owners or linked managers per account-links tab (same cap both directions). */
export function maxAccountLinksForTier(tier: string | null | undefined): number | null {
  const n = normalizeManagerSkuTier(tier);
  if (n === "free") return 1;
  if (n === "pro") return 2;
  if (n === "business") return 20;
  return null;
}

/** @deprecated use managerTierPropertyLimitReached */
export function proTierPropertyLimitReached(tier: string | null | undefined, propertyCount: number): boolean {
  return managerTierPropertyLimitReached(tier, propertyCount);
}

/** Monthly amount in USD for a normalized tier; legacy / unknown tier → null. */
export function monthlyUsdForManagerTier(tier: string | null | undefined): number | null {
  const n = normalizeManagerSkuTier(tier);
  if (n === null) return null;
  return MANAGER_TIER_MONTHLY_USD[n];
}

export function formatManagerMonthlyLabel(tier: string | null | undefined): string {
  const usd = monthlyUsdForManagerTier(tier);
  if (usd === null) return "—";
  if (usd === 0) return "$0/mo";
  return `$${usd}/mo`;
}

/**
 * Sidebar branding for the shared property portal.
 */
export function paidWorkspacePortalTitle(tierRaw: string | null | undefined, stripeSubscriptionId: string | null | undefined): string {
  void tierRaw;
  void stripeSubscriptionId;
  return "Axis Property Portal";
}

const getManagerPurchaseRowByUserId = cache(async (userId: string): Promise<{
  tier: string | null;
  billing: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}> => {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .from("manager_purchases")
    .select("tier, billing, stripe_customer_id, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    tier: data?.tier != null ? String(data.tier) : null,
    billing: data?.billing != null ? String(data.billing) : null,
    stripeCustomerId:
      data?.stripe_customer_id != null && String(data.stripe_customer_id).trim() !== ""
        ? String(data.stripe_customer_id).trim()
        : null,
    stripeSubscriptionId:
      data?.stripe_subscription_id != null && String(data.stripe_subscription_id).trim() !== ""
        ? String(data.stripe_subscription_id).trim()
        : null,
  };
});

const getManagerPurchaseTierByManagerId = cache(async (managerId: string): Promise<string | null> => {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from("manager_purchases").select("tier").eq("manager_id", managerId).maybeSingle();
  return data?.tier != null ? String(data.tier) : null;
});

/**
 * Returns "free" if the manager's purchase row is tier free; "paid" if any paid tier;
 * null if no purchase row (legacy / unknown — treat as full access).
 */
export async function getManagerSubscriptionTier(userId: string): Promise<"free" | "paid" | null> {
  try {
    const purchase = await getManagerPurchaseRowByUserId(userId);
    if (!purchase.tier) return null;
    if (String(purchase.tier).toLowerCase() === "free") return "free";
    return "paid";
  } catch {
    return null;
  }
}

export async function getManagerSubscriptionTierByManagerId(managerId: string): Promise<"free" | "paid" | null> {
  const normalized = managerId.trim();
  if (!normalized) return null;
  try {
    const tier = await getManagerPurchaseTierByManagerId(normalized);
    if (!tier) return null;
    if (String(tier).toLowerCase() === "free") return "free";
    return "paid";
  } catch {
    return null;
  }
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
 * Paid tiers use `billing: "portal"`; free uses `billing: "free"`.
 */
export async function setManagerPurchaseTier(
  userId: string,
  tier: ManagerSkuTier,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: existing } = await supabase.from("manager_purchases").select("id").eq("user_id", userId).maybeSingle();

  const billing = tier === "free" ? "free" : "portal";

  if (existing) {
    const { error } = await supabase.from("manager_purchases").update({ tier, billing }).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, manager_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile?.email?.trim()) {
    return { ok: false, error: "Account email not found." };
  }
  if (!profile.manager_id?.trim()) {
    return { ok: false, error: "Manager profile is incomplete." };
  }

  const sessionId = `portal_${tier}_${userId}`;
  const { error: insErr } = await supabase.from("manager_purchases").insert({
    stripe_checkout_session_id: sessionId,
    email: profile.email.trim().toLowerCase(),
    manager_id: profile.manager_id.trim(),
    tier,
    billing,
    user_id: userId,
  });

  if (insErr) {
    if (insErr.code === "23505") {
      const { error: upErr } = await supabase
        .from("manager_purchases")
        .update({ tier, billing, user_id: userId })
        .eq("stripe_checkout_session_id", sessionId);
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
export async function upgradeManagerAccountToBusiness(
  userId: string,
): Promise<{ ok: true; alreadyBusiness?: boolean } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: existing } = await supabase.from("manager_purchases").select("id, tier").eq("user_id", userId).maybeSingle();

  if (existing && isBusinessSkuTier(existing.tier)) {
    return { ok: true, alreadyBusiness: true };
  }

  const result = await setManagerPurchaseTier(userId, "business");
  if (!result.ok) return result;
  return { ok: true };
}

export function managerSectionAllowedForTier(section: string, tier: "free" | "paid" | null): boolean {
  if (tier !== "free") return true;
  return FREE_SUBSCRIPTION_SECTIONS.has(section);
}

/** @deprecated Use FREE_SUBSCRIPTION_SECTIONS */
export const FREE_MANAGER_SECTIONS = FREE_SUBSCRIPTION_SECTIONS;
