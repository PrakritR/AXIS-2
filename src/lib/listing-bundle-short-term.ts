import type { ManagerBundleRow, ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { shortTermNightlyRate } from "@/lib/short-term-stay-pricing";

/** Bundle nightly rate used for short-term stay pricing (bundle override or listing default). */
export function resolveBundleShortTermNightlyRate(
  bundle: ManagerBundleRow,
  sub: Pick<ManagerListingSubmissionV1, "shortTermDailyCost">,
): number {
  const fromBundle = shortTermNightlyRate(bundle.shortTermNightlyRent);
  if (fromBundle > 0) return fromBundle;
  return shortTermNightlyRate(sub.shortTermDailyCost);
}

export function bundleShortTermPriceLabel(
  bundle: ManagerBundleRow,
  sub: Pick<ManagerListingSubmissionV1, "shortTermDailyCost">,
): string | undefined {
  if (!bundle.shortTermEnabled) return undefined;
  const nightly = resolveBundleShortTermNightlyRate(bundle, sub);
  if (!(nightly > 0)) return undefined;
  const label = nightly % 1 === 0 ? `$${nightly}` : `$${nightly.toFixed(2)}`;
  return `${label}/night`;
}

export function validateListingBundleShortTermPricing(
  sub: ManagerListingSubmissionV1,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!sub.shortTermRentalsAllowed) return errs;

  for (const bundle of sub.bundles ?? []) {
    if (!bundle.shortTermEnabled) continue;
    if (!(shortTermNightlyRate(bundle.shortTermNightlyRent) > 0)) {
      errs[`bundle-${bundle.id}-shortTermNightlyRent`] =
        `Enter a nightly rate for ${bundle.label.trim() || "this bundle"}.`;
    }
  }

  return errs;
}
