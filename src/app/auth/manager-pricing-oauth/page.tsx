"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import {
  clearManagerPricingOffer,
  persistManagerPricingOffer,
  readManagerPricingOffer,
} from "@/lib/auth/manager-pricing-oauth-storage";
import { openAppUrl } from "@/lib/native/open-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import type { PlanTierId } from "@/data/manager-plan-tiers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

function parseTier(raw: string | null, fallback: PlanTierId | null): PlanTierId {
  if (raw === "pro" || raw === "business" || raw === "free") return raw;
  return fallback ?? "free";
}

function parseBilling(raw: string | null, fallback: "monthly" | "annual"): "monthly" | "annual" {
  return raw === "annual" ? "annual" : fallback;
}

function ManagerPricingOauthContent() {
  const searchParams = useSearchParams();
  const storedOffer = useMemo(() => readManagerPricingOffer(), []);
  const tier = parseTier(searchParams.get("tier"), storedOffer?.tier ?? null);
  const billing = parseBilling(searchParams.get("billing"), storedOffer?.billing ?? "monthly");
  const promo = searchParams.get("promo")?.trim() || storedOffer?.promo || "";

  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Preparing your PropLane account…");
  const didRunRef = useRef(false);
  const { isNative } = useIsNativeApp();

  // Native iOS: subscription checkout is not available (App Store Guideline
  // 2.1(b)). Route native users away from this pricing-checkout route entirely —
  // a signed-in manager to their dashboard, otherwise to account creation.
  useEffect(() => {
    if (!isNative) return;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      window.location.replace(session ? "/portal/dashboard" : "/auth/create-account");
    })();
  }, [isNative]);

  useEffect(() => {
    // Never run the subscription provisioning/checkout flow on native iOS (App
    // Store 2.1(b)); the effect above redirects native users away instead. Wait
    // until isNative is definitively resolved (false = web) before provisioning.
    if (isNative !== false) return;
    if (didRunRef.current) return;
    didRunRef.current = true;

    const offer = {
      tier,
      billing,
      promo: promo || undefined,
    };
    persistManagerPricingOffer(offer);

    void (async () => {
      try {
        setStatusText("Confirming your Google sign-in…");
        const supabase = createSupabaseBrowserClient();
        const user = await waitForAuthUser(supabase);

        if (!user) {
          // No session here means OAuth never completed. Rather than re-launching Google
          // from this legacy route (a double account-chooser), hand off to the plan picker,
          // which owns the single sign-in entry. The offer is already persisted above.
          setStatusText("Opening plan selection…");
          window.location.replace(MANAGER_PRICING_ENTRY_PATH);
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
            trialSignup: storedOffer?.trialSignup === true ? true : undefined,
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
          if (res.status === 409) {
            // Account already complete — send directly to portal
            clearManagerPricingOffer();
            window.location.replace("/portal/dashboard");
            return;
          }
          setErrorText(body.error ?? "Could not continue signup.");
          return;
        }

        if (body.action === "portal") {
          clearManagerPricingOffer();
          window.location.replace("/portal/dashboard");
          return;
        }

        if (body.action === "finish" && body.sessionId) {
          clearManagerPricingOffer();
          window.location.replace(managerOauthFinishPath(body.sessionId));
          return;
        }

        if (body.action === "redirect" && body.url) {
          clearManagerPricingOffer();
          await openAppUrl(body.url);
          return;
        }

        if (body.action === "checkout" && body.clientSecret) {
          setCheckoutClientSecret(body.clientSecret);
          return;
        }

        setErrorText("Unexpected signup response.");
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not continue signup. Try again.";
        setErrorText(message);
      }
    })();
    // `isNative` gates the native early-return above, so the effect must re-run
    // when it resolves from null → false (web) to actually provision.
  }, [billing, promo, tier, isNative, storedOffer]);

  // Never mount the Stripe subscription checkout on native (App Store 2.1(b));
  // the native redirect effect above navigates away.
  if (checkoutClientSecret && !isNative) {
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
          <Link className="native-hide text-sm font-semibold text-primary hover:underline" href="/auth/manager/plan">
            Choose plan
          </Link>
          <Link className="text-sm font-semibold text-primary hover:underline" href="/auth/sign-in">
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return <AuthOAuthLoading label={statusText} caption={statusText} />;
}

export default function ManagerPricingOauthPage() {
  return (
    <Suspense fallback={<AuthOAuthLoading />}>
      <ManagerPricingOauthContent />
    </Suspense>
  );
}
