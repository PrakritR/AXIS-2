export type StripeSetupState = "unlinked" | "incomplete" | "ready" | "unknown";

/**
 * Derives the Stripe payout-setup state from the live `/api/stripe/connect/status`
 * response — never a locally-cached boolean, which can drift from Stripe's real
 * account state. "ready" is returned ONLY when Stripe reports the account can
 * actually receive money (transfers active + payouts enabled); an account that
 * exists but hasn't cleared onboarding reads as "incomplete", not "connected".
 *
 * "unknown" means the real account state could not be determined (the status
 * route hit a transient Stripe error, or the server has no Stripe keys), so the
 * UI must not assert readiness in either direction.
 *
 * The readiness fallback deliberately ignores `chargesEnabled`: a transfers-only
 * Express destination account has charges_enabled=false yet is payout-ready.
 *
 * This is the single source of truth for the manager Payment setup UI so that
 * "Connected" is never shown for a manager who cannot actually be paid out.
 */
export function stripeSetupStateFromStatus(body: {
  paymentReady?: boolean;
  payoutsEnabled?: boolean;
  chargesEnabled?: boolean;
  transfersEnabled?: boolean;
  connected?: boolean;
  accountId?: string | null;
  stripeError?: string | null;
  demo?: boolean;
}): StripeSetupState {
  if (body.stripeError || body.demo === true) return "unknown";
  const ready = Boolean(body.paymentReady ?? (body.payoutsEnabled && body.transfersEnabled));
  if (ready) return "ready";
  const connected = Boolean(body.connected ?? body.accountId?.trim());
  return connected ? "incomplete" : "unlinked";
}
