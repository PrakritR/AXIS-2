import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

/** Pro tier includes up to this many active properties (pending + live listings in demo). Business is unlimited. */
export const PRO_MAX_PROPERTIES = 2;

/** Sections available to free-tier managers (house posting only). */
export const FREE_MANAGER_SECTIONS = new Set(["dashboard", "properties", "inbox", "profile", "upgrade"]);

export type ManagerSkuTier = "free" | "pro" | "business";

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

/**
 * Pro tier is capped at PRO_MAX_PROPERTIES; Business and legacy (unknown tier with paid access) are uncapped.
 * Free tier uses the same property UI but marketing limits may apply separately.
 */
export function proTierPropertyLimitReached(tier: string | null | undefined, propertyCount: number): boolean {
  if (!isProSkuTier(tier)) return false;
  return propertyCount >= PRO_MAX_PROPERTIES;
}

/**
 * Returns "free" if the manager's purchase row is tier free; "paid" if any paid tier;
 * null if no purchase row (legacy / unknown — treat as full access).
 */
export async function getManagerSubscriptionTier(userId: string): Promise<"free" | "paid" | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from("manager_purchases").select("tier").eq("user_id", userId).maybeSingle();
  if (!data?.tier) return null;
  if (String(data.tier).toLowerCase() === "free") return "free";
  return "paid";
}

/** Raw tier + billing from manager_purchases (service role). */
export async function getManagerPurchaseSku(userId: string): Promise<{ tier: string | null; billing: string | null }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.from("manager_purchases").select("tier, billing").eq("user_id", userId).maybeSingle();
  return {
    tier: data?.tier != null ? String(data.tier) : null,
    billing: data?.billing != null ? String(data.billing) : null,
  };
}

/**
 * Sets this account to Business in `manager_purchases` (service role).
 * Used for self-serve upgrade from the manager portal; billing is marked `portal` (integrate Stripe when ready).
 */
export async function upgradeManagerAccountToBusiness(
  userId: string,
): Promise<{ ok: true; alreadyBusiness?: boolean } | { ok: false; error: string }> {
  const supabase = createSupabaseServiceRoleClient();
  const { data: existing } = await supabase.from("manager_purchases").select("id, tier").eq("user_id", userId).maybeSingle();

  if (existing && isBusinessSkuTier(existing.tier)) {
    return { ok: true, alreadyBusiness: true };
  }

  if (existing) {
    const { error } = await supabase
      .from("manager_purchases")
      .update({ tier: "business", billing: "portal" })
      .eq("user_id", userId);
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

  const sessionId = `portal_biz_${userId}`;
  const { error: insErr } = await supabase.from("manager_purchases").insert({
    stripe_checkout_session_id: sessionId,
    email: profile.email.trim().toLowerCase(),
    manager_id: profile.manager_id.trim(),
    tier: "business",
    billing: "portal",
    user_id: userId,
    paid_at: new Date().toISOString(),
  });

  if (insErr) {
    if (insErr.code === "23505") {
      const { error: upErr } = await supabase
        .from("manager_purchases")
        .update({ tier: "business", billing: "portal", user_id: userId })
        .eq("stripe_checkout_session_id", sessionId);
      if (upErr) return { ok: false, error: upErr.message };
      return { ok: true };
    }
    return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

export function managerSectionAllowedForTier(section: string, tier: "free" | "paid" | null): boolean {
  if (tier !== "free") return true;
  return FREE_MANAGER_SECTIONS.has(section);
}
