import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";
import { generateManagerId } from "@/lib/manager-id";
import { cache } from "react";

/** Property caps by plan (houses / listings in the portal). Legacy unknown tier → no numeric cap (`null`). */
export const FREE_MAX_PROPERTIES = 1;
export const PRO_MAX_PROPERTIES = 2;
export const BUSINESS_MAX_PROPERTIES = 20;

export type ManagerSkuTier = "free" | "pro" | "business";

/** Public pricing (monthly); keep in sync with `manager-plan-tiers` / partner pricing. */
export const MANAGER_TIER_MONTHLY_USD: Record<ManagerSkuTier, number> = {
  free: 0,
  pro: 20,
  business: 200,
};

/**
 * Sections available on Free: listings, applications, calendar, payments.
 * Residents, leases, services, inbox, and co-managers require Pro+.
 */
export const FREE_SUBSCRIPTION_SECTIONS = new Set([
  "dashboard",
  "properties",
  "applications",
  "payments",
  "calendar",
  "profile",
  "plan",
  "bugs-feedback",
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

/** Short plan label for signup / checkout UI copy. */
export function managerTierDisplayLabel(tier: string | null | undefined): string {
  const normalized = normalizeManagerSkuTier(tier);
  if (normalized === "free") return "Free";
  if (normalized === "business") return "Business";
  if (normalized === "pro") return "Pro";
  return "Pro";
}

/** Headline on manager-id page after pricing signup. */
export function managerSignupReservedHeadline(tier: string | null | undefined): string {
  const normalized = normalizeManagerSkuTier(tier) ?? "pro";
  if (normalized === "free") return "Free tier account reserved";
  if (normalized === "business") return "Axis Business account reserved";
  return "Axis Pro account reserved";
}

/** Phrase for create-account finish copy, e.g. "your Axis Pro account". */
export function managerSignupFinishPhrase(tier: string | null | undefined): string {
  const normalized = normalizeManagerSkuTier(tier) ?? "pro";
  if (normalized === "free") return "your Free tier account";
  if (normalized === "business") return "your Axis Business account";
  return "your Axis Pro account";
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
  return "Axis";
}

export function isStripeManagedBilling(billing: string | null | undefined): boolean {
  const b = String(billing ?? "").toLowerCase();
  return b === "monthly" || b === "annual";
}

type ManagerPurchaseRowRecord = {
  id: string;
  tier: string | null;
  billing: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  paid_at: string | null;
  user_id: string | null;
};

async function loadManagerPurchaseRowsForUser(userId: string): Promise<ManagerPurchaseRowRecord[]> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
  const email = profile?.email?.trim().toLowerCase() ?? "";

  const select = "id, tier, billing, stripe_customer_id, stripe_subscription_id, paid_at, user_id";
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

/** Prefer the linked signup row; otherwise the most recent purchase — not the highest tier. */
export function pickBestManagerPurchaseRow(
  rows: ManagerPurchaseRowRecord[],
  userId?: string,
): ManagerPurchaseRowRecord | null {
  if (rows.length === 0) return null;

  const linked = userId ? rows.filter((r) => r.user_id === userId) : [];
  const pool = linked.length > 0 ? linked : rows;

  return [...pool].sort((a, b) => {
    const aTime = a.paid_at ? Date.parse(a.paid_at) : 0;
    const bTime = b.paid_at ? Date.parse(b.paid_at) : 0;
    return bTime - aTime;
  })[0]!;
}

const getManagerPurchaseRowByUserId = cache(async (userId: string): Promise<{
  tier: string | null;
  billing: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}> => {
  const best = pickBestManagerPurchaseRow(await loadManagerPurchaseRowsForUser(userId), userId);
  if (!best) {
    return { tier: null, billing: null, stripeCustomerId: null, stripeSubscriptionId: null };
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
  };
});

export type ManagerSubscriptionTier = "free" | "paid" | null;

/** Resolve subscription access from a purchase row (synced tier state). */
export function resolveManagerSubscriptionTierFromPurchase(input: {
  tier: string | null | undefined;
  stripeSubscriptionId: string | null | undefined;
  hasPurchaseRow: boolean;
}): ManagerSubscriptionTier {
  const normalized = normalizeManagerSkuTier(input.tier);
  if (normalized === "free") return "free";
  if (normalized === "pro" || normalized === "business") return "paid";

  const stripeManaged = Boolean(input.stripeSubscriptionId?.trim());
  const missingTier = input.tier == null || String(input.tier).trim() === "";

  if (!input.hasPurchaseRow) return null;
  if (stripeManaged) return "paid";
  if (missingTier) return "free";
  return "paid";
}

export function isManagerFreePlan(tier: ManagerSubscriptionTier): boolean {
  return tier === "free";
}

/**
 * Returns "free" if the manager's purchase row is tier free; "paid" if any paid tier;
 * null if no purchase row (legacy / unknown — treat as full access).
 */
export async function getManagerSubscriptionTier(userId: string): Promise<ManagerSubscriptionTier> {
  try {
    const purchase = await getManagerPurchaseRowByUserId(userId);
    const rows = await loadManagerPurchaseRowsForUser(userId);
    return resolveManagerSubscriptionTierFromPurchase({
      tier: purchase.tier,
      stripeSubscriptionId: purchase.stripeSubscriptionId,
      hasPurchaseRow: rows.length > 0,
    });
  } catch {
    return null;
  }
}

export async function getManagerSubscriptionTierByManagerId(managerId: string): Promise<ManagerSubscriptionTier> {
  const normalized = managerId.trim();
  if (!normalized) return null;
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data } = await supabase
      .from("manager_purchases")
      .select("tier, stripe_subscription_id")
      .eq("manager_id", normalized)
      .maybeSingle();
    if (!data) return null;
    return resolveManagerSubscriptionTierFromPurchase({
      tier: data.tier != null ? String(data.tier) : null,
      stripeSubscriptionId: data.stripe_subscription_id ?? null,
      hasPurchaseRow: true,
    });
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
 * Admin overrides use `billing: "admin"` and clear any stale Stripe subscription id.
 */
export async function setManagerPurchaseTier(
  userId: string,
  tier: ManagerSkuTier,
  opts?: { adminOverride?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
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
  // Legacy route id kept for redirects and API checks.
  if (section === "financials" || section === "documents") return false;
  return FREE_SUBSCRIPTION_SECTIONS.has(section);
}

export function managerSectionLockedForTier(
  section: string,
  tier: "free" | "paid" | null | undefined,
): boolean {
  return tier === "free" && !managerSectionAllowedForTier(section, "free");
}

/** @deprecated Use FREE_SUBSCRIPTION_SECTIONS */
export const FREE_MANAGER_SECTIONS = FREE_SUBSCRIPTION_SECTIONS;
