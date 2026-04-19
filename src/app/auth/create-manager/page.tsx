"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function Req() {
  return <span className="text-danger"> *</span>;
}

function CreateManagerForm() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [managerId, setManagerId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(!!sessionId);

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    fetch(`/api/stripe/session-info?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data: { managerId?: string; email?: string; fullName?: string; error?: string }) => {
        if (data.managerId) setManagerId(data.managerId);
        if (data.email) setEmail(data.email);
        if (data.fullName) setFullName(data.fullName);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

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
        return;
      }
      showToast(`Account ready. Manager ID: ${body.managerId ?? managerId}. Sign in with your email.`);
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
        <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Create account</h1>
        <p className="mt-4 text-center text-sm text-slate-600">
          Complete payment on the{" "}
          <Link className="font-semibold text-primary hover:underline" href="/partner/pricing">
            partner pricing
          </Link>{" "}
          page first. After checkout you will return here automatically.
        </p>
        <div className="mt-6 flex justify-center">
          <Link className="text-sm font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
            ← Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-[#0f172a]">Create account</h1>
      <p className="mt-2 text-center text-xs text-slate-400 font-medium uppercase tracking-wide">Manager portal</p>

      {loading ? (
        <p className="mt-8 text-center text-sm text-slate-500">Loading your details…</p>
      ) : (
        <div className="mt-7 space-y-4">
          {managerId && (
            <div>
              <label className="text-xs font-semibold text-[#334155]">Manager ID</label>
              <Input
                className="mt-1.5 bg-slate-50 font-mono text-sm"
                value={managerId}
                readOnly
                tabIndex={-1}
              />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-[#334155]">Full name</label>
            <Input
              className="mt-1.5 bg-slate-50"
              value={fullName}
              readOnly
              tabIndex={-1}
              placeholder="—"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#334155]">
              Email
            </label>
            <Input
              className="mt-1.5 bg-slate-50"
              value={email}
              readOnly
              tabIndex={-1}
              placeholder="—"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="pw1">
              Create password
              <Req />
            </label>
            <PasswordInput
              id="pw1"
              className="mt-1.5"
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-[#334155]" htmlFor="pw2">
              Confirm password
              <Req />
            </label>
            <PasswordInput
              id="pw2"
              className="mt-1.5"
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
        </div>
      )}

      <Button
        type="button"
        className="mt-8 w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void submit()}
        disabled={busy || loading}
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
