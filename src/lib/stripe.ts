import Stripe from "stripe";

/**
 * Server-only Stripe client. Never import this in Client Components.
 * Uses STRIPE_SECRET_KEY from the environment (e.g. Vercel).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return new Stripe(key, {
    apiVersion: "2026-03-25.dahlia",
    typescript: true,
  });
}
