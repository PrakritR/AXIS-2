"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useIsNativeApp } from "@/hooks/use-is-native-app";
import {
  AUTH_PORTAL_PICKER_OPTIONS,
  type AuthPortalPickerId,
} from "@/lib/auth/auth-portal-picker-options";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";
import { provisionPortalFromGetStarted } from "@/lib/auth/provision-portal-from-get-started";
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
  const { isNative } = useIsNativeApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [resolving, setResolving] = useState(true);
  useAuthWelcomeChrome(true);
  const cardVariant = isNative ? "blend" : "card";

  const stackOptions = useMemo(
    () =>
      AUTH_PORTAL_PICKER_OPTIONS.map((opt) => ({
        id: opt.id,
        label: opt.chooserLabel,
        hint: opt.id === "vendor" ? opt.chooserHint : undefined,
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

  const choose = async (id: string) => {
    const role = id as AuthPortalPickerId;
    if (!AUTH_PORTAL_PICKER_OPTIONS.some((opt) => opt.id === role)) return;
    setBusy(id);
    const result = await provisionPortalFromGetStarted(role);
    if (!result.ok) {
      showToast(result.error);
      setBusy(null);
      return;
    }
    await navigateAfterRoleSignup(result.redirectTo);
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
      <AuthCard variant={cardVariant}>
        <AuthOAuthLoading label="Loading your account" />
      </AuthCard>
    );
  }

  return (
    <AuthCard variant={cardVariant}>
      <AuthPageHeader
        showLogo
        title="How do you want to use PropLane?"
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

function GetStartedFallback() {
  const { isNative } = useIsNativeApp();
  return (
    <AuthCard variant={isNative ? "blend" : "card"}>
      <p className="text-center text-sm text-muted">Loading…</p>
    </AuthCard>
  );
}

export default function GetStartedPage() {
  return (
    <Suspense
      fallback={<GetStartedFallback />}
    >
      <GetStartedContent />
    </Suspense>
  );
}
