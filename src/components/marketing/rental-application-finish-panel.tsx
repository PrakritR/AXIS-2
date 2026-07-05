"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";

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
  const signInHref = `/auth/sign-in?intent=resident&next=${encodeURIComponent("/resident/applications")}`;

  return (
    <div className="application-finish-panel relative mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur-md sm:mt-8 sm:rounded-3xl sm:p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(47,107,255,0.45),transparent)]"
        aria-hidden
      />
      <AuthPageHeader
        eyebrow="Done"
        title="Application submitted"
        subtitle={email ? `Confirmation for ${email}` : "Sign in to track your application in the resident portal."}
      />

      {syncError ? (
        <p className="mt-2 text-center text-[12px] text-amber-800 sm:text-sm">Sync issue — sign in to confirm your application status.</p>
      ) : null}

      {email && emailSent ? (
        <p className="application-finish-detail mt-2 text-center text-[12px] text-muted sm:text-sm">Emailed to {email}</p>
      ) : null}

      <p className="mt-3 text-center font-mono text-xs text-muted">{axisId}</p>

      <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
        <Link
          href={signInHref}
          className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
        >
          Sign in to resident portal
        </Link>
      </div>

      <div className="mt-3 flex justify-center sm:mt-4">
        <Button type="button" variant="ghost" className="h-9 px-4 text-[13px] sm:h-10 sm:text-sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
