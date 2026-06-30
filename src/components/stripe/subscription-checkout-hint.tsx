"use client";

import { detectNativePlatformSync } from "@/lib/native/detect-native";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";

type Props = {
  className?: string;
  /** When true, copy assumes an upgrade (no trial mention). */
  upgrade?: boolean;
};

/**
 * Subscription checkout helper — Apple Pay is available in the iOS/Android app
 * via Stripe Embedded Checkout (dynamic payment methods). Rent uses ACH only.
 */
export function SubscriptionCheckoutHint({ className, upgrade }: Props) {
  const isNative = typeof window !== "undefined" && Boolean(detectNativePlatformSync());
  const trialNote = upgrade
    ? ""
    : ` You won't be charged until your ${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day trial ends.`;

  if (isNative) {
    return (
      <p className={className ?? "text-xs leading-relaxed text-muted"}>
        Choose <span className="font-semibold text-foreground">Apple Pay</span> or card in secure checkout below.
        {trialNote}
      </p>
    );
  }

  return (
    <p className={className ?? "text-xs leading-relaxed text-muted"}>
      Secure checkout with card or Apple Pay (Safari / iPhone).
      {trialNote}
    </p>
  );
}
