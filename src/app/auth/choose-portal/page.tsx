"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath, type AuthRole } from "@/components/auth/portal-switcher";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const ROLE_META: Record<AuthRole, { label: string; description: string }> = {
  admin: {
    label: "Admin portal",
    description: "Platform operations, review queues, and user management.",
  },
  manager: {
    label: "Property portal",
    description: "Manage listings, leases, residents, and property workflows.",
  },
  resident: {
    label: "Resident portal",
    description: "Your lease, payments, maintenance, and move-in status.",
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
      <h1 className="text-center text-[22px] font-semibold tracking-tight text-foreground">Choose a portal</h1>
      <p className="mt-3 text-center text-sm text-muted">Your account has access to more than one portal. Pick where to go.</p>

      {error ? <p className="mt-4 text-center text-sm text-rose-600">{error}</p> : null}

      <div className="mt-8 space-y-3">
        {roles === null ? (
          <p className="text-center text-sm text-muted">Loading…</p>
        ) : roles.length === 0 ? (
          <p className="text-center text-sm text-muted">No portal roles found.</p>
        ) : (
          roles.map((r) => {
            const meta = ROLE_META[r];
            const selected = busy === r;
            return (
              <button
                key={r}
                type="button"
                disabled={busy !== null}
                onClick={() => void choose(r)}
                className="group w-full text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div
                  className={`rounded-[18px] transition-all duration-200 ${
                    selected
                      ? "bg-[linear-gradient(135deg,var(--primary),var(--sky))] p-[2px] shadow-[0_12px_32px_-12px_rgba(47,107,255,0.35)]"
                      : "glass-card hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]"
                  }`}
                >
                  <div className={`${selected ? "rounded-[16px] bg-[var(--glass-fill)] p-4 backdrop-blur-[24px]" : "p-4"}`}>
                    <div className="flex items-start gap-3">
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(47,107,255,0.55)]"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">{busy === r ? "Opening…" : meta.label}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted">{meta.description}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <button type="button" className="mt-6 w-full text-center text-sm font-semibold text-muted hover:text-foreground" onClick={() => void signOut()}>
        Sign out
      </button>

      <p className="mt-6 text-center text-sm text-muted">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
          Back to sign-in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function ChoosePortalPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-muted">Loading…</p></AuthCard>}>
      <ChoosePortalForm />
    </Suspense>
  );
}
