"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { useAuthWelcomeChrome } from "@/components/auth/use-auth-welcome-chrome";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { isGetStartedDestination, resolvePostAuthDestination } from "@/lib/auth/resolve-post-auth-destination";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useState } from "react";

/**
 * Quick role chooser for a signed-in user we can't yet route to a portal (an unknown
 * Google login with no role, purchase, or application). We never silently create an
 * account here — the user explicitly picks how to get started.
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
    // Resident: the user is already signed in — link them to their application by email
    // (a pending/limited portal if no application matches yet). No Axis ID required.
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
      window.location.replace(nativeAwarePath("/resident"));
    } catch {
      showToast("Network error. Try again.");
      setBusy(null);
    }
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
        title="How do you want to use Axis?"
        subtitle="Pick the option that fits you — you can add the other later."
        accent={false}
      />

      <AuthRoleStack
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
            label: "I'm a resident with an application",
            hint: "Use the email on your rental application",
            icon: "resident",
            tone: "steel",
          },
        ]}
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
