import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export type ApplicationFeePayChannel = "stripe" | "zelle";

/**
 * Application fee checkout is Stripe-only in the renter flow.
 * We keep the union type for backward compatibility with older stored drafts.
 */
export function listingApplicationFeeChannels(sub: ManagerListingSubmissionV1 | undefined): {
  stripe: boolean;
  zelle: boolean;
} {
  void sub;
  return { stripe: true, zelle: false };
}

export function resolveApplicationFeePayChannel(
  sub: ManagerListingSubmissionV1 | undefined,
  preference: ApplicationFeePayChannel | undefined,
): ApplicationFeePayChannel {
  void sub;
  void preference;
  return "stripe";
}
