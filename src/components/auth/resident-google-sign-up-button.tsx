"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { persistResidentSignupAxisId } from "@/lib/auth/resident-oauth-storage";

export function ResidentGoogleSignUpButton({
  axisId,
  disabled = false,
}: {
  axisId: string;
  disabled?: boolean;
}) {
  const trimmed = axisId.trim();
  const canUseGoogle = trimmed.length > 0;

  return (
    <>
      <GoogleSignInButton
        label="Continue with Google"
        fixedCallbackPath="/auth/callback/resident-signup"
        viaContinue={false}
        disabled={disabled || !canUseGoogle}
        onBeforeRedirect={() => {
          persistResidentSignupAxisId(trimmed);
        }}
      />
      {!canUseGoogle ? (
        <p className="mt-2 text-center text-xs text-muted">Enter your Axis ID above to enable Google signup.</p>
      ) : (
        <p className="mt-2 text-center text-xs text-muted">
          Use the same Google account email as your rental application.
        </p>
      )}
    </>
  );
}
