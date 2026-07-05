"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthDivider } from "@/components/auth/auth-mobile-primitives";
import { VendorGoogleSignUpButton } from "@/components/auth/vendor-google-sign-up-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FIELD_LABEL_CLASS } from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type RegisterResponse = {
  error?: string;
  redirectTo?: string;
  confirmed?: boolean;
  emailDeliveryConfigured?: boolean;
  confirmLink?: string;
};

/** Vendor account creation — Google or email/password; reused in auth hub, invite page, and public marketing. */
export function VendorSignupForm({
  inviteToken,
  initialEmail = "",
  initialFullName = "",
  nextPath = "/vendor/dashboard",
  variant = "default",
  disabled = false,
}: {
  inviteToken?: string;
  initialEmail?: string;
  initialFullName?: string;
  nextPath?: string;
  /** Hub-style signup matches resident create-account layout. */
  variant?: "default" | "compact";
  disabled?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState(initialFullName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [devConfirmLink, setDevConfirmLink] = useState<string | null>(null);
  const [confirmLinkNotice, setConfirmLinkNotice] = useState<string | null>(null);

  const compact = variant === "compact";
  const locked = disabled || busy;
  const resolvedNext = nextPath.startsWith("/") ? nextPath : "/vendor/dashboard";

  const submit = async () => {
    setError(null);
    if (compact && !inviteToken && (!fullName.trim() || !email.trim() || password.length < 8)) {
      showToast("Enter your name, email, and an 8+ character password.");
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
      window.location.replace(body.redirectTo?.startsWith("/") ? body.redirectTo : resolvedNext);
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
        {devConfirmLink ? (
          <p className="mt-4 rounded-md border border-border bg-card/40 p-3 text-xs text-muted">
            {confirmLinkNotice}
            <br />
            <a className="break-all font-semibold text-primary" href={devConfirmLink}>
              {devConfirmLink}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  const googleBlock = (
    <VendorGoogleSignUpButton
      inviteToken={inviteToken}
      nextPath={resolvedNext}
      disabled={locked}
    />
  );

  const passwordFieldsCompact = (
    <>
      <Input
        placeholder="Full name"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        disabled={locked}
      />
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
        <label className={FIELD_LABEL_CLASS} htmlFor="vendor-name">
          Full name
        </label>
        <Input
          id="vendor-name"
          type="text"
          className="mt-1.5"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={locked}
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
      <div className="vendor-signup-form space-y-3">
        <p className="text-center text-xs text-muted">
          Create a vendor account to see work orders offered to you, track scheduled visits, and message your
          property manager directly.
        </p>

        {googleBlock}

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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {googleBlock}
      <AuthDivider label="or enter your details" />
      {passwordFieldsDefault}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
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
    </div>
  );
}
