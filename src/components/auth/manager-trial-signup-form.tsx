"use client";

import posthog from "posthog-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AuthDivider, AuthLegalConsent } from "@/components/auth/auth-mobile-primitives";
import { PricingAppleContinueButton } from "@/components/auth/pricing-apple-continue-button";
import { PricingGoogleContinueButton } from "@/components/auth/pricing-google-continue-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import type { PlanTierId } from "@/data/manager-plan-tiers";
import {
  buildPricingOffer,
  continuePartnerPricingWithOffer,
  handleGoogleSignedInReturn,
  type ContinuePartnerPricingResult,
} from "@/lib/auth/partner-pricing-google-flow";
import { readManagerPricingOffer } from "@/lib/auth/manager-pricing-oauth-storage";
import { MANAGER_SUBSCRIPTION_TRIAL_DAYS } from "@/lib/stripe/subscription-checkout-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";

function trialSignupSubtitle(tier: PlanTierId): string {
  if (tier === "free") return "Free plan · no card required";
  return `${MANAGER_SUBSCRIPTION_TRIAL_DAYS}-day free trial · no card required`;
}

/** Manager account creation — OAuth or email, no inline plan UI. */
export function ManagerTrialSignupForm({
  tier,
  billing,
  initialEmail = "",
  disabled = false,
  hideLegalFooter = false,
  googleReturn = false,
  trialSignup = true,
}: {
  tier: PlanTierId;
  billing: "monthly" | "annual";
  initialEmail?: string;
  disabled?: boolean;
  hideLegalFooter?: boolean;
  googleReturn?: boolean;
  trialSignup?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [finishingGoogle, setFinishingGoogle] = useState(googleReturn);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [signedInSession, setSignedInSession] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);

  const locked = disabled || busy || finishingGoogle;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        setSignedInSession(Boolean(data.session?.user));
        setSignedInEmail(data.session?.user?.email ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyPricingResult = useCallback(
    (result: ContinuePartnerPricingResult) => {
      if (result.status === "portal") {
        void navigateAfterRoleSignup("/portal/dashboard");
        return;
      }
      if (result.status === "error") {
        setErrorText(result.message);
        showToast(result.message);
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!googleReturn) return;
    let cancelled = false;
    void (async () => {
      setFinishingGoogle(true);
      try {
        const stored = readManagerPricingOffer();
        const offer =
          stored ??
          buildPricingOffer({ tier, billing, returnSurface: "mobile-plan", trialSignup: true });
        const result = await handleGoogleSignedInReturn(offer);
        if (cancelled) return;
        if (result.status !== "provisioned") {
          if (result.status === "error") {
            setErrorText(result.message);
            showToast(result.message);
          }
          return;
        }
        const continued = await continuePartnerPricingWithOffer(offer);
        if (!cancelled) applyPricingResult(continued);
      } finally {
        if (!cancelled) setFinishingGoogle(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot continuation on mount
  }, [googleReturn]);

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      showToast("Enter your email and an 8+ character password.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/manager-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          tier,
        }),
      });
      const body = (await res.json()) as { error?: string; redirectTo?: string; existingAccount?: boolean };
      if (!res.ok) {
        setErrorText(body.error ?? "Could not create manager account.");
        showToast(body.error ?? "Could not create manager account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        showToast("Account created. Sign in to continue.");
        router.push("/auth/sign-in?role=manager");
        return;
      }
      if (signInData?.user) posthog.identify(signInData.user.id);
      const fallback = body.redirectTo?.startsWith("/") ? body.redirectTo : "/portal/dashboard";
      await navigateAfterRoleSignup(fallback);
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="manager-trial-signup-form space-y-2.5 sm:space-y-3">
      <p className="text-center text-[11px] leading-tight text-muted whitespace-nowrap sm:text-xs">
        {trialSignupSubtitle(tier)}
      </p>

      {finishingGoogle ? (
        <p className="rounded-2xl border border-border bg-card/50 px-3 py-2 text-center text-sm text-muted">
          Finishing sign-in…
        </p>
      ) : (
        <>
          {signedInSession ? (
            <div className="rounded-2xl border border-border bg-card/50 px-3 py-2 text-center text-[12px] leading-snug text-muted">
              {signedInEmail ? (
                <>You&apos;re signed in as <span className="font-semibold text-foreground">{signedInEmail}</span>. </>
              ) : (
                <>You&apos;re already signed in. </>
              )}
              Create a new property account below, or{" "}
              <Link href="/portal/dashboard" className="font-semibold text-primary hover:opacity-90">
                go to your dashboard
              </Link>
              .
            </div>
          ) : null}
          <div className="space-y-3">
            <PricingAppleContinueButton
              tier={tier}
              billing={billing}
              returnSurface="mobile-plan"
              trialSignup={trialSignup}
              disabled={locked}
            />
            <PricingGoogleContinueButton
              tier={tier}
              billing={billing}
              returnSurface="mobile-plan"
              trialSignup={trialSignup}
              disabled={locked}
            />
          </div>

          <AuthDivider label="or enter your details" />

          <Input
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={locked}
          />
          <PasswordInput
            autoComplete="new-password"
            placeholder="Password (8+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={locked}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <Button
            type="button"
            data-attr="manager-trial-signup-submit"
            className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
            disabled={locked}
            onClick={() => void submit()}
          >
            {busy ? "Creating…" : "Create property account"}
          </Button>
        </>
      )}

      {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}

      {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
    </div>
  );
}
