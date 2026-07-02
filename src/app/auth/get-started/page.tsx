"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useState } from "react";

/**
 * Quick role chooser for a signed-in user we can't yet route to a portal (an unknown
 * Google login with no role, purchase, or application). We never silently create an
 * account here — the user explicitly picks how to get started.
 */
function GetStartedContent() {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [busy, setBusy] = useState<string | null>(null);

  const choose = async (id: string) => {
    setBusy(id);
    if (id === "manager") {
      // Plan selection is manager onboarding AFTER the account exists — not a gate.
      window.location.replace(nativeAwarePath(MANAGER_PRICING_ENTRY_PATH));
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
      window.location.replace(nativeAwarePath("/resident/dashboard"));
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
