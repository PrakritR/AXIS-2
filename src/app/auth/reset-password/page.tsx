"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setHasSession(Boolean(data.session));
        setReady(true);
      } catch {
        if (!cancelled) {
          setHasSession(false);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async () => {
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      showToast("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        showToast(error.message || "Could not update password.");
        return;
      }
      showToast("Password updated. Sign in with your new password.");
      await supabase.auth.signOut();
      router.replace("/auth/sign-in");
    } catch {
      showToast("Could not update password.");
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-muted">Loading…</p>
      </AuthCard>
    );
  }

  if (!hasSession) {
    return (
      <AuthCard>
        <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Reset link expired</h1>
        <p className="mt-2 text-center text-sm text-muted">
          Request a new password reset link and open it from the same browser.
        </p>
        <Link
          className="mt-8 flex w-full justify-center text-sm font-semibold text-primary hover:opacity-90"
          href="/auth/forgot-password"
        >
          Request new reset link →
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Choose a new password</h1>
      <p className="mt-2 text-center text-sm text-muted">Enter and confirm your new password below.</p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="new-password">
            New password
          </label>
          <PasswordInput
            id="new-password"
            className="mt-1.5"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="confirm-password">
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-password"
            className="mt-1.5"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        disabled={busy}
        onClick={() => void submit()}
      >
        {busy ? "Saving…" : "Save new password"}
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
