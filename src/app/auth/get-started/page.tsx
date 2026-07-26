"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  AUTH_PORTAL_PICKER_OPTIONS,
  type AuthPortalPickerId,
} from "@/lib/auth/auth-portal-picker-options";
import { authCreateAccountHref } from "@/lib/auth/auth-role-signup-routes";
import { isGetStartedDestination, resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useMemo, useState } from "react";

/**
 * Portal chooser for a signed-in user with no portal role yet (new OAuth/email login).
 * User picks Property, Resident, or Vendor — never silently provisioned.
 */
function GetStartedContent() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  useAuthWelcomeChrome(true);

  const stackOptions = useMemo(
    () =>
      AUTH_PORTAL_PICKER_OPTIONS.map((opt) => ({
        id: opt.id,
        label: opt.chooserLabel,
        hint: opt.chooserHint,
        icon: opt.icon,
        tone: opt.tone,
      })),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { redirectTo, resolutionFailed } = await resolvePostAuthDestination("/auth/continue");
      if (cancelled) return;
      if (redirectTo && !isGetStartedDestination(redirectTo)) {
        window.location.replace(redirectTo);
        return;
      }
      if (resolutionFailed) {
        showToast("Couldn't verify your account. Pick an option below or sign out and try again.");
      }
      setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const choose = (id: string) => {
    const role = id as AuthPortalPickerId;
    if (!AUTH_PORTAL_PICKER_OPTIONS.some((opt) => opt.id === role)) return;
    setBusy(id);
    window.location.replace(authCreateAccountHref(role));
  };

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    try {
      posthog.reset();
    } catch {
      /* best-effort analytics reset */
    }
    router.push("/auth/sign-in");
    router.refresh();
  };

  if (resolving) {
    return (
      <AuthCard>
        <AuthOAuthLoading label="Loading your account" />
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthPageHeader
        showLogo
        title="How do you want to use PropLane?"
        subtitle="Pick the option that fits you; you can add other portal types later from Settings."
        accent={false}
      />

      <AuthRoleStack
        options={stackOptions}
        onSelect={choose}
        disabled={busy !== null}
        busyId={busy}
      />

      <AuthBackLink onClick={() => void signOut()}>Sign out</AuthBackLink>
    </AuthCard>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <GetStartedContent />
    </Suspense>
  );
}
