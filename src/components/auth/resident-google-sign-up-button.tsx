"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { persistResidentSignupAxisId } from "@/lib/auth/resident-oauth-storage";

export function ResidentGoogleSignUpButton({
  axisId,
  disabled = false,
}: {
  /** Optional — a manager application link may pass an Axis ID; signup links by email either way. */
  axisId?: string;
  disabled?: boolean;
}) {
  const trimmed = axisId?.trim() ?? "";

  return (
    <>
      <GoogleSignInButton
        label="Continue with Google"
        intent="resident"
        fixedCallbackPath="/auth/callback/resident-signup"
        viaContinue={false}
        disabled={disabled}
        onBeforeRedirect={() => {
          // Only meaningful when a manager link supplied an Axis ID; otherwise the finish
          // step links the resident to their application by email.
          if (trimmed) persistResidentSignupAxisId(trimmed);
        }}
      />
      <p className="auth-choice-hint mt-1.5 text-center text-[11px] text-muted sm:mt-2 sm:text-xs">
        Use the same email as your application
      </p>
    </>
  );
}
