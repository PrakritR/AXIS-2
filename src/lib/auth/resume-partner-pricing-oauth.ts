import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { continuePartnerPricingWithOffer } from "@/lib/auth/partner-pricing-google-flow";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type ResumePartnerPricingOAuthResult =
  | { status: "checkout"; clientSecret: string }
  | { status: "finish"; sessionId: string }
  | { status: "portal" }
  | { status: "error"; message: string };

export async function resumePartnerPricingOAuth(): Promise<ResumePartnerPricingOAuthResult> {
  const offer = readManagerPricingOffer();
  if (!offer) {
    return { status: "error", message: "Pricing selection expired. Choose a plan and try Google again." };
  }

  const supabase = createSupabaseBrowserClient();
  const user = await waitForAuthUser(supabase);
  if (!user) {
    return { status: "error", message: "Google sign-in did not complete. Try again." };
  }

  const result = await continuePartnerPricingWithOffer(offer);
  if (result.status === "provisioned") {
    return { status: "error", message: "Choose a plan and continue." };
  }
  return result;
}

export function partnerPricingFinishPath(sessionId: string): string {
  return `/auth/manager-oauth-finish?session_id=${encodeURIComponent(sessionId)}`;
}
