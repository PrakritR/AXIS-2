import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export type ApplicationFeePayChannel = "stripe" | "zelle";

export function listingApplicationFeeChannels(sub: ManagerListingSubmissionV1 | undefined): {
  stripe: boolean;
  zelle: boolean;
} {
  const zelle = Boolean(sub?.zellePaymentsEnabled && sub.applicationFeeZelleEnabled !== false && sub.zelleContact?.trim());
  const stripe = sub?.applicationFeeStripeEnabled !== false;
  if (!stripe && !zelle) return { stripe: true, zelle: false };
  return { stripe, zelle };
}

export function resolveApplicationFeePayChannel(
  sub: ManagerListingSubmissionV1 | undefined,
  preference: ApplicationFeePayChannel | undefined,
): ApplicationFeePayChannel {
  const channels = listingApplicationFeeChannels(sub);
  if (preference === "zelle" && channels.zelle) return "zelle";
  if (preference === "stripe" && channels.stripe) return "stripe";
  if (channels.stripe) return "stripe";
  return "zelle";
}
