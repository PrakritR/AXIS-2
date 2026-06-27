"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { clearResidentSignupAxisId, readResidentSignupAxisId } from "@/lib/auth/resident-oauth-storage";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

function ResidentOauthFinishContent() {
  const [errorText, setErrorText] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    void (async () => {
      try {
        const axisId = readResidentSignupAxisId();
        if (!axisId) {
          setErrorText("Enter your Axis ID on Create account, then try Google again.");
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const user = await waitForAuthUser(supabase);
        if (!user) {
          setErrorText("Google sign-in did not complete. Try again.");
          return;
        }

        const res = await fetch("/api/auth/register-resident-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ axisId }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErrorText(body.error ?? "Could not link your resident account.");
          return;
        }

        clearResidentSignupAxisId();
        window.location.replace(portalDashboardPath("resident"));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not finish resident signup.";
        setErrorText(message);
      }
    })();
  }, []);

  if (errorText) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-rose-600">{errorText}</p>
        <div className="mt-6 flex justify-center">
          <Link className="text-sm font-semibold text-primary hover:underline" href="/auth/create-account?role=resident">
            Back to create account
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <p className="text-center text-sm text-muted">Linking your resident account…</p>
    </AuthCard>
  );
}

export default function ResidentOauthFinishPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <ResidentOauthFinishContent />
    </Suspense>
  );
}
