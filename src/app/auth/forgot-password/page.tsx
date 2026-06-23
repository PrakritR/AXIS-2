"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { passwordResetCallbackUrl, resolveBrowserAppOrigin } from "@/lib/auth/password-reset-url";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const { showToast } = useAppUi();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const sendResetLink = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      showToast("Enter the email you use to sign in.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = passwordResetCallbackUrl(resolveBrowserAppOrigin());
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });
      if (error) {
        showToast(error.message || "Could not send reset link.");
        return;
      }
      setSent(true);
      showToast("If an account exists for that email, a reset link is on its way.");
    } catch {
      showToast("Could not send reset link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-semibold tracking-tight text-foreground">Reset password</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Enter the email you use to sign in. We&apos;ll send a secure link to choose a new password.
      </p>

      <div className="mt-8">
        <label className="text-xs font-semibold text-muted" htmlFor="email">
          Email
        </label>
        <Input
          id="email"
          className="mt-1.5"
          placeholder="you@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      {sent ? (
        <p className="mt-4 text-center text-sm text-emerald-700">
          Check your inbox for a reset link. It may take a minute to arrive.
        </p>
      ) : null}

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        disabled={busy}
        onClick={() => void sendResetLink()}
      >
        {busy ? "Sending…" : "Send reset link"}
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
