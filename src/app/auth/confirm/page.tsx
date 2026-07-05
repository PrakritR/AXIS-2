"use client";

import { AuthCard } from "@/components/auth/auth-card";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const VALID_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function parseEmailOtpType(raw: string | null): EmailOtpType | null {
  return VALID_TYPES.includes(raw as EmailOtpType) ? (raw as EmailOtpType) : null;
}

/**
 * Exchanges an emailed confirmation token for a session via `verifyOtp` — this app's
 * browser client is PKCE-only, so it can't pick up Supabase's hosted verify redirect
 * (which appends session tokens as an implicit-flow URL hash). Works regardless of flow type.
 */
function ConfirmContent() {
  const searchParams = useSearchParams();
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get("token_hash");
    const type = parseEmailOtpType(searchParams.get("type"));
    if (!tokenHash || !type) {
      setErrorText("This confirmation link is invalid or has expired.");
      return;
    }
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (cancelled) return;
      if (error) {
        setErrorText("This confirmation link is invalid or has expired.");
        return;
      }
      window.location.replace("/auth/continue");
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (errorText) {
    return (
      <AuthCard>
        <h1 className="text-center text-[22px] font-bold tracking-tight text-foreground">Link invalid</h1>
        <p className="mt-2 text-center text-sm text-muted">{errorText}</p>
        <Link
          className="mt-8 flex w-full justify-center text-sm font-semibold text-primary hover:opacity-90"
          href="/auth/sign-in"
        >
          ← Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <p className="text-center text-sm text-muted">Confirming your account…</p>
    </AuthCard>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <AuthCard>
          <p className="text-center text-sm text-muted">Confirming your account…</p>
        </AuthCard>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
