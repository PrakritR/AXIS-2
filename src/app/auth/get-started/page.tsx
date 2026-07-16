"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { AUTH_PORTAL_PICKER_OPTIONS } from "@/lib/auth/auth-portal-picker-options";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";
import { isGetStartedDestination, resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useState } from "react";

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { redirectTo, resolutionFailed } = await resolvePostAuthDestination("/auth/continue");
      if (cancelled) return;
      if (redirectTo && !isGetStartedDestination(redirectTo)) {
        window.location.replace(nativeAwarePath(redirectTo));
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
    setBusy(id);
    if (id === "manager") {
      window.location.replace(
        nativeAwarePath("/auth/create-account?mode=create&role=manager"),
      );
      return;
    }
<<<<<<< HEAD
    // Residents create accounts from the emailed setup link after applying — not here.
    showToast("Apply first, then use the account setup link from your email. Or sign in if you already have an account.");
    window.location.replace(nativeAwarePath("/rent/browse"));
=======
    if (id === "resident") {
      try {
        const res = await fetch("/api/auth/register-resident-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not finish resident setup.");
          setBusy(null);
          return;
        }
        await navigateAfterRoleSignup("/resident/applications/apply");
      } catch {
        showToast("Network error. Try again.");
        setBusy(null);
      }
      return;
    }
    if (id === "vendor") {
      try {
        const res = await fetch("/api/auth/register-vendor-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({}),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not finish vendor setup.");
          setBusy(null);
          return;
        }
        await navigateAfterRoleSignup("/vendor/dashboard");
      } catch {
        showToast("Network error. Try again.");
        setBusy(null);
      }
    }
>>>>>>> fm/captain-wip-ship-s1
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
<<<<<<< HEAD
        title="How do you want to use PropLane?"
        subtitle="Pick the option that fits you — you can add the other later."
=======
        title="Which portal is for you?"
        subtitle="Pick one to get started. You can add the others later with the same email."
>>>>>>> fm/captain-wip-ship-s1
        accent={false}
      />

      <AuthRoleStack
<<<<<<< HEAD
        options={[
          {
            id: "manager",
            label: "Set up as a property manager",
            hint: "List properties, screen applicants & collect rent",
            icon: "manager",
            tone: "blue",
          },
          {
            id: "resident",
            label: "I'm applying to rent",
            hint: "Browse homes, apply, then set up from your email link",
            icon: "resident",
            tone: "steel",
          },
        ]}
=======
        options={AUTH_PORTAL_PICKER_OPTIONS}
>>>>>>> fm/captain-wip-ship-s1
        onSelect={(id) => void choose(id)}
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
