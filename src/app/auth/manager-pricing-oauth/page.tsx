"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { managerPricingOauthPath } from "@/lib/auth/manager-pricing-oauth-path";
import {
  clearManagerPricingOffer,
  persistManagerPricingOffer,
  readManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";
import { persistOAuthNextPath } from "@/lib/auth/oauth-next-cookie";
import { bareAuthCallbackUrl } from "@/lib/auth/oauth-redirect";
import { resolveOAuthBrowserOrigin } from "@/lib/auth/password-reset-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PlanTierId } from "@/data/manager-plan-tiers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

function parseTier(raw: string | null, fallback: PlanTierId): PlanTierId {
  if (raw === "pro" || raw === "business" || raw === "free") return raw;
  return fallback;
}

function parseBilling(raw: string | null, fallback: "monthly" | "annual"): "monthly" | "annual" {
  return raw === "annual" ? "annual" : fallback;
}

import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";

async function restartGoogleForPricingOffer(offer: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  discountPercent?: number;
  promo?: string;
}) {
  persistManagerPricingOffer(offer);
  const supabase = createSupabaseBrowserClient();
  const nextPath = managerPricingOauthPath(offer);
  persistOAuthNextPath(nextPath);
  const redirectTo = bareAuthCallbackUrl(resolveOAuthBrowserOrigin());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("Could not start Google sign-in.");
  window.location.assign(data.url);
}

function ManagerPricingOauthContent() {
  const searchParams = useSearchParams();
  const storedOffer = useMemo(() => readManagerPricingOffer(), []);
  const tier = parseTier(searchParams.get("tier"), storedOffer?.tier ?? "pro");
  const billing = parseBilling(searchParams.get("billing"), storedOffer?.billing ?? "monthly");
  const discountRaw = searchParams.get("d");
  const discountPercent =
    discountRaw != null && discountRaw !== ""
      ? Number.parseInt(discountRaw, 10)
      : storedOffer?.discountPercent;
  const promo = searchParams.get("promo")?.trim() || storedOffer?.promo || "";

  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Preparing your Axis account…");
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    const offer = {
      tier,
      billing,
      discountPercent: Number.isFinite(discountPercent) ? discountPercent : undefined,
      promo: promo || undefined,
    };
    persistManagerPricingOffer(offer);

    void (async () => {
      try {
        setStatusText("Confirming your Google sign-in…");
        const supabase = createSupabaseBrowserClient();
        const user = await waitForAuthUser(supabase);

        if (!user) {
          setStatusText("Redirecting to Google…");
          didRunRef.current = false;
          await restartGoogleForPricingOffer(offer);
          return;
        }

        setStatusText(tier === "free" ? "Creating your account…" : "Opening secure checkout…");

        const res = await fetch("/api/manager/pricing-oauth-continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tier,
            billing,
            promo: promo || undefined,
            discountPercent: Number.isFinite(discountPercent) ? discountPercent : undefined,
          }),
        });

        const body = (await res.json()) as {
          action?: string;
          sessionId?: string;
          clientSecret?: string;
          url?: string;
          error?: string;
        };

        if (!res.ok) {
          setErrorText(body.error ?? "Could not continue signup.");
          return;
        }

        if (body.action === "finish" && body.sessionId) {
          clearManagerPricingOffer();
          window.location.replace(managerOauthFinishPath(body.sessionId));
          return;
        }

        if (body.action === "redirect" && body.url) {
          clearManagerPricingOffer();
          window.location.assign(body.url);
          return;
        }

        if (body.action === "checkout" && body.clientSecret) {
          clearManagerPricingOffer();
          setCheckoutClientSecret(body.clientSecret);
          return;
        }

        setErrorText("Unexpected signup response.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not continue signup. Try again.";
        setErrorText(message);
      }
    })();
  }, [billing, discountPercent, promo, tier]);

  if (checkoutClientSecret) {
    return (
      <AuthCard>
        <h1 className="text-center text-xl font-semibold text-foreground">Complete payment</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Your Google account is linked. Finish checkout to activate your {tier} plan.
        </p>
        <div className="mt-6">
          <EmbeddedCheckoutMount
            clientSecret={checkoutClientSecret}
            onError={(message) => setErrorText(message)}
          />
        </div>
        {errorText ? <p className="mt-4 text-center text-sm text-rose-600">{errorText}</p> : null}
      </AuthCard>
    );
  }

  if (errorText) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-rose-600">{errorText}</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link className="text-sm font-semibold text-primary hover:underline" href="/partner/pricing">
            Partner pricing
          </Link>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/auth/sign-in">
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        role="status"
        aria-label={statusText}
      />
      <p className="text-sm text-muted">{statusText}</p>
    </div>
  );
}

export default function ManagerPricingOauthPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <ManagerPricingOauthContent />
    </Suspense>
  );
}
