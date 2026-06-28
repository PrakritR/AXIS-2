"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  AuthBackLink,
  AuthChoiceList,
  AuthPageHeader,
  AuthRoleCard,
} from "@/components/auth/auth-mobile-primitives";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type ManagerMode = "choose" | "sign-in";

export default function ManagerAuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<ManagerMode>("choose");

  if (mode === "choose") {
    return (
      <AuthCard>
        <AuthPageHeader eyebrow="Manager" title="Property portal" subtitle="Sign in or start a new account" />

        <AuthChoiceList>
          <AuthRoleCard label="Sign in" hint="Open your dashboard" icon="sign-in" onClick={() => setMode("sign-in")} />
          <AuthRoleCard
            label="New account"
            hint="Choose a plan"
            icon="spark"
            tone="steel"
            onClick={() => router.push("/auth/manager/plan")}
          />
        </AuthChoiceList>

        <p className="auth-footer-link mt-5 text-center text-[13px] text-muted sm:mt-6 sm:text-sm">
          <Link className="font-semibold text-primary hover:opacity-90" href="/auth/welcome">
            Change role
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthPageHeader eyebrow="Manager" title="Sign in" accent={false} />

      <div className="mt-5 sm:mt-6">
        <GoogleSignInButton nextPath="/portal/dashboard" disabled={false} />
      </div>

      <div className="auth-divider my-4 flex items-center gap-3 sm:my-5">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted sm:text-xs">or</span>
        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full rounded-full py-2.5 text-[15px] font-semibold sm:py-3 sm:text-base"
        onClick={() => router.push("/auth/sign-in?intent=manager&next=/portal/dashboard")}
      >
        Email sign in
      </Button>

      <p className="auth-footer-link mt-4 text-center text-[13px] text-muted sm:mt-5 sm:text-sm">
        <Link className="font-semibold text-primary hover:opacity-90" href="/auth/manager/plan">
          New account
        </Link>
      </p>

      <AuthBackLink onClick={() => setMode("choose")}>← Back</AuthBackLink>
    </AuthCard>
  );
}
