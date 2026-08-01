"use client";

import { friendlyOAuthErrorMessage, parseOAuthErrorFromUrl } from "@/lib/auth/parse-oauth-error";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Supabase OAuth failures redirect to Site URL (/) with error query/hash params.
 * Forward users to sign-in with a readable message and strip error params from the URL.
 */
export function AuthOAuthErrorHandler() {
  const router = useRouter();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current || typeof window === "undefined") return;

    const oauthError = parseOAuthErrorFromUrl(window.location.href);
    if (!oauthError) return;

    // `?error=oauth&message=…` is OUR OWN shape — `nativeOAuthSignInFailureUrl` emits it and the
    // `message` is already user-facing copy. This handler only knows how to turn genuine
    // Supabase/Google params (server_error, access_denied, …) into copy, so re-running it here
    // would replace an actionable hint with the generic string and throw away the reason.
    if (oauthError.error === "oauth") return;

    handledRef.current = true;
    const message = friendlyOAuthErrorMessage(oauthError);
    const params = new URLSearchParams({ error: "oauth", message });
    router.replace(`/auth/sign-in?${params.toString()}`);
  }, [router]);

  return null;
}
