"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { AuthDivider, AuthLegalConsent } from "@/components/auth/auth-mobile-primitives";
import { ResidentAppleSignUpButton } from "@/components/auth/resident-apple-sign-up-button";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";

/** Resident account creation — Google or email/password, then apply inside the portal. */
export function ResidentSignupForm({
  nextPath = "/resident/applications/apply",
  initialEmail = "",
  disabled = false,
  hideLegalFooter = false,
}: {
  nextPath?: string;
  initialEmail?: string;
  disabled?: boolean;
  hideLegalFooter?: boolean;
}) {
  const { showToast } = useAppUi();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const locked = disabled || busy;
  const resolvedNext = nextPath.startsWith("/") ? nextPath : "/resident/applications/apply";

  const submit = async () => {
    if (!email.trim() || password.length < 8) {
      showToast("Enter your email and an 8+ character password.");
      return;
    }
    setErrorText(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/resident-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });
      const body = (await res.json()) as {
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok) {
        setErrorText(body.error ?? "Could not create resident account.");
        showToast(body.error ?? "Could not create resident account.");
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        showToast("Resident account created. Sign in with your email.");
        return;
      }
      if (signInData?.user) posthog.identify(signInData.user.id);
      const fallback =
        resolvedNext ||
        (body.redirectTo?.startsWith("/") ? body.redirectTo : "/resident/applications/apply");
      await navigateAfterRoleSignup(fallback);
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="resident-signup-form space-y-2.5 sm:space-y-3">
      <p className="text-center text-[11px] leading-tight text-muted whitespace-nowrap sm:text-xs">
        Create an account, then apply in the portal.
      </p>

      <div className="space-y-2.5 sm:space-y-3">
        <ResidentAppleSignUpButton nextPath={resolvedNext} disabled={locked} />
        <ResidentGoogleSignUpButton nextPath={resolvedNext} disabled={locked} />
      </div>

      <AuthDivider label="or enter your details" />

      <Input
        type="email"
        autoComplete="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={locked}
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

      <Button
        type="button"
        data-attr="resident-signup-submit"
        className="btn-cobalt w-full rounded-full py-2.5 text-[15px] font-semibold"
        disabled={locked}
        onClick={() => void submit()}
        event="resident_signup_submitted"
      >
        {busy ? "Creating…" : "Create resident account"}
      </Button>

      {errorText ? <p className="text-center text-xs text-rose-600">{errorText}</p> : null}

      {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
    </div>
  );
}
