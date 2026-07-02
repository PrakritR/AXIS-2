"use client";

import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function safeNext(raw: string | null): string {
  if (!raw?.startsWith("/")) return "";
  const normalized = normalizePostAuthPath(raw);
  return normalized === "/auth/continue" ? "" : normalized;
}

function AuthContinueLoading() {
  return <AuthOAuthLoading />;
}

function ContinueContent() {
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [errorText, setErrorText] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
    // Paid manager signup must finish on its dedicated route, not portal routing.
    if (nextPath.startsWith("/auth/manager-")) {
      window.location.replace(nextPath);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const user = await waitForOAuthUser(supabase, { attempts: 20, delayMs: 300 });

        if (!user) {
          window.location.replace(nextPath ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/auth/sign-in");
          return;
        }

        // Single source of truth: the server resolves the destination once (portal, plan,
        // signup-finish, choose-portal, or the get-started role chooser for unknown users).
        const resolveDestination = async (): Promise<string | null> => {
          try {
            const res = await fetch(
              `/api/auth/oauth-portal-access?next=${encodeURIComponent(nextPath || "/auth/continue")}`,
              { credentials: "include", cache: "no-store" },
            );
            if (!res.ok) return null;
            const body = (await res.json()) as { redirectTo?: string };
            const candidate = body.redirectTo?.startsWith("/") ? normalizePostAuthPath(body.redirectTo) : null;
            return candidate === "/auth/continue" ? null : candidate;
          } catch {
            return null;
          }
        };

        let redirectTo = await resolveDestination();
        if (!redirectTo) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          redirectTo = await resolveDestination();
        }

        if (cancelled || didRedirectRef.current) return;
        didRedirectRef.current = true;

        if (redirectTo) {
          window.location.replace(nativeAwarePath(redirectTo));
          return;
        }

        // Resolution failed (network/500) — keep the user on a safe authenticated screen.
        window.location.replace(nativeAwarePath("/auth/get-started"));
      } catch {
        if (cancelled) return;
        setErrorText("Still loading your portal. If this keeps happening, go back and try sign-in again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  if (errorText) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <AuthOAuthLoading label="Loading your portal" />
        <p className="max-w-sm text-center text-sm text-rose-600">{errorText}</p>
      </div>
    );
  }

  return <AuthOAuthLoading />;
}

export default function AuthContinuePage() {
  return (
    <Suspense fallback={<AuthContinueLoading />}>
      <ContinueContent />
    </Suspense>
  );
}
