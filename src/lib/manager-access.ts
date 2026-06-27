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

export function managerSectionAllowedForTier(section: string, tier: "free" | "paid" | null): boolean {
  if (tier !== "free") return true;
  return FREE_SUBSCRIPTION_SECTIONS.has(section);
}

/** @deprecated Use FREE_SUBSCRIPTION_SECTIONS */
export const FREE_MANAGER_SECTIONS = FREE_SUBSCRIPTION_SECTIONS;
