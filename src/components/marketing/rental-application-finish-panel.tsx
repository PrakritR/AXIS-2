"use client";

import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ResidentGoogleSignUpButton } from "@/components/auth/resident-google-sign-up-button";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import { Button } from "@/components/ui/button";
import { buildResidentCreateAccountHref } from "@/lib/auth/parse-resident-link";
import Link from "next/link";
import { useEffect, useState } from "react";

type FinishPanelProps = {
  axisId: string;
  email: string;
  emailSent?: boolean;
  syncError?: string;
  onDone: () => void;
};

export function RentalApplicationFinishPanel({
  axisId,
  email,
  emailSent,
  syncError,
  onDone,
}: FinishPanelProps) {
  const [emailStatusLoading, setEmailStatusLoading] = useState(Boolean(email.includes("@")));
  const [hasResidentAccount, setHasResidentAccount] = useState(false);

  useEffect(() => {
    const normalEmail = email.trim().toLowerCase();
    if (!normalEmail.includes("@")) {
      setEmailStatusLoading(false);
      return;
    }

    let cancelled = false;
    void fetch(`/api/auth/account-email-status?email=${encodeURIComponent(normalEmail)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as { exists?: boolean; roles?: string[] };
      })
      .then((body) => {
        if (cancelled || !body) return;
        const roles = Array.isArray(body.roles) ? body.roles : [];
        setHasResidentAccount(Boolean(body.exists && roles.includes("resident")));
      })
      .finally(() => {
        if (!cancelled) setEmailStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [email]);

  const createAccountHref = buildResidentCreateAccountHref(axisId, email);
  const signInHref = `/auth/sign-in?intent=resident&next=${encodeURIComponent("/resident/dashboard")}`;

  return (
    <div className="application-finish-panel relative mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur-md sm:mt-8 sm:rounded-3xl sm:p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(47,107,255,0.45),transparent)]"
        aria-hidden
      />
      <AuthPageHeader
        eyebrow="Done"
        title={hasResidentAccount ? "Sign in" : "Create account"}
        subtitle={
          hasResidentAccount
            ? `Use ${email || "your email"} to open your portal`
            : `Same email as your application${email ? ` · ${email}` : ""}`
        }
        accent={!hasResidentAccount}
      />

      {syncError ? (
        <p className="mt-2 text-center text-[12px] text-amber-800 sm:text-sm">Sync issue — you can still continue below.</p>
      ) : null}

      {email && emailSent ? (
        <p className="application-finish-detail mt-2 text-center text-[12px] text-muted sm:text-sm">Emailed to {email}</p>
      ) : null}

      <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
        {emailStatusLoading ? (
          <p className="text-center text-[13px] text-muted">Checking…</p>
        ) : hasResidentAccount ? (
          <>
            <GoogleSignInButton nextPath="/resident/dashboard" />
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] w-full rounded-full text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
              onClick={() => {
                window.location.assign(signInHref);
              }}
            >
              Email sign in
            </Button>
          </>
        ) : (
          <>
            <ResidentGoogleSignUpButton axisId={axisId} />
            <div className="auth-divider flex items-center gap-2">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">or</span>
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-transparent" aria-hidden />
            </div>
            <Link
              href={createAccountHref}
              className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
            >
              Email sign up
            </Link>
            <p className="text-center text-[12px] text-muted sm:text-xs">
              <Link className="font-semibold text-primary" href={signInHref}>
                Sign in instead
              </Link>
            </p>
          </>
        )}
      </div>

      <div className="mt-3 flex justify-center sm:mt-4">
        <Button type="button" variant="ghost" className="h-9 px-4 text-[13px] sm:h-10 sm:text-sm" onClick={onDone}>
          Later
        </Button>
      </div>
    </div>
  );
}
