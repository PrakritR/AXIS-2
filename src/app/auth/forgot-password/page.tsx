"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const { showToast } = useAppUi();

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-semibold tracking-tight text-foreground">Reset password</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Enter the email you use to sign in. We&apos;ll send reset instructions to that address (demo only).
      </p>

      <div className="mt-8">
        <label className="text-xs font-semibold text-muted" htmlFor="email">
          Email
        </label>
        <Input id="email" className="mt-1.5" placeholder="you@example.com" autoComplete="email" />
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => showToast("Reset email sent.")}
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
