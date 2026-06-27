import { clearManagerPricingOffer, persistManagerPricingOffer, readManagerPricingOffer, type ManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PlanTierId } from "@/data/manager-plan-tiers";

export type PartnerPricingSession = {
  authenticated: boolean;
  needsPricing: boolean;
  email?: string;
  fullName?: string | null;
  isGoogle?: boolean;
};

export type ContinuePartnerPricingResult =
  | { status: "checkout"; clientSecret: string }
  | { status: "finish"; sessionId: string }
  | { status: "portal" }
  | { status: "provisioned" }
  | { status: "error"; message: string };

export async function fetchPartnerPricingSession(): Promise<PartnerPricingSession> {
  try {
    const res = await fetch("/api/auth/manager-onboarding-status", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return { authenticated: false, needsPricing: false };
    return (await res.json()) as PartnerPricingSession;
  } catch {
    return { authenticated: false, needsPricing: false };
  }
}

export async function provisionPartnerPricingGoogleAccount(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/auth/provision-pending-manager", {
      method: "POST",
      credentials: "include",
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) {
      const message = body.error ?? "Could not create your account.";
      if (res.status === 409 && message.toLowerCase().includes("already exists")) {
        return { ok: true };
      }
      return { ok: false, error: message };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error while creating your account." };
  }
}

function offerToRequestBody(offer: ManagerPricingOffer) {
  return {
    tier: offer.tier,
    billing: offer.billing,
    promo: offer.promo,
    discountPercent: offer.discountPercent,
  };
}

export async function continuePartnerPricingWithOffer(
  offer: ManagerPricingOffer,
): Promise<ContinuePartnerPricingResult> {
  persistManagerPricingOffer(offer);

  const supabase = createSupabaseBrowserClient();
  const user = await waitForAuthUser(supabase);
  if (!user) {
    return { status: "error", message: "Sign in with Google first." };
  }

  const session = await fetchPartnerPricingSession();
  if (session.authenticated && session.needsPricing) {
    const provision = await provisionPartnerPricingGoogleAccount();
    if (!provision.ok) {
      return { status: "error", message: provision.error };
    }
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

  if (body.action === "portal") {
    clearManagerPricingOffer();
    return { status: "portal" };
  }

  if (body.action === "checkout" && body.clientSecret) {
    return { status: "checkout", clientSecret: body.clientSecret };
  }

  return { status: "error", message: "Unexpected signup response." };
}

export function buildPricingOffer(opts: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  promo?: string;
  discountPercent?: number | null;
}): ManagerPricingOffer {
  const stored = readManagerPricingOffer();
  return {
    tier: opts.tier,
    billing: opts.billing,
    promo: opts.promo ?? stored?.promo,
    discountPercent: opts.discountPercent ?? stored?.discountPercent,
  };
}

export async function handleGoogleSignedInReturn(): Promise<{ status: "provisioned" } | { status: "error"; message: string }> {
  const provision = await provisionPartnerPricingGoogleAccount();
  if (!provision.ok) {
    return { status: "error", message: provision.error };
  }

  if (typeof window !== "undefined") {
    window.history.replaceState({}, "", "/partner/pricing");
  }

  return { status: "provisioned" };
}
