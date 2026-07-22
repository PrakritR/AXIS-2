"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthPageHeader } from "@/components/auth/auth-mobile-primitives";
import type { GroupRole } from "@/lib/rental-application/types";

type FinishPanelProps = {
  axisId: string;
  email: string;
  emailSent?: boolean;
  syncError?: string;
  /** Guest apply — prompt to check email for setup link instead of sign-in CTA. */
  guestFlow?: boolean;
  /** Mailto fallback when Resend is not configured (local/dev). */
  mailtoHref?: string;
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
    <div
      className={`rounded-2xl border border-border bg-accent/20 p-4 text-left [html[data-theme=dark]_&]:border-white/10 [html[data-theme=dark]_&]:bg-white/4 ${className ?? "mt-4"}`}
    >
      <p className="text-[13px] font-semibold text-foreground">
        {!shareable
          ? "Group application"
          : groupRole === "joining"
            ? "You joined a group application"
            : "Your group is ready"}
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        {!shareable
          ? "Your application was not approved. Your Group ID is kept here for reference."
          : groupRole === "joining"
            ? "Your application is linked to your group. Each member applies with their own account, and your manager reviews you together."
            : others != null
              ? `Share this Group ID with your ${others} ${others === 1 ? "roommate" : "roommates"} so their applications link to yours. Each of you keeps your own account.`
              : "Share this Group ID with your roommates so their applications link to yours. Each of you keeps your own account."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-card px-3 py-2 font-mono text-[13px] text-foreground">
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
  groupId,
  groupRole,
  groupSize,
  onDone,
}: FinishPanelProps) {
  const signInHref = `/auth/sign-in?intent=resident&next=${encodeURIComponent("/resident/applications")}`;
  const emailFailed = guestFlow && emailSent === false;
  const showGroup = Boolean(groupId && groupId.trim());

  return (
    <div className="application-finish-panel relative mt-4 overflow-hidden rounded-2xl border border-border/80 bg-card/80 p-4 backdrop-blur-md sm:mt-8 sm:rounded-3xl sm:p-6">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(47,107,255,0.45),transparent)]"
        aria-hidden
      />
      <AuthPageHeader
        eyebrow="Done"
        title="Application submitted"
        subtitle={
          guestFlow
            ? emailFailed
              ? "Application saved — we could not send the setup email automatically."
              : email
                ? `Check ${email} for your resident account setup link.`
                : "Check your email for your resident account setup link."
            : email
              ? `Confirmation for ${email}`
              : "Sign in to track your application in the resident portal."
        }
      />

      {syncError ? (
        <p className="mt-2 text-center text-[12px] text-amber-800 sm:text-sm">
          Sync issue — {guestFlow ? "try submitting again, or sign in if you already have an account." : "sign in to confirm your application status."}
        </p>
      ) : null}

      {email && emailSent ? (
        <p className="application-finish-detail mt-2 text-center text-[12px] text-muted sm:text-sm">
          {guestFlow ? `Setup link emailed to ${email}` : `Emailed to ${email}`}
        </p>
      ) : null}

      {emailFailed ? (
        <p className="mt-2 text-center text-[12px] text-amber-800 sm:text-sm">
          Email delivery is not configured on this environment. Use the button below to open a draft with your setup link, or ask your manager to resend the welcome email.
        </p>
      ) : null}

      <p className="mt-3 text-center font-mono text-xs text-muted">Application ID: {axisId}</p>

      {showGroup ? (
        <GroupShareCallout groupId={groupId!.trim()} groupRole={groupRole} groupSize={groupSize} />
      ) : null}

      <div className="mt-4 space-y-2.5 sm:mt-5 sm:space-y-3">
        {guestFlow ? (
          <>
            {!emailFailed ? (
              <p className="text-center text-[13px] text-muted sm:text-sm">
                Use the link in your email to create your resident portal account. You can only create an account from that setup link.
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

      <div className="mt-3 flex justify-center sm:mt-4">
        <Button type="button" variant="ghost" className="h-9 px-4 text-[13px] sm:h-10 sm:text-sm" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
