import { completeFreeManagerTierForUser } from "@/lib/auth/manager-pricing-selection";
import { finalizePendingManagerFreeTier } from "@/lib/auth/manager-onboarding";
import type { SupabaseClient } from "@supabase/supabase-js";

type Tier = "free" | "pro" | "business";

export function isManagerSignupTrialTier(tier: string | null | undefined): tier is Tier {
  return tier === "free" || tier === "pro" || tier === "business";
}

/** Grants the chosen plan: Free immediately, paid tiers get a 14-day trial (no card). */
export async function completeManagerSignupTrial(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    email: string;
    fullName?: string | null;
    tier: Tier;
  },
): Promise<{ managerId: string }> {
  if (opts.tier === "free") {
    const { managerId } = await completeFreeManagerTierForUser(supabase, {
      userId: opts.userId,
      email: opts.email,
      fullName: opts.fullName,
      tier: "free",
      billing: "free",
    });
    return { managerId };
  }

  const { managerId } = await finalizePendingManagerFreeTier(supabase, {
    userId: opts.userId,
    email: opts.email,
    fullName: opts.fullName,
    tier: opts.tier,
    billing: "trial",
  });
  return { managerId };
}
