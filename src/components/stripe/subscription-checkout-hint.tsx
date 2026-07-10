"use client";

import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";

type Props = {
  className?: string;
  /** When true, copy assumes an upgrade (no trial mention). */
  upgrade?: boolean;
};

/**
 * Subscription checkout helper — Apple Pay is available in the iOS/Android app
 * via Stripe Embedded Checkout (dynamic payment methods). Rent uses ACH only.
 *
 * The web / native copy is toggled purely with CSS (`native-hide` / `native-only`,
 * driven by the synchronous `html[data-native]` marker). Both variants are in the
 * server HTML, so there is no hydration mismatch and no native flash — unlike
 * reading `detectNativePlatformSync()` during render.
 */
export function SubscriptionCheckoutHint({ className, upgrade }: Props) {
  const trialNote = upgrade
    ? ""
    : ` You won't be charged until your ${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day trial ends.`;

  return (
    <p className={className ?? "text-xs leading-relaxed text-muted"}>
      <span className="native-only">
        Choose <span className="font-semibold text-foreground">Apple Pay</span> or card in secure checkout below.
      </span>
      <span className="native-hide">Secure checkout with card or Apple Pay (Safari / iPhone).</span>
      {trialNote}
    </p>
  );
}
