"use client";

import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";

type Props = {
  className?: string;
  /** When true, copy assumes an upgrade (no trial mention). */
  upgrade?: boolean;
};

/**
 * Subscription checkout helper — Apple Pay is offered via Stripe Embedded Checkout
 * (dynamic payment methods) on web and in the native app WebView when eligible.
 *
 * Web / native copy is toggled with CSS (`native-hide` / `native-only` on `html[data-native]`).
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
