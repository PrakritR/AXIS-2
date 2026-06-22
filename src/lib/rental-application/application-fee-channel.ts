import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { axisPaymentsEnabledOnListing } from "@/lib/payment-policy";

/** How the applicant pays the application fee. `stripe` is a legacy alias for `ach`. */
export type ApplicationFeePayChannel = "ach" | "zelle" | "venmo" | "stripe";

export function listingApplicationFeeChannels(sub: ManagerListingSubmissionV1 | undefined): {
  ach: boolean;
  /** @deprecated Use `ach` — kept for older saved form state. */
  stripe: boolean;
  zelle: boolean;
  venmo: boolean;
} {
  const ach = axisPaymentsEnabledOnListing(sub);
  const zelle = Boolean(sub?.zellePaymentsEnabled && sub.applicationFeeZelleEnabled !== false && sub.zelleContact?.trim());
  const venmo = Boolean(sub?.venmoPaymentsEnabled && sub.applicationFeeVenmoEnabled !== false && sub.venmoContact?.trim());
  return { ach, stripe: ach, zelle, venmo };
}

export function resolveApplicationFeePayChannel(
  sub: ManagerListingSubmissionV1 | undefined,
  preference: ApplicationFeePayChannel | undefined,
): ApplicationFeePayChannel {
  const channels = listingApplicationFeeChannels(sub);
  const pref = preference === "stripe" ? "ach" : preference;
  if (pref === "ach" && channels.ach) return "ach";
  if (pref === "zelle" && channels.zelle) return "zelle";
  if (pref === "venmo" && channels.venmo) return "venmo";
  if (channels.ach) return "ach";
  if (channels.zelle) return "zelle";
  if (channels.venmo) return "venmo";
  return "ach";
}

export function isAchApplicationFeeChannel(channel: ApplicationFeePayChannel): boolean {
  return channel === "ach" || channel === "stripe";
}
