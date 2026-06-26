"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { EmbeddedCheckoutMount } from "@/components/stripe/embedded-checkout";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { PlanTierId } from "@/data/manager-plan-tiers";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function parseTier(raw: string | null): PlanTierId {
  if (raw === "pro" || raw === "business" || raw === "free") return raw;
  return "pro";
}

function parseBilling(raw: string | null): "monthly" | "annual" {
  return raw === "annual" ? "annual" : "monthly";
}

function ManagerPricingOauthContent() {
  const searchParams = useSearchParams();
  const tier = parseTier(searchParams.get("tier"));
  const billing = parseBilling(searchParams.get("billing"));
  const discountRaw = searchParams.get("d");
  const discountPercent = discountRaw ? Number.parseInt(discountRaw, 10) : undefined;
  const promo = searchParams.get("promo")?.trim() ?? "";

  const [errorText, setErrorText] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const returnPath = `/auth/manager-pricing-oauth?${searchParams.toString()}`;
        if (!user) {
          window.location.replace(`/auth/sign-in?next=${encodeURIComponent(returnPath)}`);
          return;
        }

        const res = await fetch("/api/manager/pricing-oauth-continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          if (!cancelled) setErrorText(body.error ?? "Could not continue signup.");
          return;
        }

        if (body.action === "finish" && body.sessionId) {
          window.location.replace(managerOauthFinishPath(body.sessionId));
          return;
        }

        if (body.action === "checkout" && body.clientSecret) {
          if (!cancelled) setCheckoutClientSecret(body.clientSecret);
          return;
        }

        if (body.action === "redirect" && body.url) {
          window.location.assign(body.url);
          return;
        }

        if (!cancelled) setErrorText("Unexpected signup response.");
      } catch {
        if (!cancelled) setErrorText("Could not continue signup. Try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [billing, discountPercent, promo, searchParams, tier]);

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
        <p className="mt-6 text-center text-sm text-muted">
          After payment you&apos;ll land in your{" "}
          <button
            type="button"
            className="font-semibold text-primary"
            onClick={() => window.location.replace(portalDashboardPath("manager"))}
          >
            manager portal
          </button>
          .
        </p>
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
        aria-label="Preparing your signup"
      />
      <p className="text-sm text-muted">Preparing your Axis account…</p>
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
