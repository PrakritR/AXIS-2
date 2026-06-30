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
        <p className="auth-choice-hint mt-1.5 text-center text-[11px] text-muted sm:mt-2 sm:text-xs">Enter Axis ID first</p>
      ) : (
        <p className="auth-choice-hint mt-1.5 text-center text-[11px] text-muted sm:mt-2 sm:text-xs">
          Same email as your application
        </p>
      )}
    </>
  );
}
