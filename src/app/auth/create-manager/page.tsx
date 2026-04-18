"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function CreateManagerForm() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!sessionId) {
      showToast("Missing checkout session. Start from Partner pricing.");
      return;
    }
    if (password.length < 8) {
      showToast("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      showToast("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/manager-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, password }),
      });
      const body = (await res.json()) as { error?: string; managerId?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not create account.");
        setBusy(false);
        return;
      }
      showToast(`Account ready. Manager ID ${body.managerId ?? ""}. Sign in with your email.`);
      router.push("/auth/sign-in");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (!sessionId) {
    return (
      <AuthCard>
        <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Create manager account</h1>
        <p className="mt-4 text-center text-sm text-slate-600">
          Complete payment on the{" "}
          <Link className="font-semibold text-primary hover:underline" href="/partner/pricing">
            partner pricing
          </Link>{" "}
          page first. After Stripe checkout you will return here automatically.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Create manager password</h1>
      <p className="mt-3 text-center text-sm text-slate-600">
        Your email and Manager ID were set at checkout. Choose a password for the manager portal.
      </p>

      <div className="mt-8 space-y-4">
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw1">
            Password
          </label>
          <PasswordInput
            id="pw1"
            className="mt-1.5"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-[#334155]" htmlFor="pw2">
            Confirm password
          </label>
          <PasswordInput
            id="pw2"
            className="mt-1.5"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void submit()}
        disabled={busy}
      >
        {busy ? "Creating…" : "Create account"}
      </Button>

      <div className="mt-6 flex justify-center">
        <Link className="text-sm font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
          ← Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}

export default function CreateManagerPage() {
  return (
    <Suspense fallback={<AuthCard><p className="text-center text-sm text-slate-600">Loading…</p></AuthCard>}>
      <CreateManagerForm />
    </Suspense>
  );
}
