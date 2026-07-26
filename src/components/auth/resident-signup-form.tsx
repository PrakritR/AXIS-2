"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthDivider, AuthLegalConsent } from "@/components/auth/auth-mobile-primitives";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { FIELD_LABEL_CLASS } from "@/lib/ui-styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { nativeAwarePath } from "@/lib/auth/native-auth-entry";
import { navigateAfterRoleSignup } from "@/lib/auth/navigate-after-role-signup";

type RegisterResponse = {
  error?: string;
  redirectTo?: string;
  axisId?: string;
  linkedApplication?: boolean;
};

/**
 * Prospective-resident account creation — Google or email/phone/password. A renter
 * creates their account, then applies from inside their portal. `nextPath` carries
 * the listing context (e.g. `/rent/apply?propertyId=…`) so signup lands them on that
 * application, not an empty dashboard. Shares the auth-hub compact skeleton with the
 * manager/vendor signup forms.
 */
export function ResidentSignupForm({
  initialEmail = "",
  nextPath = "/resident/applications",
  axisId,
  variant = "default",
  disabled = false,
  hideLegalFooter = false,
}: {
  initialEmail?: string;
  /** Post-signup redirect — in-portal apply with a pre-selected property when present. */
  nextPath?: string;
  /** A manager application link may pass an Axis ID; signup links by email either way. */
  axisId?: string;
  variant?: "default" | "compact";
  disabled?: boolean;
  hideLegalFooter?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compact = variant === "compact";
  const locked = disabled || busy;
  const resolvedNext = nextPath.startsWith("/") ? nextPath : "/resident/applications";

  const submit = async () => {
    setError(null);
    if (!email.trim().includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid phone number.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/resident-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, fullName: fullName.trim(), phone: phone.trim() }),
      });
      const body = (await res.json()) as RegisterResponse;
      if (!res.ok) {
        setError(body.error ?? "Could not create resident account.");
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
      // When a listing context was passed (Create account from a listing's apply
      // gate), land the renter ON that application inside their portal. We go
      // straight there rather than through the post-auth resolver, which would
      // pick a generic portal path and drop the propertyId.
      if (resolvedNext !== "/resident/applications") {
        window.location.replace(nativeAwarePath(resolvedNext));
        return;
      }
      await navigateAfterRoleSignup(body.redirectTo?.startsWith("/") ? body.redirectTo : resolvedNext);
    } catch {
      setError("Could not create resident account.");
    } finally {
      setBusy(false);
    }
  };

  const socialBlock = (
    <ResidentGoogleSignUpButton axisId={axisId} nextPath={resolvedNext} disabled={locked} />
  );

  const fieldsCompact = (
    <>
      <Input
        type="text"
        autoComplete="name"
        placeholder="Full name"
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
      <Input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="Phone number"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
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
    </>
  );

  const fieldsDefault = (
    <>
      <div>
        <label className={FIELD_LABEL_CLASS} htmlFor="resident-name">
          Full name
        </label>
        <Input
          id="resident-name"
          type="text"
          className="mt-1.5"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={locked}
        />
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS} htmlFor="resident-email">
          Email
        </label>
        <Input
          id="resident-email"
          type="email"
          className="mt-1.5"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={locked}
        />
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS} htmlFor="resident-phone">
          Phone number
        </label>
        <Input
          id="resident-phone"
          type="tel"
          inputMode="tel"
          className="mt-1.5"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={locked}
        />
        <p className="mt-1 text-xs text-muted/70">Used for tenancy and account text updates. Reply STOP anytime.</p>
      </div>
      <div>
        <label className={FIELD_LABEL_CLASS} htmlFor="resident-password">
          Password
        </label>
        <PasswordInput
          id="resident-password"
          className="mt-1.5"
          autoComplete="new-password"
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
      <div className="resident-signup-form space-y-2.5 sm:space-y-3">
        <p className="text-center text-[11px] leading-tight text-muted sm:text-xs">
          Free resident account · track and apply from your portal.
        </p>

        {socialBlock}

        <AuthDivider label="or enter your details" />

        {fieldsCompact}

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

        {error ? <p className="text-center text-xs text-rose-600">{error}</p> : null}

        {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {socialBlock}
      <AuthDivider label="or enter your details" />
      {fieldsDefault}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button
        type="button"
        className="w-full rounded-full py-3 text-base font-semibold"
        onClick={() => void submit()}
        disabled={locked}
        data-attr="resident-signup-submit"
        event="resident_signup_submitted"
      >
        {busy ? "Creating account…" : "Create resident account"}
      </Button>
      {!hideLegalFooter ? <AuthLegalConsent action="create" className="mt-2" /> : null}
    </div>
  );
}
