"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { GroupRole } from "@/lib/rental-application/types";

type FinishPanelProps = {
  axisId: string;
  email: string;
  emailSent?: boolean;
  syncError?: string;
  /** Guest apply — offer inline account creation instead of email-only instructions. */
  guestFlow?: boolean;
  /** Mailto fallback when Resend is not configured (local/dev). */
  mailtoHref?: string;
  /** Same-session handoff to resident account setup (guest flow). */
  setupHref?: string;
  /** Shared Group ID when this was submitted as part of a group application. */
  groupId?: string;
  groupRole?: GroupRole;
  groupSize?: string;
  onDone: () => void;
};

/**
 * Group-application confirmation: the first applicant shares the Group ID; joiners see
 * they linked in. Rendered both on the finish screen and, durably, on the resident's
 * submitted application in the portal so the code can be re-read and re-shared later.
 */
export function GroupShareCallout({
  groupId,
  groupRole,
  groupSize,
  className,
  shareable = true,
}: {
  groupId: string;
  groupRole?: GroupRole;
  groupSize?: string;
  className?: string;
  /**
   * False only for a terminal application (not approved). An approved organizer whose
   * roommates have not applied yet still needs to hand out the code. The id stays
   * retrievable either way.
   */
  shareable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const size = Number.parseInt((groupSize ?? "").trim(), 10);
  const others = Number.isFinite(size) && size >= 2 ? size - 1 : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(groupId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (e.g. insecure context) — the id stays visible to copy manually.
    }
  };

  return (
    <div className={`mt-6 text-left ${className ?? ""}`}>
      <p className="text-[13px] font-semibold text-foreground">
        {!shareable
          ? "Group application"
          : groupRole === "joining"
            ? "You joined a group application"
            : "Your group is ready"}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted sm:text-sm">
        {!shareable
          ? "Your application was not approved. Your Group ID is kept here for reference."
          : groupRole === "joining"
            ? "Your application is linked to your group. Each member applies with their own account, and your manager reviews you together."
            : others != null
              ? `Share this Group ID with your ${others} ${others === 1 ? "roommate" : "roommates"} so their applications link to yours. Each of you keeps your own account.`
              : "Share this Group ID with your roommates so their applications link to yours. Each of you keeps your own account."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background/40 px-3 py-2 font-mono text-[13px] text-foreground">
          {groupId}
        </code>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 rounded-full px-4 text-xs"
          data-attr="group-id-copy"
          onClick={() => void copy()}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function RentalApplicationFinishPanel({
  axisId,
  email,
  emailSent,
  syncError,
  guestFlow = false,
  mailtoHref,
  setupHref,
  groupId,
  groupRole,
  groupSize,
  onDone,
}: FinishPanelProps) {
  const signInHref = `/auth/sign-in?intent=resident&next=${encodeURIComponent("/resident/applications")}`;
  const emailFailed = guestFlow && emailSent === false;
  const showGroup = Boolean(groupId && groupId.trim());
  const canCreateAccount = guestFlow && Boolean(setupHref?.startsWith("/auth/resident-setup"));

  return (
    <div className="application-finish-panel mx-auto mt-8 max-w-lg text-center sm:mt-12">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Done</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Application submitted</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
        {guestFlow
          ? canCreateAccount
            ? "Create your resident portal account now to track your application."
            : emailFailed
              ? "Application saved. We could not send the setup email automatically."
              : email
                ? `Check ${email} for your resident account setup link.`
                : "Check your email for your resident account setup link."
          : email
            ? `Confirmation for ${email}`
            : "Sign in to track your application in the resident portal."}
      </p>

      {syncError ? (
        <p className="mt-3 text-[12px] text-amber-800 sm:text-sm">
          Sync issue: {guestFlow ? "try submitting again, or sign in if you already have an account." : "sign in to confirm your application status."}
        </p>
      ) : null}

      <p className="mt-4 font-mono text-xs text-muted">Application ID: {axisId}</p>

      {showGroup ? (
        <GroupShareCallout groupId={groupId!.trim()} groupRole={groupRole} groupSize={groupSize} />
      ) : null}

      <div className="mt-6 space-y-2.5 sm:mt-8 sm:space-y-3">
        {guestFlow ? (
          <>
            {canCreateAccount ? (
              <Link
                href={setupHref!}
                className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
              >
                Create your resident account
              </Link>
            ) : null}
            {emailFailed ? (
              <p className="text-[12px] text-amber-800 sm:text-sm">
                Email delivery is not configured on this environment. Use the button below to open a draft with your setup link, or ask your manager to resend the welcome email.
              </p>
            ) : null}
            {mailtoHref ? (
              <a
                href={mailtoHref}
                className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
              >
                Open setup email draft
              </a>
            ) : null}
            {canCreateAccount && email && emailSent ? (
              <p className="application-finish-detail text-[12px] text-muted sm:text-sm">
                We also emailed a backup setup link to {email}.
              </p>
            ) : null}
            <Link
              href={signInHref}
              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold text-foreground sm:min-h-[48px] sm:text-base"
            >
              Already have an account? Sign in
            </Link>
          </>
        ) : (
          <Link
            href={signInHref}
            className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold sm:min-h-[48px] sm:text-base"
          >
            Sign in to resident portal
          </Link>
        )}
      </div>

      <div className="mt-4 flex justify-center sm:mt-6">
        <Button type="button" variant="ghost" className="h-9 px-4 text-[13px] sm:h-10 sm:text-sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
