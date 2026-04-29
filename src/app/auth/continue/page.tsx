"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function isAuthRole(value: unknown): value is AuthRole {
  return value === "resident" || value === "manager" || value === "owner" || value === "admin";
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

function ContinueContent() {
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const [errorText, setErrorText] = useState<string | null>(null);
  const didRedirectRef = useRef(false);

  useEffect(() => {
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
          roles = legacyRole ? [legacyRole] : ["resident"];
        }

        if (cancelled || didRedirectRef.current) return;
        didRedirectRef.current = true;

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
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Loading your portal</h1>
      <p className="mt-4 text-center text-sm text-slate-600">Finishing sign-in and opening the right portal for this account.</p>
      {errorText ? <p className="mt-5 text-center text-sm text-rose-600">{errorText}</p> : null}
    </AuthCard>
  );
}

export default function AuthContinuePage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-slate-600">Loading…</p></AuthCard>}>
      <ContinueContent />
    </Suspense>
  );
}
