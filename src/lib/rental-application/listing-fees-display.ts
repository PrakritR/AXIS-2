import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { parseMoneyAmount } from "@/lib/household-charges";

export type ListingMoneySigningFields = Pick<ManagerListingSubmissionV1, "paymentAtSigning" | "securityDeposit" | "moveInFee">;

/** Price column for “Payment due at signing”: explicit listing value, else deposit + move-in (numeric sum). */
export function paymentAtSigningPriceLabel(sub: ListingMoneySigningFields | undefined): string {
  if (!sub) return "—";
  const explicit = sub.paymentAtSigning.trim();
  if (explicit) return explicit;
  const sum = parseMoneyAmount(sub.securityDeposit) + parseMoneyAmount(sub.moveInFee);
  if (sum > 0) return `$${sum.toFixed(2)}`;
  return "—";
}

/** Detail body for listing / lease copy when explicit payment-at-signing is not set. */
export function paymentAtSigningDetailBody(sub: ListingMoneySigningFields | undefined): string {
  if (!sub) return "Confirm amounts and timing with the property manager.";
  const explicit = sub.paymentAtSigning.trim();
  if (explicit) return explicit;
  const sum = parseMoneyAmount(sub.securityDeposit) + parseMoneyAmount(sub.moveInFee);
  if (sum > 0) {
    return `Security deposit (${sub.securityDeposit.trim() || "—"}) plus move-in fee (${sub.moveInFee.trim() || "—"}) due at signing.`;
  }
  return "Confirm payment due at signing with the property manager.";
}
