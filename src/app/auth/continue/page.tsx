"use client";

import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
import { GET_STARTED_PATH } from "@/lib/auth/get-started-path";
import { normalizePostAuthPath } from "@/lib/auth/normalize-post-auth-path";
import {
  resolveClientPostAuthDestination,
  resolvePostAuthDestination,
} from "@/lib/auth/resolve-post-auth-destination";
import { waitForOAuthUser } from "@/lib/auth/wait-for-oauth-user";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
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

        // Ensure SSR auth cookies are flushed before the server resolver runs.
        await supabase.auth.refreshSession().catch(() => undefined);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token ?? null;

        const { redirectTo, resolutionFailed } = await resolvePostAuthDestination(
          nextPath || "/auth/continue",
          accessToken,
        );

        if (cancelled || didRedirectRef.current) return;

        if (redirectTo) {
          didRedirectRef.current = true;
          window.location.replace(nativeAwarePath(redirectTo));
          return;
        }

        if (resolutionFailed) {
          const clientDestination = await resolveClientPostAuthDestination(supabase, nextPath);
          if (clientDestination) {
            didRedirectRef.current = true;
            window.location.replace(nativeAwarePath(clientDestination));
            return;
          }

          const fallback =
            nextPath.startsWith("/") && nextPath !== "/auth/continue" ? normalizePostAuthPath(nextPath) : null;
          if (fallback && fallback !== "/auth/continue") {
            didRedirectRef.current = true;
            window.location.replace(nativeAwarePath(fallback));
            return;
          }

          didRedirectRef.current = true;
          window.location.replace(nativeAwarePath(GET_STARTED_PATH));
          return;
        }

        didRedirectRef.current = true;
        window.location.replace(nativeAwarePath(GET_STARTED_PATH));
      } catch {
        if (cancelled) return;
        setErrorText("Still loading your portal. If this keeps happening, go back and try sign-in again.");
        didRedirectRef.current = false;
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
        <Link
          href={nextPath ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/auth/sign-in"}
          className="text-sm font-semibold text-primary hover:opacity-90"
        >
          Back to sign in
        </Link>
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
