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

    handledRef.current = true;
    const message = friendlyOAuthErrorMessage(oauthError);
    const params = new URLSearchParams({ error: "oauth", message });
    router.replace(`/auth/sign-in?${params.toString()}`);
  }, [router]);

  return null;
}
