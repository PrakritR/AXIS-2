"use client";

import { AxisLogoMark } from "@/components/brand/axis-logo";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function isAuthRole(value: unknown): value is AuthRole {
  return value === "resident" || value === "manager" || value === "admin";
}

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") ? raw : "";
}

async function fetchPortalRolesFast(): Promise<AuthRole[] | null> {
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    const res = await fetch("/api/auth/portal-roles", {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    if (!res.ok) return null;
    const body = (await res.json()) as { roles?: AuthRole[] };
    return Array.isArray(body.roles) ? body.roles.filter(isAuthRole) : null;
  } catch {
    return null;
  }
}

async function fetchLegacyRole(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  userId: string,
): Promise<AuthRole | null> {
  try {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return isAuthRole(profile?.role) ? profile.role : null;
  } catch {
    return null;
  }
}

function fallbackRolesFromUser(user: { user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null }): AuthRole[] {
  const role = user.user_metadata?.role ?? user.app_metadata?.role;
  return isAuthRole(role) ? [role] : [];
}

function AuthContinueLoading() {
  return (
    <div className="flex flex-col items-center gap-6 py-10" role="status" aria-live="polite">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        aria-hidden
      />
    </div>
  );
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
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.replace(nextPath ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/auth/sign-in");
          return;
        }

        try {
          await fetch("/api/auth/reconcile-account", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
          });
        } catch {
          // Non-blocking: portal routing still proceeds if linking fails.
        }

        let roles = await fetchPortalRolesFast();
        if (!roles || roles.length === 0) {
          roles = fallbackRolesFromUser(user);
        }
        if (roles.length === 0) {
          const legacyRole = await fetchLegacyRole(supabase, user.id);
          if (legacyRole) {
            roles = [legacyRole];
          } else {
            const accessRes = await fetch(
              `/api/auth/oauth-portal-access?next=${encodeURIComponent(nextPath || "/auth/continue")}`,
              { credentials: "include", cache: "no-store" },
            );
            if (accessRes.ok) {
              const accessBody = (await accessRes.json()) as { redirectTo?: string };
              const redirectTo = accessBody.redirectTo?.trim() ?? "";
              const isContinueLoop =
                redirectTo === "/auth/continue" || redirectTo.startsWith("/auth/continue?");
              if (redirectTo.startsWith("/") && !isContinueLoop) {
                if (cancelled || didRedirectRef.current) return;
                didRedirectRef.current = true;
                window.location.replace(redirectTo);
                return;
              }
            }
            if (cancelled || didRedirectRef.current) return;
            didRedirectRef.current = true;
            window.location.replace("/auth/create-account");
            return;
          }
        }

        if (cancelled || didRedirectRef.current) return;
        didRedirectRef.current = true;

        if (roles.length === 1 && roles[0] === "manager") {
          const onboardingRes = await fetch("/api/auth/manager-onboarding-status", {
            credentials: "include",
            cache: "no-store",
          });
          if (onboardingRes.ok) {
            const onboardingBody = (await onboardingRes.json()) as { needsPricing?: boolean };
            if (onboardingBody.needsPricing) {
              window.location.replace("/partner/pricing");
              return;
            }
          }
        }

        if (roles.length > 1) {
          const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
          window.location.replace(`/auth/choose-portal${q}`);
          return;
        }

        const role = roles[0] ?? "resident";
        window.location.replace(nextPath || portalDashboardPath(role));
      } catch {
        if (cancelled) return;
        setErrorText("Still loading your portal. If this keeps happening, go back and try sign-in again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nextPath]);

  return (
    <div className="flex flex-col items-center gap-6 py-10">
      <AxisLogoMark />
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-steel-light/25 border-t-steel-light"
        role="status"
        aria-label="Loading your portal"
      />
      {errorText ? <p className="max-w-sm text-center text-sm text-rose-600">{errorText}</p> : null}
    </div>
  );
}

export default function AuthContinuePage() {
  return (
    <Suspense fallback={<AuthContinueLoading />}>
      <ContinueContent />
    </Suspense>
  );
}
