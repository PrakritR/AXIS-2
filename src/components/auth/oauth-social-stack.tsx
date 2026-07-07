"use client";

import { AppleSignInButton } from "@/components/auth/apple-sign-in-button";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import type { OAuthSignInIntent } from "@/lib/auth/post-oauth-routing";
import type { ReactNode } from "react";

type OAuthStackProps = {
  nextPath?: string;
  disabled?: boolean;
  viaContinue?: boolean;
  fixedCallbackPath?: string;
  intent?: OAuthSignInIntent | null;
  onBeforeRedirect?: () => void;
  googleLabel?: string;
  /** Override the default sign-in Apple button (resident/vendor/manager signup). */
  appleSlot?: ReactNode;
};

/** Apple first, then Google — legal copy belongs at the bottom of the screen. */
export function OAuthSocialStack({
  nextPath = "",
  disabled = false,
  viaContinue = true,
  fixedCallbackPath,
  intent = null,
  onBeforeRedirect,
  googleLabel = "Continue with Google",
  appleSlot,
}: OAuthStackProps) {
  const shared = {
    nextPath,
    disabled,
    viaContinue,
    fixedCallbackPath,
    intent,
    onBeforeRedirect,
  };

  return (
    <div className="auth-oauth-stack space-y-3">
      {appleSlot ?? <AppleSignInButton label="Continue with Apple" {...shared} />}
      <GoogleSignInButton label={googleLabel} {...shared} />
    </div>
  );
}
