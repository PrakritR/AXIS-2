/**
 * Platform take rates when using Stripe Connect destination charges.
 * Set in environment (basis points = hundredths of a percent; 100 bps = 1%).
 *
 * Stripe: pass `application_fee_amount` (integer cents) on PaymentIntents / Checkout
 * created with `transfer_data.destination` = connected account id.
 *
 * Application fee payment: platformFeeCents(amountCents, "application_fee")
 * Rent payment: platformFeeCents(amountCents, "rent")
 */

export type PlatformFeeKind = "application_fee" | "rent";

/** Default 1% = 100 bps */
export function platformApplicationFeeBps(): number {
  const n = Number(process.env.AXIS_PLATFORM_APPLICATION_FEE_BPS ?? "100");
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.floor(n) : 100;
}

/** Default 0.5% = 50 bps */
export function platformRentBps(): number {
  const n = Number(process.env.AXIS_PLATFORM_RENT_BPS ?? "50");
  return Number.isFinite(n) && n >= 0 && n <= 10000 ? Math.floor(n) : 50;
}

/** Integer cents taken by the platform from a gross charge (floor). */
export function platformFeeCents(grossAmountCents: number, kind: PlatformFeeKind): number {
  if (!Number.isFinite(grossAmountCents) || grossAmountCents <= 0) return 0;
  const bps = kind === "application_fee" ? platformApplicationFeeBps() : platformRentBps();
  return Math.floor((grossAmountCents * bps) / 10000);
}

/** Public labels for UI (e.g. 1 and 0.5). */
export function platformFeeDisplayPercents(): { applicationFee: number; rent: number } {
  return {
    applicationFee: platformApplicationFeeBps() / 100,
    rent: platformRentBps() / 100,
  };
}
