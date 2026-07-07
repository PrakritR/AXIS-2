import { isAdminManagedManagerPurchase } from "@/lib/manager-admin-purchase";
import { resolveEffectiveManagerTier } from "@/lib/manager-tier-expiry";
import { RESIDENT_FREE_TIER_SECTION_IDS } from "@/lib/portals/resident-sections";

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

export type ManagerPurchaseRowRecord = {
  id: string;
  tier: string | null;
  billing: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  /** Optional: only the access-resolution path selects/needs this. */
  promo_code?: string | null;
  paid_at: string | null;
  user_id: string | null;
};

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

export type ManagerSubscriptionTier = "free" | "paid" | null;

/**
 * A non-empty `promo_code` marks a payment-waiver / coupon grant (e.g. FREE100,
 * onboard 100%-off). It is only ever written by server-side flows that already
 * validated the waiver, so it is a trustworthy authorization signal for paid
 * access that is not backed by a Stripe subscription.
 */
export function isWaiverGrantedManagerPurchase(promoCode: string | null | undefined): boolean {
  return Boolean(promoCode?.trim());
}

/** Resolve subscription access from a purchase row (synced tier state). */
export function resolveManagerSubscriptionTierFromPurchase(input: {
  tier: string | null | undefined;
  billing?: string | null | undefined;
  stripeSubscriptionId?: string | null | undefined;
  stripeCheckoutSessionId?: string | null | undefined;
  promoCode?: string | null | undefined;
  paidAt?: string | null | undefined;
  hasPurchaseRow: boolean;
  nowMs?: number;
}): ManagerSubscriptionTier {
  if (!input.hasPurchaseRow) return null;

  const normalized = normalizeManagerSkuTier(input.tier);
  if (normalized === "free") return "free";

  const hasStripe = Boolean(input.stripeSubscriptionId?.trim());
  const billing = input.billing?.toLowerCase().trim() ?? "";
  const isAdminGrant =
    billing === "admin" || isAdminManagedManagerPurchase(input.stripeCheckoutSessionId);
  const isWaiverGrant = isWaiverGrantedManagerPurchase(input.promoCode);

  if (normalized === "pro" || normalized === "business") {
    if (hasStripe) return "paid";
    // Coupon / payment-waiver grants are comp access; the `billing` field is the
    // plan cadence chosen at signup, not a comp period, so it must not be run
    // through the date-based expiry the way admin grants are.
    if (isWaiverGrant) return "paid";
    if (isAdminGrant) {
      const effective = resolveEffectiveManagerTier(
        {
          tier: normalized,
          billing: input.billing,
          paid_at: input.paidAt,
          stripe_subscription_id: null,
        },
        input.nowMs,
      );
      return effective === "free" ? "free" : "paid";
    }
    return "free";
  }

  if (hasStripe) return "paid";
  return "free";
}

export function isManagerFreePlan(tier: ManagerSubscriptionTier): boolean {
  return tier === "free";
}

/** Applicant background checks (Checkr) require Pro or Business — not included on Free. */
export function managerScreeningAllowedForTier(tier: ManagerSubscriptionTier): boolean {
  return !isManagerFreePlan(tier);
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

/**
 * Resident portal sections available when the linked property manager is on Free.
 * Mirrors manager Pro-gated features (documents, finances, services, inbox).
 */
export const RESIDENT_FREE_MANAGER_SECTIONS = new Set<string>(RESIDENT_FREE_TIER_SECTION_IDS);

export function residentSectionAllowedForManagerTier(
  section: string,
  managerTier: "free" | "paid" | null,
): boolean {
  if (managerTier !== "free") return true;
  return RESIDENT_FREE_MANAGER_SECTIONS.has(section);
}

export function residentSectionLockedForManagerTier(
  section: string,
  managerTier: "free" | "paid" | null | undefined,
): boolean {
  return managerTier === "free" && !residentSectionAllowedForManagerTier(section, "free");
}

/** @deprecated Use FREE_SUBSCRIPTION_SECTIONS */
export const FREE_MANAGER_SECTIONS = FREE_SUBSCRIPTION_SECTIONS;
