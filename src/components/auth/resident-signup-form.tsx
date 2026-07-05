"use client";

import posthog from "posthog-js";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthDivider } from "@/components/auth/auth-mobile-primitives";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Resident account creation — Google or email/password, then apply inside the portal. */
export function ResidentSignupForm({
  nextPath = "/resident/applications",
  initialEmail = "",
  showBrowseLink = false,
  disabled = false,
}: {
  nextPath?: string;
  initialEmail?: string;
  showBrowseLink?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useAppUi();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const locked = disabled || busy;
  const resolvedNext = nextPath.startsWith("/") ? nextPath : "/resident/applications";

  const submit = async () => {
    if (!fullName.trim() || !email.trim() || password.length < 8) {
      showToast("Enter your name, email, and an 8+ character password.");
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
          fullName: fullName.trim(),
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
      const destination =
        resolvedNext ||
        (body.redirectTo?.startsWith("/") ? body.redirectTo : "/resident/applications");
      window.location.replace(destination);
    } catch {
      showToast("Network error.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="resident-signup-form space-y-3">
      <p className="text-center text-xs text-muted">
        Create your account, then complete your housing application in the portal.
      </p>

      <ResidentGoogleSignUpButton nextPath={resolvedNext} disabled={locked} />

      <AuthDivider label="or enter your details" />

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

      {showBrowseLink ? (
        <>
          <AuthDivider label="or" />
          <Button
            type="button"
            variant="outline"
            data-attr="auth-hub-resident-browse"
            className="w-full rounded-full py-2.5 text-[15px] font-semibold"
            disabled={locked}
            onClick={() => router.push("/rent/browse?from=auth")}
          >
            Browse properties
          </Button>
        </>
      ) : null}
    </div>
  );
}
