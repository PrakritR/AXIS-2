"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalSwitcher, parseAuthRole, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { portalDashboardPath } from "@/components/auth/portal-switcher";

function titleFor(role: AuthRole) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  if (role === "owner") return "Owner portal";
  return "Admin portal";
}

function SignInContent() {
  const { showToast, openModal } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roleFromUrl = useMemo(() => parseAuthRole(searchParams.get("role")), [searchParams]);
  const [role, setRole] = useState<AuthRole>(roleFromUrl);

  useEffect(() => {
    setRole(roleFromUrl);
  }, [roleFromUrl]);

  const title = useMemo(() => titleFor(role), [role]);
  const ctaLabel =
    role === "admin" ? "Sign in to Admin" : role === "owner" ? "Sign in to Owner portal" : "Sign in";

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">{title}</h1>

      <div className="mt-7">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
            Email
          </label>
          <Input id="email" className="mt-1.5" placeholder="you@example.com" autoComplete="email" />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Password
          </label>
          <Input id="pw" className="mt-1.5" type="password" placeholder="••••••••" autoComplete="current-password" />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
        <button
          type="button"
          className="shrink-0 font-semibold text-primary hover:opacity-90"
          onClick={() => openModal({ title: "Message Axis", body: "Messaging is not wired yet." })}
        >
          Message Axis
        </button>
      </div>

      <Button
        type="button"
        className="mt-6 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => {
          showToast(`Signed in to ${title} (demo)`);
          router.push(portalDashboardPath(role));
        }}
      >
        {ctaLabel}
      </Button>

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{" "}
        <Link
          className="font-semibold text-primary hover:opacity-90"
          href={`/auth/create-account?role=${encodeURIComponent(role)}`}
        >
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}

function SignInFallback() {
  return (
    <AuthCard>
      <p className="text-center text-sm text-slate-600">Loading…</p>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFallback />}>
      <SignInContent />
    </Suspense>
  );
}
