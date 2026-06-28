"use client";

import { AuthOAuthLoading } from "@/components/auth/auth-oauth-loading";
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
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.replace(nextPath ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/auth/sign-in");
          return;
        }

        let roles = await fetchPortalRolesFast();
        if (!roles || roles.length === 0) {
          roles = fallbackRolesFromUser(user);
        }
        if (roles.length === 0) {
          const legacyRole = await fetchLegacyRole(supabase, user.id);
          if (legacyRole) {
            roles = [legacyRole];
          }
        }

        if (roles.length === 0) {
          const resolvePortalAccess = async (): Promise<string | null> => {
            try {
              const accessRes = await fetch(
                `/api/auth/oauth-portal-access?next=${encodeURIComponent(nextPath || "/auth/continue")}`,
                { credentials: "include", cache: "no-store" },
              );
              if (!accessRes.ok) return null;
              const body = (await accessRes.json()) as { redirectTo?: string };
              return body.redirectTo?.startsWith("/") ? body.redirectTo : null;
            } catch {
              return null;
            }
          };

          let redirectTo = await resolvePortalAccess();
          if (!redirectTo) {
            await new Promise((resolve) => window.setTimeout(resolve, 400));
            redirectTo = await resolvePortalAccess();
          }
          if (redirectTo) {
            if (cancelled || didRedirectRef.current) return;
            didRedirectRef.current = true;
            window.location.replace(redirectTo);
            return;
          }
          if (cancelled || didRedirectRef.current) return;
          didRedirectRef.current = true;
          window.location.replace(
            "/auth/sign-in?error=oauth&message=" +
              encodeURIComponent("No portal account found for this Google login. Create an account or use email and password."),
          );
          return;
        }

        if (cancelled || didRedirectRef.current) return;
        didRedirectRef.current = true;

        if (roles.length > 1) {
          const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : "";
          window.location.replace(`/auth/choose-portal${q}`);
          return;
        }

        const role = roles[0] ?? "manager";
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
