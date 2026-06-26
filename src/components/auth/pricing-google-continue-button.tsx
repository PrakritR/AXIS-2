"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";
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

  return (
    <GoogleSignInButton
      label="Continue with Google"
      nextPath={nextPath}
      viaContinue={false}
      disabled={disabled}
    />
  );
}
