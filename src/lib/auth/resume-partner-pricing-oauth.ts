import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import {
  clearManagerPricingOffer,
  readManagerPricingOffer,
  type ManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type ResumePartnerPricingOAuthResult =
  | { status: "checkout"; clientSecret: string }
  | { status: "finish"; sessionId: string }
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

  const res = await fetch("/api/manager/pricing-oauth-continue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(offerToRequestBody(offer)),
  });

  const body = (await res.json()) as {
    action?: string;
    sessionId?: string;
    clientSecret?: string;
    error?: string;
  };

  if (!res.ok) {
    return { status: "error", message: body.error ?? "Could not continue signup." };
  }

  if (body.action === "finish" && body.sessionId) {
    clearManagerPricingOffer();
    return { status: "finish", sessionId: body.sessionId };
  }

  if (body.action === "checkout" && body.clientSecret) {
    clearManagerPricingOffer();
    return { status: "checkout", clientSecret: body.clientSecret };
  }

  return { status: "error", message: "Unexpected signup response." };
}

function offerToRequestBody(offer: ManagerPricingOffer) {
  return {
    tier: offer.tier,
    billing: offer.billing,
    promo: offer.promo,
    discountPercent: offer.discountPercent,
  };
}

export function partnerPricingFinishPath(sessionId: string): string {
  return managerOauthFinishPath(sessionId);
}
