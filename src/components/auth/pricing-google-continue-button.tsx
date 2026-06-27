"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";
import { persistManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import type { PlanTierId } from "@/data/manager-plan-tiers";

export function PricingGoogleContinueButton({
  tier,
  billing,
  discountPercent,
  promo,
  disabled = false,
}: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number | null;
  promo?: string;
  disabled?: boolean;
}) {
  const nextPath = managerPricingOauthPath({
    tier,
    billing,
    discountPercent,
    promo,
  });

  const onBeforeOAuth = () => {
    persistManagerPricingOffer({
      tier,
      billing,
      discountPercent: discountPercent ?? undefined,
      promo,
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
