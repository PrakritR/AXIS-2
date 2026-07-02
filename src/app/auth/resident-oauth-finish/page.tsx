"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignedInBanner } from "@/components/auth/google-signed-in-banner";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { clearResidentSignupAxisId, readResidentSignupAxisId } from "@/lib/auth/resident-oauth-storage";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";

function ResidentOauthFinishContent() {
  const [errorText, setErrorText] = useState<string | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleName, setGoogleName] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (didRunRef.current) return;
    didRunRef.current = true;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const user = await waitForAuthUser(supabase);
        if (!user) {
          setErrorText("Google sign-in did not complete. Try again.");
          return;
        }
        setGoogleEmail(user.email ?? null);
        setGoogleName(
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null,
        );

        // Forward the Axis ID the applicant typed on the create-account form so the
        // Google path enforces the same application email+ID match as the password path.
        const storedAxisId = readResidentSignupAxisId();
        const res = await fetch("/api/auth/register-resident-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(storedAxisId ? { axisId: storedAxisId } : {}),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErrorText(body.error ?? "Could not finish resident signup.");
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
          <Link className="text-sm font-semibold text-primary hover:underline" href="/auth/sign-in?mode=create&role=resident">
            Back to create account
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      {googleEmail ? (
        <GoogleSignedInBanner
          email={googleEmail}
          fullName={googleName}
          subtitle="Setting up your resident account…"
        />
      ) : (
        <p className="text-center text-sm text-muted">Setting up your resident account…</p>
      )}
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
