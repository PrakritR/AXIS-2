import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export type ApplicationFeePayChannel = "stripe" | "zelle";

/** Which application-fee paths this listing exposes in the rental wizard (demo: “Stripe” = portal-tracked fee line). */
export function listingApplicationFeeChannels(sub: ManagerListingSubmissionV1 | undefined): {
  stripe: boolean;
  zelle: boolean;
} {
  if (!sub || sub.v !== 1) return { stripe: true, zelle: false };
  const zelleListingOn = Boolean(sub.zellePaymentsEnabled && sub.zelleContact?.trim());
  const stripe = sub.applicationFeeStripeEnabled !== false;
  const zelle = zelleListingOn && sub.applicationFeeZelleEnabled !== false;
  return { stripe, zelle };
}

export function resolveApplicationFeePayChannel(
  sub: ManagerListingSubmissionV1 | undefined,
  preference: ApplicationFeePayChannel | undefined,
): ApplicationFeePayChannel {
  const { stripe, zelle } = listingApplicationFeeChannels(sub);
  if (!stripe && zelle) return "zelle";
  if (stripe && !zelle) return "stripe";
  if (stripe && zelle) return preference === "zelle" ? "zelle" : "stripe";
  return "stripe";
}
