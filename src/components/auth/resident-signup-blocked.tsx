"use client";

import Link from "next/link";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";

/** Shown when someone tries to create a resident account without an emailed setup link. */
export function ResidentSignupBlocked({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <AuthPageHeader
        eyebrow="Resident"
        title="Apply first"
        subtitle="Resident accounts are created from the setup link we email after you submit a rental application."
      />
      <div className="space-y-2.5">
        <Link
          href="/rent/browse"
          className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold"
        >
          Browse homes & apply
        </Link>
        <Link
          href="/auth/sign-in?intent=resident&next=/resident/applications"
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold text-foreground"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
