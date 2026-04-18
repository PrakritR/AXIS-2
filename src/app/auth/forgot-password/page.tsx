"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { PortalSwitcher, type AuthRole } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const { showToast } = useAppUi();
  const [role, setRole] = useState<AuthRole>("resident");

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Reset password</h1>
      <p className="mt-2 text-center text-sm text-slate-600">
        Choose the portal you use most often (demo only).
      </p>

      <div className="mt-7">
        <PortalSwitcher value={role} onChange={setRole} />
      </div>

      <div className="mt-8">
        <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
          Email
        </label>
        <Input id="email" className="mt-1.5" placeholder="you@example.com" autoComplete="email" />
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => showToast("Reset email sent (demo)")}
      >
        Send reset link
      </Button>

      <Link
        className="mt-8 flex w-full justify-center text-sm font-semibold text-primary hover:opacity-90"
        href="/auth/sign-in"
      >
        ← Back to sign in
      </Link>
    </AuthCard>
  );
}
