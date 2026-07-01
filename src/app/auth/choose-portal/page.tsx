"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { AuthBackLink, AuthPageHeader, AuthRoleStack } from "@/components/auth/auth-mobile-primitives";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import type { AuthRoleIconName } from "@/components/auth/auth-role-icons";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { Suspense, useEffect, useMemo, useState } from "react";

const ROLE_META: Record<
  AuthRole,
  { label: string; hint: string; icon: AuthRoleIconName; tone: "blue" | "steel" }
> = {
  admin: {
    label: "Admin",
    hint: "Platform administration",
    icon: "admin",
    tone: "steel",
  },
  manager: {
    label: "Property",
    hint: "Manage properties & tenants",
    icon: "manager",
    tone: "blue",
  },
  resident: {
    label: "Resident",
    hint: "Rent, pay & apply",
    icon: "resident",
    tone: "blue",
  },
};

function ChoosePortalForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get("next") ?? "";
  const safeNext = nextRaw.startsWith("/") ? nextRaw : "";

  const [roles, setRoles] = useState<AuthRole[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/portal-roles", { credentials: "include" });
        const body = (await res.json()) as { roles?: AuthRole[]; error?: string };
        if (!res.ok) {
          if (!cancelled) setError(body.error ?? "Could not load your account.");
          return;
        }
        if (!cancelled) {
          setRoles((body.roles ?? []).filter((role): role is AuthRole => role in ROLE_META));
        }
      } catch {
        if (!cancelled) setError("Could not load your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stackOptions = useMemo(
    () =>
      (roles ?? []).map((role) => ({
        id: role,
        label: ROLE_META[role].label,
        hint: ROLE_META[role].hint,
        icon: ROLE_META[role].icon,
        tone: ROLE_META[role].tone,
      })),
    [roles],
  );

  const choose = async (role: AuthRole) => {
    setBusy(role);
    setError(null);
    try {
      const res = await fetch("/api/auth/set-active-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not continue.");
        setBusy(null);
        return;
      }
      const dest = safeNext || portalDashboardPath(role);
      router.push(dest);
      router.refresh();
    } catch {
      setError("Network error.");
      setBusy(null);
    }
  };

  const signOut = async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    try {
      posthog.reset();
    } catch {
      /* ignore — analytics reset is best-effort */
    }
    router.push("/auth/sign-in");
    router.refresh();
  };

  return (
    <AuthCard>
      <AuthPageHeader showLogo title="Choose a portal" accent={false} />

      {error ? <p className="mt-4 text-center text-sm text-rose-600">{error}</p> : null}

      {roles === null ? (
        <p className="auth-role-stack text-center text-sm text-muted">Loading…</p>
      ) : roles.length === 0 ? (
        <p className="auth-role-stack text-center text-sm text-muted">No portal roles found.</p>
      ) : (
        <AuthRoleStack
          options={stackOptions}
          onSelect={(id) => void choose(id as AuthRole)}
          disabled={busy !== null}
          busyId={busy}
        />
      )}

      <AuthBackLink onClick={() => void signOut()}>Sign out</AuthBackLink>
    </AuthCard>
  );
}

export default function ChoosePortalPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading…</p>
        </AuthCard>
      }
    >
      <ChoosePortalForm />
    </Suspense>
  );
}
