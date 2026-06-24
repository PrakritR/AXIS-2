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

export function isStripeLiveMode(): boolean {
  return process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_") ?? false;
}

/** Live Connect redirects must use https — Stripe rejects http return URLs (e.g. localhost). */
export function stripeConnectRedirectOriginError(origin: string): string | null {
  if (!isStripeLiveMode()) return null;
  try {
    if (new URL(origin).protocol === "http:") {
      return "Live Stripe requires HTTPS. For local dev, use test keys (sk_test_/pk_test_) or an HTTPS tunnel (ngrok) with NEXT_PUBLIC_APP_URL set to the https URL.";
    }
  } catch {
    return "Invalid app URL for Stripe Connect redirects.";
  }
  return null;
}
