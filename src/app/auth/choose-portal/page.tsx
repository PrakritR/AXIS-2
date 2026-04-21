"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const LABELS: Record<AuthRole, string> = {
  admin: "Admin portal",
  manager: "Axis Pro Portal (management)",
  resident: "Resident portal",
  owner: "Axis Pro Portal (ownership)",
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
        if (!cancelled) setRoles(body.roles ?? []);
      } catch {
        if (!cancelled) setError("Could not load your account.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    router.push("/auth/sign-in");
    router.refresh();
  };

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Choose a portal</h1>
      <p className="mt-3 text-center text-sm text-slate-600">Your account has access to more than one portal. Pick where to go.</p>

      {error ? <p className="mt-4 text-center text-sm text-rose-600">{error}</p> : null}

      <div className="mt-8 space-y-3">
        {roles === null ? (
          <p className="text-center text-sm text-slate-500">Loading…</p>
        ) : roles.length === 0 ? (
          <p className="text-center text-sm text-slate-500">No portal roles found.</p>
        ) : (
          roles.map((r) => (
            <Button
              key={r}
              type="button"
              variant="outline"
              className="w-full rounded-full py-3 text-base font-semibold"
              disabled={busy !== null}
              onClick={() => void choose(r)}
            >
              {busy === r ? "Opening…" : LABELS[r]}
            </Button>
          ))
        )}
      </div>

      <button type="button" className="mt-6 w-full text-center text-sm font-semibold text-slate-500 hover:text-slate-800" onClick={() => void signOut()}>
        Sign out
      </button>

      <p className="mt-6 text-center text-sm text-slate-600">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
          Back to sign-in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ChoosePortalPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-slate-600">Loading…</p></AuthCard>}>
      <ChoosePortalForm />
    </Suspense>
  );
}
