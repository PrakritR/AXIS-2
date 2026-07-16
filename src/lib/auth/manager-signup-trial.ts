import { after } from "next/server";
import { completeFreeManagerTierForUser } from "@/lib/auth/manager-pricing-selection";
import { finalizePendingManagerFreeTier } from "@/lib/auth/manager-onboarding";
import { maybeSendManagerPropLaneAssistantIntro } from "@/lib/claw-onboarding-sms.server";
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
  let managerId: string;
  if (opts.tier === "free") {
    ({ managerId } = await completeFreeManagerTierForUser(supabase, {
      userId: opts.userId,
      email: opts.email,
      fullName: opts.fullName,
      tier: "free",
      billing: "free",
    }));
  } else {
    ({ managerId } = await finalizePendingManagerFreeTier(supabase, {
      userId: opts.userId,
      email: opts.email,
      fullName: opts.fullName,
      tier: opts.tier,
      billing: "trial",
    }));
  }

  // Best-effort PropLane assistant intro when a personal phone is already on
  // file. after() keeps the serverless runtime alive until the send finishes;
  // outside a request scope (tests) fall back to fire-and-forget.
  const sendIntro = () =>
    maybeSendManagerPropLaneAssistantIntro(supabase, opts.userId).catch(() => undefined);
  try {
    after(sendIntro);
  } catch {
    void sendIntro();
  }

  return { managerId };
}
