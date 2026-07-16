"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthDivider, AuthLegalConsent } from "@/components/auth/auth-mobile-primitives";
import { VendorAppleSignUpButton } from "@/components/auth/vendor-apple-sign-up-button";
import { VendorGoogleSignUpButton } from "@/components/auth/vendor-google-sign-up-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FIELD_LABEL_CLASS } from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";

type RegisterResponse = {
  error?: string;
  redirectTo?: string;
  confirmed?: boolean;
  emailDeliveryConfigured?: boolean;
  confirmLinkLoggedLocally?: boolean;
};

/** Vendor account creation — Google or email/password; reused in auth hub, invite page, and public marketing. */
export function VendorSignupForm({
  inviteToken,
  initialEmail = "",
  initialFullName = "",
  nextPath = "/vendor/dashboard",
  variant = "default",
  disabled = false,
  hideLegalFooter = false,
}: {
  inviteToken?: string;
  initialEmail?: string;
  initialFullName?: string;
  nextPath?: string;
  /** Hub-style signup matches resident create-account layout. */
  variant?: "default" | "compact";
  disabled?: boolean;
  hideLegalFooter?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [localDevConfirmHint, setLocalDevConfirmHint] = useState(false);

  const compact = variant === "compact";
  const locked = disabled || busy;
  const resolvedNext = nextPath.startsWith("/") ? nextPath : "/vendor/dashboard";

  const submit = async () => {
    setError(null);
    if (compact && !inviteToken && (!email.trim() || password.length < 8)) {
      showToast("Enter your email and an 8+ character password.");
      return;
    }
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
            ? { token: inviteToken, password, fullName: initialFullName.trim() || undefined }
            : { email: email.trim(), password },
        ),
      });
      const body = (await res.json()) as RegisterResponse;
      if (!res.ok) {
        setLocalDevConfirmHint(body.confirmLinkLoggedLocally === true);
        setError(body.error ?? "Could not create vendor account.");
        return;
      }

      if (body.confirmed === false) {
        setPendingConfirmation(true);
        setLocalDevConfirmHint(false);
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
      const fallback = body.redirectTo?.startsWith("/") ? body.redirectTo : resolvedNext;
      await navigateAfterRoleSignup(fallback);
    } catch {
      setError("Could not create vendor account.");
    } finally {
      setBusy(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-foreground">Check your email</h3>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <strong>{email.trim()}</strong>. Click it to finish creating your vendor
          account.
        </p>
      </div>
    );
  }

  const socialBlock = (
    <div className="space-y-3">
      <VendorAppleSignUpButton inviteToken={inviteToken} nextPath={resolvedNext} disabled={locked} />
      <VendorGoogleSignUpButton inviteToken={inviteToken} nextPath={resolvedNext} disabled={locked} />
    </div>
  );

  const passwordFieldsCompact = (
    <>
      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={Boolean(inviteToken) || locked}
      />
      <PasswordInput
        autoComplete="new-password"
        placeholder="Password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={locked}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
      />
    </>
  );

  const passwordFieldsDefault = (
    <>
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
          disabled={Boolean(inviteToken) || locked}
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
          disabled={locked}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </div>
    </>
  );

  if (compact) {
    return (
      <div className="vendor-signup-form space-y-2.5 sm:space-y-3">
        <p className="text-center text-[11px] leading-tight text-muted whitespace-nowrap sm:text-xs">
          Free vendor account — work orders &amp; payouts through PropLane.
        </p>

        {socialBlock}

        <AuthDivider label="or enter your details" />

        {passwordFieldsCompact}

        <Button
          type="button"
          data-attr="vendor-signup-submit"
          className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
          disabled={locked}
          onClick={() => void submit()}
          event="vendor_signup_submitted"
        >
          {busy ? "Creating…" : "Create vendor account"}
        </Button>

        {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}
        {localDevConfirmHint ? (
          <p className="text-center text-xs text-muted">
            Local dev only: check the server console for the confirmation link.
          </p>
        ) : null}

        {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {socialBlock}
      <AuthDivider label="or enter your details" />
      {passwordFieldsDefault}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {localDevConfirmHint ? (
        <p className="text-xs text-muted">Local dev only: check the server console for the confirmation link.</p>
      ) : null}
      <Button
        type="button"
        className="w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void submit()}
        disabled={locked}
        data-attr="vendor-signup-submit"
        event="vendor_signup_submitted"
      >
        {busy ? "Creating account…" : "Create vendor account"}
      </Button>
      {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
    </div>
  );
}
