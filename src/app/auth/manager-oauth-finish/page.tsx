"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AxisLogoMark } from "@/components/brand/axis-logo";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
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
      setErrorText("Missing signup session. Start again from Partner pricing.");
      return;
    }
    if (didRunRef.current) return;
    didRunRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.replace(`/auth/sign-in?next=${encodeURIComponent(`/auth/manager-oauth-finish?session_id=${sessionId}`)}`);
          return;
        }

        const res = await fetch("/api/auth/manager-signup-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await res.json()) as { error?: string; managerId?: string };
        if (!res.ok) {
          if (!cancelled) setErrorText(body.error ?? "Could not finish account setup.");
          return;
        }

        if (!cancelled) {
          window.location.replace(portalDashboardPath("manager"));
        }
      } catch {
        if (!cancelled) setErrorText("Could not finish account setup. Try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
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

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        role="status"
        aria-label="Finishing account setup"
      />
      <p className="text-sm text-muted">Finishing your Axis account…</p>
    </div>
  );
}

export default function ManagerOauthFinishPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <ManagerOauthFinishContent />
    </Suspense>
  );
}
