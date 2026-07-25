"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import {
  persistResidentSignupAxisId,
  persistResidentSignupNext,
  persistResidentSignupSetupToken,
} from "@/lib/auth/resident-oauth-storage";

export function ResidentGoogleSignUpButton({
  axisId,
  nextPath,
  setupToken,
  label = "Continue with Google",
  disabled = false,
}: {
  /** Optional — a manager application link may pass an Axis ID; signup links by email either way. */
  axisId?: string;
  /** Post-signup redirect (e.g. in-portal apply with a pre-selected property). */
  nextPath?: string;
  /**
   * Resident-setup handoff token. When present it is carried through OAuth so the
   * finish route can authorize the link (and relink a mismatched Google email).
   */
  setupToken?: string;
  label?: string;
  disabled?: boolean;
}) {
  const trimmed = axisId?.trim() ?? "";
  const trimmedNext = nextPath?.trim() ?? "";
  const trimmedToken = setupToken?.trim() ?? "";

  return (
    <GoogleSignInButton
      label={label}
      intent="resident"
      fixedCallbackPath="/auth/callback/resident-signup"
      viaContinue={false}
      disabled={disabled}
      onBeforeRedirect={() => {
        if (trimmed) persistResidentSignupAxisId(trimmed);
        if (trimmedNext.startsWith("/")) persistResidentSignupNext(trimmedNext);
        if (trimmedToken) persistResidentSignupSetupToken(trimmedToken);
      }}
    />
  );
}
