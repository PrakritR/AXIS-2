"use client";

import posthog from "posthog-js";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { FIELD_LABEL_CLASS, READONLY_INPUT_CLASS } from "@/lib/ui-styles";

function ResidentSetupFallback() {
  return (
    <AuthCard>
      <p className="text-center text-sm text-muted">Loading setup…</p>
    </AuthCard>
  );
}

function ResidentSetupInner() {
  const { showToast } = useAppUi();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const axisIdFromUrl = useMemo(() => searchParams.get("axis_id")?.trim() ?? "", [searchParams]);

  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [axisId, setAxisId] = useState(axisIdFromUrl);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !axisIdFromUrl) {
      setInvalid(true);
      setErrorMessage("This page only works from the account setup link in your application email.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/auth/resident-setup?token=${encodeURIComponent(token)}&axis_id=${encodeURIComponent(axisIdFromUrl)}`,
          { cache: "no-store" },
        );
        const body = (await res.json()) as {
          error?: string;
          axisId?: string;
          email?: string;
          name?: string | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          setInvalid(true);
          setErrorMessage(body.error ?? "This setup link is invalid or has expired.");
          return;
        }
        setAxisId(body.axisId ?? axisIdFromUrl);
        setEmail(body.email ?? "");
        if (body.name) setFullName(body.name);
      } catch {
        if (!cancelled) {
          setInvalid(true);
          setErrorMessage("Could not validate your setup link.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, axisIdFromUrl]);

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
      const res = await fetch("/api/auth/resident-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName: fullName.trim() || undefined,
          token,
          axisId,
        }),
      });
      const body = (await res.json()) as { error?: string; redirectTo?: string; axisId?: string };
      if (!res.ok) {
        showToast(body.error ?? "Could not create resident account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        showToast("Account ready. Sign in with your email.");
        window.location.replace("/auth/sign-in?intent=resident&next=/resident/applications");
        return;
      }
      if (signInData?.user) posthog.identify(signInData.user.id);
      showToast("Resident account created.");
      window.location.replace(body.redirectTo?.startsWith("/") ? body.redirectTo : "/resident/applications");
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AuthCard>
        <p className="text-center text-sm text-muted">Validating your setup link…</p>
      </AuthCard>
    );
  }

  if (invalid) {
    return (
      <AuthCard>
        <AuthPageHeader
          eyebrow="Resident portal"
          title="Setup link required"
          subtitle={errorMessage ?? "Apply first, then use the account setup link from your email."}
        />
        <div className="mt-6 space-y-3">
          <Link
            href="/rent/browse"
            className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold"
          >
            Browse homes
          </Link>
          <Link
            href="/auth/sign-in?intent=resident&next=/resident/applications"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold text-foreground"
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthPageHeader
        eyebrow="Resident portal"
        title="Create your account"
        subtitle="This link is tied to your rental application. Use the same email you applied with."
      />

      <p className="mt-3 text-center font-mono text-xs text-muted">{axisId}</p>

      <div className="mt-6 space-y-3">
        <div>
          <label className={FIELD_LABEL_CLASS} htmlFor="resident-setup-email">
            Email
          </label>
          <Input id="resident-setup-email" className={`mt-1.5 ${READONLY_INPUT_CLASS}`} value={email} readOnly />
        </div>
        <div>
          <label className={FIELD_LABEL_CLASS} htmlFor="resident-setup-name">
            Full name
          </label>
          <Input
            id="resident-setup-name"
            className="mt-1.5"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={busy}
            autoComplete="name"
          />
        </div>
        <div>
          <label className={FIELD_LABEL_CLASS} htmlFor="resident-setup-password">
            Password
          </label>
          <PasswordInput
            id="resident-setup-password"
            className="mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className={FIELD_LABEL_CLASS} htmlFor="resident-setup-confirm">
            Confirm password
          </label>
          <PasswordInput
            id="resident-setup-confirm"
            className="mt-1.5"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={busy}
            autoComplete="new-password"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <Button
          type="button"
          className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? "Creating…" : "Create resident account"}
        </Button>
        <p className="text-center text-xs text-muted">
          Already have an account?{" "}
          <Link className="font-semibold text-primary hover:underline" href="/auth/sign-in?intent=resident&next=/resident/applications">
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}

export default function ResidentSetupClient() {
  return (
    <Suspense fallback={<ResidentSetupFallback />}>
      <ResidentSetupInner />
    </Suspense>
  );
}
