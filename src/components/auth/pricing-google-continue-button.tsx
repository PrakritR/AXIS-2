"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";
import { persistManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { persistOAuthSignInContext } from "@/lib/auth/oauth-next-cookie";
import type { PlanTierId } from "@/data/manager-plan-tiers";

export function PricingGoogleContinueButton({
  tier,
  billing,
  promo,
  disabled = false,
  returnSurface = "partner-pricing",
}: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  promo?: string;
  disabled?: boolean;
  returnSurface?: "mobile-plan" | "partner-pricing";
}) {
  const nextPath = managerPricingOauthPath({
    tier,
    billing,
    promo,
  });

  const onBeforeOAuth = () => {
    persistOAuthSignInContext({ intent: "manager", nextPath: nextPath });
    persistManagerPricingOffer({
      tier,
      billing,
      promo,
      returnSurface,
    });
  };

  return (
    <GoogleSignInButton
      label="Continue with Google"
      nextPath={nextPath}
      viaContinue={false}
      fixedCallbackPath="/auth/callback/partner-pricing"
      disabled={disabled}
      onBeforeRedirect={onBeforeOAuth}
    />
  );
}
