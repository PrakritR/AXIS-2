"use client";

import posthog from "posthog-js";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { HideOnNative } from "@/components/native/hide-on-native";
import { FIELD_LABEL_CLASS } from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type RegisterResponse = {
  error?: string;
  redirectTo?: string;
  confirmed?: boolean;
  emailDeliveryConfigured?: boolean;
  confirmLink?: string;
};

/** Vendor account creation — from a manager's invite link (?token=…) or public self-serve signup. */
export default function VendorRegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = useMemo(() => (searchParams.get("token") ?? "").trim(), [searchParams]);

  const [checkingInvite, setCheckingInvite] = useState(Boolean(inviteToken));
  const [inviteInvalid, setInviteInvalid] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [devConfirmLink, setDevConfirmLink] = useState<string | null>(null);
  const [confirmLinkNotice, setConfirmLinkNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/auth/vendor-register?token=${encodeURIComponent(inviteToken)}`, {
          cache: "no-store",
        });
        const body = (await res.json()) as { email?: string; name?: string; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setInviteInvalid(true);
          return;
        }
        setEmail(body.email ?? "");
        setFullName(body.name ?? "");
      } catch {
        if (!cancelled) setInviteInvalid(true);
      } finally {
        if (!cancelled) setCheckingInvite(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const submit = async () => {
    setError(null);
    if (!inviteToken && !email.trim().includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/vendor-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          inviteToken
            ? { token: inviteToken, password, fullName: fullName.trim() || undefined }
            : { email: email.trim(), password, fullName: fullName.trim() || undefined },
        ),
      });
      const body = (await res.json()) as RegisterResponse;
      if (!res.ok) {
        setError(body.error ?? "Could not create vendor account.");
        return;
      }

      if (body.confirmed === false) {
        setPendingConfirmation(true);
        if (body.emailDeliveryConfigured === false) {
          setDevConfirmLink(body.confirmLink ?? null);
          setConfirmLinkNotice(
            body.error
              ? `We couldn't send that email (${body.error}) — use this link directly:`
              : "Email delivery isn't configured in this environment — use this link directly:",
          );
        }
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        router.push("/auth/sign-in");
        return;
      }
      if (signInData?.user) posthog.identify(signInData.user.id);
      router.push(body.redirectTo?.startsWith("/") ? body.redirectTo : "/vendor/dashboard");
    } catch {
      setError("Could not create vendor account.");
    } finally {
      setBusy(false);
    }
  };

  if (checkingInvite) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AuthCard>
          <p className="text-center text-sm text-muted">Loading your invite…</p>
        </AuthCard>
      </main>
    );
  }

  if (inviteInvalid) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AuthCard>
          <h1 className="text-xl font-semibold text-foreground">Invite link invalid</h1>
          <p className="mt-2 text-sm text-muted">
            This vendor invite link is invalid or has expired. Ask your property manager to resend it, or
            sign up without an invite below.
          </p>
          <Button
            type="button"
            className="mt-6 w-full rounded-full py-2.5 text-[15px] font-semibold"
            onClick={() => router.push("/auth/vendor-register")}
          >
            Sign up as a vendor
          </Button>
        </AuthCard>
      </main>
    );
  }

  if (pendingConfirmation) {
    return (
      <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
        <AuthCard>
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="mt-2 text-sm text-muted">
            We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to finish creating your
            vendor account.
          </p>
          {devConfirmLink ? (
            <p className="mt-4 rounded-md border border-border bg-card/40 p-3 text-xs text-muted">
              {confirmLinkNotice}
              <br />
              <a className="break-all font-semibold text-primary" href={devConfirmLink}>
                {devConfirmLink}
              </a>
            </p>
          ) : null}
        </AuthCard>
      </main>
    );
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <AuthCard>
        <h1 className="text-xl font-semibold text-foreground">Become an Axis vendor</h1>
        <p className="mt-1 text-sm text-muted">Create your account to see work orders offered to you.</p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-email">
              Email
            </label>
            <Input
              id="vendor-email"
              type="email"
              className="mt-1.5"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={Boolean(inviteToken)}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-name">
              Full name
            </label>
            <Input
              id="vendor-name"
              type="text"
              className="mt-1.5"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <label className={FIELD_LABEL_CLASS} htmlFor="vendor-password">
              Password
            </label>
            <PasswordInput
              id="vendor-password"
              className="mt-1.5"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <Button
            type="button"
            className="w-full rounded-full py-3 text-base font-semibold"
            onClick={submit}
            disabled={busy}
            data-attr="vendor-signup-submit"
            event="vendor_signup_submitted"
          >
            {busy ? "Creating account…" : "Create vendor account"}
          </Button>
        </div>

        <HideOnNative>
          <p className="mt-5 text-center text-[12px] text-muted">
            <Link
              className="font-semibold text-muted transition hover:text-foreground"
              href="/"
              data-attr="auth-back-to-home"
            >
              ← Back to home
            </Link>
          </p>
        </HideOnNative>
      </AuthCard>
    </main>
  );
}
