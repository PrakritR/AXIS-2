import {
  findManagerPurchaseForAccount,
  finalizePendingManagerFreeTier,
  isAxisPendingSessionId,
  isManagerOnboardingComplete,
} from "@/lib/auth/manager-onboarding";
import type { SupabaseClient } from "@supabase/supabase-js";

type Tier = "free" | "pro" | "business";
type Billing = "monthly" | "annual";

export async function resolveManagerPurchaseForPricing(
  supabase: SupabaseClient,
  userId: string,
  email: string,
): Promise<
  | { kind: "complete" }
  | { kind: "pending"; managerId: string; purchaseId: string }
  | { kind: "none" }
> {
  const purchase = await findManagerPurchaseForAccount(supabase, userId, email);
  if (!purchase) return { kind: "none" };
  if (isManagerOnboardingComplete(purchase)) return { kind: "complete" };
  if (isAxisPendingSessionId(purchase.stripe_checkout_session_id) || purchase.tier == null) {
    return { kind: "pending", managerId: purchase.manager_id, purchaseId: purchase.id };
  }
  return { kind: "none" };
}

export async function completeFreeManagerTierForUser(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    email: string;
    fullName?: string | null;
    tier: Tier;
    billing: Billing;
    promo?: string | null;
  },
): Promise<{ managerId: string; alreadyLinked: boolean }> {
  const state = await resolveManagerPurchaseForPricing(supabase, opts.userId, opts.email);
  if (state.kind === "complete") {
    throw new Error("A manager account already exists for this email. Sign in instead.");
  }
  if (state.kind === "pending") {
    await finalizePendingManagerFreeTier(supabase, opts);
    return { managerId: state.managerId, alreadyLinked: true };
  }
  return { managerId: "", alreadyLinked: false };
}
