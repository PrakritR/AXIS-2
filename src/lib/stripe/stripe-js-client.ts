export function stripePublishableKey(): string | undefined {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return pk || undefined;
}

export function isStripeLivePublishableKey(pk = stripePublishableKey()): boolean {
  return pk?.startsWith("pk_live_") ?? false;
}

/** Stripe.js blocks live mode on http:// origins (localhost, LAN IP, etc.). */
export function stripeLiveJsBlockedMessage(protocol?: string): string | null {
  const resolvedProtocol =
    protocol ??
    (typeof window !== "undefined" ? window.location.protocol : undefined);
  if (resolvedProtocol !== "http:") return null;
  if (!isStripeLivePublishableKey()) return null;
  return (
    "Live Stripe checkout requires HTTPS. For local testing, use pk_test_/sk_test_ keys in .env.local, " +
    "or point the mobile app at https://www.axis-seattle-housing.com (CAP_SERVER_URL)."
  );
}
