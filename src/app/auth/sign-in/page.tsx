"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { resolvePortalRoleFromEmail } from "@/lib/auth/resolve-portal-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function portalLabel(role: ReturnType<typeof resolvePortalRoleFromEmail>) {
  if (role === "resident") return "Resident portal";
  if (role === "manager") return "Manager portal";
  if (role === "owner") return "Owner portal";
  return "Admin portal";
}

export default function SignInPage() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const [email, setEmail] = useState("");

  const handleSignIn = () => {
    if (!email.trim()) {
      showToast("Enter your email to continue.");
      return;
    }
    const role = resolvePortalRoleFromEmail(email);
    showToast(`Signed in to ${portalLabel(role)} (demo).`);
    router.push(portalDashboardPath(role));
  };

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Portal sign-in</h1>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="email">
            Email
          </label>
          <Input
            id="email"
            className="mt-1.5"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw">
            Password
          </label>
          <PasswordInput id="pw" className="mt-1.5" autoComplete="current-password" />
        </div>
      </div>

      <div className="mt-5 text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/forgot-password">
          Forgot password
        </Link>
      </div>

      <Button type="button" className="mt-6 w-full rounded-full py-3 text-base font-semibold" onClick={handleSignIn}>
        Sign in
      </Button>

      <p className="mt-8 text-center text-sm text-slate-600">
        New here?{" "}
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/create-account">
          Create account
        </Link>
      </p>
    </AuthCard>
  );
}
