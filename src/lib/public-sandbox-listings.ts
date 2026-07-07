import type { MockProperty } from "@/data/types";
import { isPortalSandboxEmail } from "@/lib/portal-sandbox-accounts";

const SANDBOX_PROPERTY_ID_PREFIXES = ["prodseed", "seedwf", "demo_", "demo-"] as const;

/** Seeded workflow / sandbox property ids (scripts/seed-demo-manager-workflow.mjs). */
export function isSandboxSeedPropertyId(id: string): boolean {
  const normalized = id.trim().toLowerCase();
  return SANDBOX_PROPERTY_ID_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/** Explicit demo/test street addresses (e.g. production QA listings). */
export function isSandboxDemoPropertyAddress(address: string): boolean {
  const street = address.split(",")[0]?.trim().toLowerCase() ?? "";
  return /\bdemo\b/.test(street) && /\btest\b/.test(street);
}

export function isSandboxPublicListing(opts: {
  property: Pick<MockProperty, "id" | "address" | "managerUserId">;
  managerEmail?: string | null;
}): boolean {
  if (opts.managerEmail && isPortalSandboxEmail(opts.managerEmail)) return true;
  if (isSandboxSeedPropertyId(opts.property.id)) return true;
  if (isSandboxDemoPropertyAddress(opts.property.address)) return true;
  return false;
}

/** Drop sandbox/demo listings from the public rent catalog on production. */
export function filterSandboxFromPublicCatalog<T extends Pick<MockProperty, "id" | "address" | "managerUserId">>(
  listings: T[],
  opts: {
    production: boolean;
    managerEmailByUserId?: ReadonlyMap<string, string | null | undefined>;
  },
): T[] {
  if (!opts.production) return listings;
  return listings.filter((property) => {
    const managerEmail = property.managerUserId
      ? opts.managerEmailByUserId?.get(property.managerUserId)
      : undefined;
    return !isSandboxPublicListing({ property, managerEmail });
  });
}
