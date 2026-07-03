"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { waitForAuthUser } from "@/lib/auth/wait-for-auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function ManagerOauthFinishContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id")?.trim() ?? "";
  const [errorText, setErrorText] = useState<string | null>(null);
  const didRunRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- terminal error state for a malformed URL
      setErrorText("Missing signup session. Start again from Partner pricing.");
      return;
    }
    // Run once even under StrictMode's double-invoked effects. The completion call is
    // idempotent server-side and ends in a hard navigation, so no cancellation: a
    // cleanup-scoped `cancelled` flag would skip the redirect on the first (aborted)
    // StrictMode pass while the ref guard blocks the second, stranding the user here.
    if (didRunRef.current) return;
    didRunRef.current = true;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        // Returning from Stripe checkout the Supabase session cookie can lag a beat;
        // poll before falling back to sign-in so a healthy session never re-auths.
        const user = await waitForAuthUser(supabase);

        if (!user) {
          window.location.replace(`/auth/sign-in?next=${encodeURIComponent(`/auth/manager-oauth-finish?session_id=${sessionId}`)}`);
          return;
        }

        // Completion is idempotent server-side; retry once so a transient network blip
        // right after payment doesn't strand the user on an error screen.
        let res: Response | null = null;
        let body: { error?: string; managerId?: string } = {};
        for (let attempt = 0; attempt < 2; attempt++) {
          res = await fetch("/api/auth/manager-signup-oauth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          body = (await res.json()) as { error?: string; managerId?: string };
          if (res.ok) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }
        if (!res?.ok) {
          setErrorText(body.error ?? "Could not finish account setup.");
          return;
        }

        window.location.replace(portalDashboardPath("manager"));
      } catch {
        setErrorText("Could not finish account setup. Try again.");
      }
    })();
  }, [sessionId]);

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

  return <AuthOAuthLoading label="Finishing account setup" caption="Finishing your Axis account…" />;
}

export default function ManagerOauthFinishPage() {
  return (
    <Suspense
      fallback={<AuthOAuthLoading />}
    >
      <ManagerOauthFinishContent />
    </Suspense>
  );
}
