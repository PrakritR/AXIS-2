"use client";

import posthog from "posthog-js";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleSignedInBanner } from "@/components/auth/google-signed-in-banner";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { managerOauthFinishPath } from "@/lib/auth/manager-oauth-finish-path";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { managerSignupFinishPhrase } from "@/lib/manager-access";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { MANAGER_PRICING_ENTRY_PATH } from "@/lib/auth/manager-pricing-entry-path";
import {
  BANNER_INFO_CLASS,
  BANNER_NEUTRAL_CLASS,
  BANNER_WARNING_CLASS,
  FIELD_LABEL_CLASS,
  READONLY_INPUT_CLASS,
} from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function Req() {
  return <span className="text-danger"> *</span>;
}

type ManagerCheckoutPreview = {
  managerId: string;
  email: string;
  fullName: string | null;
  tier: string;
};

type ExistingEmailStatus = {
  exists: boolean;
  roles: string[];
};

type CreateAccountRole = "resident" | "manager";

function parseCreateAccountRole(value: string | null): CreateAccountRole {
  return value === "manager" ? "manager" : "resident";
}

export default function CreateAccountClient() {
  const { showToast } = useAppUi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = useMemo(() => searchParams.get("session_id")?.trim() ?? "", [searchParams]);
  const roleFromUrl = useMemo(() => parseCreateAccountRole(searchParams.get("role")), [searchParams]);
  const axisIdFromUrl = useMemo(
    () => searchParams.get("axis_id")?.trim() || "",
    [searchParams],
  );
  const emailFromUrl = useMemo(
    () => searchParams.get("email")?.trim().toLowerCase() || "",
    [searchParams],
  );
  const nextFromUrl = useMemo(() => {
    const raw = searchParams.get("next")?.trim() ?? "";
    return raw.startsWith("/") ? raw : "";
  }, [searchParams]);
  const urlDerivedRole: CreateAccountRole = axisIdFromUrl
    ? "resident"
    : sessionIdFromUrl
      ? "manager"
      : roleFromUrl;

  const [role, setRole] = useState<CreateAccountRole>(urlDerivedRole);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [axisId, setAxisId] = useState(axisIdFromUrl);
  const [busy, setBusy] = useState(false);
  const [checkoutPreview, setCheckoutPreview] = useState<ManagerCheckoutPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<ExistingEmailStatus | null>(null);
  const [emailStatusLoading, setEmailStatusLoading] = useState(false);
  const [prevRoleFromUrl, setPrevRoleFromUrl] = useState(roleFromUrl);
  const [googleSessionEmail, setGoogleSessionEmail] = useState<string | null>(null);
  const [googleSessionName, setGoogleSessionName] = useState<string | null>(null);
  const [googleSessionLoading, setGoogleSessionLoading] = useState(true);

  if (sessionIdFromUrl || axisIdFromUrl) {
    if (role !== urlDerivedRole) setRole(urlDerivedRole);
  } else if (roleFromUrl !== prevRoleFromUrl) {
    setPrevRoleFromUrl(roleFromUrl);
    if (role !== roleFromUrl) setRole(roleFromUrl);
  }

  if (axisIdFromUrl && axisId !== axisIdFromUrl) {
    setAxisId(axisIdFromUrl);
  }

  if (emailFromUrl && email !== emailFromUrl && role === "resident") {
    setEmail(emailFromUrl);
  }

  useEffect(() => {
    void Promise.resolve().then(() => {
      void fetch("/api/auth/manager-onboarding-status", { credentials: "include", cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return null;
          return (await res.json()) as {
            authenticated?: boolean;
            email?: string;
            fullName?: string | null;
            isGoogle?: boolean;
          };
        })
        .then((body) => {
          if (body?.authenticated && body.email) {
            setGoogleSessionEmail(body.email);
            setGoogleSessionName(body.fullName ?? null);
            if (!email.trim()) setEmail(body.email);
            if (!fullName.trim() && body.fullName) setFullName(body.fullName);
          }
        })
        .finally(() => setGoogleSessionLoading(false));
    });
  }, [email, fullName]);

  const googleSignedIn = Boolean(googleSessionEmail);
  const lockResidentEmail = role === "resident" && Boolean(axisIdFromUrl && emailFromUrl.includes("@"));

  const normalEmail = email.trim().toLowerCase();
  const isEmailCheckable = normalEmail.length > 0 && normalEmail.includes("@");
  const displayedEmailStatus = isEmailCheckable ? emailStatus : null;
  const displayedEmailStatusLoading = isEmailCheckable ? emailStatusLoading : false;

  const shouldLoadCheckout = role === "manager" && !!sessionIdFromUrl;
  const effectiveCheckoutPreview = shouldLoadCheckout ? checkoutPreview : null;
  const effectivePreviewError = shouldLoadCheckout ? previewError : null;
  const effectivePreviewLoading = shouldLoadCheckout ? previewLoading : false;

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!shouldLoadCheckout) {
        setConfirmPassword("");
      }
    });
  }, [shouldLoadCheckout]);

  useEffect(() => {
    if (!isEmailCheckable) return;

    const controller = new AbortController();

    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setEmailStatusLoading(true);
    });

    void fetch(`/api/auth/account-email-status?email=${encodeURIComponent(normalEmail)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as ExistingEmailStatus & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Could not check email.");
        if (!controller.signal.aborted) {
          setEmailStatus({ exists: Boolean(body.exists), roles: Array.isArray(body.roles) ? body.roles : [] });
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setEmailStatus(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setEmailStatusLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [isEmailCheckable, normalEmail]);

  useEffect(() => {
    if (!shouldLoadCheckout) return;

    const controller = new AbortController();

    void Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setPreviewLoading(true);
      setPreviewError(null);
      setCheckoutPreview(null);
    });

    void fetch(`/api/auth/manager-checkout-preview?session_id=${encodeURIComponent(sessionIdFromUrl)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as ManagerCheckoutPreview & { error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? "Could not load checkout session.");
        }
        if (!controller.signal.aborted) {
          setCheckoutPreview({
            managerId: body.managerId,
            email: body.email,
            fullName: body.fullName ?? null,
            tier: body.tier ?? "pro",
          });
        }
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setPreviewError(e instanceof Error ? e.message : "Could not load checkout session.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setPreviewLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [shouldLoadCheckout, sessionIdFromUrl]);

  const managerPostCheckout = role === "manager" && !!sessionIdFromUrl && !!effectiveCheckoutPreview;
  const managerNeedsPricing = role === "manager" && !sessionIdFromUrl;
  const isAxisIntentSignup = sessionIdFromUrl.startsWith("axis_intent_");
  const existingAccountRoles = useMemo(() => {
    if (!displayedEmailStatus?.exists) return [];
    return displayedEmailStatus.roles.filter((r) => r !== role);
  }, [displayedEmailStatus, role]);
  const reusingExistingAccount = Boolean(displayedEmailStatus?.exists);
  const passwordLabel = reusingExistingAccount ? "Password" : "Create password";
  const existingAccountHint =
    role === "resident" && reusingExistingAccount
      ? "This email already has an Axis login. Enter that account's password to add resident access."
      : reusingExistingAccount && existingAccountRoles.length
        ? `This email already has Axis access for ${existingAccountRoles.map((r) => r[0]!.toUpperCase() + r.slice(1)).join(", ")}. Use the same password to add ${role} access to that login.`
        : reusingExistingAccount
          ? "This email already has an Axis login. Use the same password for that account."
          : null;

  const submit = async () => {
    if (managerPostCheckout && effectiveCheckoutPreview) {
      if (password.length < 8) {
        showToast("Enter a valid password (8+ characters).");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        const res = await fetch("/api/auth/manager-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sessionIdFromUrl, password }),
        });
        const body = (await res.json()) as { error?: string; managerId?: string };
        if (!res.ok) {
          showToast(body.error ?? "Could not create account.");
          return;
        }
        // Sign the just-created manager straight in with the password they set here —
        // no reason to bounce back through the sign-in screen after paying.
        const supabase = createSupabaseBrowserClient();
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: effectiveCheckoutPreview.email,
          password,
        });
        if (signInError || !signInData?.user) {
          showToast(`Account ready. Account ID ${body.managerId ?? effectiveCheckoutPreview.managerId}. Sign in with your email.`);
          router.push("/auth/sign-in");
          return;
        }
        posthog.identify(signInData.user.id);
        showToast(`Account ready. Account ID ${body.managerId ?? effectiveCheckoutPreview.managerId}.`);
        window.location.replace("/portal/dashboard");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sign up failed";
        showToast(msg);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (role === "manager" && sessionIdFromUrl && !effectiveCheckoutPreview) {
      showToast(effectivePreviewLoading ? "Still loading checkout details…" : "Fix checkout session or start from Partner pricing.");
      return;
    }

    // New manager signup — creates pending account, then pricing for tier selection.
    if (role === "manager" && !sessionIdFromUrl) {
      if (!fullName.trim() || !email.trim()) {
        showToast("Enter your full name and email.");
        return;
      }
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
        const res = await fetch("/api/auth/manager-register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim() }),
        });
        const body = (await res.json()) as { error?: string; redirectTo?: string; existingAccount?: boolean };
        if (!res.ok) {
          showToast(body.error ?? "Could not create manager account.");
          return;
        }
        const supabase = createSupabaseBrowserClient();
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          showToast("Account created. Sign in to choose your plan.");
          router.push("/auth/sign-in");
          return;
        }
        if (signInData?.user) {
          posthog.identify(signInData.user.id);
        }
        if (body.existingAccount || body.redirectTo === "/portal/dashboard") {
          window.location.replace("/portal/dashboard");
          return;
        }
        showToast("Account created. Choose your plan next.");
        router.push(nativeAwarePath(body.redirectTo?.startsWith("/") ? body.redirectTo : MANAGER_PRICING_ENTRY_PATH));
      } catch {
        showToast("Network error.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!email.trim() || password.length < 8) {
      showToast("Enter a valid email and password (8+ characters).");
      return;
    }

    if (role !== "resident") {
      showToast("Manager signup starts from Partner pricing.");
      return;
    }

    setBusy(true);
    try {
      // Email-only resident signup: the application is matched by email, so no Axis ID
      // is required. Existing logins are verified by password (never silently reset).
      const res = await fetch("/api/auth/resident-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          fullName: fullName.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        linkedApplication?: boolean;
        axisId?: string;
        redirectTo?: string;
      };
      if (!res.ok) {
        showToast(body.error ?? "Could not create resident account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: residentSignInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        showToast("Resident account created. Sign in with your email.");
        router.push("/auth/sign-in");
        return;
      }
      if (residentSignInData?.user) {
        posthog.identify(residentSignInData.user.id);
      }
      showToast("Resident account created. You are signed in.");
      const destination =
        nextFromUrl ||
        (body.redirectTo?.startsWith("/") ? body.redirectTo : "/resident/applications/apply");
      router.push(nativeAwarePath(destination));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Sign up failed";
      showToast(msg);
    } finally {
      setBusy(false);
    }
  };

  const readOnlyInputClass = READONLY_INPUT_CLASS;

  return (
    <AuthCard>
      <h1 className="text-center text-[22px] font-bold tracking-tight text-foreground">Create account</h1>

      <div className="mt-7">
        <label className={FIELD_LABEL_CLASS} htmlFor="account-type">
          Portal type
        </label>
        <Select
          id="account-type"
          className="mt-1.5"
          value={role}
          disabled={!!sessionIdFromUrl}
          onChange={(e) => setRole(parseCreateAccountRole(e.target.value))}
        >
          <option value="resident">Resident</option>
          <option value="manager">Manager</option>
        </Select>
      </div>

      <div className={`mt-6 ${BANNER_NEUTRAL_CLASS}`}>
        {managerPostCheckout ? (
          <>
            {isAxisIntentSignup ? (
              <>
                Your <span className="font-semibold text-foreground">account ID</span> is reserved for this signup—use it
                when you need support. Set a password below to finish {managerSignupFinishPhrase(effectiveCheckoutPreview?.tier)}.
              </>
            ) : (
              <>
                Payment confirmed. Your <span className="font-semibold text-foreground">account ID</span> is tied to this
                checkout. Set a password below to finish {managerSignupFinishPhrase(effectiveCheckoutPreview?.tier)}.
              </>
            )}
          </>
        ) : role === "resident" ? (
          <>
            Use the same email address from your rental application. Axis links your account to that application
            automatically—no extra steps needed. After signup, your resident portal stays limited until an Axis manager
            marks your application fee paid and approves your application.
          </>
        ) : (
          <>
            Create your manager login below, then choose Free, Pro, or Business on{" "}
            <Link className="font-semibold text-primary hover:opacity-90" href={nativeAwarePath("/partner/pricing")}>
              Partner pricing
            </Link>
            . Free goes straight to your portal; Pro and Business open secure Stripe checkout.
          </>
        )}
      </div>

      {role === "manager" && sessionIdFromUrl && effectivePreviewLoading ? (
        <p className="mt-6 text-center text-sm text-muted">Loading checkout details…</p>
      ) : null}

      {role === "manager" && sessionIdFromUrl && effectivePreviewError ? (
        <div className={`mt-6 ${BANNER_WARNING_CLASS}`}>
          <p>{effectivePreviewError}</p>
          <Link className="mt-3 inline-block font-semibold text-primary hover:underline" href={nativeAwarePath("/partner/pricing")}>
            Back to Partner pricing
          </Link>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {existingAccountHint ? (
          <div className={BANNER_INFO_CLASS}>
            {existingAccountHint}
          </div>
        ) : null}

        {managerPostCheckout && effectiveCheckoutPreview ? (
          <>
            <div className="mb-2">
              <GoogleSignInButton
                label="Continue with Google"
                nextPath={managerOauthFinishPath(sessionIdFromUrl)}
                viaContinue={false}
                disabled={busy}
              />
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-border" aria-hidden />
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">or set a password</span>
                <div className="h-px flex-1 bg-border" aria-hidden />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="manager-id">
                Account ID
              </label>
              <Input
                id="manager-id"
                readOnly
                className={`font-mono text-[13px] ${readOnlyInputClass}`}
                value={effectiveCheckoutPreview.managerId}
                tabIndex={-1}
              />
            </div>
            {effectiveCheckoutPreview.fullName ? (
              <div>
                <label className={FIELD_LABEL_CLASS} htmlFor="mgr-name">
                  Full name
                </label>
                <Input id="mgr-name" readOnly className={readOnlyInputClass} value={effectiveCheckoutPreview.fullName} tabIndex={-1} />
              </div>
            ) : null}
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-email">
                Email
                <Req />
              </label>
              <Input
                id="mgr-email"
                readOnly
                className={readOnlyInputClass}
                type="email"
                value={effectiveCheckoutPreview.email}
                tabIndex={-1}
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-pw">
                {passwordLabel}
                <Req />
              </label>
              <PasswordInput
                id="mgr-pw"
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-pw2">
                Confirm password
                <Req />
              </label>
              <PasswordInput
                id="mgr-pw2"
                className="mt-1.5"
                autoComplete="off"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </>
        ) : managerNeedsPricing ? (
          <>
            {googleSignedIn && googleSessionEmail ? (
              <>
                <GoogleSignedInBanner
                  email={googleSessionEmail}
                  fullName={googleSessionName}
                  subtitle="Your Google account is linked. Choose Free, Pro, or Business on Partner pricing — no password needed."
                />
                <div className="mt-6 flex justify-center">
                  <Link
                    href={nativeAwarePath("/partner/pricing")}
                    className="btn-cobalt inline-flex rounded-full px-6 py-3 text-sm font-semibold"
                  >
                    Continue to Partner pricing
                  </Link>
                </div>
              </>
            ) : (
              <>
                <GoogleSignInButton
                  label="Continue with Google"
                  nextPath="/auth/manager-register-oauth"
                  viaContinue={false}
                  disabled={busy || googleSessionLoading}
                />
                <div className="my-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" aria-hidden />
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">or set a password</span>
                  <div className="h-px flex-1 bg-border" aria-hidden />
                </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-name-input">
                Full name <Req />
              </label>
              <Input
                id="mgr-name-input"
                className="mt-1.5"
                placeholder="Your name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-email-input">
                Email <Req />
              </label>
              <Input
                id="mgr-email-input"
                className="mt-1.5"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-pw-activate">
                {passwordLabel} <Req />
              </label>
              <PasswordInput
                id="mgr-pw-activate"
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="mgr-pw2-activate">
                Confirm password <Req />
              </label>
              <PasswordInput
                id="mgr-pw2-activate"
                className="mt-1.5"
                autoComplete="off"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
              </>
            )}
          </>
        ) : (
          <>
            {role === "resident" ? (
              <div>
                {googleSignedIn && googleSessionEmail ? (
                  <div className="mb-4">
                    <GoogleSignedInBanner
                      email={googleSessionEmail}
                      fullName={googleSessionName}
                      subtitle="Continue with Google below to finish setting up your resident account."
                    />
                  </div>
                ) : null}
                {/* Email-only resident signup — the rental application is matched by email, so
                    the Axis ID field is gone. A manager link may still pass one via the URL. */}
                <ResidentGoogleSignUpButton axisId={axisId} disabled={busy} />
                {!googleSignedIn ? (
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-border" aria-hidden />
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">or set a password</span>
                    <div className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                ) : null}
              </div>
            ) : null}
            {!googleSignedIn || role !== "resident" ? (
              <>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="email">
                Email
                <Req />
              </label>
              <Input
                id="email"
                className="mt-1.5"
                placeholder="Your email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                readOnly={lockResidentEmail}
                disabled={lockResidentEmail}
              />
              {lockResidentEmail ? (
                <p className="mt-1 text-xs text-muted/70">Must match the email on your rental application.</p>
              ) : null}
            </div>
            <div>
              <label className={FIELD_LABEL_CLASS} htmlFor="pw">
                {passwordLabel}
                <Req />
              </label>
              <PasswordInput
                id="pw"
                className="mt-1.5"
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {displayedEmailStatusLoading ? <p className="mt-1 text-xs text-muted/70">Checking for an existing Axis login…</p> : null}
            </div>
              </>
            ) : null}
          </>
        )}
      </div>

      {false ? (
        <Button type="button" className="mt-8 w-full rounded-full py-3 text-base font-semibold" onClick={() => router.push("/partner/pricing")}>
          Continue to Partner pricing
        </Button>
      ) : (
        <Button
          type="button"
          className="mt-8 w-full rounded-full py-3 text-base font-semibold"
          onClick={() => void submit()}
          disabled={
            busy ||
            googleSessionLoading ||
            (googleSignedIn && managerNeedsPricing) ||
            (googleSignedIn && role === "resident") ||
            (role === "manager" && !!sessionIdFromUrl && (effectivePreviewLoading || !!effectivePreviewError || !effectiveCheckoutPreview))
          }
        >
          {busy
            ? "Working…"
            : googleSignedIn && managerNeedsPricing
              ? "Continue on Partner pricing"
              : googleSignedIn && role === "resident"
                ? "Use Google above"
                : "Create account"}
        </Button>
      )}

      <div className="mt-6 flex justify-center">
        <Link className="text-sm font-semibold text-primary hover:opacity-90" href="/auth/sign-in">
          ← Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
