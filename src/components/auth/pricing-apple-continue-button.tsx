"use client";

import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";
import { persistManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { persistOAuthSignInContext } from "@/lib/auth/oauth-next-cookie";
import type { PlanTierId } from "@/data/manager-plan-tiers";

export function PricingAppleContinueButton({
  tier,
  billing,
  promo,
  disabled = false,
  returnSurface = "partner-pricing",
  trialSignup = false,
}: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  promo?: string;
  disabled?: boolean;
  returnSurface?: "mobile-plan" | "partner-pricing";
  trialSignup?: boolean;
}) {
  const nextPath = managerPricingOauthPath({
    tier,
    billing,
    promo,
  });

  const onBeforeOAuth = () => {
    persistOAuthSignInContext({ intent: "manager", nextPath });
    persistManagerPricingOffer({
      tier,
      billing,
      promo,
      returnSurface,
      trialSignup: trialSignup || undefined,
    });
  };

  return (
    <AppleSignInButton
      label="Continue with Apple"
      nextPath={nextPath}
      viaContinue={false}
      fixedCallbackPath="/auth/callback/partner-pricing"
      disabled={disabled}
      onBeforeRedirect={onBeforeOAuth}
      intent="manager"
    />
  );
}
