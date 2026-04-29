import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export type ApplicationFeePayChannel = "stripe" | "zelle" | "venmo";

export function listingApplicationFeeChannels(sub: ManagerListingSubmissionV1 | undefined): {
  stripe: boolean;
  zelle: boolean;
  venmo: boolean;
} {
  const zelle = Boolean(sub?.zellePaymentsEnabled && sub.applicationFeeZelleEnabled !== false && sub.zelleContact?.trim());
  const venmo = Boolean(sub?.venmoPaymentsEnabled && sub.applicationFeeVenmoEnabled !== false && sub.venmoContact?.trim());
  const stripe = sub?.applicationFeeStripeEnabled !== false;
  if (!stripe && !zelle && !venmo) return { stripe: true, zelle: false, venmo: false };
  return { stripe, zelle, venmo };
}

export function resolveApplicationFeePayChannel(
  sub: ManagerListingSubmissionV1 | undefined,
  preference: ApplicationFeePayChannel | undefined,
): ApplicationFeePayChannel {
  const channels = listingApplicationFeeChannels(sub);
  if (preference === "zelle" && channels.zelle) return "zelle";
  if (preference === "venmo" && channels.venmo) return "venmo";
  if (preference === "stripe" && channels.stripe) return "stripe";
  if (channels.stripe) return "stripe";
  if (channels.zelle) return "zelle";
  return "venmo";
}
