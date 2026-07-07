import type { CheckrPackage } from "@/lib/checkr/config";

/** Checkr Tenant add-on slugs (see Testing → Identity Verification add-on). */
export type CheckrAddOnSlug = "identity_verification";

export type CheckrPackageCatalogEntry = {
  slug: CheckrPackage;
  name: string;
  priceCents: number;
  tagline: string;
  /** Human-readable inclusions shown in the package picker. */
  features: string[];
  /** When set, UI shows "Everything in {inheritsFrom}". */
  inheritsLabel?: string;
  popular?: boolean;
};

export type CheckrAddOnCatalogEntry = {
  slug: CheckrAddOnSlug;
  name: string;
  priceCents: number;
  description: string;
  badge?: string;
};

/** Default Checkr Tenant retail pricing (override via env if your account differs). */
export const CHECKR_PACKAGE_CATALOG: CheckrPackageCatalogEntry[] = [
  {
    slug: "starter",
    name: "Starter",
    priceCents: 2499,
    tagline: "Essential checks for landlords just getting started.",
    features: ["Criminal history", "Global watchlist", "Sex offender registry"],
  },
  {
    slug: "essential",
    name: "Essential",
    priceCents: 3499,
    tagline: "Financials, rental history, and background in one report.",
    inheritsLabel: "Starter",
    features: ["Credit report", "Credit score", "Eviction history"],
    popular: true,
  },
  {
    slug: "complete",
    name: "Complete",
    priceCents: 4499,
    tagline: "Income, employment, and asset verification included.",
    inheritsLabel: "Essential",
    features: ["Income verification", "Assets & bank report"],
  },
];

export const CHECKR_ADD_ON_CATALOG: CheckrAddOnCatalogEntry[] = [
  {
    slug: "identity_verification",
    name: "Identity protection",
    priceCents: 295,
    description: "Government ID verification to reduce impersonation risk.",
    badge: "New",
  },
];

export function checkrPackageCatalog(): CheckrPackageCatalogEntry[] {
  return CHECKR_PACKAGE_CATALOG.map((entry) => ({
    ...entry,
    priceCents: readPriceOverride(`CHECKR_${entry.slug.toUpperCase()}_PRICE_CENTS`, entry.priceCents),
  }));
}

export function checkrAddOnCatalog(): CheckrAddOnCatalogEntry[] {
  return CHECKR_ADD_ON_CATALOG.map((entry) => ({
    ...entry,
    priceCents: readPriceOverride("CHECKR_IDENTITY_ADDON_PRICE_CENTS", entry.priceCents),
  }));
}

function readPriceOverride(envKey: string, fallback: number): number {
  const raw = Number(process.env[envKey]);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : fallback;
}

/** Axis platform fee added to every Checkr screening order (default $5). */
export function checkrAxisSurchargeCents(): number {
  const raw = Number(process.env.CHECKR_AXIS_SURCHARGE_CENTS ?? "500");
  return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : 500;
}

export function isCheckrPackage(value: string): value is CheckrPackage {
  return value === "starter" || value === "essential" || value === "complete";
}

export function isCheckrAddOn(value: string): value is CheckrAddOnSlug {
  return value === "identity_verification";
}

export function checkrOrderCostCents(
  packageSlug: CheckrPackage,
  addOnProducts: readonly CheckrAddOnSlug[] = [],
): number {
  const pkg = checkrPackageCatalog().find((p) => p.slug === packageSlug);
  const base = pkg?.priceCents ?? 3499;
  const addOnTotal = addOnProducts.reduce((sum, slug) => {
    const addOn = checkrAddOnCatalog().find((a) => a.slug === slug);
    return sum + (addOn?.priceCents ?? 0);
  }, 0);
  return base + addOnTotal + checkrAxisSurchargeCents();
}

export function formatCheckrPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
