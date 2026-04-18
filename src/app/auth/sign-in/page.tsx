"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalSwitcher, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useMemo, useState } from "react";

function titleFor(role: AuthRole) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  return "Admin portal";
}

function homeFor(role: AuthRole) {
  if (role === "resident") return "/resident/dashboard";
  if (role === "manager") return "/manager/dashboard";
  return "/admin/dashboard";
}

export default function SignInPage() {
  const { showToast, openModal } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");

  const title = useMemo(() => titleFor(role), [role]);

  return (
    <AuthCard>
      <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">{title}</h1>

      <div className="mt-7">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="email">
            Email
          </label>
          <Input id="email" className="mt-1.5" placeholder="you@example.com" autoComplete="email" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600" htmlFor="pw">
            Password
          </label>
          <Input id="pw" className="mt-1.5" type="password" placeholder="••••••••" autoComplete="current-password" />
        </div>
      </div>

      <Link
        className="mt-4 inline-block text-sm font-semibold text-[#2b5ce7] hover:text-blue-700"
        href="/auth/forgot-password"
      >
        Forgot password
      </Link>

      <Button
        type="button"
        className="mt-6 w-full rounded-full py-3 text-base font-semibold shadow-[0_10px_28px_-8px_rgba(43,92,231,0.55)]"
        onClick={() => showToast(`Signed in to ${title} (demo)`)}
      >
        Sign in
      </Button>

      <div className="mt-5 flex items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="font-semibold text-[#2b5ce7] hover:text-blue-700"
          onClick={() => openModal({ title: "Message Axis", body: "Messaging is not wired yet." })}
        >
          Message Axis
        </button>
        <Link className="shrink-0 font-semibold text-[#2b5ce7] hover:text-blue-700" href={homeFor(role)}>
          Enter portal UI →
        </Link>
      </div>

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-semibold text-[#2b5ce7] hover:text-blue-700" href="/auth/create-account">
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}
