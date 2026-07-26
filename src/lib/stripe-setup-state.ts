export type StripeSetupState = "unlinked" | "incomplete" | "ready";

/**
 * Derives the Stripe payout-setup state from the live `/api/stripe/connect/status`
 * response — never a locally-cached boolean, which can drift from Stripe's real
 * account state. "ready" is returned ONLY when Stripe reports the account can
 * actually receive money (transfers active + payouts enabled); an account that
 * exists but hasn't cleared onboarding reads as "incomplete", not "connected".
 *
 * This is the single source of truth for the manager Payment setup UI so that
 * "Connected" is never shown for a manager who cannot actually be paid out.
 */
export function stripeSetupStateFromStatus(body: {
  paymentReady?: boolean;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  connected?: boolean;
  accountId?: string | null;
}): StripeSetupState {
  const ready = Boolean(body.paymentReady ?? (body.payoutsEnabled && body.chargesEnabled));
  if (ready) return "ready";
  const connected = Boolean(body.connected ?? body.accountId?.trim());
  return connected ? "incomplete" : "unlinked";
}
