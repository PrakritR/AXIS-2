"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  persistResidentSignupAxisId,
  persistResidentSignupNext,
} from "@/lib/auth/resident-oauth-storage";

export function ResidentGoogleSignUpButton({
  axisId,
  nextPath,
  disabled = false,
}: {
  /** Optional — a manager application link may pass an Axis ID; signup links by email either way. */
  axisId?: string;
  /** Post-signup redirect (e.g. in-portal apply with a pre-selected property). */
  nextPath?: string;
  disabled?: boolean;
}) {
  const trimmed = axisId?.trim() ?? "";
  const trimmedNext = nextPath?.trim() ?? "";

  return (
    <GoogleSignInButton
      label="Continue with Google"
      intent="resident"
      fixedCallbackPath="/auth/callback/resident-signup"
      viaContinue={false}
      disabled={disabled}
      onBeforeRedirect={() => {
        if (trimmed) persistResidentSignupAxisId(trimmed);
        if (trimmedNext.startsWith("/")) persistResidentSignupNext(trimmedNext);
      }}
    />
  );
}
