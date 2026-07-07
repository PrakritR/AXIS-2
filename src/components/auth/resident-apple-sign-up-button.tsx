"use client";

import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import {
  persistResidentSignupAxisId,
  persistResidentSignupNext,
} from "@/lib/auth/resident-oauth-storage";

export function ResidentAppleSignUpButton({
  axisId,
  nextPath,
  disabled = false,
}: {
  axisId?: string;
  nextPath?: string;
  disabled?: boolean;
}) {
  const trimmed = axisId?.trim() ?? "";
  const trimmedNext = nextPath?.trim() ?? "";

  return (
    <AppleSignInButton
      label="Continue with Apple"
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
